/* usage: node study-site/test/ec-framework.test.js <path to index.html>
   The Electrochemistry section (ec): it is registered in the Chemistry tab, every lesson builds, the page has no console errors,
   the table of standard electrode potentials (EC_E0) has the values that the class notes and the diploma answer key use, every half-reaction balances,
   ecPredict gives the notes' answers, ecTable and ecCell work, and every generator gives 200 items that the grader accepts. Exit code 0 = pass, 1 = fail. */
const path=require('path');let chromium;try{({chromium}=require('playwright'));}catch(e){({chromium}=require('/opt/node-tools/node_modules/playwright'));}
const file=path.resolve(process.argv[2]||path.join(__dirname,'..','index.html'));
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:900}}),errs=[];
  p.on('pageerror',e=>errs.push('page error: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::|favicon/.test(m.text()))errs.push('console: '+m.text());});
  await p.route(/^https?:\/\//,r=>r.abort());await p.goto('file://'+file);await p.waitForTimeout(800);
  const r=await p.evaluate(()=>{const fails=[],ok=(c,m)=>{if(!c)fails.push(m);},near=(a,b)=>a!=null&&Math.abs(a-b)<.0051;let n=0;
    /* registration */
    ok(ORDER.indexOf('ec')===ORDER.indexOf('eq')+1,'ORDER: ec must come right after eq');ok(curL.ec===0||Number.isInteger(curL.ec),'curL.ec is missing');
    const chem=SUBJECTS.find(s=>s.k==='chem');ok(chem&&chem.units.join()==='th,eq,ec','the Chemistry tab must have the units th, eq, ec');
    const T=['Oxidation and reduction','Oxidation numbers','Redox tables from experiments','Predicting redox reactions','Redox titrations','Balancing redox equations','Disproportionation and voltaic cells','Cell potentials','Batteries and fuel cells','Corrosion','Electrolytic cells','Faraday’s law'];
    ok(JSON.stringify(EC_T)===JSON.stringify(T),'EC_T must be the 12 fixed titles');
    const S=SUBJ.ec;ok(S&&S.name==='Electrochemistry'&&S.short==='Electro','SUBJ.ec name');
    ok(S.lessons.length===14&&S.lessons[12].t==='Formulas and terms'&&S.lessons[13].rv,'ec must have 12 lessons, the reference sheet and the Review');
    ok(ICON.ec&&T.every(t=>LIC[t]&&ICON[LIC[t]]),'every ec lesson needs an icon (LIC and ICON), and ICON.ec');
    ok(RQ.ec===EC_RQ&&CH.ec===EC_CH&&WRQ.ec===EC_WRQ&&REF.ec===EC_REF&&HT.ec===EC_HT&&METHOD.ec===EC_METHOD,'a container is not wired into its table');
    ok(!EC_GEN.some(a=>a&&a.length)||Array.isArray(GEN.ec)&&GEN.ec.length===EC_GEN.reduce((s,a)=>s+(a?a.length:0),0),'GEN.ec must hold every EC_GEN generator');
    ok([...document.styleSheets].some(ss=>{try{return [...ss.cssRules].some(x=>x.selectorText==='body[data-s="ec"]');}catch(e){return false;}}),'the accent colours of ec are missing');
    /* every lesson builds, and the diploma questions follow the lesson's own questions */
    for(let i=0;i<12;i++){const L=S.lessons[i],g=document.createElement('div');g.className='grid';const host=document.createElement('article');host.className='lesson';host.id='ec-t'+i;host.append(g);document.body.append(host);
      try{L.build(g,L);}catch(e){fails.push('lesson '+i+' build: '+e.message);}ok(g.querySelector('.card'),'lesson '+i+' shows no card');ok(L.qz.length>=2,'lesson '+i+' needs 2 or more questions');
      const d=EC_DIP[i]||[];ok(d.every((it,j)=>L.qz[L.qz.length-d.length+j]===it),'lesson '+i+': EC_DIP must be at the end of qz');host.remove();n++;}
    /* the table of potentials: order, balance, and the values of the notes (p. 39, 41, 65) and of the diploma answer key (p. 85) */
    ok(EC_E0.length>=40,'EC_E0 has too few rows');EC_E0.forEach((w,i)=>{ok(!ecBal(w.s),'EC_E0 row '+w.s+' does not balance: '+ecBal(w.s));if(i)ok(w.E<=EC_E0[i-1].E,'EC_E0 row '+w.s+' is not in order');});
    ok(EC_E0[0].k==='F2(g)'&&near(EC_E0[0].E,2.87)&&EC_E0[EC_E0.length-1].k==='Li^+(aq)'&&near(EC_E0[EC_E0.length-1].E,-3.04),'EC_E0 must go from F2(g) +2.87 V to Li+(aq) −3.04 V');
    const E=x=>{const w=ecRow(x);return w?w.E:null;};
    [['Ag^+(aq)',.80],['Fe^3+(aq)',.77],['O2(g) + 2H^+(aq) + 2e^- <=> H2O2(l)',.70],['I2(s)',.54],['O2(g) + 2H2O(l) + 4e^- <=> 4OH^-(aq)',.40],['Cu^2+(aq)',.34],['SO4^2-(aq) + 4H^+(aq) + 2e^- <=> H2SO3(aq) + H2O(l)',.17],
     ['Sn^4+(aq)',.15],['S(s)',.14],['AgBr(s)',.07],['H^+(aq)',0],['Pb^2+(aq)',-.13],['Sn^2+(aq)',-.14],['AgI(s)',-.15],['O2(g) + 4H^+(aq) + 4e^- <=> 2H2O(l)',1.23],
     ['Mg^2+(aq)',-2.37],['Au^3+(aq)',1.50],['Zn^2+(aq)',-.76],['Fe^2+(aq)',-.45],['Ni^2+(aq)',-.26],['Al^3+(aq)',-1.66],['Na^+(aq)',-2.71],['Cr^3+(aq)',-.41],['Cd^2+(aq)',-.40],['MnO4^-(aq)',1.51],['Cl2(g)',1.36],['Br2(l)',1.07],['Hg^2+(aq)',.85],['2H2O(l) + 2e^- <=> H2(g) + 2OH^-(aq)',-.83],['Cr2O7^2-(aq)',1.23],['Li^+(aq)',-3.04],['F2(g)',2.87]]
      .forEach(([k,v])=>ok(near(E(k),v),'EC_E0: '+k+' must be '+v+' V, not '+E(k)));
    /* answer key: 50 A (+0.43), 52 (2.37), 55 D (−0.60), 58 C (+0.20), 61 (1.50), 77 A and 85 (1.10), 84 B (Fe), 88 C (+0.48), 94 B (+2.06), 95 (6.18), 115 B (−0.14) */
    const d=(a,b)=>+(E(a)-E(b)).toFixed(2);
    ok(near(d('Fe^3+(aq)','Cu^2+(aq)'),.43),'Q50: +0.43 V');ok(near(d('H^+(aq)','Mg^2+(aq)'),2.37),'Q52: 2.37 V');ok(near(d('Ni^2+(aq)','Cu^2+(aq)'),-.60),'Q55: −0.60 V');
    ok(near(d('Cu^2+(aq)','S(s)'),.20),'Q58: +0.20 V');ok(near(d('Au^3+(aq)','H^+(aq)'),1.50),'Q61: 1.50 V');ok(near(d('Cu^2+(aq)','Zn^2+(aq)'),1.10),'Q77/85: 1.10 V');
    ok(near(d('H^+(aq)','Fe^2+(aq)'),.45),'Q84: Fe gives 0.45 V');ok(near(1.24+E('Zn^2+(aq)'),.48),'Q88: +0.48 V');ok(near(d('O2(g) + 2H2O(l) + 4e^- <=> 4OH^-(aq)','Al^3+(aq)'),2.06),'Q94: +2.06 V');
    ok(near(3*d('O2(g) + 2H2O(l) + 4e^- <=> 4OH^-(aq)','Al^3+(aq)'),6.18),'Q95: 6.18 V');ok(near(E('Sn^2+(aq)'),-.14),'Q115: −0.14 V');
    /* ecPredict: the examples and practice questions of the notes (p. 13, 14, 70) and diploma questions 12 and 66 */
    const P=(ents,soa,sra,e,spont,net,o)=>{const x=ecPredict(ents,o),tag=ents.join(' ');if(!x){fails.push('ecPredict '+tag+': no result');return;}
      ok(x.soa===soa,'ecPredict '+tag+': SOA '+x.soa+', expected '+soa);ok(x.sra===sra,'ecPredict '+tag+': SRA '+x.sra+', expected '+sra);ok(near(x.E,e),'ecPredict '+tag+': E '+x.E+', expected '+e);ok(x.spont===spont,'ecPredict '+tag+': spontaneity');
      if(x.netS)ok(!ecBal(x.netS),'ecPredict '+tag+': the net equation does not balance: '+x.netS);ok(!ecBal(x.redM)&&!ecBal(x.oxM),'ecPredict '+tag+': a half-reaction does not balance');
      if(net){const f=s=>{const q=ecParse(s),k=a=>a.map(([c,y])=>c+y).sort().join(' ');return k(q.L)+' -> '+k(q.R);};ok(f(x.netS)===f(net),'ecPredict '+tag+': net '+x.netS+', expected '+net);}n++;return x;};
    P(['K^+(aq)','MnO4^-(aq)','H^+(aq)','Fe^2+(aq)','SO4^2-(aq)','H2O(l)'],'MnO4^-(aq)','Fe^2+(aq)',.74,true,'MnO4^-(aq) + 8H^+(aq) + 5Fe^2+(aq) -> Mn^2+(aq) + 4H2O(l) + 5Fe^3+(aq)');
    P(['Cu(s)','H^+(aq)','Cl^-(aq)','H2O(l)'],'H^+(aq)','Cu(s)',-.34,false);
    P(['Cu(s)','H^+(aq)','NO3^-(aq)','H2O(l)'],'NO3^-(aq)','Cu(s)',.46,true,'Cu(s) + 2NO3^-(aq) + 4H^+(aq) -> Cu^2+(aq) + N2O4(g) + 2H2O(l)');
    P(['Fe(s)','O2(g)','H2O(l)'],'O2(g)','Fe(s)',.85,true,'2Fe(s) + O2(g) + 2H2O(l) -> 2Fe^2+(aq) + 4OH^-(aq)');
    P(['Au^3+(aq)','Cl^-(aq)','H2O2(l)','H2O(l)'],'Au^3+(aq)','H2O2(l)',.80,true,'2Au^3+(aq) + 3H2O2(l) -> 2Au(s) + 3O2(g) + 6H^+(aq)');
    P(['Na(s)','H2O(l)'],'H2O(l)','Na(s)',1.88,true,'2Na(s) + 2H2O(l) -> 2Na^+(aq) + H2(g) + 2OH^-(aq)');
    P(['Al(s)','H2O(l)'],'H2O(l)','Al(s)',.83,true);
    P(['H2(g)','Fe^3+(aq)','Cl^-(aq)','H2O(l)'],'Fe^3+(aq)','H2(g)',.77,true,'2Fe^3+(aq) + H2(g) -> 2Fe^2+(aq) + 2H^+(aq)');
    P(['Cl2(g)','Na^+(aq)','Br^-(aq)','H2O(l)'],'Cl2(g)','Br^-(aq)',.29,true,'Cl2(g) + 2Br^-(aq) -> 2Cl^-(aq) + Br2(l)');
    P(['Br2(l)','Na^+(aq)','Cl^-(aq)','H2O(l)'],'Br2(l)','H2O(l)',-.16,false);
    P(['Pb(s)','PbO2(s)','H^+(aq)','SO4^2-(aq)','H2O(l)'],'PbO2(s)','Pb(s)',2.05,true,'Pb(s) + PbO2(s) + 2SO4^2-(aq) + 4H^+(aq) -> 2PbSO4(s) + 2H2O(l)');
    P(['K^+(aq)','I^-(aq)','H2O(l)'],'H2O(l)','I^-(aq)',-1.37,false,'2H2O(l) + 2I^-(aq) -> H2(g) + 2OH^-(aq) + I2(s)');
    P(['Ni^2+(aq)','NO3^-(aq)','H2O(l)'],'Ni^2+(aq)','H2O(l)',-1.49,false,'2Ni^2+(aq) + 2H2O(l) -> 2Ni(s) + O2(g) + 4H^+(aq)');
    P(['Cu^2+(aq)','SO4^2-(aq)','H2O(l)'],'Cu^2+(aq)','H2O(l)',-.89,false,'2Cu^2+(aq) + 2H2O(l) -> 2Cu(s) + O2(g) + 4H^+(aq)');
    P(['Na^+(aq)','SO4^2-(aq)','H2O(l)'],'H2O(l)','H2O(l)',-2.06,false,'2H2O(l) -> 2H2(g) + O2(g)');
    P(['Mg^2+(aq)','Cl^-(aq)','H2O(l)'],'H2O(l)','H2O(l)',-2.06,false);
    const br=P(['Na^+(aq)','Cl^-(aq)','H2O(l)'],'H2O(l)','Cl^-(aq)',-2.19,false,'2H2O(l) + 2Cl^-(aq) -> H2(g) + 2OH^-(aq) + Cl2(g)',{cl:true});ok(br&&br.cl,'ecPredict: the chloride anomaly flag');
    P(['I2(s)','Ag(s)','H2O(l)'],'I2(s)','Ag(s)',-.26,false);
    /* a table built from evidence: rows without E° are ranked by position */
    const ev=['Pd^2+(aq) + 2e^- <=> Pd(s)','Cu^2+(aq) + 2e^- <=> Cu(s)','Co^2+(aq) + 2e^- <=> Co(s)','In^3+(aq) + 3e^- <=> In(s)'].map(s=>ecRowOf(s,null)),xe=ecPredict(['Cu^2+(aq)','In(s)'],{rows:ev});
    ok(xe&&xe.soa==='Cu^2+(aq)'&&xe.sra==='In(s)'&&xe.spont&&!ecBal(xe.netS),'ecPredict on a table without E°');
    /* formulas */
    ok(ecU('Cr2O7^2-(aq)')==='Cr₂O₇²⁻(aq)'&&ecK('Cr₂O₇²⁻(aq)')==='Cr2O7^2-(aq)'&&ecK(C('Cr2O7^2-(aq)'))==='Cr2O7^2-(aq)','ecU and ecK');
    ok(ecMolar('CuSO4(s)')===159.61&&!ecBal('Cr2O7^2-(aq) + 14H^+(aq) + 6e^- -> 2Cr^3+(aq) + 7H2O(l)')&&ecBal('Fe^3+(aq) + e^- -> Fe(s)')!=='','ecMolar and ecBal');
    /* ecCell: every variant is a valid SVG with a description */
    const V=[{},{sep:'cup',L:{el:'C(s)',sol:['MnO4^-(aq)','H^+(aq)','Mn^2+(aq)']},R:{el:'Cu(s)',sol:'CuSO4(aq)'},anode:'R'},{L:{el:'Pt(s)',gas:'H2(g)',sol:'HCl(aq)'},R:{el:'Ag(s)',sol:'AgNO3(aq)'},anode:'L'},
      {type:'electrolytic',L:{el:'C(s)',sol:'KI(aq)'},R:{el:'C(s)',bub:true}},{type:'electrolytic',sep:'bridge',L:{el:'Cu(s)'},R:{el:'Fe(s)'}},{nums:{anode:1,cathode:2,bridge:3,wire:4,meter:5,eflow:6,cat:7,an:8,solL:9,solR:10},lab:false}];
    V.forEach((o,i)=>{const s=ecCell(Object.assign({L:{el:'Zn(s)',sol:'Zn^2+(aq)'},R:{el:'Cu(s)',sol:'Cu^2+(aq)'}},o)),doc=new DOMParser().parseFromString(s,'image/svg+xml');
      ok(!doc.querySelector('parsererror')&&doc.documentElement.getAttribute('role')==='img'&&doc.documentElement.getAttribute('aria-label').length>40,'ecCell variant '+i+' is not a valid SVG with a description');n++;});
    /* ecTable: the rows, and the SOA/SRA try-it */
    const host=document.createElement('article');host.className='lesson';host.id='ec-tt';document.body.append(host);
    const ents=['K^+(aq)','MnO4^-(aq)','H^+(aq)','Fe^2+(aq)','SO4^2-(aq)','H2O(l)'],rows=ecRows(['MnO4^-(aq)','Fe^3+(aq)','H^+(aq)','Fe^2+(aq)','H2O(l)']),bx=ecTable(host,rows,{hl:ents,pick:true,slot:9});
    ok(bx.querySelectorAll('tbody tr').length===rows.length,'ecTable rows');const pr=ecPredict(ents,{rows});
    bx.querySelector(`button.ecpk[data-s="o"][data-i="${rows.indexOf(pr.rr)}"]`).click();bx.querySelector(`button.ecpk[data-s="r"][data-i="${rows.indexOf(pr.or)}"]`).click();bx.querySelector('[data-a=check]').click();
    ok(bx.querySelector('[aria-live]').textContent==='Both are correct.','ecTable try-it: the right picks are not accepted');bx.querySelector('[data-a=clear]').click();host.remove();
    /* generators: 200 items each, accepted by the grader */
    (GEN.ec||[]).forEach((f,j)=>{for(let k=0;k<200;k++){const it=f();if(!(it&&typeof it.q==='string'&&typeof it.w==='string'&&isFinite(it.n)&&numOK(it.n,it)&&Number.isInteger(it.L)&&it.L>=0&&it.L<12)){fails.push('GEN.ec['+j+'] gave a bad item: '+JSON.stringify(it).slice(0,200));break;}}n++;});
    return {fails,n};});
  const all=r.fails.concat(errs);console.log((all.length?'FAIL':'PASS')+' ec-framework: '+r.n+' checks groups, '+all.length+' problems');all.slice(0,40).forEach(x=>console.log('  - '+x));
  await b.close();process.exit(all.length?1:0);})();
