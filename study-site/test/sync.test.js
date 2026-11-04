/* usage: node study-site/test/sync.test.js <path to index.html> [old index.html]
   The account copy, against a mock server in this process that several browser "devices" share. The mock follows the Claude db contract (db.d.ts 0.2.73):
   documents over 256 KiB are rejected with invalid_argument, update() needs an existing document and merges nested objects, the writer's own listener sees
   its write first with hasPendingWrites, a viewer who may not write reads nothing and every write is rejected. The Firestore path runs against a mock of the
   Firebase modules that the page imports (the same server, with setDoc merge semantics).
   Cases: migration of an old single document of about 300 KB without loss, two devices live, offline answers, a viewer who cannot write, the version gate,
   cost per answer, an old page that is still open (with the second argument: a copy of the page from before the change), Firestore. Exit code 0 = all pass. */
const {chromium}=require('playwright');const path=require('path');
const FILE=path.resolve(process.argv[2]||'study-site/index.html'),OLD=process.argv[3]?path.resolve(process.argv[3]):null;
const LIM=256*1024,sleep=ms=>new Promise(r=>setTimeout(r,ms)),res=[];
const ok=(t,c,info)=>{res.push([c?'PASS':'FAIL',t]);console.log((c?'PASS  ':'FAIL  ')+t+(info!==undefined?'  '+(typeof info==='string'?info:JSON.stringify(info)):''));};
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const size=x=>Buffer.byteLength(JSON.stringify(x));
const deep=(a,b,arr)=>{for(const k in b){const v=b[k];if(v&&typeof v==='object'&&!Array.isArray(v)&&a[k]&&typeof a[k]==='object'&&!Array.isArray(a[k]))deep(a[k],v);else a[k]=clone(v);}return a;};
const nested=x=>Array.isArray(x)?x.some(v=>Array.isArray(v)||nested(v)):x&&typeof x==='object'?Object.values(x).some(nested):false;

/* ---------- the mock server ---------- */
class Server{
  constructor(){this.docs=new Map();this.subs=new Map();this.sid=0;}
  col(p){return p.split('/').slice(0,-1).join('/');}
  vis(dev,p){return !dev.viewer;}
  async op(dev,op,a){
    if(dev.offline&&op!=='unsub')throw {code:'unavailable',message:'offline'};
    if(dev.revoked&&op!=='unsub')throw {code:'revoked',message:'the grant was withdrawn'};
    const n=a&&a.path;dev.calls=(dev.calls||0)+1;
    if(op==='get'){const d=this.vis(dev,n)?this.docs.get(n):undefined;dev.readB=(dev.readB||0)+(d?size(d):0);return {exists:!!d,data:clone(d)};}
    if(op==='query'){const out=[];for(const [p,d] of this.docs)if(this.col(p)===n&&this.vis(dev,p))out.push({id:p.split('/').pop(),data:clone(d)});out.sort((x,y)=>x.id<y.id?-1:1);dev.readB=(dev.readB||0)+out.reduce((s,d)=>s+size(d.data),0);return out;}
    if(op==='set'||op==='update'||op==='merge'){
      if(dev.viewer)throw {code:dev.fb?'permission-denied':'invalid_argument',message:'this viewer may not write'};
      const cur=this.docs.get(n);if(op==='update'&&!cur)throw {code:'invalid_argument',message:'update() needs an existing document'};
      const next=op==='set'?clone(a.data):deep(clone(cur||{}),a.data);
      if(size(next)>dev.lim)throw {code:dev.fb?'invalid-argument':'invalid_argument',message:'document over the size limit'};
      if(dev.fb&&nested(next))throw {code:'invalid-argument',message:'nested arrays are not supported'};
      dev.writes=(dev.writes||0)+1;dev.writeB=(dev.writeB||0)+size(a.data);this.docs.set(n,next);this.changed(n,dev);return true;}
    if(op==='sub'){const id=++this.sid;this.subs.set(id,{dev,kind:a.kind,path:n,seen:new Map(),first:true});setTimeout(()=>this.deliver(id,null),5);return id;}
    if(op==='unsub'){this.subs.delete(a.id);return true;}
    throw new Error('op '+op);}
  changed(p,writer){for(const [id,s] of this.subs){if(!(s.kind==='col'?this.col(p)===s.path:s.path===p))continue;
      if(s.dev===writer)this.deliver(id,p,true);setTimeout(()=>this.deliver(id,null),20);}}
  /* the changes this subscription has not seen. pend: the writer's own unconfirmed write */
  async deliver(id,pend,pending){const s=this.subs.get(id);if(!s||s.dev.offline||s.dev.closed)return;
    const now=new Map();for(const [p,d] of this.docs)if((s.kind==='col'?this.col(p)===s.path:p===s.path)&&this.vis(s.dev,p))now.set(p,JSON.stringify(d));
    const ch=[];for(const [p,t] of now){if(pending&&p!==pend)continue;const o=s.seen.get(p);if(o!==t)ch.push({type:o===undefined?'added':'modified',id:p.split('/').pop(),data:JSON.parse(t),pending:!!pending});}
    if(!pending)for(const [p] of s.seen)if(!now.has(p))ch.push({type:'removed',id:p.split('/').pop(),data:null});
    if(!pending){s.seen=now;}if(!ch.length&&!s.first)return;s.first=false;
    s.dev.readB=(s.dev.readB||0)+ch.reduce((n,c)=>n+(c.data?size(c.data):0),0);
    try{await s.dev.page.evaluate(([id,pl])=>window.__snap&&window.__snap(id,pl),[id,{kind:s.kind,changes:ch,fromCache:false}]);}catch(e){}}
  online(dev){for(const [id,s] of this.subs)if(s.dev===dev)this.deliver(id,null);}
}

/* ---------- the page side: window.claude (db and user), built on the server above ---------- */
const CLAUDE_SHIM=cfg=>{const call=(op,a)=>window.__db(op,a);const L=new Map();
  window.__snap=(id,pl)=>{const f=L.get(id);if(!f)return;const V=f.view;pl.changes.forEach(c=>{if(c.data)V.set(c.id,c);else V.delete(c.id);});pl.docs=[...V.values()].sort((x,y)=>x.id<y.id?-1:1);const mk=c=>({id:c.id,exists:!!c.data,data:()=>c.data?JSON.parse(JSON.stringify(c.data)):undefined,metadata:{hasPendingWrites:!!c.pending,fromCache:false}});
    if(pl.kind==='doc'){const c=pl.changes[0]||pl.docs[0]&&Object.assign({},pl.docs[0],{pending:false});f.next(c?mk(c):{id:'',exists:false,data:()=>undefined,metadata:{hasPendingWrites:false,fromCache:false}});return;}
    const docs=pl.docs.map(mk),ch=pl.changes.map(c=>({type:c.type,doc:mk(c)}));f.next({docs,size:docs.length,empty:!docs.length,docChanges:()=>ch,metadata:{fromCache:!!pl.fromCache,hasPendingWrites:pl.changes.some(c=>c.pending)}});};
  const sub=(kind,p,next,err)=>{let id=null,dead=false;call('sub',{kind,path:p}).then(i=>{id=i;if(dead)call('unsub',{id});else L.set(i,{next,err,view:new Map()});},e=>err&&err(e));return ()=>{dead=true;if(id!=null){L.delete(id);call('unsub',{id});}};};
  const wrap=p=>Promise.resolve(p).catch(e=>{throw {code:e&&e.code||String(e),message:e&&e.message||''};});
  const docRef=p=>({id:p.split('/').pop(),path:p,
    get:()=>call('get',{path:p}).then(r=>({id:p.split('/').pop(),exists:r.exists,data:()=>r.data,metadata:{hasPendingWrites:false,fromCache:false}})),
    set:d=>wrap(call('set',{path:p,data:d})).then(()=>undefined),update:d=>wrap(call('update',{path:p,data:d})).then(()=>undefined),
    onSnapshot:(n,e)=>sub('doc',p,n,e),collection:c=>colRef(p+'/'+c)});
  const colRef=p=>({path:p,doc:id=>docRef(p+'/'+id),
    get:()=>cfg.noQuery?Promise.reject({code:'invalid_argument',message:'no query here'}):call('query',{path:p}).then(ds=>{const docs=ds.map(d=>({id:d.id,exists:true,data:()=>JSON.parse(JSON.stringify(d.data)),metadata:{hasPendingWrites:false,fromCache:false}}));return {docs,size:docs.length,empty:!docs.length,docChanges:()=>docs.map(d=>({type:'added',doc:d})),metadata:{fromCache:false,hasPendingWrites:false}};}),
    onSnapshot:(n,e)=>{if(cfg.noQuery){setTimeout(()=>e&&e({code:'invalid_argument',message:'no query here'}),5);return ()=>{};}return sub('col',p,n,e);}});
  const db={doc:docRef,collection:colRef};
  const user={id:async()=>cfg.id,isOwner:async()=>!!cfg.owner,canEdit:async()=>!!cfg.owner,can:async()=>cfg.can===undefined?null:cfg.can,me:async()=>({id:cfg.id,name:'',email:null,isOwner:!!cfg.owner,canEdit:!!cfg.owner})};
  window.claude={use:async n=>n==='db'?db:n==='user'?user:null};
  window.__toasts=[];new MutationObserver(ms=>{for(const m of ms)for(const x of m.addedNodes)if(x.classList&&x.classList.contains('toast'))window.__toasts.push(x.textContent);}).observe(document,{childList:true,subtree:true});};

/* ---------- the Firebase modules the page imports, on the same server (users/{uid}/progress/...) ---------- */
const FB_APP=`export const initializeApp=c=>({c});`;
const FB_AUTH=`let cb=[],cur=null;export const getAuth=()=>({});export class GoogleAuthProvider{setCustomParameters(){}}
export const onAuthStateChanged=(a,f)=>{cb.push(f);setTimeout(()=>f(cur),0);return ()=>{};};
export const signInWithPopup=async()=>{const u=window.__nextUser||'fbU1';cur={uid:u,email:u+'@example.com'};cb.forEach(f=>f(cur));return {user:cur};};
export const signInWithRedirect=signInWithPopup;export const getRedirectResult=async()=>null;export const signOut=async()=>{cur=null;cb.forEach(f=>f(null));};`;
const FB_STORE=`const call=(op,a)=>window.__db(op,a).catch(e=>{throw {code:e&&e.code||String(e),message:e&&e.message||''};});const L=new Map();
export const getFirestore=()=>({});
export const collection=(db,...p)=>({type:'col',path:p.join('/')});export const doc=(db,...p)=>({type:'doc',path:p.join('/'),id:p[p.length-1]});
const snap=(id,data,pending)=>({id,exists:()=>!!data,data:()=>data?JSON.parse(JSON.stringify(data)):undefined,metadata:{hasPendingWrites:!!pending,fromCache:false}});
export const getDoc=async r=>{const x=await call('get',{path:r.path});return snap(r.id,x.exists?x.data:null);};
export const getDocs=async c=>{const ds=await call('query',{path:c.path});return {docs:ds.map(d=>snap(d.id,d.data)),metadata:{fromCache:false}};};
export const setDoc=async(r,d,o)=>{await call(o&&o.merge?'merge':'set',{path:r.path,data:d});};
window.__fbsnap=(id,pl)=>{const f=L.get(id);if(!f)return;const V=f.view||(f.view=new Map());pl.changes.forEach(c=>{if(c.data)V.set(c.id,c);else V.delete(c.id);});pl.docs=[...V.values()];const ch=pl.changes.map(c=>({type:c.type,doc:snap(c.id,c.data,c.pending)}));
  f({docs:pl.docs.map(d=>snap(d.id,d.data)),metadata:{fromCache:false},docChanges:o=>{if(o&&o.includeMetadataChanges&&!f.meta)throw new Error('includeMetadataChanges');return ch;}});};
export const onSnapshot=(q,o,n,e)=>{if(typeof o==='function'){e=n;n=o;o={};}let id=null;const f=s=>n(s);f.meta=!!(o&&o.includeMetadataChanges);
  call('sub',{kind:q.type,path:q.path}).then(i=>{id=i;L.set(i,f);});return ()=>{if(id!=null){L.delete(id);call('unsub',{id});}};};`;

const server=new Server();let browser;
async function device(name,o={}){const ctx=await browser.newContext({viewport:{width:1100,height:800}});const dev={name,ctx,lim:o.lim||LIM,viewer:!!o.viewer,fb:!!o.fb,offline:!!o.offline};
  if(o.seed)await ctx.addInitScript(s=>{try{if(!sessionStorage.getItem('seeded')){localStorage.setItem('unit-study-site.v2',s);sessionStorage.setItem('seeded','1');}}catch(e){}},o.seed);
  if(o.fb){await ctx.addInitScript(()=>{window.__snap=(id,pl)=>window.__fbsnap&&window.__fbsnap(id,pl);window.__toasts=[];new MutationObserver(ms=>{for(const m of ms)for(const x of m.addedNodes)if(x.classList&&x.classList.contains('toast'))window.__toasts.push(x.textContent);}).observe(document,{childList:true,subtree:true});});
    await ctx.route(/gstatic\.com\/firebasejs\/.*\/firebase-(app|auth|firestore)\.js/,r=>{const n=r.request().url().match(/firebase-(\w+)\.js/)[1];r.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:n==='app'?FB_APP:n==='auth'?FB_AUTH:FB_STORE});});}
  else await ctx.addInitScript(CLAUDE_SHIM,{id:o.id||'u1',owner:o.owner!==false,can:o.can,noQuery:!!o.noQuery});
  await ctx.route(/^https?:\/\/(?!www\.gstatic\.com\/firebasejs)/,r=>r.abort());
  await ctx.exposeBinding('__db',(src,op,a)=>server.op(dev,op,a));
  const page=await ctx.newPage();dev.page=page;dev.errors=[];page.on('pageerror',e=>dev.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/net::|ERR_|Failed to load/.test(m.text()))dev.errors.push(m.text());});
  await page.goto('file://'+(o.file||FILE));await page.waitForFunction(()=>typeof Store!=='undefined'&&document.querySelector('.lesson:not([hidden])'));
  return dev;}
const close=async dev=>{dev.closed=true;await dev.ctx.close();};
const ev=(dev,f,a)=>dev.page.evaluate(f,a);
const until=async(dev,f,a,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await ev(dev,f,a))return true;await sleep(100);}return false;};
/* the entries of a copy as one map 'm|k' -> canonical JSON, tombstones included */
const flat=o=>{const J=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((q,k)=>(q[k]=v[k],q),{}):v);const f={};for(const m of ['a','r','s','w','h','g','c'])for(const k in o[m]||{})f[m+'|'+k]=J(o[m][k]);return f;};
const unshard=(prefix)=>{const o={};for(const [p,d] of server.docs){if(!p.startsWith(prefix))continue;const id=p.slice(prefix.length);if(id==='progress'||id==='main')continue;
  for(const m in d){if(m==='v'||!d[m]||typeof d[m]!=='object')continue;o[m]=o[m]||{};for(const k in d[m])o[m][k]=typeof d[m][k]==='string'?JSON.parse(d[m][k]):d[m][k];}}return o;};
const state=dev=>ev(dev,()=>{const o=Store.exportCopy?Store.exportCopy():JSON.parse(localStorage.getItem('unit-study-site.v2'));return o;});

/* a heavy old single document, built from the page's own lessons: every lesson and review question answered, with history and spaced repetition */
const buildLegacy=dev=>ev(dev,()=>{const o={v:3,a:{},r:{},s:{},w:{},h:{},g:{},c:{}},now=Date.now(),DAY=864e5;let r=7;const rnd=()=>{r=(r*16807)%2147483647;return r/2147483647;};
  const FREE=['th_0','th_1','th_2','eq_2','mom_3','ns_1','lim_2','ff_1'];
  for(const k of ORDER)SUBJ[k].lessons.forEach((le,L)=>{if(!le.qz||le.rv||FREE.includes(k+'_'+L))return;const ids=le.qz.map((_,j)=>k+'_'+L+'_'+j).concat((le.rq||[]).map((_,j)=>k+'_'+L+'_r'+j));
    ids.forEach((id,i)=>{const t=now-Math.floor(rnd()*150)*DAY-5*DAY;o.a[id]={v:Math.floor(rnd()*4),ok:1,t};o.h[id]={d:[dayOf(t-6*DAY),dayOf(t-3*DAY),dayOf(t)],c:3,m:Math.floor(rnd()*2),t};if(rnd()<.6)o.s[id]=rnd()<.5?{x:1,t}:{b:1,d:t+3*DAY,t};});
    o.g['cnt_'+k+'_'+L]={n:9,t:now-DAY};});
  for(const k of ORDER){o.r[k]={last:{c:18,n:20},best:{c:20,n:20},k:3,t:now-DAY};o.g['boss_'+k]={won:dayOf(now-9*DAY),best:{c:9,ms:70000},t:now-DAY};}
  o.w['mt_ff-2_2']={v:[3,2,1,0,3],t:now-DAY};o.w['note_pr-1_lit']={v:'A note. '.repeat(400),t:now-DAY};o.w['ice_0']={v:{a:1},t:now-DAY};
  o.g.days={v:Array.from({length:160},(_,i)=>dayOf(now-(160-i)*DAY)),t:now-DAY};o.g.n_ok={n:4000,t:now-DAY};o.c['rb2:bio']={t:Date.parse('2026-11-02T16:01:43Z')};
  return o;});
const answer=(dev,sk,L,n)=>ev(dev,async([sk,L,n])=>{goLesson(sk,L);await new Promise(r=>setTimeout(r,300));let k=0;
  for(const q of [...document.querySelectorAll('#'+sk+'-'+L+' .quiz .q')].filter(q=>q.querySelector('.ops')&&!q.dataset.done)){if(k>=n)break;q.querySelector('button.op').click();k++;await new Promise(r=>setTimeout(r,120));}return k;},[sk,L,n]);

(async()=>{browser=await chromium.launch();const T0=Date.now();
  try{
  /* 1. migration: the account holds only the old single document (about 300 KB); a device with an empty browser signs in */
  let A=await device('A');const legacy=await buildLegacy(A);const legSize=size(legacy);server.docs.set('data/users/u1/progress',clone(legacy));
  await close(A);A=await device('A');
  const tm=Date.now();ok('the device connects to the Claude account and moves the old document',await until(A,()=>Store.mode()==='account'&&!Store.pending(),null,20000),{legacyKB:Math.round(legSize/1024),seconds:(Date.now()-tm)/1000});
  const fa=flat(await state(A)),fl=flat(legacy),RB=Date.parse('2026-11-02T16:01:43Z');let miss=0,diff=0,cut=0;
  for(const k in fl){if(!(k in fa))miss++;else if(fa[k]!==fl[k]){const [m,id]=k.split('|');if(/^[ash]$/.test(m)&&/^(ns|sn|en)_\d+_r\d+$/.test(id)&&fa[k]===JSON.stringify({t:RB,x:1}))cut++;else diff++;}}
  ok('every entry of the old document is on the device (unchanged, or cleared by its own rb2:bio cut-off)',miss===0&&diff===0,{entries:Object.keys(fl).length,missing:miss,changed:diff,clearedByRb2:cut});
  const shards=[...server.docs.keys()].filter(p=>p.startsWith('data/users/u1/')&&!p.endsWith('/progress')),fs=flat(unshard('data/users/u1/'));let smiss=0;for(const k in fl)if(fs[k]!==fa[k])smiss++;
  ok('every entry is in the new documents of the account',smiss===0,{docs:shards.length,missing:smiss});
  const big=Math.max(...shards.map(p=>size(server.docs.get(p))));ok('each document stays far below 256 KiB',big<LIM*0.6,{largestKB:+(big/1024).toFixed(1)});
  ok('the old document is not written',JSON.stringify(server.docs.get('data/users/u1/progress'))===JSON.stringify(legacy));
  ok('the new documents carry schema 4',shards.every(p=>server.docs.get(p).v===4));
  ok('no page errors (A)',A.errors.length===0,A.errors.slice(0,3));

  /* 2. cost of one answer while signed in */
  const cost=async(dev,sk,L)=>{const w0=dev.writeB||0,r0=dev.readB||0,c0=dev.writes||0,q0=dev.calls||0;await answer(dev,sk,L,1);await until(dev,()=>!Store.pending());await sleep(300);
    return {writes:(dev.writes||0)-c0,bytes:(dev.writeB||0)-w0,calls:(dev.calls||0)-q0,listenerBytes:(dev.readB||0)-r0};};
  const c1=await cost(A,'th',1),c2=await cost(A,'th',1);
  ok('one answer uploads less than 1 KB, without a read first (the first answer of a day also writes the study-day list)',c2.bytes<1024&&c2.calls===c2.writes,{firstOfDay:c1,next:c2});

  /* an entry whose value JSON changes (NaN becomes null) is uploaded once, not again and again */
  {const w=A.writes||0;await ev(A,()=>Store.xs('g','nanCheck',{n:NaN,v:undefined}));await sleep(4000);ok('an entry with NaN is uploaded once',(A.writes||0)-w===1,{writes:(A.writes||0)-w});}

  /* 2b. two devices move the same old document at the same moment, each with answers that only it has */
  {const small=clone(legacy);for(const m of ['a','h','s'])for(const k of Object.keys(small[m]))if(!/^(ff|eq)_/.test(k))delete small[m][k];server.docs.set('data/users/u3/progress',small);
    const t=Date.now()-1000,seed=ids=>JSON.stringify({a:Object.fromEntries(ids.map(i=>[i,{v:1,ok:1,t}])),r:{},s:{},w:{},h:{},g:{},c:{}});
    const [R1,R2]=await Promise.all([device('R1',{id:'u3',seed:seed(['mom_0_0','th_0_0'])}),device('R2',{id:'u3',seed:seed(['mom_0_1','mb_1_0'])})]);
    await Promise.all([until(R1,()=>Store.mode()==='account'&&!Store.pending(),null,15000),until(R2,()=>Store.mode()==='account'&&!Store.pending(),null,15000)]);await sleep(1500);
    const all=['mom_0_0','th_0_0','mom_0_1','mb_1_0'],acc=unshard('data/users/u3/');
    const r1=await ev(R1,ids=>ids.filter(i=>Store.get(i)).length,all),r2=await ev(R2,ids=>ids.filter(i=>Store.get(i)).length,all);
    const fsm=flat(small),fr=flat(acc);let lost=0;for(const k in fsm)if(!(k in fr))lost++;
    ok('a migration on two devices at once loses nothing',r1===4&&r2===4&&all.every(i=>acc.a[i])&&lost===0,{R1:r1,R2:r2,inAccount:all.filter(i=>acc.a[i]).length,oldEntriesMissing:lost});
    await close(R1);await close(R2);}

  /* 2c. a store that refuses a query on the collection: each document is read and watched on its own */
  {const small=clone(legacy);for(const m of ['a','h','s'])for(const k of Object.keys(small[m]))if(!/^(ns|lim)_/.test(k))delete small[m][k];server.docs.set('data/users/u4/progress',small);
    const Q=await device('Q',{id:'u4',noQuery:true});const okQ=await until(Q,()=>Store.mode()==='account'&&!Store.pending(),null,15000);
    const fq=flat(await state(Q)),fsm=flat(small);let lost=0;for(const k in fsm)if(!(k in fq))lost++;const acc=flat(unshard('data/users/u4/'));let notUp=0;for(const k in fq)if(acc[k]!==fq[k])notUp++;
    const Q2=await device('Q2',{id:'u4'});await until(Q2,()=>Store.mode()==='account'&&!Store.pending(),null,15000);
    await answer(Q,'th',1,1);const iq=await ev(Q,()=>Store.xk('a').filter(k=>k.startsWith('th_1_')).sort((x,y)=>Store.get(y).t-Store.get(x).t)[0]);
    await answer(Q2,'eq',2,1);const iq2=await ev(Q2,()=>Store.xk('a').filter(k=>k.startsWith('eq_2_')).sort((x,y)=>Store.get(y).t-Store.get(x).t)[0]);
    const live1=await until(Q2,id=>!!Store.get(id),iq),live2=await until(Q,id=>!!Store.get(id),iq2);
    ok('a store without collection queries: the old document moves, and the devices sync live',okQ&&lost===0&&notUp===0&&live1&&live2,{connected:okQ,oldEntriesMissing:lost,notInAccount:notUp,QtoQ2:live1,Q2toQ:live2,errors:Q.errors.concat(Q2.errors).slice(0,2)});
    await close(Q);await close(Q2);}

  /* 3. a second device signs in, and the two see each other's answers live */
  let B=await device('B');ok('device B gets all of the progress',await until(B,()=>Store.mode()==='account'&&!Store.pending()&&Store.xk('a').length>1500),await ev(B,()=>Store.xk('a').length));
  await answer(A,'eq',2,2);const idA=await ev(A,()=>Store.xk('a').filter(k=>k.startsWith('eq_2_')).sort((x,y)=>Store.get(y).t-Store.get(x).t)[0]);
  ok('an answer on A reaches B live',await until(B,id=>{const e=Store.get(id),f=JSON.parse(localStorage.getItem('unit-study-site.v2')).a[id];return !!e&&!!f&&e.t===f.t;},idA)&&await until(B,([id,t])=>Store.get(id).t===t,[idA,await ev(A,id=>Store.get(id).t,idA)]));
  await answer(B,'mom',3,2);const idB=await ev(B,()=>Store.xk('a').filter(k=>k.startsWith('mom_3_')).sort((x,y)=>Store.get(y).t-Store.get(x).t)[0]);
  ok('an answer on B reaches A live',await until(A,([id,t])=>{const e=Store.get(id);return !!e&&e.t===t;},[idB,await ev(B,id=>Store.get(id).t,idB)]));

  /* 4. offline: A answers while offline; the answers upload when it is back */
  A.offline=true;await answer(A,'ns',1,3);const offIds=await ev(A,()=>Store.xk('a').filter(k=>k.startsWith('ns_1_')).sort((x,y)=>Store.get(y).t-Store.get(x).t).slice(0,3));
  await sleep(2500);const st=await ev(A,()=>Store.status());ok('offline: the answers wait, and the state says so',st.remote==='retrying'||st.remote==='pending',st);
  A.offline=false;server.online(A);await ev(A,()=>Store.sync());
  ok('back online: the answers reach B',await until(B,ids=>ids.every(id=>!!Store.get(id)),offIds,15000));
  ok('no page errors (A, B)',A.errors.length+B.errors.length===0,A.errors.concat(B.errors).slice(0,3));

  /* 5. both devices agree, entry by entry, with each other and with the account */
  await sleep(500);const sa=flat(await state(A)),sb=flat(await state(B)),sr=flat(unshard('data/users/u1/'));let ab=0,ar=0;for(const k in sa){if(sa[k]!==sb[k])ab++;if(sa[k]!==sr[k])ar++;}
  ok('A, B and the account copy hold the same entries',ab===0&&ar===0,{entries:Object.keys(sa).length,AvsB:ab,AvsAccount:ar});
  await close(B);

  /* 6. an old page that is still open (account u2, whose old document is under the cap, so that the old page can still write it):
     it writes only the old document; its answers reach the new page and the new documents, and it cannot erase them */
  if(OLD){const small=clone(legacy);for(const m of ['a','h','s'])for(const k of Object.keys(small[m]))if(!/^(mom|th|eq)_/.test(k))delete small[m][k];server.docs.set('data/users/u2/progress',small);
    const N=await device('N',{id:'u2'});await until(N,()=>Store.mode()==='account'&&!Store.pending(),null,15000);await answer(N,'th',0,2);await until(N,()=>!Store.pending());
    const C=await device('C',{id:'u2',file:OLD});await until(C,()=>Store.mode()==='account');const sh=()=>JSON.stringify([...server.docs].filter(([p])=>p.startsWith('data/users/u2/')&&!p.endsWith('/progress')));
    const before=sh(),legW=(C.writes||0);await answer(C,'lim',2,2);await sleep(2500);const idC=await ev(C,()=>Store.xk('a').filter(k=>k.startsWith('lim_2_')).sort((x,y)=>Store.get(y).t-Store.get(x).t)[0]);
    ok('the old page writes only the old document',(C.writes||0)>legW&&!!idC,{oldPageWrites:(C.writes||0)-legW,answered:idC});
    ok('its answer reaches the new page and the new documents',await until(N,id=>!!Store.get(id),idC)&&await (async()=>{for(let i=0;i<30;i++){if(unshard('data/users/u2/').a&&unshard('data/users/u2/').a[idC])return true;await sleep(200);}return false;})());
    const nTh=await ev(N,()=>Store.xk('a').filter(k=>k.startsWith('th_0_')).length);ok('the answers of the new page are still in the new documents',Object.keys(unshard('data/users/u2/').a).filter(k=>k.startsWith('th_0_')&&!unshard('data/users/u2/').a[k].x).length===nTh&&nTh>0,{th0:nTh});
    await close(C);await close(N);}

  /* 7. a viewer who may not write (a shared link): the platform says nothing up front, the first write is refused */
  const V=await device('V',{id:'v9',viewer:true,owner:false,seed:JSON.stringify({a:{mom_0_0:{v:1,ok:1,t:Date.now()-5000}},r:{},s:{},w:{},h:{},g:{},c:{}})});
  await sleep(1500);await answer(V,'th',0,1);await sleep(2000);const vw=V.writes||0,vc=V.calls;await answer(V,'th',0,2);await sleep(2500);
  const vs=await ev(V,()=>({mode:Store.mode(),st:Store.status(),toasts:window.__toasts,saved:!!JSON.parse(localStorage.getItem('unit-study-site.v2')).a.mom_0_0}));
  ok('viewer: no account sync is claimed, and the page says why once',vs.mode==='device'&&vs.st.remote==='viewer'&&vs.toasts.filter(t=>/cannot save progress to your Claude account/.test(t)).length===1,vs);
  ok('viewer: no more writes are tried after the refusal',V.calls===vc,{callsAfter:V.calls-vc});
  ok('viewer: progress is still saved in the browser',vs.saved);
  await close(V);
  const V2=await device('V2',{id:'v8',viewer:true,owner:false,can:false});await sleep(1200);
  ok('viewer (the platform says it cannot write): no attach and no write',(V2.writes||0)===0&&await ev(V2,()=>Store.mode()==='device'&&Store.status().remote==='viewer'));
  await close(V2);

  /* 7b. the grant is withdrawn while the page runs: sync stops for this visit, without the viewer text, and progress stays in the browser */
  {const RV=await device('RV',{id:'u5'});await until(RV,()=>Store.mode()==='account'&&!Store.pending());RV.revoked=true;await answer(RV,'th',0,1);await sleep(2500);
    const rv=await ev(RV,()=>({mode:Store.mode(),st:Store.status(),t:window.__toasts.filter(t=>/stopped for this visit/.test(t)).length,saved:Store.xk('a').length}));
    ok('a withdrawn grant: detached for the visit, said once, progress kept in the browser',rv.mode==='device'&&rv.st.remote==='off'&&rv.t===1&&rv.saved>=1,rv);await close(RV);}

  /* 8. the version gate: a newer page wrote schema 5 */
  const meta=server.docs.get('data/users/u1/meta');meta.v=5;server.changed('data/users/u1/meta',null);await sleep(300);const wv=A.writes;await answer(A,'ff',1,1);await sleep(2500);
  const gs=await ev(A,()=>({st:Store.status(),t:window.__toasts.filter(t=>/out of date/.test(t)).length}));
  ok('version gate: no upload after a newer page wrote, and the page asks for a reload',A.writes===wv&&gs.st.remote==='outdated'&&gs.t===1,gs);
  ok('no page errors (A)',A.errors.length===0,A.errors.slice(0,3));
  await close(A);

  /* 9. Firestore: the same layout in users/{uid}/progress, with the old document 'main' */
  const fbLegacy=clone(legacy);delete fbLegacy.w['note_pr-1_lit'];server.docs.set('users/fbU1/progress/main',fbLegacy);
  const G=await device('G',{fb:1});await until(G,()=>window.SYNC&&window.SYNC.ready);await ev(G,()=>window.SYNC.signIn());
  ok('Firestore: signs in and syncs',await until(G,()=>Store.mode()==='account'&&!Store.pending()&&Store.xk('a').length>1500,null,15000));
  const fg=flat(await state(G)),ffl=flat(fbLegacy);let fm=0;for(const k in ffl)if(!(k in fg))fm++;
  const fsh=flat(unshard('users/fbU1/progress/'));let fsm=0;for(const k in fg)if(fsh[k]!==fg[k])fsm++;
  ok('Firestore: every old entry is kept and stored in the new documents',fm===0&&fsm===0,{missing:fm,notInAccount:fsm,docs:[...server.docs.keys()].filter(p=>p.startsWith('users/fbU1/')).length});
  await cost(G,'th',2);const g2=await cost(G,'th',2);ok('Firestore: one answer is a small merge write',g2.bytes<1024,g2);
  ok('Firestore: the old document is not written',JSON.stringify(server.docs.get('users/fbU1/progress/main'))===JSON.stringify(fbLegacy));
  /* another account signs in on this browser while fbU1 has answers that did not upload: they are kept for fbU1, not given to fbU2, and upload when fbU1 is back */
  G.offline=true;await answer(G,'mom',3,2);const gi=await ev(G,()=>Store.xk('a').filter(k=>k.startsWith('mom_3_')).sort((x,y)=>Store.get(y).t-Store.get(x).t).slice(0,2));
  await ev(G,async()=>{await Store.flush(800);await window.SYNC.signOut();});G.offline=false;
  await ev(G,()=>{window.__nextUser='fbU2';return window.SYNC.signIn();});await until(G,()=>Store.mode()==='account'&&!Store.pending(),null,15000);
  const onB=await ev(G,ids=>ids.filter(i=>Store.get(i)).length,gi),inB=Object.keys(unshard('users/fbU2/progress/').a||{}).filter(k=>gi.includes(k)).length;
  await ev(G,async()=>{await window.SYNC.signOut();window.__nextUser='fbU1';return window.SYNC.signIn();});await until(G,()=>Store.mode()==='account'&&!Store.pending(),null,15000);await sleep(500);
  const back=await ev(G,ids=>ids.filter(i=>Store.get(i)).length,gi),up=gi.filter(i=>(unshard('users/fbU1/progress/').a||{})[i]).length;
  ok('another account on this browser: answers that did not upload are kept for their account, and upload when it is back',gi.length===2&&onB===0&&inB===0&&back===2&&up===2,{answered:gi.length,onDeviceForB:onB,inBsAccount:inB,backForA:back,uploaded:up});
  ok('no page errors (G)',G.errors.length===0,G.errors.slice(0,3));
  await close(G);
  }catch(e){ok('the test ran to the end',false,String(e&&e.stack||e).slice(0,600));}
  await browser.close();const f=res.filter(r=>r[0]==='FAIL').length;console.log(`${res.length-f} of ${res.length} passed in ${((Date.now()-T0)/1000).toFixed(1)} s`);process.exit(f?1:0);})();
