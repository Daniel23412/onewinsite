import {games} from './games.mjs';
import {languages,detectLanguage,t} from './i18n.mjs';

const pageQuery=new URLSearchParams(location.search);
let savedLanguage=null;
try{savedLanguage=localStorage.getItem('pixelclub.language')}catch{}
let language=detectLanguage(navigator.languages?.length?navigator.languages:[navigator.language],savedLanguage,pageQuery.get('lang'));
let config={affiliateUrl:'https://lknw.cc/d830cc81',promoCode:'205bonus',showDemoFeed:true};
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
let cycle=0;
let toastTimer;
const select=document.querySelector('#language');
for(const [code,label] of languages){const option=document.createElement('option');option.value=code;option.textContent=label;select.append(option)}

function gameUrl(id){
  const query=new URLSearchParams({game:id,lang:language});
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
    const value=pageQuery.get(key);if(value) query.set(key,value.slice(0,120));
  }
  return `api/go?${query}`;
}
function renderGames(){
  const grid=document.querySelector('#game-grid');
  for(const game of games.slice(1)){
    const a=document.createElement('a');a.className='game-card';a.dataset.game=game.id;
    const picture=document.createElement('div');picture.className='game-image';
    const img=document.createElement('img');img.src=`assets/${game.id}.jpg`;img.alt=game.name;img.loading='lazy';img.decoding='async';img.width=300;img.height=300;
    picture.append(img);
    const info=document.createElement('div');info.className='game-info';
    const details=document.createElement('div');
    const title=document.createElement('h3');title.textContent=game.name;
    const provider=document.createElement('p');provider.textContent=game.provider;details.append(title,provider);
    const arrow=document.createElement('span');arrow.className='game-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
    info.append(details,arrow);a.append(picture,info);grid.append(a);
  }
}
function renderDemo(){
  const list=document.querySelector('#demo-list');list.replaceChildren();
  for(let i=0;i<3;i++){
    const game=games[(cycle+i*4)%games.length];
    const row=document.createElement('div');row.className='demo-item';row.setAttribute('role','listitem');
    const img=document.createElement('img');img.src=`assets/${game.id}.jpg`;img.width=38;img.height=38;img.alt='';img.loading='lazy';
    const detail=document.createElement('div');detail.className='demo-detail';
    const player=document.createElement('p');player.className='demo-player';player.textContent=`${t(language,'demoPlayer')} ${String(((cycle*3+i)%99)+1).padStart(2,'0')}`;
    const title=document.createElement('p');title.textContent=game.name;detail.append(player,title);
    const multiplier=document.createElement('strong');multiplier.textContent=`×${new Intl.NumberFormat(language,{minimumFractionDigits:2,maximumFractionDigits:2}).format([2.4,1.65,3.8,1.25,5.1,2.75][(cycle+i)%6])}`;
    row.append(img,detail,multiplier);list.append(row);
  }
}
function renderLanguage(){
  document.documentElement.lang=language;select.value=language;select.setAttribute('aria-label',t(language,'language'));
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(language,el.dataset.i18n)});
  document.querySelector('#game-count').textContent=t(language,'gameCount',{n:games.length-1});
  document.querySelectorAll('[data-game]').forEach(el=>{el.href=gameUrl(el.dataset.game)});
  document.querySelector('#copy-promo').setAttribute('aria-label',`${t(language,'copy')} ${config.promoCode}`);
  document.querySelector('#pause-demo').textContent=t(language,paused?'resume':'pause');
  document.querySelector('#pause-demo').setAttribute('aria-pressed',String(paused));
  renderDemo();
}
function toast(message){const el=document.querySelector('#toast');clearTimeout(toastTimer);el.textContent=message;el.hidden=false;toastTimer=setTimeout(()=>{el.hidden=true},3500)}
select.addEventListener('change',()=>{
  language=select.value;
  try{localStorage.setItem('pixelclub.language',language)}catch{}
  // Replace a shared ?lang= override too, so reloading keeps the chosen language.
  const url=new URL(location.href);url.searchParams.set('lang',language);
  try{history.replaceState(null,'',url)}catch{}
  renderLanguage();
});
document.querySelector('#copy-promo').addEventListener('click',async()=>{
  let copied=false;
  try{await navigator.clipboard.writeText(config.promoCode);copied=true}catch{
    const field=document.createElement('textarea');field.value=config.promoCode;field.className='sr-only';field.setAttribute('readonly','');document.body.append(field);field.select();
    try{copied=document.execCommand('copy')}catch{}field.remove();
  }
  toast(copied?t(language,'copied'):`${t(language,'copyError')} ${config.promoCode}`);
});
document.querySelector('#pause-demo').addEventListener('click',()=>{paused=!paused;renderLanguage()});
renderGames();renderLanguage();
fetch('site-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Config unavailable');return r.json()}).then(value=>{
  if(typeof value.promoCode==='string' && value.promoCode.length>0 && value.promoCode.length<=64) config.promoCode=value.promoCode;
  config.showDemoFeed=value.showDemoFeed!==false;
  document.querySelector('#promo-value').textContent=config.promoCode;document.querySelector('.mobile-promo').textContent=config.promoCode;
  document.querySelector('#demo-section').hidden=!config.showDemoFeed;renderLanguage();
}).catch(()=>{});
setInterval(()=>{if(!paused&&!document.hidden&&config.showDemoFeed){cycle++;renderDemo()}},6500);
