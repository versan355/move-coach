// Run only with your own bot credentials in environment variables. Never put tokens in CLI arguments.
const {TELEGRAM_BOT_TOKEN:token,TELEGRAM_WEBHOOK_SECRET:secret,TELEGRAM_MINI_APP_URL:mini}=process.env;
if(!token||!secret||!mini)throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_MINI_APP_URL in the process environment.');
if(!/^[A-Za-z0-9_-]{1,256}$/.test(secret))throw new Error('Invalid webhook secret format.');
const url=new URL(mini);if(url.protocol!=='https:'||url.pathname!=='/mini')throw new Error('Use the public HTTPS Mini App URL ending in /mini.');
const webhook=new URL('/api/telegram/webhook',url).href;
const response=await fetch(webhook,{redirect:'manual',method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:0})});
if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('Webhook is not accessible. Configure a public deployment with the same secrets; owner-private Sites require sign-in and cannot receive Telegram updates.');
async function call(method,body){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!j.ok)throw new Error(`${method} failed; check credentials and domain.`)}
await call('setWebhook',{url:webhook,secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Моя практика',web_app:{url:mini}}});
console.log('Webhook and Mini App menu configured. Open your bot and choose «Моя практика».');
