import {randomUUID} from 'node:crypto';

// Instance-local by default. Supply Upstash settings for cross-instance persistence.
export function createEventStore(env={},fetcher=fetch){
  const cache=new Map();
  const configured=Boolean(env.UPSTASH_REDIS_REST_URL||env.UPSTASH_REDIS_REST_TOKEN);
  async function redis(command){
    if(!env.UPSTASH_REDIS_REST_URL||!env.UPSTASH_REDIS_REST_TOKEN)throw new Error('Incomplete event store configuration');
    const url=new URL(env.UPSTASH_REDIS_REST_URL);
    if(url.protocol!=='https:')throw new Error('Event store requires HTTPS');
    const response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(2200)});
    if(!response.ok)throw new Error('Event store unavailable');
    const result=await response.json();if(result.error)throw new Error('Event store unavailable');return result.result;
  }
  function prune(){const now=Date.now();for(const [key,entry] of cache){if(entry.expires<=now)cache.delete(key)}if(cache.size>=20000)cache.delete(cache.keys().next().value)}
  return {
    durable:configured,
    async claim(id){
      const key=`pixelclub:event:${id}`;const token=randomUUID();
      if(configured){const ok=await redis(['SET',key,token,'NX','EX',30]);if(ok)return {state:'claimed',key,token};const current=await redis(['GET',key]);return {state:current==='sent'?'duplicate':'pending'}}
      prune();const entry=cache.get(key);if(entry)return {state:entry.value==='sent'?'duplicate':'pending'};
      cache.set(key,{value:token,expires:Date.now()+30000});return {state:'claimed',key,token};
    },
    async complete(claim){
      if(configured){const ok=await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],'sent','EX',604800); return 1 else return 0 end",1,claim.key,claim.token]);if(ok!==1)throw new Error('Event lease expired');return}
      if(cache.get(claim.key)?.value!==claim.token)throw new Error('Event lease expired');
      cache.set(claim.key,{value:'sent',expires:Date.now()+604800000});
    },
    async release(claim){
      if(configured){await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,claim.key,claim.token]);return}
      if(cache.get(claim.key)?.value===claim.token)cache.delete(claim.key);
    }
  };
}
