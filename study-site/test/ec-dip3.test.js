/* usage: node study-site/test/ec-dip3.test.js <path to index.html>
   The diploma practice questions 7 to 27 of Electrochemistry lesson 3 (EC_DIP[3], slot 3d): 21 items in the order of the notes (pages 15 to 19), the keys of the
   answer key (notes p. 85), every code answer is exact and stays out of the exam's number boxes, every "below" stem has its information (fig), no multiple-choice
   key is the unique longest option, the items follow the lesson's own questions, the hints of a code answer never give its digits, every figure fits a 320 px
   phone, and the page loads with no console errors. Exit code 0 = pass, 1 = fail. */
const path=require('path');let chromium;try{({chromium}=require('playwright'));}catch(e){({chromium}=require('/opt/node-tools/node_modules/playwright'));}
const file=path.resolve(process.argv[2]||path.join(__dirname,'..','index.html'));
const KEY={7:'C',8:'A',9:'B',10:'2314',11:'2415',12:'C',13:'A',14:'B',15:'A',16:'D',17:'A',18:'A',19:'B',20:'D',21:'D',22:'A',23:'D',24:'D',25:'D',26:'C',27:'B'};
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:900}}),errs=[];
  p.on('pageerror',e=>errs.push('page error: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::|favicon/.test(m.text()))errs.push('console: '+m.text());});
  await p.route(/^https?:\/\//,r=>r.abort());await p.goto('file://'+file);await p.waitForTimeout(800);
  const fails=await p.evaluate(KEY=>{const f=[],ok=(c,m)=>{if(!c)f.push(m);},D=EC_DIP[3]||[],txt=s=>String(s).replace(/<[^>]+>/g,'').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
    ok(D.length===21,'EC_DIP[3] must have 21 items (questions 7 to 27), not '+D.length);
    const qz=ECL[3].qz;ok(D.every((it,j)=>qz[qz.length-D.length+j]===it),'EC_DIP[3] must be at the end of ECL[3].qz');
    D.forEach((it,j)=>{const n=7+j,k=KEY[n],at='question '+n+' (EC_DIP[3]['+j+'])';
      if(/^[A-D]$/.test(k)){ok(it.o&&it.o.length===4&&it.a==='ABCD'.indexOf(k),at+': the key must be option '+k);
        const L=it.o.map(o=>txt(o).length),m=Math.max(...L);ok(!(L[it.a]===m&&L.filter(v=>v===m).length===1),at+': the key is the unique longest option');}
      else ok(!it.o&&it.ans===k&&it.n===+k&&it.tol===0&&numOK(+k,it)&&!numOK(+k+1,it)&&!numOK(+k-1,it),at+': the code answer must be '+k+' (ans, n, tol 0)');
      ok(!/\bbelow\b/.test(it.q)||!!it.fig,at+': the stem refers to information below, but there is no fig');
      ok(typeof it.w==='string'&&it.w.length>80,at+': the explanation is missing or too short');
      ok(!/\b[Oo]ptions? [A-D]\b/.test(it.w||''),at+': the options are shuffled, thus the explanation must not name them by letter');});
    /* the shared information of questions 26 and 27 is given to both */
    ok(D[19]&&D[20]&&D[19].fig&&D[19].fig===D[20].fig,'questions 26 and 27 must both carry the Alfred Nobel information');
    /* every figure and stem is well formed: each element that is opened is closed (br is a void element) */
    const bal=h=>{const c={};(String(h).match(/<\/?[a-z][a-z0-9]*/gi)||[]).forEach(t=>{const nm=t.replace(/[<\/]/g,'').toLowerCase();if(nm==='br')return;c[nm]=(c[nm]||0)+(t[1]==='/'?-1:1);});return Object.keys(c).filter(k=>c[k]);};
    D.forEach((it,j)=>[it.q,it.fig].forEach(h=>{if(h){const b=bal(h);ok(!b.length,'question '+(7+j)+': an element is not closed: '+b.join(', '));}}));
    /* a code answer: the hint button shows the sentences of w except the last one (qEl), thus every digit of the code is given only in the last sentence */
    D.forEach((it,j)=>{if(!it.ans)return;const ss=sentences(it.w),hs=ss.slice(0,-1),bad=hs.filter(t=>t.includes(it.ans)||/\(\d\)|(?<![\d.])[1-9]\.?$/.test(t));
      ok(!bad.length,'question '+(7+j)+': a hint gives a digit of the code '+it.ans+': '+bad.join(' | '));ok(ss[ss.length-1].includes(it.ans),'question '+(7+j)+': the last sentence of w must give the code '+it.ans);});
    return f;},KEY);
  /* every figure fits a 320 px phone: no element of a diploma item is wider than the item (main clips it, thus a column of a table would be lost) */
  await p.setViewportSize({width:320,height:800});await p.evaluate(()=>goSection('ec',3));await p.waitForTimeout(500);
  fails.push(...await p.evaluate(()=>{const D=EC_DIP[3],qs=[...document.querySelectorAll('#ec-3 section.quiz .q')].slice(-D.length),f=[];
    if(qs.length!==D.length)return ['the question card of lesson 3 must show the '+D.length+' diploma questions last'];
    qs.forEach((q,j)=>{const r=q.getBoundingClientRect(),w=[...q.querySelectorAll('.qt *, .qfig *')].filter(e=>{const x=e.getBoundingClientRect();return x.width&&(x.right>r.right+1||x.left<r.left-1);});
      if(w.length)f.push('question '+(7+j)+' at 320 px: '+w.length+' elements are wider than the question, for example '+w[0].tagName+' '+Math.round(w[0].getBoundingClientRect().right)+' > '+Math.round(r.right));});
    return f;}));
  const all=fails.concat(errs);await b.close();
  if(all.length){console.log('FAIL ec-dip3: '+all.length+' problems\n  '+all.join('\n  '));process.exit(1);}
  console.log('PASS ec-dip3: 21 diploma questions of lesson 3 match the answer key');process.exit(0);})();
