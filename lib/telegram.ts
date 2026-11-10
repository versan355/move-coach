export class ApiError extends Error{constructor(message:string,public status=400){super(message)}}
const encoder=new TextEncoder();
async function hmac(key:Uint8Array,message:string){const k=await crypto.subtle.importKey('raw',key as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(message)))}
export function constantEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
export async function validateInitData(raw:string,token:string,now=Date.now()){
 if(raw.length>10000)throw new ApiError('Некорректная сессия Telegram.',401);
 const p=new URLSearchParams(raw),hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/i.test(hash))throw new ApiError('Откройте кабинет заново в Telegram.',401);
 const keys=[...p.keys()];if(new Set(keys).size!==keys.length)throw new ApiError('Некорректная сессия Telegram.',401);
 p.delete('hash');const data=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac(encoder.encode('WebAppData'),token);const result=await hmac(secret,data);const hex=Array.from(result,x=>x.toString(16).padStart(2,'0')).join('');
 if(!constantEqual(hex,hash.toLowerCase()))throw new ApiError('Подпись Telegram не прошла проверку.',401);
 const age=Math.floor(now/1000)-Number(p.get('auth_date'));if(!Number.isFinite(age)||age< -30||age>3600)throw new ApiError('Сессия истекла. Откройте кабинет заново.',401);
 let user;try{user=JSON.parse(p.get('user')||'null')}catch{throw new ApiError('Не удалось определить пользователя.',401)}
 if(!Number.isSafeInteger(user?.id)||user.id<=0||typeof user.first_name!=='string')throw new ApiError('Не удалось определить пользователя.',401);
 return {owner:'tg:'+user.id,name:String(user.first_name).slice(0,100),telegramId:String(user.id)};
}
export async function telegramCall(token:string,method:string,body:Record<string,unknown>|FormData){
 const multipart=body instanceof FormData;const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:multipart?undefined:{'Content-Type':'application/json'},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const j=await response.json() as {ok:boolean;result:unknown};if(!response.ok||!j.ok)throw new Error('Telegram API request failed');return j.result;
}
