import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';

export function equalSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a||!b||a.length>512||b.length>512)return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
export function issueClick(secret,now=Date.now()){
  if(!secret)return null;
  const payload=`${Math.floor(now/1000).toString(36)}.${randomBytes(9).toString('base64url')}`;
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url').slice(0,22)}`;
}
export function verifyClick(value,secret,now=Date.now()){
  if(!secret||typeof value!=='string'||!/^([a-z0-9]{6,9})\.([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{22})$/.test(value))return false;
  const parts=value.split('.');const seconds=parseInt(parts[0],36);const age=Math.floor(now/1000)-seconds;
  if(age < -300 || age>180*86400)return false;
  const expected=createHmac('sha256',secret).update(`${parts[0]}.${parts[1]}`).digest('base64url').slice(0,22);
  return equalSecret(parts[2],expected);
}
export function clean(value,max=120){return String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max).trim()}

export function safeAffiliate(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid affiliate URL');
  return url;
}
