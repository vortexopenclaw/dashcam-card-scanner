// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic challenge execution: no live Turnstile bypass or production requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../worker.js';
const hash='a'.repeat(64), state='b'.repeat(64), ticket='c'.repeat(64);
async function page(fragment, response={ticket}, ok=true){
 const env={ENABLED:'true',PENDING:{},GATE:{},IP_SALT:'s'.repeat(32),TURNSTILE_SECRET:'synthetic',TURNSTILE_SITE_KEY:'synthetic',ORIGIN:'https://intake.example',MAX_RECORDS:'10',MAX_STORED_BYTES:'100000'};
 const r=await worker.fetch(new Request(env.ORIGIN+'/challenge'),env), html=await r.text();
 const script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
 const nodes=Object.fromEntries(['instructions','hash','ticket'].map(k=>[k,{textContent:''}]));
 const calls=[],navigations=[],history=[];let options;
 const context={location:{hash:'#'+fragment,replace:url=>navigations.push(url)},history:{replaceState:(...args)=>history.push(args)},document:{getElementById:id=>nodes[id]},turnstile:{render:(selector,o)=>{options=o;}},fetch:async(url,init)=>{calls.push({url,...init});if(response instanceof Error)throw response;return {ok,json:async()=>response};}};
 context.window=context;vm.runInNewContext(script,context);context.ready();
 return {nodes,calls,navigations,history,options,html,headers:r.headers};
}
test('app completion automatically returns only fixed fragment, clears history and never renders ticket',async()=>{
 const p=await page(`app=1&hash=${hash}&state=${state}`);
 assert.deepEqual(p.history,[[null,'','/challenge']]);
 await p.options.callback('synthetic-turnstile');
 assert.deepEqual(p.navigations,[`/app-complete#state=${state}&hash=${hash}&ticket=${ticket}`]);
 assert.equal(p.calls.length,1);assert.equal(p.calls[0].url,'/ticket');
 assert.deepEqual(JSON.parse(p.calls[0].body),{hash,turnstile:'synthetic-turnstile'});
 assert(!JSON.stringify(p.nodes).includes(ticket));assert(!JSON.stringify(p.calls).includes(state));assert(!JSON.stringify(p.calls).includes(ticket));
 await p.options.callback('again');assert.equal(p.calls.length,1);assert.equal(p.navigations.length,1);
 assert.match(p.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(p.headers.get('referrer-policy'),'no-referrer');
});
test('manual browser fallback remains, with no automatic navigation',async()=>{
 const p=await page(hash);await p.options.callback('synthetic');assert.equal(p.nodes.ticket.textContent,ticket);assert.equal(p.navigations.length,0);
});
test('strict app parsing rejects duplicate, extra, reordered, encoded, uppercase and arbitrary callback fields',async()=>{
 for(const f of [`app=1&hash=${hash}&state=${state}&state=${state}`,`app=1&state=${state}&hash=${hash}`,`app=1&hash=${hash}&state=${state}&callback=https://evil.example/`,`app=1&hash=${hash}&state=${state.toUpperCase()}`,`app=1&hash=${hash}&state=%62${state.slice(1)}`,`app=1&hash=${hash}&state=bad`]){
  const p=await page(f);assert.equal(p.options,undefined);assert.equal(p.calls.length,0);assert.equal(p.navigations.length,0);assert.equal(p.nodes.hash.textContent,'Invalid hash');
 }
});
test('failures, malformed responses and challenge expiry return bounded error without upstream text',async()=>{
 for(const response of [{ticket:'bad'}, {ticket:ticket.toUpperCase()}, {error:'secret upstream details'},new Error('secret network details')]){
  const p=await page(`app=1&hash=${hash}&state=${state}`,response);await p.options.callback('synthetic');assert.deepEqual(p.navigations,[`/app-complete#state=${state}&hash=${hash}&error=challenge`]);assert(!JSON.stringify(p.nodes).includes('secret'));
 }
 for(const [callback,reason] of [['error-callback','challenge'],['expired-callback','expired']]){
  const p=await page(`app=1&hash=${hash}&state=${state}`);p.options[callback]();await p.options.callback('late');assert.equal(p.calls.length,0);assert.deepEqual(p.navigations,[`/app-complete#state=${state}&hash=${hash}&error=${reason}`]);
 }
});
