/* THE NOW PLAYING MATRIX (v0.85.2). Three rounds of regressions came
   from checking ONE style at a time: fixing Art Hero broke Large,
   restoring Large's header re-broke the padding, and a baked `style`
   silently disabled the picker for everyone. This probe walks EVERY
   style in BOTH states and asserts the shape of each, so a fix to one
   can never quietly cost another.

   RENDERED AT 350×582 — the devices' REAL CSS viewport (480×800
   physical at 1.5 DPR; the skin viewports say 349×581). Four rounds of
   fixes "passed" at 480 CSS px, a width no remote has, which is how a
   fixed-height art slab could look square here and portrait on his
   wall. Never widen this viewport.

   Guards, per his own bug reports:
     · every style renders and holds a DISTINCT, locked height;
     · the full-width Library bar is padded the SAME on both sides
       (.has-trail reserves ~92px on the right for the small chip);
     · the header keeps its state label — "it should show idle/now
       playing etc" — and the title is not truncated early;
     · idle keeps the artwork, dimmed, at the same height. */
import { chromium } from 'playwright-core';
const STYLES=['plain','slim','art','hero','poster'];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const out={};
const BASE={version:2,home_screen:'den',screen_order:['den'],
    global:{room:'Porch',activity_select:'select.harmonium_den_activity'},devices:{},
    activities:{a:{name:'Listen to Music',room_view:'den',
      context:{media_player:'media_player.ma',volume:'media_player.ma'},
      screen:'controller:c'}},
    screens:{den:{name:'Porch',type:'hub',room:true,sections:[{role:'activities',tiles:[{id:'acts',type:'activities',room:'den'}]}]},
      lib:{name:'Library',type:'hub',drawer:true,parent:'controller:c',sections:[{tiles:[]}]}},
    controllers:{c:{name:'Music',type:'controller',class:'activity',view_kind:'controller',
      control_target:{label:'$activity.name',volume:'$context.volume',pass_through:[]},
      sections:[{tiles:[
        {id:'m_np',type:'media',art:true,np_default:'hero',entity:'$context.media_player',
         icon:'material:music_note',label:'Now Playing',span:2,
         trailing:{icon:'material:library_music',action:{navigate:'lib'},emphasis:'accent'}},
        {id:'m_vol',type:'volume',entity:'$context.volume',icon:'material:volume_up',label:'Sonos',span:2},
      ]}]}}};
const MOCK=(s)=>{localStorage.setItem('hakr_token','t');localStorage.setItem('hakr_host','localhost:8482');
  window._STATES=s;window.WebSocket=class{constructor(){setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'auth_required'})}),20);}
  send(m){const g=JSON.parse(m);const r=o=>setTimeout(()=>this.onmessage?.({data:JSON.stringify(o)}),15);
  if(g.type==='auth')r({type:'auth_ok'});else if(g.type==='subscribe_entities'){r({type:'result',id:g.id,success:true,result:null});
  const q={};(g.entity_ids||[]).forEach(e=>{if(window._STATES[e])q[e]=window._STATES[e];});r({type:'event',id:g.id,event:{a:q}});}
  else r({type:'result',id:g.id,success:true,result:null});}close(){}};};
for (const style of STYLES) for (const state of ['playing','idle']) {
  const CONFIG=JSON.parse(JSON.stringify(BASE));
  CONFIG.activities.a.surface={np_style:style};
  const a={friendly_name:'Sonos',volume_level:0.49,source:'Music Assistant Queue',
    entity_picture:'https://x/a.jpg'};
  if(state==='playing')Object.assign(a,{media_title:'Head over Feet',media_artist:'Alanis Morissette',
    media_album_name:'Jagged Little Pill',media_duration:222,media_position:72,
    media_position_updated_at:new Date().toISOString()});
  const STATES={'media_player.ma':{s:state,a},'select.harmonium_den_activity':{s:'a',a:{options:['a','off']}}};
  const ctx=await b.newContext({viewport:{width:350,height:582}});
  const p=await ctx.newPage();
  await ctx.route('**/config.json*',r=>r.fulfill({json:CONFIG}));
  await ctx.route('**/a.jpg',r=>r.fulfill({status:200,contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#6b4a2f"/><circle cx="300" cy="300" r="180" fill="#c8a06a"/></svg>'}));
  await p.addInitScript(MOCK,STATES);
  await p.goto('http://localhost:8482/index.html');await p.waitForTimeout(800);
  await p.evaluate(()=>navigate('controller:c'));await p.waitForTimeout(500);
  const m=await p.evaluate(()=>{const t=document.getElementById('tile_m_np');
    if(!t)return{missing:true};const r=t.getBoundingClientRect();
    const tr=t.querySelector('.trail');const g=document.getElementById('grid');
    const gr=g.getBoundingClientRect();
    const npt=t.querySelector('.npt');
    const fr=t.querySelector('.npart');
    const frb=fr?fr.getBoundingClientRect():null;
    return {cls:t.className.replace('tile wgt-media ',''),h:Math.round(r.height),
      artW:frb?Math.round(frb.width):null, artH:frb?Math.round(frb.height):null,
      lbl:(t.querySelector('.lbl')||{}).textContent||'',
      npt:npt?npt.textContent:'',
      trailRight: tr?Math.round(gr.right-tr.getBoundingClientRect().right):null,
      trailLeft: tr?Math.round(tr.getBoundingClientRect().left-gr.left):null,
      volBottom:Math.round((document.getElementById('tile_m_vol')||{getBoundingClientRect:()=>({bottom:0})}).getBoundingClientRect().bottom)};});
  out[style+'/'+state]=m;
  await p.screenshot({path:`/tmp/sheet-${style}-${state}.png`});
  await ctx.close();
}
const errs=[]; const ck=(n,c)=>{ if(!c) errs.push(n); };
for (const k of Object.keys(out)) {
  const v = out[k];
  ck(k+': tile rendered', !v.missing);
  ck(k+': has a height', v.h > 0);
}
/* locked: the same style is the same height playing and idle */
for (const st of STYLES)
  ck(st+': height is locked across states', out[st+'/playing'].h === out[st+'/idle'].h);
/* the size ladder is real — smallest to largest. Slim (a one-liner)
   is SHORTER than Basic, so the ladder is not the menu order. */
const LADDER = ['slim','plain','art','hero','poster'];
const hs = LADDER.map(s2 => out[s2+'/playing'].h);
ck('the styles form a size ladder ('+LADDER.join(' < ')+')',
  hs.every((h,i) => i===0 || h > hs[i-1]));
/* the full-width bar is symmetric (his padding bug) */
for (const st of ['hero','poster'])
  for (const state of ['playing','idle']) {
    const v = out[st+'/'+state];
    ck(st+'/'+state+': Library bar padded evenly',
      Math.abs(v.trailLeft - v.trailRight) <= 2);
  }
/* the header still says what the player is doing (his "all text is gone") */
for (const st of ['art','hero','poster']) {
  ck(st+': says Now Playing while playing', /now playing/i.test(out[st+'/playing'].lbl));
  ck(st+': says Idle when idle', /idle/i.test(out[st+'/idle'].lbl));
}
/* the title is shown in full, not cut early */
for (const st of ['art','hero','poster'])
  ck(st+': title is not truncated', out[st+'/playing'].npt === 'Head over Feet');
/* v0.85.7: an empty MUSIC queue says so in every artwork style */
for (const st of ['art','hero','poster'])
  ck(st+': empty queue says so', out[st+'/idle'].npt === 'No items in the queue');
/* the poster's art frame is SQUARE at this width — the exact failure
   his screenshot showed (portrait slab) can never come back */
for (const state of ['playing','idle']) {
  const v = out['poster/'+state];
  ck('poster/'+state+': art frame is square ('+v.artW+'x'+v.artH+')',
    v.artW > 0 && Math.abs(v.artW - v.artH) <= 2);
}
/* his ceiling, twice adjusted: "408 or whatever number BELOW 408" */
ck('music Large is 408 or less (is '+out['poster/playing'].h+')',
  out['poster/playing'].h <= 408);

/* ---- TV flavour: no title, an app name, and BLACK artwork ---- */
{
  const CONFIG=JSON.parse(JSON.stringify(BASE));
  CONFIG.activities.a.surface={np_style:'hero'};
  const a={friendly_name:'Fire TV',volume_level:.4,app_name:'YouTube TV',
    source:'Home',device_class:'tv',/* SAME-ORIGIN like real HA proxy art — a cross-origin url taints
     the canvas and detection correctly declines to judge it */
    entity_picture:'/blackart.svg'};
  const STATES={'media_player.ma':{s:'idle',a},
    'select.harmonium_den_activity':{s:'a',a:{options:['a','off']}}};
  const ctx=await b.newContext({viewport:{width:350,height:582}});
  const p=await ctx.newPage();
  await ctx.route('**/config.json*',r=>r.fulfill({json:CONFIG}));
  await ctx.route('**/blackart.svg*',r=>r.fulfill({status:200,contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#000"/></svg>'}));
  await p.addInitScript(MOCK,STATES);
  await p.goto('http://localhost:8482/index.html');await p.waitForTimeout(800);
  await p.evaluate(()=>navigate('controller:c'));await p.waitForTimeout(900);
  const tv=await p.evaluate(()=>{const t=document.querySelector('.tile.wgt-media');
    return {npt:t.querySelector('.npt').textContent,
      npb:t.querySelector('.npb').textContent,
      phShown:!t.querySelector('.npph').classList.contains('hidden'),
      phIcon:t.querySelector('.npph .material-symbols-outlined').textContent,
      imgHidden:t.querySelector('.npimg').classList.contains('hidden'),
      slimless:true};});
  ck('tv: the app is PROMOTED to the title row', tv.npt==='YouTube TV');
  ck('tv: ...and not repeated below', tv.npb==='');
  ck('tv: black artwork detected → placeholder shown', tv.phShown && tv.imgHidden);
  ck('tv: placeholder glyph is a TV', tv.phIcon==='tv');
  /* v0.85.5: Basic on a TV says WHERE it is — never queue language */
  const tvBasic=await p.evaluate(async ()=>{
    CONFIG.activities.a.surface.np_style='plain';renderStates();
    await new Promise(z=>setTimeout(z,150));
    const t=document.querySelector('.tile.wgt-media');
    return {sub:t.querySelector('.sub').textContent,
      lbl:t.querySelector('.lbl').textContent};
  });
  ck('tv basic: label is the state', tvBasic.lbl==='Idle');
  ck('tv basic: shows the app, not queue talk',
    tvBasic.sub==='YouTube TV' && !/queue/i.test(tvBasic.sub));
  /* THE TAGESSCHAU CASE (a real Apple TV payload, forum 2026-08-25):
     PLAYING with media_title = "" and only app_name + duration — the
     app is promoted to the title row and the progress bar runs. */
  const playingApp=await p.evaluate(async ()=>{
    /* the mock snapshots _STATES SYNCHRONOUSLY when the flip's
       re-subscribe fires — so the truth must change BEFORE the flip,
       or the echo restores the old state mid-wait */
    window._STATES['media_player.ma']={s:'playing',a:{friendly_name:'ATV',
      volume_level:.4,media_title:'',app_name:'Tagesschau',
      media_duration:592,media_position:277,
      media_position_updated_at:new Date().toISOString()}};
    CONFIG.activities.a.surface.np_style='hero';renderStates();
    await new Promise(z=>setTimeout(z,150));
    const t=document.querySelector('.tile.wgt-media');
    return {lbl:t.querySelector('.lbl').textContent,
      npt:t.querySelector('.npt').textContent,
      progress:!t.querySelector('.npprog').classList.contains('hidden')};
  });
  ck('playing + empty title: app promoted', playingApp.npt==='Tagesschau');
  ck('playing + empty title: header says Now Playing', /now playing/i.test(playingApp.lbl));
  ck('playing + empty title: progress bar runs', playingApp.progress);
  /* v0.85.6: Large on a TV is 340 — artist/album/times reserves are
     collapsed (a TV can never fill them; device_class is constant so
     it cannot jump), and Compact shows NO placeholder at all. */
  const tvSizes=await p.evaluate(async ()=>{
    const o={};
    CONFIG.activities.a.surface.np_style='poster';renderStates();
    await new Promise(z=>setTimeout(z,150));
    const t=()=>document.querySelector('.tile.wgt-media');
    o.poster=Math.round(t().getBoundingClientRect().height);
    o.posterTv=t().classList.contains('nptv');
    CONFIG.activities.a.surface.np_style='art';renderStates();
    await new Promise(z=>setTimeout(z,150));
    const ph=t().querySelector('.npph');
    o.compactPh=ph?getComputedStyle(ph).display:'(none)';
    return o;
  });
  ck('tv Large is 300 (±3)', Math.abs(tvSizes.poster-300)<=3 && tvSizes.posterTv);
  ck('Compact shows NO placeholder', tvSizes.compactPh==='none');
  await p.evaluate(()=>{CONFIG.activities.a.surface.np_style='hero';renderStates();});
  await p.waitForTimeout(150);
  await p.screenshot({path:'/tmp/mx-tv-hero-black.png'});
  await ctx.close();
}

/* ---- slim on a TV: "Playing • YouTube TV" ---- */
{
  const CONFIG=JSON.parse(JSON.stringify(BASE));
  CONFIG.activities.a.surface={np_style:'slim'};
  const STATES={'media_player.ma':{s:'playing',a:{friendly_name:'Fire TV',
    volume_level:.4,app_name:'YouTube TV',device_class:'tv'}},
    'select.harmonium_den_activity':{s:'a',a:{options:['a','off']}}};
  const ctx=await b.newContext({viewport:{width:350,height:582}});
  const p=await ctx.newPage();
  await ctx.route('**/config.json*',r=>r.fulfill({json:CONFIG}));
  await p.addInitScript(MOCK,STATES);
  await p.goto('http://localhost:8482/index.html');await p.waitForTimeout(800);
  await p.evaluate(()=>navigate('controller:c'));await p.waitForTimeout(500);
  const sl=await p.evaluate(()=>document.querySelector('.npstx').textContent);
  ck('slim tv reads "Playing • YouTube TV"', sl==='Playing • YouTube TV');
  await ctx.close();
}

/* ---- BASIC on music: state in the label, track/artist below ---- */
{
  const CONFIG=JSON.parse(JSON.stringify(BASE));
  CONFIG.activities.a.surface={np_style:'plain'};
  const mk=(state,extra)=>({s:state,a:Object.assign({friendly_name:'Sonos',
    volume_level:.5,source:'Music Assistant Queue'},extra)});
  const STATES={'media_player.ma':mk('idle',{media_title:'That Wasn\u2019t Me',
    media_artist:'Brandi Carlile'}),
    'select.harmonium_den_activity':{s:'a',a:{options:['a','off']}}};
  const ctx=await b.newContext({viewport:{width:350,height:582}});
  const p=await ctx.newPage();
  await ctx.route('**/config.json*',r=>r.fulfill({json:CONFIG}));
  await p.addInitScript(MOCK,STATES);
  await p.goto('http://localhost:8482/index.html');await p.waitForTimeout(800);
  await p.evaluate(()=>navigate('controller:c'));await p.waitForTimeout(500);
  const b1=await p.evaluate(()=>{const t=document.querySelector('.tile.wgt-media');
    return {lbl:t.querySelector('.lbl').textContent, sub:t.querySelector('.sub').textContent};});
  ck('basic idle: label slot says Idle', b1.lbl==='Idle');
  ck('basic idle: track then artist below',
    /That Wasn/.test(b1.sub) && /Brandi Carlile/.test(b1.sub));
  const b2=await p.evaluate(()=>{
    S.states.set('media_player.ma',{s:'idle',a:{friendly_name:'Sonos',
      volume_level:.5,source:'Music Assistant Queue'}});
    renderStates();
    const t=document.querySelector('.tile.wgt-media');
    return {lbl:t.querySelector('.lbl').textContent, sub:t.querySelector('.sub').textContent};});
  ck('basic empty queue: says so, source below',
    /No items in the queue/.test(b2.sub) && /Music Assistant Queue/.test(b2.sub));
  await p.screenshot({path:'/tmp/mx-basic-idle.png'});
  await ctx.close();
}
/* ---- THE LIVE SWITCH (v0.85.4 — the bug that survived four rounds:
   "Selecting any other cards does nothing - we're locked out"). The
   Studio pushes new config WITHOUT a navigation; tileSig never saw the
   style patch, so nothing re-rendered. Flip the style in-page and the
   card must change mode ON THE SPOT. ---- */
{
  const CONFIG=JSON.parse(JSON.stringify(BASE));
  CONFIG.activities.a.surface={np_style:'slim'};
  const STATES={'media_player.ma':{s:'playing',a:{friendly_name:'Sonos',
    volume_level:.5,media_title:'Head over Feet',media_artist:'Alanis Morissette',
    source:'Music Assistant Queue'}},
    'select.harmonium_den_activity':{s:'a',a:{options:['a','off']}}};
  const ctx=await b.newContext({viewport:{width:350,height:582}});
  const p=await ctx.newPage();
  await ctx.route('**/config.json*',r=>r.fulfill({json:CONFIG}));
  await p.addInitScript(MOCK,STATES);
  await p.goto('http://localhost:8482/index.html');await p.waitForTimeout(800);
  await p.evaluate(()=>navigate('controller:c'));await p.waitForTimeout(500);
  const seq=await p.evaluate(async ()=>{
    const cls=()=>document.querySelector('.tile.wgt-media').className;
    const flip=(st2)=>{CONFIG.activities.a.surface.np_style=st2;renderStates();};
    const outp=[cls()];
    for (const st2 of ['poster','art','hero','plain']) {
      flip(st2); await new Promise(z=>setTimeout(z,120)); outp.push(cls());
    }
    return outp;
  });
  ck('live: starts slim', /\bslim\b/.test(seq[0]));
  ck('live: → Large on the spot', /\bposter\b/.test(seq[1]));
  ck('live: → Compact on the spot', /\bart\b/.test(seq[2]) && !/\bposter\b/.test(seq[2]));
  ck('live: → Art Hero on the spot', /\bhero\b/.test(seq[3]));
  ck('live: → Basic on the spot', !/\b(slim|art|hero|poster)\b/.test(seq[4]));
  await ctx.close();
}
console.log(JSON.stringify({out, ok:errs.length===0, errs},null,1));
await b.close();
if (errs.length) process.exit(1);
