// SPDX-License-Identifier: AGPL-3.0-or-later
// Transactional synthetic Durable Object storage: rollback, ordered bounded lists.
export class Storage {
 constructor(){this.data=new Map();this.queue=Promise.resolve();this.failCommit=false;}
 transaction(fn){
  const run=async()=>{
   const copy=new Map(structuredClone([...this.data]));
   const tx={get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>copy.set(k,structuredClone(v)),delete:async k=>copy.delete(k),
    list:async({prefix='',startAfter='',limit=1000}={})=>new Map([...copy].filter(([k])=>k.startsWith(prefix)&&k>startAfter).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit))};
   const result=await fn(tx);if(this.failCommit){this.failCommit=false;throw Error('synthetic commit failure');}this.data=copy;return result;
  };
  const job=this.queue.then(run);this.queue=job.catch(()=>{});return job;
 }
}
