/* THE ART HERO FAMILY (v0.85 — his round: "middle art hero should be
   the default for music and look like the attached", "I want the size
   locked in and not jumping around", and "when I pause the player and
   it is in idle, all the artwork blanks... best result would be to keep
   it and dim it").

   Three things that must hold, all of which used to fail:
     1. LOCKED HEIGHT — the card is the same height playing and idle, so
        nothing below it (Modes, Volume) ever twitches on a state change.
     2. ART SURVIVES IDLE, DIMMED — Music Assistant parks a paused Sonos
        in `idle` while still publishing entity_picture; the old rule
        blanked the cover the moment the player left ACTIVE.
     3. VOLUME CLEARS THE FOLD — the whole reason the middle size
        exists: on a 480x800 remote the Volume tile must be visible
        without scrolling. */
import { chromium } from 'playwright-core';
const CONFIG = {
  version:2, home_screen:'den', screen_order:['den'],
  global:{room:'Porch', activity_select:'select.harmonium_den_activity'},
  devices:{},
  activities:{listen:{name:'Listen to Music',room_view:'den',
    context:{media_player:'media_player.ma',volume:'media_player.ma'},
    screen:'controller:music4'}},
  screens:{den:{name:'Porch',type:'hub',room:true,sections:[{role:'activities',hero_label:'Activities',
    tiles:[{id:'acts',type:'activities',room:'den'}]}]}},
  controllers:{music4:{name:'Music',type:'controller',class:'activity',view_kind:'controller',
    font_scope:'music', grid:{max_width:760},
    control_target:{label:'$activity.name',volume:'$context.volume',pass_through:[]},
    sections:[{tiles:[
      {id:'m_np',type:'media',art:true,np_default:'hero',entity:'$context.media_player',
       icon:'material:music_note',label:'Now Playing',span:2,
       trailing:{icon:'material:library_music',action:{navigate:'music_library'},emphasis:'accent'}},
      {id:'m_cmd',type:'mediabtns',entity:'$context.media_player',label:'Modes',span:2},
      {id:'m_vol',type:'volume',entity:'$context.volume',icon:'material:volume_up',label:'Sonos',span:2},
    ]}]}},
  screens_extra:{},
};
CONFIG.screens.music_library={name:'Library',type:'hub',drawer:true,parent:'controller:music4',sections:[{tiles:[]}]};
const ART='https://x/art.jpg';
const STATES={
  'media_player.ma':{s:'playing',a:{friendly_name:'Sonos',volume_level:0.49,
    media_title:'Out Of My Head',media_artist:'Fastball',media_album_name:'All The Pain Money Can Buy',
    media_duration:222,media_position:95,media_position_updated_at:new Date().toISOString(),
    entity_picture:ART, supported_features:84351}},
  'select.harmonium_den_activity':{s:'listen',a:{options:['listen','off']}},
};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:480,height:800},deviceScaleFactor:1});
const p=await ctx.newPage();
await ctx.route('**/config.json*',r=>r.fulfill({json:CONFIG}));
await ctx.route('**/art.jpg',r=>r.fulfill({status:200,contentType:'image/svg+xml',
  body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c2b6"/><stop offset="1" stop-color="#4a4038"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><text x="300" y="90" font-size="64" text-anchor="middle" fill="#222" font-family="serif">fastball</text></svg>`}));
await p.addInitScript((s)=>{localStorage.setItem('hakr_token','t');localStorage.setItem('hakr_host','localhost:8482');
  window._STATES=s;
  window.WebSocket=class{constructor(){setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'auth_required'})}),20);}
  send(m){const msg=JSON.parse(m);const reply=o=>setTimeout(()=>this.onmessage?.({data:JSON.stringify(o)}),15);
  if(msg.type==='auth')reply({type:'auth_ok'});
  else if(msg.type==='subscribe_entities'){reply({type:'result',id:msg.id,success:true,result:null});
    const a={};(msg.entity_ids||[]).forEach(e=>{if(window._STATES[e])a[e]=window._STATES[e];});
    reply({type:'event',id:msg.id,event:{a}});}
  else reply({type:'result',id:msg.id,success:true,result:null});}close(){}};},STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(()=>navigate('controller:music4'));
await p.waitForTimeout(700);

const h1=await p.evaluate(()=>{const t=document.getElementById('tile_m_np');const v=document.getElementById('tile_m_vol');
  return {np:Math.round(t.getBoundingClientRect().height), volTop:Math.round(v.getBoundingClientRect().top), volBottom:Math.round(v.getBoundingClientRect().bottom)};});
// now go idle (the pause case)
await p.evaluate(()=>{const s=S.states.get('media_player.ma');s.s='idle';S.states.set('media_player.ma',s);renderStates();});
await p.waitForTimeout(400);

const h2=await p.evaluate(()=>{const t=document.getElementById('tile_m_np');
  return {np:Math.round(t.getBoundingClientRect().height),
    dim:t.classList.contains('npdim'),
    artVisible:!document.querySelector('#tile_m_np .npimg').classList.contains('hidden')};});
/* THE IDLE FIRE TV (his screenshots): no media_title, no album, but a
   source ("Home") and a picture. Must read as ONE "Idle" on the header
   row — not Idle/Home/Idle/Home — and must not echo the source. */
await p.evaluate(()=>{
  S.states.set('media_player.ma',{s:'idle',a:{friendly_name:'Fire TV',
    volume_level:0.4, source:'Home', app_id:'com.amazon.tv.launcher', device_class:'tv',
    entity_picture:'https://x/art.jpg'}});
  renderStates();
});
await p.waitForTimeout(300);
const idleTv = await p.evaluate(()=>{
  const t=document.getElementById('tile_m_np');
  const txt=(q)=>t.querySelector(q)?.textContent.trim()||'';
  const subShown=(()=>{const e=t.querySelector('.sub');
    return !!e && getComputedStyle(e).display!=='none' && e.textContent.trim()!=='';})();
  return { npt:txt('.npt'), npb:txt('.npb'),
    idleCount:(t.innerText.match(/Idle/gi)||[]).length, raw:t.innerText,
    saysHome:/Home/.test(t.innerText), subShown,
    h:Math.round(t.getBoundingClientRect().height) };
});

/* THE PICKER MUST STILL WIN over np_default (the lockout he hit) */
const override = await p.evaluate(()=>{
  CONFIG.activities.listen.surface={np_style:'poster'};
  navigate('den'); navigate('controller:music4');
  return null;
});
await p.waitForTimeout(600);
const asPoster = await p.evaluate(()=>{
  const t=document.getElementById('tile_m_np');
  return { poster:t.classList.contains('poster'), hero:t.classList.contains('hero') };
});

const errs=[];
const ck=(n,c)=>{ if(!c) errs.push(n); };
ck('hero height is locked across states', h1.np === h2.np);
ck('hero is the middle size (not the 493px Large)', h1.np > 150 && h1.np < 360);
ck('Volume clears the 800px fold', h1.volBottom < 800);
ck('idle keeps the artwork', h2.artVisible);
ck('idle dims the card', h2.dim);
ck('idle shows exactly ONE state label', idleTv.idleCount === 1);
/* v0.85.3 REVERSAL, on his instruction: the app/source is the
   HEADLINE on a TV ("the most important bit of information… i.e. You
   Tube TV"), so it must be SHOWN — it was only ever wrong because the
   chassis sub echoed it. The test is now "once", not "never". */
ck('the app/source is shown (it is the headline on a TV)', idleTv.saysHome);
ck('...but only ONCE — no chassis echo',
  (idleTv.raw.match(/Home/g) || []).length === 1);
ck('the chassis sub no longer duplicates', !idleTv.subShown);
/* v0.85.4: the app/source is PROMOTED into the title row when there
   is no title (his: "the source label is the most important thing on
   the tile… way too small and dim" / "orphaned in the middle — should
   be under Now Playing"). It takes the title slot and does not repeat
   below. */
ck('the app/source is promoted into the title row', idleTv.npt === 'Home');
ck('...and does not repeat on the album line', idleTv.npb === '');
ck('idle keeps the locked height', idleTv.h === h1.np);
ck('the activity picker OVERRIDES np_default', asPoster.poster && !asPoster.hero);
console.log(JSON.stringify({playing:h1, idle:h2, idleTv, asPoster, ok:errs.length===0, errs},null,1));
await b.close();
if (errs.length) process.exit(1);
