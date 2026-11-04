/* usage: node study-site/test/ec-dip7.test.js <path to index.html>
   The diploma practice questions 48 to 91 of Electrochemistry lesson 7 (EC_DIP[7], slot 7d): 44 items in the order of the notes, the keys of the answer key
   (notes p. 85), every numeric item accepts its own key, code answers stay out of the exam's number boxes, every "below" stem has its figure, the items
   follow the lesson's own questions, no line can break inside a formula, nothing is wider than its question on a 320 px phone, and the page loads with
   no console errors. Exit code 0 = pass, 1 = fail. */
const path=require('path');let chromium;try{({chromium}=require('playwright'));}catch(e){({chromium}=require('/opt/node-tools/node_modules/playwright'));}
const file=path.resolve(process.argv[2]||path.join(__dirname,'..','index.html'));
const KEY={48:'D',49:'B',50:'A',51:'D',52:2.37,53:3.04,54:.44,55:'D',56:'A',57:'D',58:'C',59:'A',60:'C',61:1.5,62:'A',63:'A',64:'C',65:'D',66:'C',67:'B',68:'D',69:'B',70:'C',
  71:'C',72:'A',73:'C',74:56.2,75:'A',76:'D',77:'A',78:'1467',79:'4631',80:'B',81:'A',82:'A',83:'A',84:'B',85:1.1,86:'B',87:'D',88:'C',89:'C',90:2.04,91:'2143'};
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:900}}),errs=[];
  p.on('pageerror',e=>errs.push('page error: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::|favicon/.test(m.text()))errs.push('console: '+m.text());});
  await p.route(/^https?:\/\//,r=>r.abort());await p.goto('file://'+file);await p.waitForTimeout(800);
  const fails=await p.evaluate(KEY=>{const f=[],ok=(c,m)=>{if(!c)f.push(m);},D=EC_DIP[7]||[];
    ok(D.length===44,'EC_DIP[7] must have 44 items (questions 48 to 91), not '+D.length);
    const qz=ECL[7].qz;ok(D.every((it,j)=>qz[qz.length-D.length+j]===it),'EC_DIP[7] must be at the end of ECL[7].qz');
    D.forEach((it,j)=>{const n=48+j,k=KEY[n],at='question '+n+' (EC_DIP[7]['+j+'])';
      if(typeof k==='string'&&/^[A-D]$/.test(k))ok(it.o&&it.o.length===4&&it.a==='ABCD'.indexOf(k),at+': the key must be option '+k);
      else if(typeof k==='string')ok(!it.o&&it.ans===k&&it.n===+k&&numOK(+k,it)&&!numOK(+k+1,it),at+': the code answer must be '+k+' (ans, n, tol 0)');
      else{ok(!it.o&&numOK(k,it)&&numOK(it.n,it),at+': the numeric key '+k+' must be accepted');ok(!it.ans&&!!nrSpec(it.n),at+': a value answer must fit the exam boxes');}
      ok(!/\bbelow\b/.test(it.q)||!!it.fig,at+': the stem refers to information below, but there is no fig');
      ok(typeof it.w==='string'&&it.w.length>40,at+': the explanation is missing or too short');});
    /* the figures render, with an accessible name for every drawing */
    const host=document.createElement('div');document.body.append(host);D.forEach((it,j)=>{if(!it.fig)return;host.innerHTML=it.fig;host.querySelectorAll('svg').forEach(s=>ok(s.getAttribute('role')==='img'&&(s.getAttribute('aria-label')||'').length>20,'question '+(48+j)+': a drawing needs role img and an aria-label'));});
    /* a line never breaks inside a formula: a charge (<sup>) in the stem or in the information sits in a nowrap species, else "Cl⁻ | (aq)" can happen */
    D.forEach((it,j)=>{host.innerHTML=it.q+(it.fig||'');host.querySelectorAll('svg').forEach(s=>s.remove());
      host.querySelectorAll('sup').forEach(s=>{let e=s.parentElement,nw=false;while(e&&e!==host){if(e.style&&e.style.whiteSpace==='nowrap')nw=true;e=e.parentElement;}
        ok(nw,'question '+(48+j)+': a formula with a charge ('+s.parentElement.textContent.slice(0,30)+') can break before its state: write it with Cn()');});});host.remove();
    return f;},KEY);
  /* on a narrow phone (320 px), nothing in a diploma question is wider than the question, and the page does not scroll sideways */
  const q=await b.newPage({viewport:{width:320,height:800}});await q.route(/^https?:\/\//,r=>r.abort());await q.goto('file://'+file);await q.waitForTimeout(600);
  await q.evaluate(()=>goSection('ec',7));await q.waitForTimeout(600);
  fails.push(...await q.evaluate(()=>{const f=[],own=ECL[7].qz.length-EC_DIP[7].length,qs=[...document.querySelectorAll('section.quiz .q')].slice(own);
    if(qs.length!==EC_DIP[7].length)f.push('lesson 7 at 320 px shows '+qs.length+' diploma questions, not '+EC_DIP[7].length);
    qs.forEach((e,j)=>{const r=e.getBoundingClientRect().right;const w=[...e.querySelectorAll('*')].find(x=>!x.closest('svg')&&x.getBoundingClientRect().width&&x.getBoundingClientRect().right>r+1);
      if(w)f.push('question '+(48+j)+' at 320 px: "'+(w.textContent||'').slice(0,30)+'" is wider than the question');});
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)f.push('lesson 7 at 320 px scrolls sideways');return f;}));
  const all=fails.concat(errs);await b.close();
  if(all.length){console.log('FAIL ec-dip7: '+all.length+' problems\n  '+all.join('\n  '));process.exit(1);}
  console.log('PASS ec-dip7: 44 diploma questions of lesson 7 match the answer key');process.exit(0);})();
