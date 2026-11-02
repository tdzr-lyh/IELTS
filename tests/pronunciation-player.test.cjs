const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','pronunciation-player.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<8;i++) await flush();}

function setup({fetcher,nativeOnly=false,storageDenied=false}={}){
 const starts=[],messages=[],saved=new Map();let fetches=0,decodes=0;
 const cache={match:async url=>saved.get(String(url))?.clone(),put:async(url,r)=>saved.set(String(url),r.clone()),keys:async()=>[...saved.keys()],delete:async url=>saved.delete(String(url))};
 const caches={open:async()=>{if(storageDenied)throw new Error('Denied');return cache;}};
 class Decoder{decodeAudioData(bytes){decodes++;return Promise.resolve({duration:1,label:new Uint8Array(bytes)[0]});}}
 class Context extends Decoder{
  constructor(){super();this.state='running';this.destination={};}
  createBufferSource(){return {playbackRate:{value:1},connect(){},disconnect(){},stop(){},start(){starts.push(this.buffer.label);}};}
 }
 const window={location:{href:'https://example.test/IELTS/'},caches,
  PRONUNCIATION_AUDIO:{locale:'en-GB',packs:{p:{url:'./media/pronunciation/p.bin',bytes:1024}},clips:{alpha:{pack:'p',offset:0,bytes:512},'beta phrase':{pack:'p',offset:512,bytes:512}}},
  ...(nativeOnly?{}:{OfflineAudioContext:Decoder,AudioContext:Context})};
 const binary=new Uint8Array(1024);binary.fill(1,0,512);binary.fill(2,512);
 const env={window,caches,Blob,Response,URL,AbortController,setTimeout,clearTimeout,
  fetch:async(...args)=>{fetches++;return fetcher?fetcher(...args):new Response(binary);}};
 vm.runInNewContext(source,env);
 class Audio extends EventTarget{constructor(){super();this.src='';this.plays=0;}pause(){}getAttribute(n){return this[n];}play(){this.plays++;return Promise.resolve();}}
 const audio=new Audio(),player=new window.PronunciationPlayer(audio,{onMessage:m=>messages.push(m)});
 return {player,audio,starts,messages,saved,binary,fetches:()=>fetches,decodes:()=>decodes};
}

test('a group needs one request and repeated taps reuse decoded sounds',async()=>{
 const s=setup();s.player.prepare(['alpha','beta phrase']);await settle();
 assert.equal(s.fetches(),1);assert.equal(s.decodes(),2);
 assert.equal(s.player.progress('mission').ready,2);
 s.player.play('alpha');await settle();s.player.play('alpha');await settle();
 assert.deepEqual(s.starts,[1,1]);assert.equal(s.fetches(),1);assert.equal(s.decodes(),2);
 s.player.stop();
});

test('rapid switching cannot play an older pending word',async()=>{
 let resolve;const s=setup({fetcher:()=>new Promise(r=>resolve=r)});
 s.player.play('alpha');s.player.play('beta phrase');await settle();
 resolve(new Response(s.binary));await settle();
 assert.deepEqual(s.starts,[2]);s.player.stop();
});

test('the first complete slice is available before the rest of a pack downloads',async()=>{
 let controller;const s=setup({fetcher:async()=>new Response(new ReadableStream({start(c){controller=c;}}))});
 const early=s.player.needClip('alpha',false);await settle();
 controller.enqueue(s.binary.slice(0,512));
 const bytes=await early;assert.equal(bytes.byteLength,512);
 assert.equal(s.player.jobs.get('p').done,false);
 controller.enqueue(s.binary.slice(512));controller.close();await settle();
 assert.equal(s.player.jobs.get('p').done,true);
});

test('HTML audio fallback works without Web Audio or storage and reuses its URL',async()=>{
 const s=setup({nativeOnly:true,storageDenied:true});
 s.player.prepare(['alpha']);await settle();s.player.play('alpha');await settle();
 const url=s.audio.src;s.player.play('alpha');await settle();
 assert.match(url,/^blob:/);assert.equal(s.audio.src,url);assert.equal(s.audio.plays,2);assert.equal(s.fetches(),1);
 s.player.stop();
});

test('unknown text gives a clear error rather than requesting a live dictionary',async()=>{
 const s=setup();s.player.play('missing');await settle();
 assert.equal(s.player.phase,'error');assert.equal(s.fetches(),0);assert.equal(s.messages.length,1);
});

test('recording playback holds background preparation but not an explicit word tap',async()=>{
 const s=setup();s.player.setBusy(true);s.player.prepare(['alpha']);await settle();
 assert.equal(s.fetches(),0);s.player.play('alpha');await settle();
 assert.equal(s.fetches(),1);assert.deepEqual(s.starts,[1]);s.player.stop();
});

test('persisted packs are reused by a new player without a network request',async()=>{
 const s=setup();s.player.prepare(['alpha','beta phrase']);await settle();
 assert.equal(s.saved.size,1);s.player.clips.clear();s.player.jobs.clear();s.player.decoded.clear();
 const clip=await s.player.needClip('alpha',false);assert.equal(new Uint8Array(clip)[0],1);
 assert.equal(s.fetches(),1);
});
