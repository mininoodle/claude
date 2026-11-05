/* usage: node study-site/test/nr.test.js <path to index.html>
   Numerical response in the four boxes of the exams (nrSpec, nrOf, nrHalf, nrOK, nrHint, ansText, exStart, dipPick):
   - a key that rounds across a power of ten (0.0998 -> .10, 9.997 -> 10.0, 99.97 -> 100, 9.996 x 10^-3 -> 1.00 x 10^-2) accepts the key give or take 1
     in the last box of the ROUNDED key
   - a key graded to +-0.005 (tol 0, abs .005: a potential) fills the boxes with 2 decimals (.09, not 9.00 x 10^-2) and is shown with 2 decimals (0.23 V)
   - an exact whole number (a coefficient, a count) is not asked with 3 significant digits
   - a code answer is drawn as code boxes; an item with a text answer (ans) never reaches the boxes
   - the timed unit exam (started from the Review page) and the diploma practice exam follow these rules, and the page has no console errors.
   Exit code 0 = pass, 1 = fail. */
const path=require('path');let chromium;try{({chromium}=require('playwright'));}catch(e){({chromium}=require('/opt/node-tools/node_modules/playwright'));}
const file=path.resolve(process.argv[2]||path.join(__dirname,'..','index.html'));
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:900}}),errs=[];
  p.on('pageerror',e=>errs.push('page error: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::|favicon/.test(m.text()))errs.push('console: '+m.text());});
  await p.route(/^https?:\/\//,r=>r.abort());await p.goto('file://'+file);await p.waitForTimeout(900);await p.addStyleTag({content:'.cele{display:none!important}'});
  const fails=await p.evaluate(()=>{const f=[],ok=(c,m,x)=>{if(!c)f.push(m+(x!==undefined?' '+JSON.stringify(x):''));},J=JSON.stringify;
    const grade=(it,vals)=>{const sp=nrOf(it);return vals.map(v=>nrOK(sp,v,it));};
    /* 1. across a power of ten: the key, and give or take 1 in the last box of the rounded key */
    [[{n:.0998},[.1,.09,.11],[.08,.12]],[{n:9.997},[10,9.9,10.1],[9.8,10.2]],[{n:99.97},[100,99,101],[98,102]],[{n:999.7},[1000,1010,990],[970,1030]],
     [{n:9.996e-3},[.01,.0101,.0099],[.0098,.0102]],[{n:.456},[.456,.455,.457],[.45,.466]],[{n:37.7,u:'J'},[37.7,37.6,37.8],[37.5,37.9]]].forEach(([it,yes,no])=>{
      ok(grade(it,yes).every(Boolean),'four boxes: n = '+it.n+' must accept '+J(yes)+' (spec '+J(nrOf(it))+')',grade(it,yes));
      ok(!grade(it,no).some(Boolean),'four boxes: n = '+it.n+' must reject '+J(no)+' (spec '+J(nrOf(it))+')',grade(it,no));});
    const s=nrSpec(9.996e-3);ok(s&&s.m==='s'&&s.e===-2,'four boxes: 9.996 × 10⁻³ is recorded as 1.00 × 10⁻² (exponent −2)',s);
    ok(J(nrSpec(.0998))===J({m:'d',p:2}),'four boxes: 0.0998 is recorded as .10',nrSpec(.0998));
    /* 2. keys with 2 decimals: the boxes, the grading window and the shown answer */
    const V=n=>({n,u:'V',tol:0,abs:.005});
    [[.09,'.09',1,'0.09 V'],[.23,'.23',2,'0.23 V'],[.6,'.60',2,'0.60 V'],[1.2,'1.20',3,'1.20 V'],[1.62,'1.62',3,'1.62 V']].forEach(([n,box,pp,shown])=>{const it=V(n),sp=nrOf(it);
      ok(sp&&sp.m==='d'&&sp.dp===2&&sp.p===pp,'2 decimals: '+n+' V fills the boxes as '+box,sp);ok(ansText(it)===shown,'2 decimals: '+n+' V is shown as '+shown,ansText(it));
      ok(nrOK(sp,nrVal(sp,box),it)&&!nrOK(sp,n+.01,it)&&!nrOK(sp,n-.01,it),'2 decimals: '+n+' V accepts '+box+' only',[box]);
      ok(/to 2 decimal places/.test(nrHint(sp,it))&&!/significant/.test(nrHint(sp,it)),'2 decimals: the hint asks for 2 decimal places',nrHint(sp,it));});
    ok(ansText({n:-.43,u:'V',tol:0,abs:.005})==='−0.43 V','2 decimals: a negative potential is shown as −0.43 V');
    ok(J(nrOf({n:.06,u:'mol',tol:.01}))===J({m:'s',e:-2}),'2 decimals: a value with a relative tolerance keeps its 3 significant digits (6.00 × 10⁻²)',nrOf({n:.06,u:'mol',tol:.01}));
    /* 3. exact whole numbers */
    [{n:6,tol:0},{n:10,tol:0},{n:4,abs:.1},{n:84,tol:0,abs:.5},{n:3,abs:.001},{n:12,ex:1}].forEach(it=>{const sp=nrOf(it);
      ok(sp&&sp.i===1&&!/significant/.test(nrHint(sp,it)),'whole number: '+J(it)+' is not asked with significant digits',[sp,nrHint(sp,it)]);
      ok(nrOK(sp,it.n,it)&&!nrOK(sp,it.n+1,it)&&!nrOK(sp,it.n-1,it),'whole number: '+J(it)+' accepts its key only');});
    [{n:120},{n:18,abs:1},{n:1,u:'V',tol:0,abs:.005}].forEach(it=>{const sp=nrOf(it);ok(sp&&!sp.i,'whole number: '+J(it)+' is not an exact count',sp);});
    ok(/Use 3 significant digits/.test(nrHint(nrOf({n:37.7}),{n:37.7})),'hint: a measured value is asked with 3 significant digits');
    /* 4. codes and text answers */
    const c={code:'2143',n:2143,tol:0,abs:0},a={code:'1356',any:1,n:1356,tol:0,abs:0};
    ok(J(nrOf(c))===J({m:'c',n:4})&&nrOK(nrOf(c),'2143',c)&&!nrOK(nrOf(c),'2134',c),'code: four code boxes, exact order');
    ok(nrOK(nrOf(a),'6531',a)&&!nrOK(nrOf(a),'1357',a)&&/in any order/.test(nrHint(nrOf(a),a)),'code: any order when the item allows it');
    ok(nrOf({n:12.95,ans:'12.95'})===null&&nrOf({n:2,o:['a','b'],a:0})===null,'text answer: an item with ans or options has no four-box format');
    /* 5. every item of every section: no ans or code item gets number boxes; the ec code items are codes */
    const bad=[];for(const sk of ORDER){const S=SUBJ[sk];S.lessons.forEach((le,L)=>[...(le.qz||[]),...(le.rq||[])].forEach(it=>{if(it.o)return;const sp=nrOf(it);if(sp&&(it.ans!=null||(it.code&&sp.m!=='c')||(sp.m==='d'&&!isFinite(nrKey(sp,it.n)))))bad.push(sk+'_'+L);}));}
    ok(!bad.length,'items: an item with ans or code got number boxes',bad.slice(0,10));
    const ecAns=[];SUBJ.ec.lessons.forEach((le,L)=>[...(le.qz||[]),...(le.rq||[])].forEach(it=>{if(it.ans&&/^\d{4}$/.test(it.ans))ecAns.push(L);}));
    ok(!ecAns.length,'ec: a four-digit order code is written with ans instead of code',ecAns);
    /* 6. the diploma practice exam: 200 Chemistry exams of 30 questions */
    const d=DIP.find(x=>x.k==='chem');let nr=0,codes=0;const wrong=[];for(let k=0;k<200;k++)dipPick(d,30).forEach(x=>{if(x.kind!=='nr')return;nr++;if(x.nr.m==='c')codes++;
      if(x.it.ans!=null||J(x.nr)!==J(nrOf(x.it)))wrong.push(x.id);});
    ok(!wrong.length,'diploma practice: an item with a text answer, or with another format than nrOf, is in the boxes',[...new Set(wrong)].slice(0,8));
    ok(codes>0,'diploma practice: no code question in 200 Chemistry exams',{nr,codes});
    return f;});
  /* 7. the timed unit exam of Electrochemistry and Equilibrium, started from the Review page: 4 exams each */
  for(const sk of ['ec','eq'])for(let r=0;r<4;r++){
    const o=await p.evaluate(async sk=>{const S=SUBJ[sk],i=S.lessons.findIndex(l=>l.rv);goLesson(sk,i);await new Promise(r=>setTimeout(r,50));
      const art=document.getElementById(sk+'-'+i),c=[...art.querySelectorAll('.card')].find(c=>/Timed unit exam/.test(c.textContent));
      const btn=c&&[...c.querySelectorAll('.btn')].find(x=>/Start the exam/.test(x.textContent));if(!btn)return {err:'no Start button on the '+sk+' Review page'};btn.click();
      await new Promise(r=>setTimeout(r,1150));let E=null;try{E=JSON.parse(sessionStorage.getItem('exam:'+sk));}catch(e){}if(!E)return {err:'the '+sk+' exam did not start'};
      sessionStorage.removeItem('exam:'+sk);return {nr:E.items.filter(x=>x.kind==='nr').map(x=>({id:x.id,ans:x.it.ans!=null,code:!!x.it.code,m:x.nr&&x.nr.m}))};},sk);
    if(o.err){fails.push(o.err);break;}
    if(o.nr.length!==4)fails.push(sk+' exam: '+o.nr.length+' numerical-response questions, not 4');
    o.nr.filter(x=>x.ans||(x.code&&x.m!=='c')).forEach(x=>fails.push(sk+' exam: '+x.id+' has a text answer or a code in number boxes'));
    await p.reload();await p.waitForTimeout(700);await p.addStyleTag({content:'.cele{display:none!important}'});}
  const all=fails.concat(errs);await b.close();
  if(all.length){console.log('FAIL nr: '+all.length+' problems\n  '+all.join('\n  '));process.exit(1);}
  console.log('PASS nr: four-box formats, grading across a power of ten, 2-decimal potentials, whole numbers, codes, and the exams');process.exit(0);})();
