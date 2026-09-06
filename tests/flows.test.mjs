import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandlers} from '../lib/handlers.mjs';
import {detectLanguage,languages,translations} from '../public/i18n.mjs';
import {issueClick,verifyClick} from '../lib/security.mjs';
import {createEventStore} from '../lib/store.mjs';

const env={POSTBACK_SECRET:'test-secret-only-not-production',BOT_TOKEN:'000000:test-only',POSTBACK_LOG_CHAT_ID:'-1000000000000'};
const config={affiliateUrl:'https://lknw.cc/d830cc81',clickIdParameter:'sub1'};
function fixture(settings={}){
  const messages=[];
  const fetcher=async(url,options)=>{messages.push({url:String(url),body:JSON.parse(options.body)});return Response.json({ok:true})};
  return {messages,handlers:createHandlers({env,config,fetcher,...settings})};
}
function callback(values={},options={}){
  const params=new URLSearchParams({secret:env.POSTBACK_SECRET,event:'registration',event_id:'reg-123',...values});
  return new Request(`https://portal.example/api/postback?${params}`,options);
}
test('15 locales contain complete translations including honest demo labels',()=>{
  const keys=Object.keys(translations.en);
  assert.equal(languages.length,15);
  for(const [code] of languages){assert.deepEqual(Object.keys(translations[code]),keys);for(const key of keys)assert.ok(translations[code][key],`${code}.${key}`)}
});
test('phone locale matching, regional Spanish, aliases, persistence and fallback',()=>{
  for(const [input,want] of [['fil-PH','fil'],['tl-PH','fil'],['id-ID','id'],['in-ID','id'],['ru-RU','ru'],['en-PH','en'],['es-CO','es-CO'],['es-VE','es-VE'],['es-PE','es'],['es-MX','es'],['pt-PT','pt-BR'],['vi-VN','vi'],['th-TH','th'],['hi-IN','hi'],['de-DE','de']])assert.equal(detectLanguage([input]),want);
  assert.equal(detectLanguage(['zh-CN','ru-RU']),'ru');assert.equal(detectLanguage(['en'],'id'),'id');assert.equal(detectLanguage(['en'],'id','es-VE'),'es-VE');assert.equal(detectLanguage(['xx-ZZ']),'en');
});
test('click IDs survive verification and reject modification or expiration',()=>{
  const token=issueClick(env.POSTBACK_SECRET);assert.ok(token.length<=64);assert.equal(verifyClick(token,env.POSTBACK_SECRET),true);assert.equal(verifyClick(token+'x',env.POSTBACK_SECRET),false);assert.equal(verifyClick(token,'wrong'),false);assert.equal(verifyClick(issueClick(env.POSTBACK_SECRET,Date.now()-181*86400000),env.POSTBACK_SECRET),false);
});
test('all game traffic uses the exact configured affiliate, no arbitrary redirect',async()=>{
  const {handlers,messages}=fixture();
  const response=await handlers.go(new Request('https://portal.example/api/go?game=wheel-out&lang=es-CO&url=https://evil.example'));
  assert.equal(response.status,302);const destination=new URL(response.headers.get('location'));
  assert.equal(destination.origin+destination.pathname,'https://lknw.cc/d830cc81');assert.ok(verifyClick(destination.searchParams.get('sub1'),env.POSTBACK_SECRET));
  assert.equal(messages.length,1);assert.match(messages[0].body.text,/Wheel Out/);assert.match(messages[0].body.text,/es-CO/);assert.equal(messages[0].body.chat_id,env.POSTBACK_LOG_CHAT_ID);
});
test('environment override and partner query parameters are retained',async()=>{
  const {handlers}=fixture({env:{...env,AFFILIATE_URL:'https://partner.example/new?offer=42'}});
  const response=await handlers.go(new Request('https://portal.example/api/go'));const destination=new URL(response.headers.get('location'));
  assert.equal(destination.origin+destination.pathname,'https://partner.example/new');assert.equal(destination.searchParams.get('offer'),'42');assert.ok(destination.searchParams.get('sub1'));
});
test('HEAD and prefetch requests do not send click notifications',async()=>{
  const {handlers,messages}=fixture();await handlers.go(new Request('https://portal.example/api/go',{method:'HEAD'}));await handlers.go(new Request('https://portal.example/api/go',{headers:{purpose:'prefetch'}}));assert.equal(messages.length,0);
});
test('redirect continues when Telegram is down or secrets are absent',async()=>{
  const {handlers}=fixture({fetcher:async()=>{throw new Error('Network failure')}});assert.equal((await handlers.go(new Request('https://portal.example/api/go'))).status,302);
  const {handlers:unconfigured}=fixture({env:{}});const response=await unconfigured.go(new Request('https://portal.example/api/go'));assert.equal(response.headers.get('location'),'https://lknw.cc/d830cc81');assert.equal((await unconfigured.postback(callback())).status,503);
});
test('bad secret, unknown event and tampered click never notify',async()=>{
  const {handlers,messages}=fixture();
  for(const values of [{secret:'bad'},{event:'click'},{event:'__proto__'},{click_id:'forged'},{event_id:''}])assert.ok((await handlers.postback(callback(values))).status>=400);
  assert.equal(messages.length,0);
});
test('confirmed registration is delivered once within a store',async()=>{
  const {handlers,messages}=fixture();const click_id=issueClick(env.POSTBACK_SECRET);
  assert.equal((await handlers.postback(callback({click_id}))).status,200);
  const duplicate=await handlers.postback(callback({click_id}));assert.equal((await duplicate.json()).duplicate,true);assert.equal(messages.length,1);assert.match(messages[0].body.text,/Регистрация/);
});
test('deposit requires positive amount and currency; rejects invalid data',async()=>{
  const {handlers,messages}=fixture();
  for(const values of [{amount:'0',currency:'USD'},{amount:'-5',currency:'USD'},{amount:'NaN',currency:'USD'},{amount:'5'},{amount:'5',currency:'USD<script>'}])assert.equal((await handlers.postback(callback({event:'deposit',...values}))).status,400);
  assert.equal(messages.length,0);
});
test('JSON postback accepts secret header and exact amount',async()=>{
  const {handlers,messages}=fixture();
  const response=await handlers.postback(new Request('https://portal.example/api/postback',{method:'POST',headers:{'Content-Type':'application/json','X-Postback-Secret':env.POSTBACK_SECRET},body:JSON.stringify({event:'ftd',transaction_id:'tx-001',amount:'50.25',currency:'php'})}));
  assert.equal(response.status,200);assert.match(messages[0].body.text,/Первый депозит/);assert.match(messages[0].body.text,/50.25 PHP/);
  const duplicate=await handlers.postback(callback({event:'deposit',event_id:'tx-001',amount:'50.25',currency:'PHP'}));assert.equal((await duplicate.json()).duplicate,true);
});
test('form callbacks supported; repeated deposits have separate transaction IDs',async()=>{
  const {handlers,messages}=fixture();
  for(const id of ['tx-a','tx-b']){const body=new URLSearchParams({secret:env.POSTBACK_SECRET,event:'deposit',event_id:id,amount:'10',currency:'COP'});assert.equal((await handlers.postback(new Request('https://portal.example/api/postback',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}))).status,200)}
  assert.equal(messages.length,2);
});
test('pending or rejected transactions are ignored',async()=>{
  const {handlers,messages}=fixture();const response=await handlers.postback(callback({event:'deposit',status:'rejected'}));assert.equal(response.status,200);assert.equal((await response.json()).ignored,true);assert.equal(messages.length,0);
});
test('failed Telegram delivery can be retried and does not get marked successful',async()=>{
  let attempt=0;const {handlers}=fixture({fetcher:async()=>Response.json({ok:++attempt>1})});
  assert.equal((await handlers.postback(callback())).status,502);assert.equal((await handlers.postback(callback())).status,200);assert.equal(attempt,2);
});
test('concurrent duplicate waits for delivery instead of being falsely acknowledged',async()=>{
  let release;const blocker=new Promise(resolve=>{release=resolve});let called;
  const sent=new Promise(resolve=>{called=resolve});
  const {handlers}=fixture({fetcher:async()=>{called();await blocker;return Response.json({ok:true})}});
  const first=handlers.postback(callback());await sent;
  const second=await handlers.postback(callback());assert.equal(second.status,503);release();assert.equal((await first).status,200);
});
test('oversized or malformed request bodies never notify',async()=>{
  const {handlers,messages}=fixture();
  for(const body of ['[]','{bad json}',JSON.stringify({event:'registration',value:'x'.repeat(17000)})]){const response=await handlers.postback(new Request('https://portal.example/api/postback',{method:'POST',headers:{'Content-Type':'application/json'},body}));assert.ok(response.status>=400)}assert.equal(messages.length,0);
});
test('configured durable store fails closed and preserves completed events',async()=>{
  const {handlers,messages}=fixture({eventStore:{claim:async()=>{throw new Error('Offline')}}});assert.equal((await handlers.postback(callback())).status,503);assert.equal(messages.length,0);
  const store=createEventStore();const claim=await store.claim('same-id');assert.equal(claim.state,'claimed');assert.equal((await store.claim('same-id')).state,'pending');await store.complete(claim);assert.equal((await store.claim('same-id')).state,'duplicate');
});
