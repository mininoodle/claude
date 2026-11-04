/* usage: node study-site/test/backup.test.js <path to index.html>
   'Download a backup' and 'Restore from a backup' (the Today page and the account dialog): the file holds every entry and the clears; restoring it in an empty
   browser brings the progress back; restoring never deletes and never replaces a newer entry; a file from a newer version or not from this site is refused;
   inside an artifact the file goes through the downloads capability; a signed-in device uploads what a restore added. Exit code 0 = all pass. */
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');const os=require('os');
const FILE=path.resolve(process.argv[2]||'study-site/index.html'),res=[];
const ok=(t,c,info)=>{res.push(c);console.log((c?'PASS  ':'FAIL  ')+t+(info!==undefined?'  '+JSON.stringify(info):''));};
const now=Date.now(),seed={v:4,a:{mom_0_0:{v:1,ok:1,t:now-9e6},mom_0_1:{v:2,ok:0,t:now-8e6},th_1_r2:{v:'4.18',ok:1,t:now-7e6},eq_2_0:{x:1,t:now-6e6}},
  h:{mom_0_0:{d:['2026-11-01','2026-11-03'],c:2,m:0,t:now-9e6}},s:{mom_0_1:{b:0,d:now+864e5,t:now-8e6}},w:{'mt_ff-2_2':{v:[3,2,1,0],t:now-5e6},'note_pr-1_lit':{v:'My note about tone.',t:now-4e6}},
  r:{mom:{last:{c:3,n:5},best:{c:4,n:5},k:2,t:now-3e6}},g:{n_ok:{n:12,t:now-2e6},days:{v:['2026-11-01','2026-11-03'],t:now-2e6}},c:{'u:lim':{t:now-1e6}},pos:null,u:null};
(async()=>{const b=await chromium.launch(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bk-'));let ctxs=[];
  const open=async(o={})=>{const ctx=await b.newContext({viewport:{width:1100,height:900},acceptDownloads:true});ctxs.push(ctx);
    if(o.seed)await ctx.addInitScript(s=>{try{if(!sessionStorage.getItem('seeded')){localStorage.setItem('unit-study-site.v2',s);sessionStorage.setItem('seeded','1');}}catch(e){}},JSON.stringify(o.seed));
    if(o.claude)await ctx.addInitScript(()=>{window.__saved=[];window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push({filename:r.filename,text:await r.data.text()});return {status:'saved'};}}:null};});
    await ctx.addInitScript(()=>{window.__toasts=[];new MutationObserver(ms=>{for(const m of ms)for(const x of m.addedNodes)if(x.classList&&x.classList.contains('toast'))window.__toasts.push(x.textContent);}).observe(document,{childList:true,subtree:true});});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/net::|ERR_|Failed to load/.test(m.text()))p.errs.push(m.text());});
    await p.route(/^https?:\/\//,r=>r.abort());await p.goto('file://'+FILE);await p.waitForFunction(()=>typeof Store!=='undefined'&&document.querySelector('.lesson:not([hidden])'));
    await p.evaluate(()=>showTab(0));await p.waitForSelector('#home-0 [data-bk]');return p;};
  const flat=o=>{const J=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((q,k)=>(q[k]=v[k],q),{}):v),f={};for(const m of ['a','r','s','w','h','g','c'])for(const k in o[m]||{})f[m+'|'+k]=J(o[m][k]);return f;};
  try{
  /* 1. download from the Today page (a normal browser: a download link) */
  const A=await open({seed});const [dl]=await Promise.all([A.waitForEvent('download'),A.click('#home-0 [data-bk]')]);const fp=path.join(dir,dl.suggestedFilename());await dl.saveAs(fp);
  const file=JSON.parse(fs.readFileSync(fp,'utf8')),local=JSON.parse(await A.evaluate(()=>localStorage.getItem('unit-study-site.v2')));
  const fl=flat(local),ff=flat(file);const same=Object.keys(fl).length===Object.keys(ff).length&&Object.keys(fl).every(k=>ff[k]===fl[k]);
  ok('the backup file is named by the date and holds every entry, the cleared ones and the clears',/^study-progress-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename())&&file.kind==='unit-study-site-progress'&&file.v===4&&same&&!('u' in file)&&!('pos' in file),{name:dl.suggestedFilename(),entries:Object.keys(ff).length});
  ok('the Today page says when the last backup was made',await A.evaluate(()=>{refreshLive();return /Last backup/.test(document.querySelector('#home-0').innerText);}));

  /* 2. restore in an empty browser, through the file input of the account dialog */
  const B=await open();await B.evaluate(()=>accountDialog());const [ch]=await Promise.all([B.waitForEvent('filechooser'),B.click('dialog.confirm [data-rs]')]);await ch.setFiles(fp);
  await B.waitForFunction(()=>window.__toasts.some(t=>/restored/.test(t)));const bl=flat(JSON.parse(await B.evaluate(()=>localStorage.getItem('unit-study-site.v2'))));
  /* entries the new browser made itself at load (achievement migration) are newer, thus they stay */
  let miss=0;const own=[];for(const k in ff)if(bl[k]!==ff[k]){if(JSON.parse(bl[k]||'{}').t>JSON.parse(ff[k]).t)own.push(k);else miss++;}
  ok('restoring in an empty browser brings back every entry',miss===0&&own.every(k=>k.startsWith('g|ach'))&&await B.evaluate(()=>!!Store.get('mom_0_0')&&Store.w('note_pr-1_lit')==='My note about tone.'),{missing:miss,newerHere:own,toast:await B.evaluate(()=>window.__toasts.find(t=>/restored/.test(t)))});

  /* 3. restoring merges: a newer answer stays, a newer clear still applies, other entries are kept */
  const C=await open({seed:Object.assign({},seed,{a:{mom_0_0:{v:3,ok:0,t:now},ns_1_0:{v:0,ok:1,t:now-1000}},h:{},s:{},w:{},r:{},g:{},c:{'u:mom':{t:now-5e5}}})});
  const r=await C.evaluate(async t=>Store.importCopy(JSON.parse(t)),JSON.stringify(file));
  const cs=await C.evaluate(()=>({mom00:Store.get('mom_0_0'),mom01:Store.get('mom_0_1'),ns10:!!Store.get('ns_1_0'),th:!!Store.get('th_1_r2'),note:Store.w('note_pr-1_lit')}));
  ok('restoring never replaces a newer entry and never deletes',cs.mom00&&cs.mom00.v===3&&cs.ns10&&cs.th&&cs.note==='My note about tone.',cs);
  ok('a clear made after the backup still applies to the restored entries (restore cannot undo a clear)',cs.mom01===null,{mom_0_1:cs.mom01,n:r.n});

  /* 4. files that are refused */
  const bad=await C.evaluate(()=>[Store.importCopy({kind:'unit-study-site-progress',v:99,a:{x_0_0:{v:1,t:1}}}),Store.importCopy({hello:1}),Store.importCopy([1,2]),Store.importCopy({kind:'other',a:{}})].map(x=>x.err));
  ok('a file from a newer version, or not from this site, is refused',bad.join()==='newer,format,format,format'&&await C.evaluate(()=>!Store.get('x_0_0')),bad);
  fs.writeFileSync(path.join(dir,'junk.json'),'not json');await C.evaluate(()=>showTab(0));await C.waitForSelector('#home-0 [data-rs]');
  const [ch2]=await Promise.all([C.waitForEvent('filechooser'),C.click('#home-0 [data-rs]')]);await ch2.setFiles(path.join(dir,'junk.json'));
  ok('a file that is not JSON says so',await C.waitForFunction(()=>window.__toasts.some(t=>/not a backup/.test(t))).then(()=>true,()=>false));

  /* 5. inside an artifact the file goes through the downloads capability */
  const D=await open({seed,claude:1});await D.click('#home-0 [data-bk]');await D.waitForFunction(()=>window.__saved.length===1);
  const sv=await D.evaluate(()=>window.__saved[0]);ok('inside an artifact the backup goes through the downloads capability',/^study-progress-.*\.json$/.test(sv.filename)&&JSON.parse(sv.text).kind==='unit-study-site-progress',{filename:sv.filename});

  /* 6. a signed-in device uploads what the restore added */
  const E=await open();const up=await E.evaluate(async t=>{let doc=null;const mock={async get(){return {exists:!!doc,data:()=>JSON.parse(JSON.stringify(doc))};},async set(d){doc=JSON.parse(JSON.stringify(d));}};
    await Store.attach(mock,{label:'x',uid:'claude:e',src:'claude'});Store.importCopy(JSON.parse(t));await new Promise(r=>setTimeout(r,2500));return {a:Object.keys(doc.a||{}).length,note:!!(doc.w&&doc.w['note_pr-1_lit'])};},JSON.stringify(file));
  ok('a signed-in device uploads the restored entries',up.a>=4&&up.note,up);
  const errs=[A,B,C,D,E].flatMap(p=>p.errs);ok('no page errors',errs.length===0,errs.slice(0,3));
  }catch(e){ok('the test ran to the end',false,String(e&&e.stack||e).slice(0,500));}
  for(const c of ctxs)await c.close();await b.close();fs.rmSync(dir,{recursive:true,force:true});
  const f=res.filter(x=>!x).length;console.log(`${res.length-f} of ${res.length} passed`);process.exit(f?1:0);})();
