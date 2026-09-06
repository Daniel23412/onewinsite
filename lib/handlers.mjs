import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {games} from '../public/games.mjs';
import {matchLanguage} from '../public/i18n.mjs';
import {issueClick,verifyClick,equalSecret,safeAffiliate,clean} from './security.mjs';
import {createEventStore} from './store.mjs';

const siteConfig=JSON.parse(readFileSync(new URL('../public/site-config.json',import.meta.url),'utf8'));
const json=(status,value,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',...extra}});
const aliases={registration:'registration',register:'registration',reg:'registration',lead:'registration',deposit:'deposit',dep:'deposit',first_deposit:'first_deposit',ftd:'first_deposit',fd:'first_deposit'};

async function readParams(request){
  const params=Object.fromEntries(new URL(request.url).searchParams);
  if(request.method==='POST'){
    const type=request.headers.get('content-type')?.split(';')[0].trim();
    if(!['application/json','application/x-www-form-urlencoded'].includes(type))throw Object.assign(new Error('Unsupported content type'),{status:415});
    if(Number(request.headers.get('content-length'))>16384)throw Object.assign(new Error('Body too large'),{status:413});
    const reader=request.body?.getReader();let text='';let bytes=0;const decoder=new TextDecoder();
    if(reader)while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();throw Object.assign(new Error('Body too large'),{status:413})}text+=decoder.decode(value,{stream:true})}
    text+=decoder.decode();
    let body;try{body=type==='application/json'?JSON.parse(text):Object.fromEntries(new URLSearchParams(text))}catch{throw Object.assign(new Error('Invalid body'),{status:400})}
    if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Invalid body'),{status:400});
    for(const [key,value] of Object.entries(body)){if(typeof value!=='string'&&typeof value!=='number')throw Object.assign(new Error('Invalid parameter'),{status:400});params[key]=String(value)}
  }
  return params;
}

export function createHandlers({env=process.env,config=siteConfig,fetcher=fetch,eventStore}={}){
  const events=eventStore??createEventStore(env,fetcher);
  const bursts=new Map();
  const signingSecret=()=>env.CLICK_SIGNING_SECRET||env.POSTBACK_SECRET;
  const telegramReady=()=>Boolean(env.BOT_TOKEN&&env.POSTBACK_LOG_CHAT_ID);
  async function notify(lines,timeout=4200){
    if(!telegramReady())return false;
    try{
      const response=await fetcher(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(timeout),
        body:JSON.stringify({chat_id:env.POSTBACK_LOG_CHAT_ID,text:lines.filter(Boolean).join('\n'),link_preview_options:{is_disabled:true}})
      });
      if(!response.ok)return false;return (await response.json()).ok===true;
    }catch{return false}
  }
  function allowClickNotification(request){
    if(request.headers.get('purpose')==='prefetch'||request.headers.get('sec-purpose')?.includes('prefetch')||/bot|crawler|spider|preview/i.test(request.headers.get('user-agent')||''))return false;
    // Bounded best-effort burst suppression; no IP is sent to Telegram or stored in clear text.
    const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
    const key=createHash('sha256').update(ip+(signingSecret()||'')).digest('hex');const now=Date.now();
    for(const [id,entry] of bursts)if(entry.until<=now)bursts.delete(id);
    const entry=bursts.get(key);if(entry){entry.count++;return entry.count<=5}
    if(bursts.size>=5000)return false;bursts.set(key,{count:1,until:now+60000});return true;
  }
  return {
    async go(request){
      if(!['GET','HEAD'].includes(request.method))return json(405,{error:'Method not allowed'},{Allow:'GET, HEAD'});
      const params=new URL(request.url).searchParams;
      const game=games.find(g=>g.id===params.get('game'))??games[0];
      const language=matchLanguage(params.get('lang'))||'en';
      let destination;
      try{destination=safeAffiliate(env.AFFILIATE_URL?.trim()||config.affiliateUrl)}catch{return json(503,{error:'Destination is not configured'})}
      const clickId=request.method==='GET'?issueClick(signingSecret()):null;
      const parameter=/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(config.clickIdParameter)?config.clickIdParameter:'sub1';
      if(clickId)destination.searchParams.set(parameter,clickId);
      if(clickId&&allowClickNotification(request)){
        const campaign=clean(params.get('utm_campaign'));
        await notify(['🔗 Переход с прокладки',`Игра: ${game.name}`,`Язык: ${language}`,`Источник: ${clean(params.get('utm_source'))||'не указан'}`,campaign?`Кампания: ${campaign}`:null,`Click ID: ${clickId}`],1600);
      }
      return new Response(null,{status:302,headers:{Location:destination.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
    },
    async postback(request){
      if(!['GET','POST'].includes(request.method))return json(405,{error:'Method not allowed'},{Allow:'GET, POST'});
      if(!env.POSTBACK_SECRET||!telegramReady())return json(503,{error:'Postbacks are not configured'});
      let params;
      try{params=await readParams(request)}catch(error){return json(error.status||400,{error:'Invalid request'})}
      const supplied=request.headers.get('x-postback-secret')||request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||params.secret||params.token;
      if(!equalSecret(supplied,env.POSTBACK_SECRET))return json(401,{error:'Unauthorized'});
      const rawEvent=String(params.event||params.type||'').toLowerCase();
      const event=Object.hasOwn(aliases,rawEvent)?aliases[rawEvent]:null;
      if(!event)return json(400,{error:'Unsupported event'});
      const status=String(params.status||'').toLowerCase();
      if(status&&!['approved','success','confirmed','completed','ok'].includes(status))return json(200,{ok:true,ignored:true,reason:'Unconfirmed status'});
      const rawId=String(params.event_id||params.transaction_id||params.order_id||'');
      if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(rawId))return json(400,{error:'A stable event_id or transaction_id is required'});
      const clickId=String(params.click_id||params.clickid||params.sub1||params[config.clickIdParameter]||'');
      if(clickId&&!verifyClick(clickId,signingSecret()))return json(400,{error:'Invalid click_id'});
      let amount='';let currency='';
      if(event!=='registration'){
        amount=String(params.amount||params.sum||'');currency=String(params.currency||'').toUpperCase();
        if(!/^\d{1,12}(\.\d{1,6})?$/.test(amount)||Number(amount)<=0)return json(400,{error:'A positive deposit amount is required'});
        if(!/^[A-Z]{3}$/.test(currency))return json(400,{error:'A three-letter currency is required'});
      }
      // FTD and deposit aliases share one transaction namespace.
      const key=createHash('sha256').update(`${event==='registration'?'reg':'deposit'}:${rawId}`).digest('hex');
      let claim;try{claim=await events.claim(key)}catch{return json(503,{error:'Event store unavailable; retry later'},{'Retry-After':'10'})}
      if(claim.state==='duplicate')return json(200,{ok:true,duplicate:true});
      if(claim.state==='pending')return json(503,{error:'Event is processing; retry later'},{'Retry-After':'10'});
      const title={registration:'✅ Регистрация',deposit:'💰 Депозит',first_deposit:'💰 Первый депозит'}[event];
      const delivered=await notify([title,`Событие: ${rawId}`,amount?`Сумма: ${amount} ${currency}`:null,`Click ID: ${clickId||'партнёр не передал'}`]);
      if(!delivered){try{await events.release(claim)}catch{}return json(502,{error:'Notification failed; retry later'},{'Retry-After':'10'})}
      try{await events.complete(claim)}catch{return json(503,{error:'Delivery state unavailable; retry later'},{'Retry-After':'10'})}
      return json(200,{ok:true});
    },
    async health(){return json(200,{ok:true})}
  };
}
export const handlers=createHandlers();
