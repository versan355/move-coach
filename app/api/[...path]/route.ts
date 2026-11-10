import {env} from 'cloudflare:workers';
import {ApiError,constantEqual,telegramCall,validateInitData} from '@/lib/telegram';
export const dynamic='force-dynamic';
const MAX=20*1024*1024;
const lessons=['Неделя 01 · Знакомство с телом','Неделя 02 · Пространство и ритм','Неделя 03 · Свобода движения','Неделя 04 · Свой маленький танец'];
type Actor={owner:string;name:string;telegramId:string|null};
type WorkRow={id:string;owner:string;student:string;telegram_id:string|null;lesson:string;comment:string;status:string;notification:string;created:number};
type UploadRow={id:string;owner:string;name:string;mime:string;size:number;object_key:string;homework_id:string|null;created:number};
function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function db(){if(!env.DB)throw new ApiError('База ещё не настроена.',503);return env.DB}
function bucket(){if(!env.BUCKET)throw new ApiError('Хранилище ещё не настроено.',503);return env.BUCKET}
function configured(){return !!(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_TEACHER_CHAT_ID&&env.TELEGRAM_TEACHER_USER_ID&&env.TELEGRAM_WEBHOOK_SECRET)}
async function actor(req:Request):Promise<Actor>{const init=req.headers.get('X-Telegram-Init-Data');if(init){if(!env.TELEGRAM_BOT_TOKEN)throw new ApiError('Telegram пока не подключён. Используйте браузерную версию.',503);return validateInitData(init,env.TELEGRAM_BOT_TOKEN)}const id=req.headers.get('oai-authenticated-user-id');if(!id)throw new ApiError('Для сохранения войдите в аккаунт сайта или откройте приложение через Telegram.',401);return{owner:'site:'+id,name:'Ученик сайта',telegramId:null}}
function sameOrigin(req:Request){const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)throw new ApiError('Недопустимый источник запроса.',403)}
async function body(req:Request){const text=await req.text();if(text.length>16000)throw new ApiError('Слишком большой запрос.',413);try{return JSON.parse(text)}catch{throw new ApiError('Некорректный запрос.')}}
function text(v:unknown,max:number,required=true){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new ApiError('Проверьте заполненные поля.');return v.trim()}
async function quota(owner:string,kind:'uploads'|'leads'|'homework',limit:number){const n=await db().prepare(`SELECT count(*) AS n FROM ${kind} WHERE owner=? AND created>?`).bind(owner,Date.now()-3600000).first<{n:number}>();if((n?.n||0)>=limit)throw new ApiError('Слишком много отправок. Попробуйте через час.',429)}
function fileMatches(data:Uint8Array,mime:string){const head=(...bytes:number[])=>bytes.every((n,i)=>data[i]===n);const ascii=(start:number,end:number)=>new TextDecoder().decode(data.slice(start,end));if(mime==='image/jpeg')return head(255,216,255);if(mime==='image/png')return head(137,80,78,71,13,10,26,10);if(mime==='image/webp')return ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';if(mime==='video/webm')return head(26,69,223,163);if(mime==='video/mp4'||mime==='video/quicktime')return ascii(4,8)==='ftyp';return false}
async function notify(work:WorkRow){
 if(!configured())return'disabled';
 try{const rows=await db().prepare('SELECT * FROM uploads WHERE homework_id=?').bind(work.id).all<UploadRow>();
  for(const f of rows.results){const object=await bucket().get(f.object_key);if(!object)throw new Error('Missing upload');const form=new FormData();form.append('chat_id',env.TELEGRAM_TEACHER_CHAT_ID!);form.append('document',new Blob([await object.arrayBuffer()],{type:f.mime}),f.name);form.append('caption',`${work.student} · ${work.lesson}`);await telegramCall(env.TELEGRAM_BOT_TOKEN!,'sendDocument',form)}
  await telegramCall(env.TELEGRAM_BOT_TOKEN!,'sendMessage',{chat_id:env.TELEGRAM_TEACHER_CHAT_ID,text:`Новая работа · ${work.student}\n${work.lesson}\n\n${work.comment||'Без комментария'}\n\nКод: ${work.id}`,reply_markup:{inline_keyboard:[[{text:'✓ Принять',callback_data:`approve:${work.id}`},{text:'↻ На доработку',callback_data:`revise:${work.id}`}]]}});return'sent';
 }catch{return'failed'}
}
async function webhook(req:Request){
 if(!configured())throw new ApiError('Бот ещё не подключён.',503);
 if(!constantEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',env.TELEGRAM_WEBHOOK_SECRET!))throw new ApiError('Неверный секрет webhook.',403);
 const update=await body(req),q=update.callback_query;
 if(!q){if(update.message?.chat?.type==='private'&&/^\/start(?:\s|$)/.test(update.message?.text||''))await telegramCall(env.TELEGRAM_BOT_TOKEN!,'sendMessage',{chat_id:update.message.chat.id,text:'MOVE ✳\nТвоя практика и домашние задания — в кабинете.',reply_markup:{inline_keyboard:[[{text:'Открыть мою практику',web_app:{url:new URL('/mini',req.url).href}}]]}});return json({ok:true})}
 if(String(q.from?.id)!==env.TELEGRAM_TEACHER_USER_ID||String(q.message?.chat?.id)!==env.TELEGRAM_TEACHER_CHAT_ID){await telegramCall(env.TELEGRAM_BOT_TOKEN!,'answerCallbackQuery',{callback_query_id:q.id,text:'Это действие доступно преподавателю.',show_alert:true});return json({ok:true})}
 const match=/^(approve|revise):([a-f0-9-]{36})$/.exec(q.data||'');if(!match){await telegramCall(env.TELEGRAM_BOT_TOKEN!,'answerCallbackQuery',{callback_query_id:q.id,text:'Неизвестное действие.'});return json({ok:true})}
 const status=match[1]==='approve'?'approved':'revision';const work=await db().prepare('SELECT * FROM homework WHERE id=?').bind(match[2]).first<WorkRow>();if(!work)throw new ApiError('Работа не найдена.',404);
 const changed=await db().prepare("UPDATE homework SET status=? WHERE id=? AND status='pending'").bind(status,work.id).run();const label=status==='approved'?'Принято':'Нужна доработка';
 await telegramCall(env.TELEGRAM_BOT_TOKEN!,'answerCallbackQuery',{callback_query_id:q.id,text:changed.meta.changes?label:'Эта работа уже проверена.'});
 if(changed.meta.changes){try{await telegramCall(env.TELEGRAM_BOT_TOKEN!,'editMessageText',{chat_id:env.TELEGRAM_TEACHER_CHAT_ID,message_id:q.message.message_id,text:`${label}\n${work.student} · ${work.lesson}\nКод: ${work.id}`,reply_markup:{inline_keyboard:[]}})}catch{/* Database remains authoritative. */}
 if(work.telegram_id)try{await telegramCall(env.TELEGRAM_BOT_TOKEN!,'sendMessage',{chat_id:work.telegram_id,text:`${label}: ${work.lesson}. Откройте кабинет, чтобы посмотреть работу.`})}catch{/* Student may not have started the bot. */}}
 return json({ok:true});
}
async function handle(req:Request){
 try{const path=new URL(req.url).pathname;
 if(path==='/api/config'&&req.method==='GET')return json({telegram:configured()});
 if(path==='/api/telegram/webhook'&&req.method==='POST')return await webhook(req);
 if(req.method!=='GET')sameOrigin(req);
 const user=await actor(req);
 if(path==='/api/uploads'&&req.method==='POST'){
  await quota(user.owner,'uploads',30);const mime=req.headers.get('Content-Type')||'';const length=Number(req.headers.get('Content-Length'));if(!Number.isFinite(length)||length<=0||length>MAX)throw new ApiError('Файл должен быть от 1 байта до 20 МБ.',413);
  let name;try{name=decodeURIComponent(req.headers.get('X-File-Name')||'file')}catch{throw new ApiError('Некорректное имя файла.')};name=name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,160);
  const reader=req.body?.getReader();if(!reader)throw new ApiError('Нет файла.');const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX){await reader.cancel();throw new ApiError('Файл больше 20 МБ.',413)}chunks.push(part.value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}if(!size||size!==length||!fileMatches(bytes,mime))throw new ApiError('Формат файла не поддерживается или файл повреждён.');
  const id=crypto.randomUUID(),objectKey=`homework/${id}`;await bucket().put(objectKey,bytes,{httpMetadata:{contentType:mime}});try{await db().prepare('INSERT INTO uploads(id,owner,name,mime,size,object_key,created) VALUES(?,?,?,?,?,?,?)').bind(id,user.owner,name,mime,size,objectKey,Date.now()).run()}catch(e){await bucket().delete(objectKey);throw e}return json({id,name,size},201);
 }
 if(path.startsWith('/api/uploads/')&&req.method==='GET'){
  const file=await db().prepare('SELECT * FROM uploads WHERE id=? AND owner=?').bind(path.split('/').pop(),user.owner).first<UploadRow>();if(!file)throw new ApiError('Файл не найден.',404);const object=await bucket().get(file.object_key);if(!object)throw new ApiError('Файл не найден.',404);return new Response(object.body,{headers:{'Content-Type':file.mime,'Content-Length':String(file.size),'Content-Disposition':`attachment; filename="homework"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(/^\/api\/homework\/[a-f0-9-]{36}\/notify$/.test(path)&&req.method==='POST'){
  if(!configured())throw new ApiError('Бот ещё не подключён.',503);
  const id=path.split('/')[3],work=await db().prepare('SELECT * FROM homework WHERE id=? AND owner=?').bind(id,user.owner).first<WorkRow>();if(!work)throw new ApiError('Работа не найдена.',404);
  if(work.notification==='sent'||work.status!=='pending')return json({notification:work.notification});
  const claim=await db().prepare("UPDATE homework SET notification='sending', notification_attempted_at=? WHERE id=? AND owner=? AND (notification IN ('failed','disabled') OR (notification IN ('pending','sending') AND coalesce(notification_attempted_at,created)<?))").bind(Date.now(),id,user.owner,Date.now()-5*60000).run();if(!claim.meta.changes)throw new ApiError('Уведомление ещё отправляется. Подождите несколько минут.',409);
  const delivery=await notify(work);await db().prepare('UPDATE homework SET notification=? WHERE id=?').bind(delivery,id).run();return json({notification:delivery});
 }
 if(path==='/api/homework'&&req.method==='GET'){
  const rows=await db().prepare('SELECT * FROM homework WHERE owner=? ORDER BY created DESC LIMIT 50').bind(user.owner).all<WorkRow>();const works=await Promise.all(rows.results.map(async w=>{const files=await db().prepare('SELECT id,name,mime,size FROM uploads WHERE homework_id=? AND owner=?').bind(w.id,user.owner).all();return{id:w.id,lesson:w.lesson,comment:w.comment,status:w.status,notification:w.notification,created:w.created,files:files.results}}));return json({works});
 }
 if(path==='/api/homework'&&req.method==='POST'){
  const data=await body(req);if(data.consent!=='on')throw new ApiError('Нужно согласие на сохранение файлов.');const id=text(data.id,36);if(!/^[a-f0-9-]{36}$/.test(id))throw new ApiError('Некорректный код отправки.');
  const existing=await db().prepare('SELECT * FROM homework WHERE id=? AND owner=?').bind(id,user.owner).first<WorkRow>();if(existing)return json({id,notification:existing.notification});
  await quota(user.owner,'homework',10);const lesson=text(data.lesson,100),comment=text(data.comment,2000,false);if(!lessons.includes(lesson))throw new ApiError('Выберите задание.');
  if(!Array.isArray(data.uploads)||!data.uploads.length||data.uploads.length>5||data.uploads.some((i:unknown)=>typeof i!=='string'||!/^[a-f0-9-]{36}$/.test(i))||new Set(data.uploads).size!==data.uploads.length)throw new ApiError('Прикрепите от 1 до 5 файлов.');
  const ids=data.uploads as string[],placeholders=ids.map(()=>'?').join(',');const uploaded=await db().prepare(`SELECT id FROM uploads WHERE owner=? AND homework_id IS NULL AND id IN (${placeholders})`).bind(user.owner,...ids).all();if(uploaded.results.length!==ids.length)throw new ApiError('Некоторые файлы уже использованы. Добавьте их заново.');
  const created=Date.now(),notification=configured()?'pending':'disabled';
  const result=await db().batch([db().prepare(`INSERT INTO homework(id,owner,student,telegram_id,lesson,comment,status,notification,created) SELECT ?,?,?,?,?,?,'pending',?,? WHERE (SELECT count(*) FROM uploads WHERE owner=? AND homework_id IS NULL AND id IN (${placeholders}))=?`).bind(id,user.owner,user.name,user.telegramId,lesson,comment,notification,created,user.owner,...ids,ids.length),db().prepare(`UPDATE uploads SET homework_id=? WHERE owner=? AND homework_id IS NULL AND id IN (${placeholders}) AND EXISTS(SELECT 1 FROM homework WHERE id=? AND owner=?)`).bind(id,user.owner,...ids,id,user.owner)]);
  if(!result[0].meta.changes)throw new ApiError('Файлы уже отправлены. Обновите историю.',409);
  const work=await db().prepare('SELECT * FROM homework WHERE id=?').bind(id).first<WorkRow>();const delivery=await notify(work!);await db().prepare('UPDATE homework SET notification=? WHERE id=?').bind(delivery,id).run();return json({id,notification:delivery},201);
 }
 if(path==='/api/leads'&&req.method==='POST'){
  await quota(user.owner,'leads',5);const data=await body(req);if(data.consent!=='on')throw new ApiError('Нужно согласие на сохранение контакта.');const name=text(data.name,80),contact=text(data.contact,120),slot=text(data.slot,80),plan=text(data.plan,80);if(!/^@[a-zA-Z0-9_]{5,32}$/.test(contact)&&!/^\S+@\S+\.\S+$/.test(contact))throw new ApiError('Укажите Telegram в формате @username или корректный email.');await db().prepare('INSERT INTO leads(id,owner,name,contact,slot,plan,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.owner,name,contact,slot,plan,Date.now()).run();return json({ok:true},201);
 }
 return json({error:'Не найдено.'},404);
 }catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);console.error('API operation failed',e instanceof Error?e.name:'Unknown');return json({error:'Не удалось выполнить действие. Данные уже могли сохраниться — проверьте историю и попробуйте ещё раз.'},500)}
}
export const GET=handle;export const POST=handle;
