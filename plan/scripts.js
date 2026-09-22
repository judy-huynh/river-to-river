/* ═══════════════════════════════════════════════════════════════════════
   42nd STREET · PLAN SHEET
   Sources, all baked into data.js so the page calls Mapbox and nothing else:
     LINE42     centreline, used only as the measuring axis
     LOTS_POLY  NYC MapPLUTO tax lots, real boundaries
     TREES      NYC Parks Forestry Tree Points, current inventory
     ROAD       NYC CSCL street centerline, width and lane counts
     BUS        MTA Bus Route Segment Speeds, M42 by leg, hour and direction
     BENCHES    NYC DOT Seating Locations on 42 Street
     PED_COUNT  NYC DOT Bi-Annual Pedestrian Counts, the one location on 42 Street
     PED_TIER   NYC DOT Pedestrian Mobility Plan, the priority tier of each segment
     CURB       NYC DOT ParkNYC metered block faces on 42 Street
     SHEDS      DOB sidewalk shed permits at 42 Street addresses, one record per building
     CRASHES    NYPD police-reported crashes within CRASH_META.near_ft of the centreline
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

if (location.protocol === 'file:') {
  document.body.innerHTML =
    '<div style="padding:70px 60px;font:16px/1.6 Helvetica Neue,Arial,sans-serif;max-width:70ch">'
    + '<div>Cannot run from a file URL</div>'
    + '<h2 style="font:600 38px/1.05 -apple-system,Helvetica,sans-serif;letter-spacing:-.03em">Serve it over localhost</h2>'
    + '<pre style="background:#F4F0E6;border-left:3px solid #14120F;padding:14px;white-space:pre-wrap">'
    + 'cd ~/Documents/GitHub/river-to-river\npython3 -m http.server 8042 --bind 127.0.0.1</pre>'
    + '<p>Then <a href="http://127.0.0.1:8042/plan/">http://127.0.0.1:8042/plan/</a></p></div>';
  return;
}

const TOKEN='pk.eyJ1IjoiajAwYnkiLCJhIjoiY2x1bHUzbXZnMGhuczJxcG83YXY4czJ3ayJ9.S5PZpU9VDwLMjoX_0x5FDQ';
const LINE=window.LINE42, LOTS=window.LOTS_POLY, TREES=window.TREES, ROAD=window.ROAD;
const LEN=LINE[LINE.length-1][0], BEARING=28.9;

const $=s=>document.querySelector(s);
const el=(t,c,h)=>{const n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n;};
const commas=n=>Math.round(n).toLocaleString('en-US');
const pct=(a,b)=>Math.round(a/b*100);
/* 24 hour clock in, '5pm' out. 24 wraps to 12am so an hour can be written 'from to'. */
const hr=h=>((h%=24)%12||12)+(h<12?'am':'pm');
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function at(ft){
  const t=Math.max(0,Math.min(LEN,ft));
  for(let i=0;i<LINE.length-1;i++) if(t>=LINE[i][0]&&t<=LINE[i+1][0]){
    const k=(t-LINE[i][0])/((LINE[i+1][0]-LINE[i][0])||1);
    return [LINE[i][1]+(LINE[i+1][1]-LINE[i][1])*k, LINE[i][2]+(LINE[i+1][2]-LINE[i][2])*k];
  }
  return [LINE.at(-1)[1], LINE.at(-1)[2]];
}
/* the four named stretches on the ruler, each from one baked cross street to another, so a
   band moves with the avenues and no station is typed */
const HUBS=[['9 Avenue','8 Avenue','Port Authority'],['7 Avenue','Broadway','Times Sq'],
  ['Avenue of the Americas','5 Avenue','Bryant Park'],['Park Avenue','Lexington Avenue','Grand Central']]
  .map(([w,e,name])=>{const at=n=>(window.AVES||[]).find(v=>v.name===n); return at(w)&&at(e)?[at(w).ft,at(e).ft,name]:null;}).filter(Boolean);

/* ── palettes ─────────────────────────────────────────────────────────── */
const ZONE={'C5-2':'#FFC24D','C5-2.5':'#FF9E2C','C5-3':'#FF5A36',
  'C6-2':'#A8C7FF','C6-4':'#4C7DFF','C6-5':'#2B5BE0','C6-6':'#1B3FB8','C6-7':'#0E2280',
  'R10':'#E5006D','PARK':'#2E9E4F'};
/* how many times the size of the lot you may build, from the data itself */
const FAR=(()=>{const m={};Object.keys(ZONE).forEach(z=>{
  const v=LOTS.features.filter(f=>f.properties.zone===z&&f.properties.allowed>0).map(f=>f.properties.allowed);
  if(v.length) m[z]=v.sort((a,b)=>v.filter(x=>x===a).length-v.filter(x=>x===b).length).pop();
}); return m;})();
const ZONE_GROUPS=[
  ['The commercial core','The densest ground the city writes. Offices and shops, nothing residential required.',['C5-2','C5-2.5','C5-3']],
  ['General commercial','The belt either side of the core. Offices, shops, hotels, sometimes housing.',['C6-2','C6-4','C6-5','C6-6','C6-7']],
  ['Housing','Where apartments are the point rather than the exception.',['R10']],
  ['Parkland','Mapped public open space. Nothing is built here.',['PARK']]
];
const COND={Excellent:'#1F7A3A',Good:'#2E9E4F',Fair:'#FFC24D',Poor:'#FF9E2C',Critical:'#FF5A36',Dead:'#8A8A8A',Unknown:'#B9B1A1'};
const CAP=[[0,'#EDE8DA'],[40000,'#FFC24D'],[160000,'#FF5A36'],[540000,'#E5006D']];
const AGE=[[1890,'#0E2280'],[1930,'#4C7DFF'],[1970,'#FFC24D'],[2010,'#FF5A36']];

const TREE_GAP_MIN=400;   /* feet with no tree before a stretch counts as a gap */
const TREE_GAPS=(()=>{const out=[];let prev=0;
  TREES.forEach(t=>{if(t.ft-prev>TREE_GAP_MIN) out.push([prev,t.ft]); prev=Math.max(prev,t.ft);});
  if(LEN-prev>TREE_GAP_MIN) out.push([prev,LEN]); return out;})();
const GAP_FEET=TREE_GAPS.reduce((s,[a,b])=>s+(b-a),0);
/* the avenue whose station is closest to x, for naming where a stretch starts and ends */
const nearAve=x=>window.STATION.AVES.reduce((m,v)=>Math.abs(v[0]-x)<Math.abs(m[0]-x)?v:m)[1];

/* the walking surface, summarised once. gross concrete, not clear width. */
const SW=window.SIDEWALK||[];
const SW_STATS=(()=>{
  if(!SW.length) return null;
  const w=SW.map(r=>r.w).sort((a,b)=>a-b);
  /* an even count has two middle widths, and the median is their mean, to the source's tenth of a foot.
     worked in whole tenths so a mean ending in 5 hundredths always rounds up */
  const t10=i=>Math.round(w[i]*10);
  const med=Math.round((t10(Math.floor((w.length-1)/2))+t10(Math.floor(w.length/2)))/2)/10;
  const cover=side=>{const segs=SW.filter(r=>r.s===side).map(r=>[r.a,r.b]).sort((x,y)=>x[0]-y[0]);
    const m=[]; segs.forEach(([a,b])=>{ if(m.length&&a<=m[m.length-1][1]) m[m.length-1][1]=Math.max(m[m.length-1][1],b); else m.push([a,b]); });
    return m.reduce((t,[a,b])=>t+(b-a),0);};
  const narrow=SW.reduce((x,y)=>y.w<x.w?y:x);
  return {med, min:w[0], max:w[w.length-1], n:SW.length,
    coverN:cover(1), coverS:cover(-1), narrow,
    under8:SW.filter(r=>r.w<8).length};
})();

/* what the roadway is, summarised once */
const ROAD_STATS=(()=>{
  let total=0, fourPlusTwo=0, wSum=0;
  ROAD.features.forEach(f=>{const p=f.properties, l=p.b-p.a;
    total+=l; wSum+=p.w*l; if(p.lanes>=4&&p.park>=2) fourPlusTwo+=l;});
  return {total, share:pct(fourPlusTwo,total), avgW:Math.round(wSum/total)};
})();

/* the bus, summarised once. a leg is one bar between two MTA timepoints, and its speed is the
   whole leg's. the corridor average is miles run over hours taken, so it is weighted by buses. */
const BUS=window.BUS||[], BUS_META=window.BUS_META||null;
/* the reference line every speed is read against, baked with its source (METHODOLOGY 3c) */
const WALK_MPH=BUS_META&&BUS_META.walk_mph||3, WALK=WALK_MPH.toFixed(1);
const DIRS={E:'eastbound',W:'westbound'};
/* the CAP colours and no others, slow end hot: one stop at each multiple of walking pace */
const BUS_RAMP=[...CAP].reverse().map(([,c],i)=>[+(WALK_MPH*(i+1)).toFixed(1),c]);
const busAtHour=h=>BUS.filter(r=>r.h===h&&r.mph!=null);
const busCorridor=h=>{const v=busAtHour(h), t=v.reduce((x,r)=>x+r.trips*r.mi/r.mph,0);
  return t?v.reduce((x,r)=>x+r.trips*r.mi,0)/t:null;};
const busSlowest=h=>busAtHour(h).reduce((x,r)=>!x||r.mph<x.mph?r:x,null);
const BUS_STATS=(()=>{
  if(!BUS.length) return null;
  const avg=[...Array(24).keys()].map(h=>[h,busCorridor(h)]).filter(x=>x[1]!=null);
  /* the stretch no kept leg reaches, per direction: drawn blank, never filled in */
  const blank=d=>{const m=[]; BUS.filter(r=>r.dir===d&&r.h===BUS[0].h).map(r=>[r.a,r.b]).sort((x,y)=>x[0]-y[0])
      .forEach(([a,b])=>{ if(m.length&&a<=m[m.length-1][1]) m[m.length-1][1]=Math.max(m[m.length-1][1],b); else m.push([a,b]); });
    const out=[]; let at0=0; m.forEach(([a,b])=>{ if(a>at0) out.push([at0,a]); at0=b; });
    if(at0<LEN) out.push([at0,LEN]); return out;};
  const live=BUS.filter(r=>r.mph!=null), [d0,d1]=BUS_META.day_hours,
    lit=live.filter(r=>r.h>=d0&&r.h<d1);
  return {avg, under:avg.filter(x=>x[1]<WALK_MPH).length,
    legHours:live.length, legUnder:live.filter(r=>r.mph<WALK_MPH).length,
    day:lit.reduce((x,r)=>x+r.trips*r.mi,0)/lit.reduce((x,r)=>x+r.trips*r.mi/r.mph,0),
    slowHour:avg.reduce((x,y)=>y[1]<x[1]?y:x), top:Math.max(...avg.map(x=>x[1])),
    slowLeg:BUS.filter(r=>r.mph!=null).reduce((x,r)=>r.mph<x.mph?r:x),
    blank:{E:blank('E'),W:blank('W')}};
})();
/* the record month by month: the slowest kept leg at one hour (BUS_META.strip_hour) of every
   month baked. legs differ between months, so each bar carries its own leg. */
const monthName=ym=>{const [y,m]=ym.split('-'); return MON[m-1]+' '+y;};
const BUS_HIST_STATS=(()=>{
  const H=window.BUS_HIST; if(!H||!BUS_META) return null;
  const h=BUS_META.strip_hour, rows=H.months.filter(x=>x.slow[h]).map(x=>{
    const [mph,k]=x.slow[h], [dir,from,to,a,b]=H.legsets[x.set][k];
    return {month:x.month, src:x.src, set:x.set, mph, dir, from, to, a, b};});
  if(!rows.length) return null;
  /* how far back the displayed month's set of legs runs unbroken */
  let i=rows.length-1; while(i>0&&rows[i-1].set===rows[i].set) i--;
  return {h, rows, n:H.months.length, under:rows.filter(r=>r.mph<WALK_MPH),
    lo:rows.reduce((x,r)=>r.mph<x.mph?r:x), hi:rows.reduce((x,r)=>r.mph>x.mph?r:x),
    top:Math.max(WALK_MPH,...rows.map(r=>r.mph)), sameSince:rows[i], sameN:rows.length-i,
    /* the months read from the publisher's earlier file */
    old:rows.filter(r=>r.src!==rows[rows.length-1].src)};
})();
/* the ramp read in the page, for the ruler and the legend. same stops, same linear blend as the map. */
const busColour=mph=>{
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const R=BUS_RAMP, k=R.findIndex(x=>mph<=x[0]);
  if(k===0) return R[0][1]; if(k<0) return R[R.length-1][1];
  const t=(mph-R[k-1][0])/(R[k][0]-R[k-1][0]), a=rgb(R[k-1][1]), b=rgb(R[k][1]);
  return 'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')+')';
};
/* 'W 42 ST/8 AV' to '8 Av': the timepoint by its cross street. a name with no 42 St in it is kept whole. */
const stopName=n=>(n.split('/').filter(x=>!/\b42 ST\b/.test(x)).join('/')||n).toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
const legName=r=>`${stopName(r.from)} to ${stopName(r.to)}`;
const hourSpan=h=>`${hr(h).slice(0,(h<12)===((h+1)%24<12)?-2:undefined)} to ${hr(h+1)}`;
const busMonth=()=>monthName(BUS_META.month);
/* six features, one per leg, carrying the chosen hour's speed. drawn along the centreline
   from timepoint to timepoint at true length, never split. */
const busGeo=h=>({type:'FeatureCollection',features:BUS.filter(r=>r.h===h).map(r=>({
  type:'Feature', properties:{dir:r.dir, mph:r.mph, trips:r.trips, name:legName(r)},
  geometry:{type:'LineString',coordinates:[at(r.a),...LINE.filter(v=>v[0]>r.a&&v[0]<r.b).map(v=>[v[1],v[2]]),at(r.b)]}}))});

/* ── stationing ───────────────────────────────────────────────────────── */
/* the lookups live in station.js so node can load and test them without a page */
const {AVES, TREE_REACH, COUNT_REACH, SHED_BY_BBL, PLACES, REACH, LOT_BAND, LOT_BY_BBL, PED_LAST, between, project, stationProfile}=window.STATION;

/* the benches and the counter, summarised once. none is every stretch of the street between
   one DOT bench and the next, ends included, longest first. */
const BENCHES=[...(window.BENCHES||[])].sort((a,b)=>a.ft-b.ft), PED=window.PED_COUNT||null;
const BENCH_STATS=BENCHES.length?{
  west:between(BENCHES[0].ft).west, east:between(BENCHES[BENCHES.length-1].ft).east,
  none:[0,...BENCHES.map(b=>b.ft),LEN].map((a,i,v)=>[a,v[i+1]]).filter(x=>x[1]>x[0]).sort((x,y)=>(y[1]-y[0])-(x[1]-x[0]))}:null;
const PED_GAP_MONTHS=12;   /* the counts are twice a year: a longer wait between two periods is a hole */
/* months between two 'yyyy-mm' periods, so the series can be drawn against time */
const months=(a,b)=>{const [y,m]=a.split('-'), [Y,M]=b.split('-'); return (Y-y)*12+(M-m);};
const PED_STATS=PED&&PED_LAST?(()=>{
  const v=PED.periods.filter(p=>p.pm!=null);
  /* the longest wait between two periods */
  const hole=PED.periods.slice(1).map((p,i)=>[PED.periods[i].p,p.p]).reduce((x,y)=>months(...y)>months(...x)?y:x);
  return {n:v.length, first:v[0], hi:v.reduce((x,y)=>y.pm>x.pm?y:x), lo:v.reduce((x,y)=>y.pm<x.pm?y:x),
    hole:months(...hole)>PED_GAP_MONTHS?hole:null};
})():null;
/* the DOT priority tier, summarised once. runs are consecutive segments of one tier merged,
   on is each tier found on the street, blank is where the source has no segment. */
/* the stretches a published vision names. scripts/bake/vision.py */
const VISION=window.VISION||null;
const TIER=window.PED_TIER||[], TIER_META=(window.PED_TIER_META||{}).tiers||[];
const TIER_STATS=TIER.length?(()=>{
  const runs=[]; TIER.forEach(r=>{ const m=runs[runs.length-1];
    if(m&&m[2]===r.rank&&r.a<=m[1]) m[1]=Math.max(m[1],r.b); else runs.push([r.a,r.b,r.rank]); });
  const blank=[]; let at0=0; runs.forEach(([a,b])=>{ if(a>at0) blank.push([at0,a]); at0=Math.max(at0,b); });
  if(at0<LEN) blank.push([at0,LEN]);
  const on=[...new Map(TIER.map(r=>[r.rank,{rank:r.rank,tier:r.tier}])).values()].sort((x,y)=>x.rank-y.rank);
  return {runs, blank, on};
})():null;
/* feet covered by a list of [a,b] bands once overlaps are merged */
const mergedFeet=bands=>{const m=[]; [...bands].sort((x,y)=>x[0]-y[0]).forEach(([a,b])=>{
  if(m.length&&a<=m[m.length-1][1]) m[m.length-1][1]=Math.max(m[m.length-1][1],b); else m.push([a,b]); });
  return m.reduce((t,[a,b])=>t+(b-a),0);};
/* the metered curb, summarised once. who and hours are tallies of the source's own words. */
const CURB=window.CURB||[];
const CURB_STATS=CURB.length?(()=>{
  const tally=get=>[...CURB.reduce((m,f)=>m.set(get(f),(m.get(get(f))||0)+1),new Map())].sort((x,y)=>y[1]-x[1]);
  const feet=sd=>mergedFeet(CURB.filter(f=>f.side===sd).map(f=>[f.a,f.b]));
  return {who:tally(f=>f.who), hours:tally(f=>(f.com||f.all||{}).hours||'not stated'), n:feet('n'), s:feet('s')};
})():null;
/* the source's terms for a face, for each kind of vehicle it names */
const curbTerms=f=>[['commercial vehicles',f.com],['all vehicles',f.all]].filter(x=>x[1])
  .map(([k,t])=>`${k}: ${t.limit}, ${t.hours}, ${t.rate}`).join('<br>');
/* shed permits, summarised once. a permit is a record at a building, never a length of shed. */
const SHEDS=window.SHEDS||[], SHEDS_META=window.SHEDS_META||null;
const SHED_STATS=SHEDS.length&&SHEDS_META?(()=>{
  const live=SHEDS.filter(x=>x.state==='in force'), lapsed=SHEDS.filter(x=>x.state!=='in force').sort((x,y)=>y.expires.localeCompare(x.expires)||x.ft-y.ft);
  return {live, lapsed, oldest:live.reduce((x,y)=>!x||y.since<x.since?y:x,null)};
})():null;
/* crashes, summarised once. places are station.js PLACES, the list the card reads too.
   drawn is every place with anyone injured, west to east: one circle and one button each. */
const CRASHES=window.CRASHES||[], CRASH_META=window.CRASH_META||null;
const CRASH_STATS=CRASHES.length&&CRASH_META?(()=>{
  const sum=k=>CRASHES.reduce((t,c)=>t+(c[k]||0),0);
  const years=[...CRASHES.reduce((m,c)=>{const y=c.d.slice(0,4), v=m.get(y)||{n:0,inj:0}; v.n++; v.inj+=c.inj||0; return m.set(y,v);},new Map())].sort();
  const inj=sum('inj'), split=[['Pedestrians',sum('ped')],['Cyclists',sum('cyc')],['Motorists',sum('mot')]];
  const drawn=PLACES.filter(p=>p.inj);
  /* crashes the source names on a road that is not the street: said on the row, from the data */
  const fdr=CRASHES.filter(c=>c.x==='FDR Drive');
  return {n:CRASHES.length, inj, k:sum('k'), hurt:CRASHES.filter(c=>c.inj).length, split,
    other:inj-split.reduce((t,x)=>t+x[1],0), years, drawn,
    fdr:{n:fdr.length, inj:fdr.reduce((t,c)=>t+(c.inj||0),0)},
    top:[...drawn].sort((x,y)=>y.inj-x.inj||x.ft-y.ft)};
})():null;
const CRASH_TOP=5;   /* places the open row lists first, before the whole list */
/* the PM series as a line against time, from a zero baseline. a period with no figure breaks the
   line, and so does a hole between two periods: nothing is drawn across time that was not counted. */
const spark=(W,H)=>{
  const P=PED.periods, span=months(P[0].p,P[P.length-1].p)||1, top=PED_STATS.hi.pm;
  const xy=p=>[(1.5+months(P[0].p,p.p)/span*(W-3)).toFixed(1),(H-1.5-p.pm/top*(H-3)).toFixed(1)];
  const runs=[[]]; P.forEach((p,i)=>{
    if(p.pm==null||(i&&months(P[i-1].p,p.p)>PED_GAP_MONTHS)) runs.push([]);
    if(p.pm!=null) runs[runs.length-1].push(xy(p)); });
  const [lx,ly]=xy(PED_LAST);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">${
    runs.filter(r=>r.length).map(r=>r.length>1?`<polyline points="${r.map(c=>c.join(',')).join(' ')}"/>`
      :`<circle cx="${r[0][0]}" cy="${r[0][1]}" r=".8"/>`).join('')
    }<circle cx="${lx}" cy="${ly}" r="1.5"/></svg>`;
};

/* ── map ──────────────────────────────────────────────────────────────── */
/* with no network the map library itself never arrives. the sheet still has to draw. */
const GL=typeof mapboxgl!=='undefined';
if(GL) mapboxgl.accessToken=TOKEN;

/* the street's own bounding box, so the opening view frames the subject at any
   window size. a fixed zoom only ever looked right on one screen. */
const STREET_BOUNDS=GL&&LINE.reduce((b,[,lng,lat])=>b.extend([lng,lat]),
  new mapboxgl.LngLatBounds(at(0),at(0)));
const FIT={bearing:BEARING, padding:{top:48,bottom:48,left:28,right:28}, maxZoom:15.4};

/* If WebGL is unavailable, the token is rejected or Mapbox fails to construct, the
   old code threw here and killed the rest of this IIFE, so the layer panel, the
   legends, the ruler and every number silently never rendered. All of that data is
   local and does not need the map, so fall back to a stub and keep the sheet
   readable instead of showing a page of empty headings. */
let MAP_OK=true, map;
try{
  if(!GL) throw new Error('the map library did not load');
  map=new mapboxgl.Map({container:'map', style:'mapbox://styles/mapbox/standard',
    bounds:STREET_BOUNDS, fitBoundsOptions:{...FIT, duration:0},
    pitch:0, antialias:true});
}catch(err){
  MAP_OK=false;
  const noop=()=>{}, nul=()=>null;
  map={on:noop, addLayer:noop, addSource:noop, addControl:noop, setPaintProperty:noop,
    setLayoutProperty:noop, setFeatureState:noop, setConfigProperty:noop, getLayer:nul,
    getCanvas:()=>({style:{}}), easeTo:noop, getBounds:()=>({getWest:()=>at(0)[0],
      getNorth:()=>at(0)[1], getEast:()=>at(LEN)[0], getSouth:()=>at(LEN)[1]}),
    touchZoomRotate:{disableRotation:noop}, dragRotate:{disable:noop},
    resize:noop, fitBounds:noop};
  const host=document.getElementById('map');
  if(host) host.innerHTML='<div style="padding:40px 32px;max-width:52ch;'
    + 'font:400 16px/1.55 Helvetica Neue,Arial,sans-serif;color:#14120F">'
    + '<div style="font-weight:600">The drawing did not load</div>'
    + '<p>This browser could not start the map. Everything else on this sheet is '
    + 'measured from local data and is still correct: the layer list, the counts, the '
    + 'legends and the ruler all work.</p>'
    + '<p>Most often this is WebGL being disabled or unavailable.</p></div>';
  console.warn('map failed to construct:', err && err.message);
}
/* top left, so the card at the right of the map has the map's whole height */
if(MAP_OK) map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-left');

/* the constructor measures the container before the mobile media query has laid it
   out, so the opening fit was computed against the wrong box and the street ran off
   the right edge on a phone. re-fit once, on load, and again on resize until the
   reader touches the map. */
let userMoved=false;
/* the view that lays the whole street across the map's WIDTH. fitBounds fits the upright
   lon/lat box of a diagonal line, so it was limited by the map's height and the street shrank
   to a speck on a short window. turned to the bearing the street is one thin horizontal line,
   so the zoom comes from its length and the width left inside the side padding. */
const streetFit=width=>{
  const a=at(0), b=at(LEN), R=Math.PI/180, lat=(a[1]+b[1])/2, EARTH=6378137;
  const dx=(b[0]-a[0])*R*Math.cos(lat*R), dy=(b[1]-a[1])*R;
  const metres=EARTH*Math.hypot(dx,dy);                         /* end to end, flat at this latitude */
  const px=Math.max(120,width-FIT.padding.left-FIT.padding.right);
  const round=2*Math.PI*EARTH*Math.cos(lat*R);                  /* the parallel here, in metres */
  const zoom=Math.min(FIT.maxZoom,Math.log2(round*px/(512*metres)));
  /* the street's two ends in that view, as shares of the width: its run across the screen at the
     map's bearing, in px at that zoom, centred. the ruler is set out between the same shares. */
  const B=BEARING*R, run=EARTH*(dx*Math.cos(B)-dy*Math.sin(B))*512*2**zoom/round;
  return {center:[(a[0]+b[0])/2,lat], zoom, lo:(width-run)/2/width, hi:(width+run)/2/width};
};
const streetView=()=>{ const {center,zoom}=streetFit(map.getContainer().clientWidth);
  return {center, zoom, bearing:BEARING}; };
/* where the street's ends sit across the ruler, as shares of its width, and a station's share.
   buildRuler sets it from streetFit, so ruler and opening map are in register. */
let SCALE={lo:0,hi:1};
const share=ft=>SCALE.lo+ft/LEN*(SCALE.hi-SCALE.lo);
/* only the reader's own hand counts. the fit itself fires zoomstart, with no originalEvent. */
map.on('dragstart',()=>{userMoved=true;}); map.on('zoomstart',e=>{ if(e.originalEvent) userMoved=true; });
/* the canvas is always matched to its box. the street is only fitted again while the reader
   has not moved the map. */
const refit=()=>{ if(!MAP_OK) return;
  try{ map.resize(); if(!userMoved) map.jumpTo(streetView()); }catch(e){} };
map.on('load',refit); map.on('load',()=>{ syncPick(); showStation(false); });
let _fitT; addEventListener('resize',()=>{clearTimeout(_fitT); _fitT=setTimeout(refit,160);});
map.dragRotate.disable(); map.touchZoomRotate.disableRotation();

/* ── the station card ─────────────────────────────────────────────────── */
/* one selection, one place. st is feet from the west end, lot is a bbl or null, hour is the
   hour of day every timed figure is read at. it opens on the street's slowest hour. */
const HOUR_START=BUS_STATS?BUS_STATS.slowHour[0]:17;
const SEL={st:null, lot:null, pick:null, hour:HOUR_START};
const AVE_FULL={Mad:'Madison',Lex:'Lexington'};
const aveShort=n=>AVE_FULL[n]||n;
const aveName=n=>aveShort(n)+' Avenue';
/* the numbered street an address names. a label only: the lot rule is frontage (METHODOLOGY 4) */
const streetNo=a=>((a||'').toUpperCase().replace(/\s+/g,' ').trim().replace(/\b(\d+)(ST|ND|RD|TH)\b/g,'$1').match(/^(?:[0-9][0-9A-Z-]* )?(?:EAST|WEST|E|W) (\d+) (?:STREET|ST)$/)||[])[1];
/* the lot row's figures, all from the drawn lots. on is the lots addressed on 42nd Street. */
/* MapPLUTO owner type: city, mixed, other public authority, fully tax-exempt */
const PUBLIC_OWN=new Set(['C','M','O','X']);
const LOT_STATS=(()=>{ const P=LOTS.features.map(f=>f.properties), sum=l=>l.reduce((t,p)=>t+(p.unbuilt||0),0), lm=P.filter(p=>p.lm===1);
  /* floor area on paper is not floor area anyone may build. both sets that cannot use it are counted
     here, so the sentence states both and not only the smaller one. */
  const pub=P.filter(p=>PUBLIC_OWN.has(p.own)), priv=P.filter(p=>p.lm!==1&&!PUBLIC_OWN.has(p.own));
  return {all:P.length, room:P.filter(p=>p.unbuilt>0).length, on:P.filter(p=>streetNo(p.addr)==='42').length,
    lm:lm.length, unbuilt:sum(P), lmUnbuilt:sum(lm),
    pub:pub.length, pubUnbuilt:sum(pub), priv:priv.length, privUnbuilt:sum(priv)}; })();
const feet=v=>v==null?'not measured here':v+' ft';
/* '2026-05-20' to '20 May 2026', '2026-05' to 'May 2026'. no Date object, so no timezone slip. */
const day=iso=>{const [y,m,d]=iso.split('-'); return (d?+d+' ':'')+MON[m-1]+' '+y;};
const srcDate=k=>(window.SOURCE_DATE||{})[k]?`, updated ${day(window.SOURCE_DATE[k])}`:'';
const away=x=>x.dir?`${commas(x.dist)} ft ${x.dir}`:'at this station';
/* a count window from the baked hours, 24 hour clock in: 'weekday 4 to 7pm' */
const span=w=>w?`${w.day} ${hr(w.from).slice(0,(w.from<12)===(w.to<12)?-2:undefined)} to ${hr(w.to)}`:'PM';
const PM_WIN=span((window.PED_COUNT||{}).windows&&window.PED_COUNT.windows.pm);
/* a shed permit in one line, the same words on the map, in the card and in the lot list */
const shedSays=x=>x.state==='in force'?`in force to ${day(x.expires)}`:`ran out ${day(x.expires)}, no sign-off recorded`;
const block=x=>x.west===x.east?`at ${aveShort(x.west)}`:!x.west?`west of ${aveShort(x.east)}`:!x.east?`east of ${aveShort(x.west)}`:`${aveShort(x.west)} to ${aveShort(x.east)}`;
/* source, date and caveat travel with the figures, whichever layers are on */
/* the rendered file on GitHub. a relative .md link is not served the same way by every host. */
const METHOD='https://github.com/judy-huynh/river-to-river/blob/main/METHODOLOGY.md';
const NOTE_WALK=`Walk widths are gross concrete. Sheds, stairs, newsstands and kiosks are not deducted, `
  +`so each width is an upper bound, not a clear width. Sidewalks: NYC planimetric sidewalk polygons `
  +`via Sidewalk Widths NYC, source file dated 20 Apr 2020. Roadway: NYC CSCL street centerline. `
  +`Trees: NYC Parks Forestry Tree Points. `
  +`Benches: NYC DOT Seating Locations${srcDate('BENCHES')}, ${(window.BENCHES||[]).length} on the street, `
  +`distance measured along it. The source holds only benches DOT placed. Seating in parks and plazas, `
  +`or put out by a building or a business improvement district, is not in it. `
  +`Pedestrian count: NYC DOT Bi-Annual Pedestrian Counts${srcDate('PED_COUNT')}. The figure is the total for `
  +`${PM_WIN} on one count day, both sidewalks, not an average. Shown within ${COUNT_REACH} ft of the `
  +`counter and only on its own block.`
  +(TIER_STATS?` Priority tier: NYC DOT Pedestrian Mobility Plan${srcDate('PED_TIER')}. A tier is the plan's rank `
  +`for the street segment, 1 the highest. It is not a count of people.`:'')
  +(CURB_STATS?` Curb: NYC DOT ParkNYC Block Faces${srcDate('CURB')}. No meter does not mean free to park: other posted `
  +`rules apply and are not in the source.`:'')
  +(CRASH_STATS?` Crashes: NYPD Motor Vehicle Collisions${srcDate('CRASHES')}, ${day(CRASH_META.since)} to ${day(CRASH_META.to)}, `
  +`police points within ${CRASH_META.near_ft} ft of the centreline, usually the nearest intersection. Counts of people hurt. No rate can be computed.`:'')
  +(BUS_STATS?` Bus: MTA Bus Route Segment Speeds, ${BUS_META.route}, weekdays in ${busMonth()}${srcDate('BUS')}. `
  +`A speed is the average over a whole leg between two timepoints, not a reading at this station. `
  +`A leg with a timepoint off 42nd Street is left out, so some stations have none.`:'');
const NOTE_LOT=`Unbuilt floor area is lot area &times; the base floor area ratio of the zoning district, minus `
  +`floor area built. Special district rules are not applied, and a landmarked lot may not be able `
  +`to use it. Lots: NYC MapPLUTO.`;
/* said only on a lot that has a shed permit */
const NOTE_SHED=(SHED_STATS?` Shed permits: DOB NOW: Build, Approved Permits${srcDate('SHEDS')}, read as of ${day(SHEDS_META.asof)}. `
  +`A permit is a record. It does not confirm a shed is standing, and the length of a shed is not in it.`:'');
const note=t=>`<p class="note">${t} <a href="${METHOD}">Method</a></p>`;
/* the line runs on past the first and last avenue, so a station can have one on one side only */
const whereName=x=>x.west&&x.west===x.east?`At ${aveName(x.west)}`
  : !x.west?`West of ${aveName(x.east)}`
  : !x.east?`East of ${aveName(x.west)}`
  : `Between ${aveShort(x.west)} and ${aveName(x.east)}`;
/* a station within AT_TOL ft of an avenue's own station reads as at that avenue, so an item stationed
   a step past the crossing and the card's title name the same place */
const AT_TOL=30;
const placeAt=ft=>{ const v=window.STATION.AVES.find(a=>Math.abs(a[0]-ft)<=AT_TOL); return v?{west:v[1],east:v[1]}:between(ft); };
const where=P=>whereName(placeAt(P.ft));
/* a cross street as the ruler names it: '6th Avenue', never the source's 'Avenue of the Americas' */
const crossName=n=>{ const v=(window.AVES||[]).find(x=>x.name===n); return v&&v.label?aveName(v.label):n; };

/* MapPLUTO cuts an address at its field width. said in full where the cut is known. */
const addrShow=p=>(p.addr||'Unnamed lot').replace(/\bAvenue Of The Amer$/,'Avenue of the Americas')
  .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g,(m,n,s)=>n+s.toLowerCase());   /* MapPLUTO writes '42Nd Street' */
/* each thing a reader can pick, by row: its station, its own geometry for the map's ring, and the
   words the list and the card use for it. one table, so a list button, a map feature and a ruler
   tick that carry the same row and index are the same item. */
const pt=(lon,lat)=>({type:'Point',coordinates:[lon,lat]});
const sideName=s=>s==='n'?'North':'South';
const lotGeo=bbl=>{ const f=LOTS.features.find(x=>String(x.properties.bbl)===String(bbl)); return f?f.geometry:null; };
const PICKS={
  people:PED_STATS?[{ft:PED.ft, geo:pt(PED.lon,PED.lat), r:[4,9], kind:'DOT pedestrian counter', name:'DOT pedestrian counter', sub:block(between(PED.ft))}]:[],
  benches:BENCHES.map(b=>({ft:b.ft, geo:pt(b.lon,b.lat), r:[3.5,8], kind:'DOT bench', name:`${sideName(b.side)} side, ${block(between(b.ft))}`})),
  sheds:SHED_STATS?[...SHED_STATS.live,...SHED_STATS.lapsed].map(x=>({ft:x.ft, bbl:String(x.bbl), geo:lotGeo(x.bbl), kind:'Shed permit', name:x.addr,
    sub:x.state==='in force'?shedSays(x):`ran out ${day(x.expires)}`, run:`${x.n} permit${x.n===1?'':'s'} in a run since ${day(x.since)}`})):[],
  crashes:CRASH_STATS?CRASH_STATS.drawn.map(p=>({ft:p.ft, geo:pt(p.lon,p.lat), r:[1.3*Math.sqrt(p.inj),4.4*Math.sqrt(p.inj)], kind:'Crash place',
    name:p.name?`At ${crossName(p.name)}`:whereName(placeAt(p.ft)), sub:`${commas(p.inj)} injured in ${commas(p.n)} crash${p.n===1?'':'es'}`})):[],
  curb:CURB.map(f=>({ft:Math.round((f.a+f.b)/2), geo:{type:'LineString',coordinates:f.c}, kind:'Metered curb',
    name:`${sideName(f.side)} side, between ${crossName(f.from)} and ${crossName(f.to)}`, sub:f.who}))
};
const pickTitle=k=>k.kind===k.name?k.kind:`${k.kind} · ${k.name}`;
/* the tier ramp on the ruler and in the row's key: four ink strengths, strongest first */
const TIER_INK={1:'--ink-fill',2:'--ink-30',3:'--hair-2',4:'--hair'};

/* ═══════════════════════════════════════════════════════════════════════
   THE ROWS. Each is a question, grouped People, Movement, Built, in the order read.
   Three levels. Shut: the question, fig [figure, unit], and the unit carries the caveat.
   Open: says (one sentence on what is drawn), lead (one computed line), l2 (the key or the
   pick list, and at most one flag), src (the source line). Behind About this data: l3.
   has is false when the row's data is not baked, and the row is then left off the rail.
   ═══════════════════════════════════════════════════════════════════════ */
const LIST_CAP=5;   /* a pick list shows this many before Show all */
const srcLine=t=>`<p class="src">${t} <a href="${METHOD}">Method</a></p>`;
const about=h=>h?`<details class="about"><summary>About this data</summary>${h}</details>`:'';
const flag=(t,b)=>`<div class="flag"><h4>${t}</h4>${b?`<p>${b}</p>`:''}</div>`;
const showAll=(L,n)=>n>LIST_CAP?`<button class="mini" type="button" data-all aria-expanded="${!!L.all}">${L.all?`Show first ${LIST_CAP}`:`Show all ${commas(n)}`}</button>`:'';
/* items are PICKS entries with their index, so a button and the map's feature name the same item */
const pickList=(L,label,items)=>`<p class="lab">${label}</p><ul class="lotrows">${
  (L.all?items:items.slice(0,LIST_CAP)).map(x=>`<li><button type="button" data-pick="${L.id}:${x.i}"><b>${x.name}</b>${x.sub?`<span>${x.sub}</span>`:''}</button></li>`).join('')}</ul>`
  +showAll(L,items.length);
const picksOf=id=>PICKS[id].map((x,i)=>({...x,i}));
const cap1=s=>s.charAt(0).toUpperCase()+s.slice(1);
/* a stretch named by place: the river at a street end, else the avenue inside the stretch at that end */
const gapEnds=([a,b])=>[a<=0?'the Hudson River':aveName(between(a).east||between(a).west),
  b>=LEN?'the East River':aveName(between(b).west||between(b).east)];
const gapPlace=g=>{ const [A,B]=gapEnds(g); return A===B?`at ${A}`:`from ${A} to ${B}`; };
const feetMiles=ft=>`${commas(ft)} ft`+(ft>=1320?` (${(ft/5280).toFixed(2)} mi)`:'');
let VISION_ON=false;   /* the published stretches on the ruler, from the ground row */
const tierSwatch=rank=>`background:${TIER_INK[rank]?`var(${TIER_INK[rank]})`:'none'};border-color:var(--ink)`;

const TREE_ROW=
  {
    id:'trees', group:'Built', short:'Trees', name:'Street trees', has:TREES.length>0,
    get fig(){ return [commas(TREES.length),'standing']; },
    on:true, open:false, ids:['treeDots'], opacity:1,
    says:`Every tree the Parks Department currently records on this street.`,
    styles:[['plain','All the same'],['cond','How healthy they are']], style:'plain',
    extras:[['gaps','Show where there are none']], extraOn:{gaps:false},
    src:`NYC Parks Forestry Tree Points${srcDate('TREES')||', release date not recorded'}.`,
    l2(){
      let h='';
      if(this.style==='plain'){
        h+=`<div class="key"><h4>Trunk size</h4>
          <div class="sizes">${[4,12,24].map(d=>
            `<figure><span style="width:${d*1.1}px;height:${d*1.1}px"></span><figcaption>${d}"</figcaption></figure>`).join('')}</div></div>`;
      } else {
        const rows=Object.entries(COND)
          .map(([k,v])=>[k,v,TREES.filter(t=>t.cond===k).length])
          .filter(r=>r[2]>0).sort((a,b)=>b[2]-a[2]);
        h+=`<div class="key"><h4>Condition, as the city rates it</h4><ul>${
          rows.map(([k,v,n])=>`<li><i class="dot" style="background:${v}"></i><span>${k}</span><b>${n}</b></li>`).join('')}</ul></div>`;
      }
      if(this.extraOn.gaps)
        h+=flag(`${commas(GAP_FEET)} feet has no tree at all`,`That is ${pct(GAP_FEET,LEN)}% of the street, in ${TREE_GAPS.length} stretch${TREE_GAPS.length===1?'':'es'} of over ${TREE_GAP_MIN} ft: ${TREE_GAPS.map(g=>g.map(x=>'near '+aveShort(nearAve(x))).join(' to ')).join(', ')}.`);
      return h;
    },
    l3(){
      const sp=[...TREES.reduce((m,t)=>m.set(t.common,(m.get(t.common)||0)+1),new Map())]
        .sort((a,b)=>b[1]-a[1]).slice(0,4);
      const spTop=sp.length?sp[0][1]:1;
      return `<p class="note">The dot is the size of the trunk. Measured across the trunk. The biggest on the street is ${Math.max(...TREES.map(t=>t.dbh||0))} inches. `
        +`${pct(TREES.filter(t=>t.cond==='Good'||t.cond==='Excellent').length,TREES.length)}% are good or better. `
        +`${TREE_GAPS.length} stretch${TREE_GAPS.length===1?'':'es'} of over ${TREE_GAP_MIN} ft with none.</p>`
        +`<div class="key key--rank"><h4>Most common species</h4>
        <p>${new Set(TREES.map(t=>t.common)).size} species in all.</p><ul>${
        sp.map(([s,c])=>`<li><div class="row"><span>${s}</span><b>${c}</b></div>`
          + `<i class="bar" style="width:${Math.max(3,Math.round(c/spTop*100))}%"></i></li>`).join('')}</ul></div>`;
    }
  };
const LAYERS=[
  {
    id:'people', group:'People', short:'Count', name:'How many people are here?', has:!!PED_STATS,
    /* the bake stops unless the source has exactly one location on 42 Street, so this is the whole set */
    get fig(){ return [commas(PED_LAST.pm), `${PM_WIN}, ${day(PED_LAST.p)}`]; },
    on:false, open:false, ids:['countDot'],
    get says(){ return `NYC DOT counts people on foot at one place on 42nd Street, twice a year: ${PED.street}, ${PED.from} to ${PED.to}.`; },
    get src(){ return `NYC DOT Bi-Annual Pedestrian Counts, location ${PED.loc}${srcDate('PED_COUNT')}.`
      +(TIER_STATS?` NYC DOT Pedestrian Mobility Plan${srcDate('PED_TIER')}.`:''); },
    l2(){
      const W=PED.windows||{}, P=PED.periods;
      let o=`<div class="key"><h4>Latest count, ${day(PED_LAST.p)}</h4><ul>${
        ['am','md','pm'].map(k=>`<li><span>${span(W[k])}</span><b>${PED_LAST[k]!=null?commas(PED_LAST[k]):'not counted'}</b></li>`).join('')}</ul>
        <div class="sparkrow">${spark(120,18)}<span class="lab">${PM_WIN}, ${day(P[0].p)} to ${day(P[P.length-1].p)}</span></div></div>`;
      o+=pickList(this,'Pick it to see it on the street',picksOf('people'));
      if(TIER_STATS)
        o+=`<div class="key"><h4>DOT pedestrian priority tier</h4><ul>${
          TIER_STATS.on.map(t=>`<li><i style="${tierSwatch(t.rank)}"></i><span>${t.tier}</span><b>tier ${t.rank} of ${TIER_META.length}</b></li>`).join('')}</ul></div>`;
      o+=flag('Counted on one block, on single days',`The count is taken across both sidewalks on this block only, on a single weekday and the Saturday next to it.`);
      return o;
    },
    l3(){
      const S=PED_STATS, P=PED.periods;
      const gone=S.hole?P.findIndex(p=>p.p===S.hole[1]):-1;
      return `<p class="note">Each figure is one count day, both sidewalks. A total over each window, not a peak hour and not a whole day. One day's weather or an event moves it, and it does not describe any other block of the street.`
        +(TIER_STATS?` A tier is the plan's rank for the street segment, 1 the highest. It is not a count of people. Drawn blank where the source has no segment.`:'')+`</p>`
        +`<div class="key"><h4>Every period, ${PM_WIN}</h4>
        <p>${S.n} count days, ${day(S.first.p)} to ${day(PED_LAST.p)}, to one scale from zero.${S.hole?` No count between ${day(S.hole[0])} and ${day(S.hole[1])}, drawn blank.`:''}</p>
        <div class="hours hours--count" role="img" aria-label="${PM_WIN} count by period. ${P.map(p=>`${day(p.p)} ${p.pm!=null?commas(p.pm):'not counted'}`).join(', ')}.">${
        P.map((p,i)=>(i===gone?'<i class="hours__none"></i>':'')
          +`<i${p===PED_LAST?' data-now':''} style="height:${p.pm!=null?(p.pm/S.hi.pm*100).toFixed(1):0}%"></i>`).join('')}</div>
        <div class="hours__lab"><span class="lab">${day(P[0].p)}</span><span class="lab">${day(P[P.length-1].p)}</span></div>
        <ul><li><span>Highest, ${day(S.hi.p)}</span><b>${commas(S.hi.pm)}</b></li>
        <li><span>Lowest, ${day(S.lo.p)}</span><b>${commas(S.lo.pm)}</b></li></ul></div>`;
    }
  },
  {
    id:'benches', group:'People', short:'Benches', name:'Where can you stop?', has:!!BENCH_STATS,
    get fig(){ return [commas(BENCHES.length), `DOT bench${BENCHES.length===1?'':'es'}`]; },
    on:false, open:false, ids:['benchDots'],
    says:`Every bench the NYC Department of Transportation (DOT) records on 42nd Street.`,
    src:`NYC DOT Seating Locations${srcDate('BENCHES')}.`,
    l2(){
      const g=BENCH_STATS.none[0], len=g[1]-g[0];
      return flag(`No DOT bench ${gapPlace(g)}`,`${feetMiles(len)}, ${pct(len,LEN)}% of the street.`)
        +`<p class="lead">Only benches DOT placed are in the source.</p>`
        +pickList(this,'Pick one to see it on the street',picksOf('benches'));
    },
    l3(){
      const S=BENCH_STATS;
      return `<p class="note">Seating in parks and plazas, or put out by a building or a business improvement district, is not. It is the length of street between DOT benches or a street end. Other places to sit are not in the source.</p>`
        +`<div class="key"><h4>Stretches with no DOT bench</h4>
        <p>Measured along the street, either side, longest first.</p><ul>${
        S.none.map(g=>`<li><span>${cap1(gapPlace(g).replace(/^from /,''))}<br>${commas(g[0])} to ${commas(g[1])} ft</span><b>${commas(g[1]-g[0])} ft</b></li>`).join('')}</ul></div>`
        +`<div class="key"><h4>Each bench</h4><ul>${BENCHES.map(b=>`<li><span>${sideName(b.side)} side, ${block(between(b.ft))}<br>${commas(b.ft)} ft from the Hudson River</span><b>${b.installed?`installed ${day(b.installed)}`:'no install date'}</b></li>`).join('')}</ul></div>`;
    }
  },
  {
    id:'sheds', group:'People', short:'Sheds', name:'What is in the way?', has:!!SHED_STATS,
    get fig(){ const n=SHED_STATS.live.length; return [commas(n), `building${n===1?'':'s'} with a shed permit in force`]; },
    on:false, open:false, ids:['shedFill','shedLine'],
    says:`Buildings addressed on 42nd Street with a Department of Buildings permit for a sidewalk shed.`,
    get src(){ return `DOB NOW: Build, Approved Permits${srcDate('SHEDS')}.`; },
    l2(){
      const S=SHED_STATS, M=SHEDS_META;
      return `<div class="key"><ul>
        <li><i class="mark mark--full"></i><span>Permit in force on ${day(M.asof)}</span><b>${S.live.length}</b></li>`
        +(S.lapsed.length?`<li><i class="mark"></i><span>Permit run out, no sign-off recorded</span><b>${S.lapsed.length}</b></li>`:'')+`</ul></div>`
        +pickList(this,'Pick one to see it on the street',picksOf('sheds'))
        +flag('The length of a shed is not in the record',`DOB publishes the address, dates and status of each permit, and not how much sidewalk the shed covers, so no length is given here.`);
    },
    l3(){
      const S=SHED_STATS, M=SHEDS_META;
      return `<p class="note">Permit records only. A permit does not say a shed is standing, how long it is, or which side of a corner building it covers. `
        +(S.oldest?`Oldest run since ${day(S.oldest.since)}. `:'')
        +(S.lapsed.length?`Permits run out are listed newest first. The record does not say whether a shed still stands. `:'')
        +`Permits at one building are read as one run when each starts within ${M.gap_days} days of the last running out. `
        +`${commas(M.rows.now)} shed permits on 42nd Street. Runs dated with ${commas(M.rows.old)} older permits from DOB Permit Issuance.</p>`
        +`<div class="key"><h4>Each building</h4><ul>${PICKS.sheds.map(k=>`<li><span>${k.name}<br>${k.sub}</span><b>${k.run}</b></li>`).join('')}</ul></div>`;
    }
  },
  {
    id:'crashes', group:'People', short:'Crashes', name:'Who gets hurt?', has:!!CRASH_STATS,
    get fig(){ return [commas(CRASH_STATS.inj),`people injured, ${day(CRASH_META.since)} to ${day(CRASH_META.to)}`]; },
    on:false, open:false, ids:['crashDots'],
    get says(){ return `Every crash the police reported within ${CRASH_META.near_ft} ft of the centre of 42nd Street.`; },
    /* the question is who, so the source's own split stands with the figure, not behind a disclosure */
    get lead(){ const S=CRASH_STATS, [p,c,m]=S.split.map(x=>commas(x[1]));
      return `Of the ${commas(S.inj)} injured, ${p} were on foot, ${c} on a bike and ${m} in a vehicle. ${commas(S.k)} people were killed.`; },
    src:`NYPD Motor Vehicle Collisions, Crashes${srcDate('CRASHES')}.`,
    l2(){
      const S=CRASH_STATS, all=picksOf('crashes');
      /* the first five by people injured, or every place west to east: one index into drawn either way */
      const items=this.all?all:S.top.slice(0,CRASH_TOP).map(p=>all[S.drawn.indexOf(p)]);
      return `<div class="key"><h4>Circle size: people injured at one place</h4>
        <div class="sizes sizes--ink">${[1,10,40].map(v=>`<figure><span style="width:${(Math.sqrt(v)*4.4).toFixed(1)}px;height:${(Math.sqrt(v)*4.4).toFixed(1)}px"></span><figcaption>${v}</figcaption></figure>`).join('')}</div></div>`
        +`<p class="lab">${this.all?'Every place with anyone injured, west to east':`The ${Math.min(CRASH_TOP,S.top.length)} places with most injured`}. Pick one to see it on the street</p>`
        +`<ul class="lotrows">${items.map(x=>`<li><button type="button" data-pick="crashes:${x.i}"><b>${x.name}</b><span>${x.sub}</span></button></li>`).join('')}</ul>`
        +showAll(this,all.length)
        +flag('Counts only',`No source counts how many people walk, cycle or drive along the street, so there is nothing to divide by.`);
    },
    l3(){
      const S=CRASH_STATS, M=CRASH_META;
      let o=`<p class="note">In ${commas(S.n)} reported crashes since ${day(M.since)}. A circle is the people injured at one place. The police put most crashes at the nearest intersection, not at the spot, so a place is an intersection far more often than a spot. `
        +`Area grows with the people injured at one place: the crashes the police put within ${window.STATION.CRASH_JOIN} ft of each other along the street. A place where nobody was injured is not drawn. `
        +`These figures say how many people were hurt. They do not say how dangerous the street is for one person using it, and a busy corner cannot be compared with a quiet one.</p>`;
      o+=`<div class="key"><h4>People injured, ${day(M.since)} to ${day(M.to)}</h4>
        <p>${commas(S.hurt)} of the ${commas(S.n)} crashes injured someone. The split is the source's own.</p><ul>${
        S.split.map(([k,v])=>`<li><span>${k}</span><b>${commas(v)}</b></li>`).join('')}${
        S.other?`<li><span>In none of the three</span><b>${commas(S.other)}</b></li>`:''}
        <li><span>All injured</span><b>${commas(S.inj)}</b></li>
        <li><span>People killed</span><b>${commas(S.k)}</b></li></ul></div>`;
      o+=`<div class="key"><h4>By year</h4><p>The last year runs to ${day(M.to)} only.</p><ul>${
        S.years.map(([y,v])=>`<li><span>${y} &middot; ${commas(v.n)} crashes</span><b>${commas(v.inj)} injured</b></li>`).join('')}</ul></div>`;
      if(S.fdr.n)
        o+=`<div class="key"><h4>Not every crash here was on 42nd Street</h4><p>The rule is distance, so a crash on an avenue inside one of the street's intersections is counted. ${commas(S.fdr.n)} of the crashes are ones the source names on the FDR Drive, at the east end, with ${commas(S.fdr.inj)} people injured.</p></div>`;
      if(M.unlocated.n)
        o+=`<div class="key"><h4>${commas(M.unlocated.n)} more crashes have no point</h4><p>The source records them on 42nd Street with no coordinates, so they cannot be placed and are not counted above. ${commas(M.unlocated.inj)} people were injured in them.</p></div>`;
      return o;
    }
  },
  {
    id:'bus', group:'Movement', short:'Bus', name:'How fast does the bus move?', has:!!BUS_STATS, hour:true,
    /* getters: the shut row follows the hour slider */
    get fig(){ const v=busCorridor(SEL.hour);
      return [v!=null?v.toFixed(2):'none', `${v!=null?'mph, street average':'no buses measured'}, ${hourSpan(SEL.hour)}`]; },
    on:false, open:false, ids:['busCase','busLine','busNone'], opacity:1,
    says:BUS_STATS?`The M42 on each leg between two MTA timepoints, averaged over the weekdays of ${busMonth()}.`:'',
    get lead(){ const r=busSlowest(SEL.hour);
      return (r?`Slowest: ${DIRS[r.dir]}, ${legName(r)}, ${r.mph.toFixed(2)} mph. `:'')+`Walking reference ${WALK} mph.`; },
    get src(){ return `MTA Bus Route Segment Speeds, ${BUS_META.route}, ${BUS_META.days[0]} to ${BUS_META.days[BUS_META.days.length-1]}, ${busMonth()}${srcDate('BUS')}.`; },
    l2(){
      const h=SEL.hour, rows=BUS.filter(r=>r.h===h);
      /* one ramp, as the map blends it between the stops. ticks sit at each stop's share of the range. */
      const lo=BUS_RAMP[0][0], hi=BUS_RAMP[BUS_RAMP.length-1][0], at=v=>((v-lo)/(hi-lo)*100).toFixed(1);
      const slow=busSlowest(h);
      return `<div class="key"><h4>Miles per hour</h4>
        <div class="ramp" role="img" aria-label="Colour runs from ${lo} mph, the walking reference, to ${hi} mph and over.">
        <i style="background:linear-gradient(90deg,${BUS_RAMP.map(([v,c])=>`${c} ${at(v)}%`).join(',')})"></i>
        <div>${BUS_RAMP.map(([v],i)=>`<span style="left:${at(v)}%"${i===0?' data-end="lo"':i===BUS_RAMP.length-1?' data-end="hi"':''}>${v}${i===BUS_RAMP.length-1?'+':''}</span>`).join('')}</div></div></div>`
        +`<div class="key"><h4>Each leg, ${hourSpan(h)}</h4><ul>${
        rows.map(r=>`<li><i style="background:${r.mph!=null?busColour(r.mph):'transparent'}${r===slow?';outline:1.5px solid var(--ink);outline-offset:1px':''}"></i><span>${DIRS[r.dir]}, ${legName(r)}</span><b>${r.mph!=null?r.mph.toFixed(2)+' mph':'no buses'}</b></li>`).join('')}</ul></div>`
        +`<p class="lab keyline"><i class="box"></i>outlined: slowest leg${BUS_META.dropped.length?`<i class="dots"></i>dotted: leg not measured`:''}</p>`;
    },
    l3(){
      if(!BUS_STATS) return '';
      const h=SEL.hour, S=BUS_STATS, rows=BUS.filter(r=>r.h===h);
      let o=`<p class="note">One bar is one leg. The speed is the whole leg's, not a reading at any point inside it. Blended between these stops. The walking reference is ${WALK} mph. Street average ${busCorridor(h)!=null?busCorridor(h).toFixed(2)+' mph':'none'}, ${hourSpan(h)}.</p>`;
      o+=`<div class="key"><h4>Each leg, length and buses measured, ${hourSpan(h)}</h4><ul>${
        rows.map(r=>`<li><span>${DIRS[r.dir]}, ${legName(r)}</span><b>${commas(r.b-r.a)} ft &middot; ${commas(r.trips)} buses</b></li>`).join('')}</ul></div>`;
      o+=`<div class="key"><h4>The street by hour</h4>
        <p>All kept legs, both directions, weighted by buses measured. The line is ${WALK} mph.</p>
        <div class="hours" role="img" aria-label="Average speed by hour. ${S.avg.map(([k,v])=>`${hr(k)} ${v.toFixed(1)}`).join(', ')} miles per hour.">${
        S.avg.map(([k,v])=>`<i${k===h?' data-now':''} style="height:${(v/S.top*100).toFixed(1)}%;background:${busColour(v)}"></i>`).join('')}
        <b style="bottom:${(WALK_MPH/S.top*100).toFixed(1)}%"></b></div>
        <div class="hours__lab"><span class="lab">${hr(0)}</span><span class="lab">${hr(12)}</span><span class="lab">${hr(23)}</span></div></div>`;
      const [d0,d1]=BUS_META.day_hours, T=BUS_HIST_STATS;
      o+=`<div class="key"><h4>${busMonth()}, weekdays</h4><ul>
        <li><span>Street average, ${hr(d0)} to ${hr(d1)}</span><b>${S.day.toFixed(2)} mph</b></li>
        <li><span>Slowest hour of the street average, ${hourSpan(S.slowHour[0])}</span><b>${S.slowHour[1].toFixed(2)} mph</b></li>
        <li><span>Slowest single leg in any hour: ${DIRS[S.slowLeg.dir]}, ${legName(S.slowLeg)}, ${hourSpan(S.slowLeg.h)}</span><b>${S.slowLeg.mph.toFixed(2)} mph</b></li>
        <li><span>Hours with the street average under ${WALK} mph</span><b>${S.under} of ${S.avg.length}</b></li>
        <li><span>Leg speeds under ${WALK} mph, every leg in every hour</span><b>${S.legUnder} of ${S.legHours}</b></li></ul></div>`;
      if(T){
        const first=T.rows[0], last=T.rows[T.rows.length-1], say=r=>`${monthName(r.month)} ${r.mph.toFixed(2)}`;
        o+=`<div class="key"><h4>Slowest leg, ${hourSpan(T.h)}, by month</h4>
          <p>One bar a month, weekdays, ${monthName(first.month)} to ${monthName(last.month)}. The line is ${WALK} mph. The slowest leg was under it in ${T.under.length} of ${T.rows.length} months.</p>
          <div class="hours hours--months" role="img" aria-label="Slowest leg, ${hourSpan(T.h)}, in miles per hour. ${T.rows.map(say).join(', ')}.">${
          T.rows.map(r=>`<i${r.month===BUS_META.month?' data-now':''} style="height:${(r.mph/T.top*100).toFixed(1)}%;background:${busColour(r.mph)}"></i>`).join('')}
          <b style="bottom:${(WALK_MPH/T.top*100).toFixed(1)}%"></b></div>
          <div class="hours__lab"><span class="lab">${monthName(first.month)}</span><span class="lab">${monthName(last.month)}</span></div>
          <p>Lowest ${T.lo.mph.toFixed(2)} mph in ${monthName(T.lo.month)}, highest ${T.hi.mph.toFixed(2)} mph in ${monthName(T.hi.month)}.${T.under.length?` The months under ${WALK} mph:`:''}</p>${
          T.under.length?`<ul>${T.under.map(r=>`<li><i style="background:${busColour(r.mph)}"></i><span>${monthName(r.month)} &middot; ${commas(r.b-r.a)} ft leg<br>${DIRS[r.dir]}, ${legName(r)}</span><b>${r.mph.toFixed(2)} mph</b></li>`).join('')}</ul>`:''}</div>`;
        o+=`<div class="key"><h4>Each bar is one leg in one hour</h4><p>Each bar is the slowest of that month's legs between ${hourSpan(T.h)}, averaged over its weekdays. It is one leg and does not describe the whole street. The MTA moved its timepoints during the record, so the legs are not the same stretches of street in every month. The legs of ${busMonth()} have been the same since ${monthName(T.sameSince.month)}, ${T.sameN} of the ${T.rows.length} months.</p></div>`;
      }
      if(BUS_META.dropped.length)
        o+=`<div class="key"><h4>Drawn blank where no leg is kept</h4><p>${BUS_META.dropped.map(d=>
          `${DIRS[d.dir][0].toUpperCase()+DIRS[d.dir].slice(1)}, ${legName(d)} has a timepoint ${Math.max(...d.off)} ft off 42nd Street, so its time on the street cannot be separated and it is left out.`).join(' ')} ${
          Object.entries(S.blank).map(([d,b])=>`No ${DIRS[d]} speed at ${b.map(([x,y])=>`${commas(x)} to ${commas(y)} ft`).join(' and ')}.`).join(' ')}</p></div>`;
      if(T&&T.old.length)
        o+=`<p class="note">${monthName(T.old[0].month)} to ${monthName(T.old[T.old.length-1].month)} are from the MTA's earlier file, ${T.old[0].src}${srcDate('BUS_OLD')}.</p>`;
      return o;
    }
  },
  {
    id:'road', group:'Movement', short:'Ground', name:'Who gets the ground?', has:ROAD.features.length>0,
    get fig(){ return SW_STATS?[`${SW_STATS.med} ft`,`median sidewalk, roadway ${ROAD_STATS.avgW} ft`]:[`${ROAD_STATS.avgW} ft`,'average roadway']; },
    on:false, open:false, ids:['roadLine','swLine'], opacity:.85,
    says:`The roadway and both sidewalks, drawn at their real widths on the same scale.`,
    src:`NYC planimetric sidewalk polygons via Sidewalk Widths NYC, source file dated 20 Apr 2020. NYC CSCL street centerline.`,
    l2(){
      let h=`<div class="key"><h4>Drawn at real width</h4>
        <ul>
          <li><i class="rule" style="border-top-width:7px;border-top-color:#6E6A62"></i><span>Roadway</span><b>${ROAD_STATS.avgW} ft average</b></li>`;
      if(SW_STATS) h+=`
          <li><i class="rule" style="border-top-width:3px;border-top-color:#2E9E4F"></i><span>Sidewalk, each side</span><b>${SW_STATS.med} ft median</b></li>`;
      h+=`</ul></div>`;
      if(VISION){
        const some=VISION.stretches.some(v=>!v.stated);
        h+=`<label class="check"><input type="checkbox" id="visionOn"${VISION_ON?' checked':''}><span>Published vision: ${VISION.by}, ${VISION.title}</span></label>`;
        if(VISION_ON) h+=`<div class="key"><ul><li><i style="background:var(--hair-2);border-color:var(--ink)"></i><span>stretch, extent given in the piece</span></li>${
          some?`<li><i style="border:1px dashed var(--ink)"></i><span>extent not given, ends approximate</span></li>`:''}</ul></div>`;
      }
      if(SW_STATS) h+=flag('Widths are the whole sidewalk',`Sheds, stairs, newsstands and kiosks are not deducted, so every figure here is an upper bound on what you can actually walk on.`);
      return h;
    },
    l3(){
      let h=`<div class="key"><h4>How the roadway is divided</h4><p>On ${ROAD_STATS.share}% of the street it is four lanes for moving traffic and two more for cars that are parked.</p></div>`;
      if(SW_STATS)
        h+=`<div class="key"><h4>The walking surface</h4>
          <p>Measured across ${SW_STATS.n} stretches of the street's own sidewalk. Coverage is ${pct(SW_STATS.coverN,LEN)}% of the north side and ${pct(SW_STATS.coverS,LEN)}% of the south.</p>
          <ul>
            <li><span>Narrowest &middot; ${SW_STATS.narrow.s===1?'north':'south'} side, ${block(between((SW_STATS.narrow.a+SW_STATS.narrow.b)/2))}</span><b>${SW_STATS.narrow.w} ft</b></li>
            <li><span>Median</span><b>${SW_STATS.med} ft</b></li>
            <li><span>Widest</span><b>${SW_STATS.max} ft</b></li>
            <li><span>Stretches under 8 ft</span><b>${SW_STATS.under8} of ${SW_STATS.n}</b></li>
          </ul></div>`;
      if(VISION)
        h+=`<p class="note">Published vision: <a href="${VISION.url}">${VISION.title}</a>, ${VISION.by}, read ${day(VISION.accessed)}. A stretch whose ends the piece gives is a ruled bar. One drawn between the nearest avenue crossings, or to the end of the street, is a dashed outline.</p>`;
      return h;
    }
  },
  {
    id:'curb', group:'Movement', short:'Curb', name:'Who is the curb for?', has:!!CURB_STATS,
    get fig(){ return [`${CURB_STATS.who[0][1]} of ${CURB.length}`,`metered block sides, ${CURB_STATS.who[0][0].toLowerCase()}`]; },
    on:false, open:false, ids:['curbLine'],
    says:`Each side of a block where NYC DOT runs parking meters, and who may pay to stand there.`,
    src:`NYC DOT Parking Meters, ParkNYC Block Faces${srcDate('CURB')}.`,
    l2(){
      const S=CURB_STATS;
      return `<div class="key"><h4>Who may pay to stand</h4><ul>${
        S.who.map(([k,v])=>`<li><span>${k}</span><b>${v} side${v===1?'':'s'}</b></li>`).join('')}</ul></div>`
        +pickList(this,'Each metered side of a block, west to east. Pick one to see it on the street',picksOf('curb'))
        +flag(`${pct(2*LEN-S.n-S.s,2*LEN)}% of the length of the two sides has no meter`,`No meter does not mean free to park.`);
    },
    l3(){
      const S=CURB_STATS;
      return `<p class="note">A line is one metered block face. Curb with no line has no meter. The source's own vehicle type, by block face. Meters run along ${pct(S.n,LEN)}% of the north side and ${pct(S.s,LEN)}% of the south. Each share is of the whole ${commas(LEN)} ft of the street, avenue crossings included, so it is a share of the street's length and not of the curb a vehicle could use. Bus stops, no standing zones and other posted rules apply there, and they are in another source that is not on this sheet.</p>`
        +`<div class="key"><h4>When the meters run</h4><ul>${
        S.hours.map(([k,v])=>`<li><span>${k}</span><b>${v} side${v===1?'':'s'}</b></li>`).join('')}</ul></div>`
        +`<div class="key"><h4>Terms on each face</h4><ul>${CURB.map(f=>`<li><span>${sideName(f.side)} side, between ${crossName(f.from)} and ${crossName(f.to)}<br>${curbTerms(f)}</span></li>`).join('')}</ul></div>`;
    }
  },
  {
    id:'lots', group:'Built', short:'Lots', name:'What could be built?', has:LOTS.features.length>0,
    /* the sum of unbuilt floor area over the drawn lots, in millions of sq ft (METHODOLOGY 2, 4) */
    get fig(){ return [`${(this.total()/1e6).toFixed(1)}M`,'sq ft allowed and unbuilt, on paper']; },
    /* the figure, the sentence and the list are one set: a filter that moves the list moves them all */
    filtered(){ return this.noLm||this.noPub; },
    total(){ return this.ranked().reduce((t,p)=>t+(p.unbuilt||0),0); },
    on:true, open:false, ids:['lotFill','lotLine','lmHatch'], opacity:.58,
    get says(){ const S=LOT_STATS;
      if(this.filtered()) return `${this.ranked().length} of the ${S.all} lots. `
        +`${(this.total()/1e6).toFixed(1)} million sq ft allowed and not built on them.`;
      return `${S.all} lots. ${(S.unbuilt/1e6).toFixed(1)} million sq ft allowed and not built, `
        +`${(S.privUnbuilt/1e6).toFixed(1)} million on private ground, not landmarked.`; },
    src:`NYC MapPLUTO${srcDate('LOTS')||', release date not recorded'}.`,
    styles:[['zoning','The rules that govern it'],['capacity','Room left to build'],
      ['landmark','What cannot be touched'],['age','When it was built'],['plain','Outline only']],
    style:'zoning', noLm:false, noPub:false,
    ranked(){ return LOTS.features.map(f=>f.properties).filter(p=>!(this.noLm&&p.lm===1)&&!(this.noPub&&PUBLIC_OWN.has(p.own))).sort((x,y)=>y.unbuilt-x.unbuilt||x.ft-y.ft); },
    key(){
      if(this.style==='zoning')
        return `<div class="key key--three"><h4>Zoning district</h4><ul>${ZONE_GROUPS.flatMap(g=>g[2]).filter(k=>LOTS.features.some(f=>f.properties.zone===k))
          .map(k=>`<li><i style="background:${ZONE[k]}"></i><span>${k}</span></li>`).join('')}</ul></div>`;
      if(this.style==='capacity')
        return `<div class="key"><h4>Floor area allowed and never built</h4><ul>${
          CAP.map(([v,c],i)=>`<li><i style="background:${c}"></i><span>${i===0?'nothing spare':commas(v)+'+ sq ft'}</span></li>`).join('')}</ul></div>`;
      if(this.style==='landmark'){
        const n=LOT_STATS.lm;
        return `<div class="key"><h4>Designated landmarks</h4><ul>
          <li><i style="background:#14120F"></i><span>designated</span><b>${n} lots</b></li>
          <li><i style="background:#E9E4D6"></i><span>not designated</span><b>${LOTS.features.length-n} lots</b></li>
          </ul></div>`;
      }
      if(this.style==='age')
        return `<div class="key"><h4>Year the building went up</h4><ul>${
          AGE.map(([y,c])=>`<li><i style="background:${c}"></i><span>${y}s</span></li>`).join('')}</ul></div>`;
      return `<div class="key"><h4>Boundaries only</h4></div>`;
    },
    l2(){
      const list=this.ranked(), shown=this.all?list:list.slice(0,LIST_CAP);
      return this.key()
        +`<p class="lab keyline"><i class="dash"></i>dashed outline: designated landmark</p>`
        +`<div class="ctl"><label for="lotFind">Find a lot by address, owner or BBL</label>
          <input id="lotFind" type="text" list="lotOpts" autocomplete="off" spellcheck="false">
          <p class="lab" id="lotFindSay" aria-live="polite"></p></div>`
        +`<div class="filters"><p class="lab">Most unbuilt floor area first</p>`
        +`<label class="check"><input type="checkbox" id="lotNoLm"${this.noLm?' checked':''}><span>Leave out landmarked lots</span></label>`
        +`<label class="check"><input type="checkbox" id="lotNoPub"${this.noPub?' checked':''}><span>Leave out public and tax-exempt owners</span></label>`
        +(this.filtered()?`<p class="lab">${list.length} of ${LOT_STATS.all} lots left in. The map still shows the rest.</p>`:'')+`</div>`
        +`<ul class="lotrows">${shown.map(p=>`<li><button type="button" data-lot="${p.bbl}"><b>${addrShow(p)}</b>`
          +`<span>${p.owner||'owner not recorded'} &middot; ${p.zone==='PARK'?'park':commas(p.unbuilt)+' sq ft'}${p.lm===1?' &middot; landmark':''}</span></button></li>`).join('')}</ul>`
        +showAll(this,list.length)
        /* the heading carries the caveat itself: a flag with no words under it qualifies nothing,
           and the full sentence is one disclosure down, where the text budget has room for it */
        +flag('On paper: the base rule does not govern here');
    },
    /* the set as it is drawn, every count from the records (METHODOLOGY 4) */
    l3(){ const S=LOT_STATS, M=window.LOTS_META, out=(window.LOTS_OUT||[]).length;
      let o=`<p class="note">${S.all} lots front the street, at their boundary from the city tax map (MapPLUTO).`
        +(M?` A lot is in the set when its boundary comes within ${M.front_ft} ft of the middle of the street, whatever its address. ${S.on} are addressed on 42nd Street and ${S.all-S.on} on an avenue or another street. ${out} of the ${M.pool} lots nearby ${out===1?'is':'are'} left out. <a href="${METHOD}#4-the-lot-rule-frontage">Method</a>.`:'')
        +` ${commas(S.unbuilt)} sq ft of floor area is allowed and not built, on ${S.room} of the ${S.all} lots. That is floor area on paper: most of these lots sit in a special district where the base rule is not the rule that governs, and ${commas(S.lmUnbuilt)} sq ft of it is on the ${S.lm} landmarked lots. ${S.lm} are landmarked and cannot be built on at all. A landmarked lot can carry unbuilt floor area on paper and never be able to use it.</p>`;
      o+=ZONE_GROUPS.map(([h,note,keys])=>{
          const rows=keys.map(k=>{
            const n=LOTS.features.filter(f=>f.properties.zone===k).length;
            if(!n) return '';
            const far=FAR[k];
            return `<li><i style="background:${ZONE[k]}"></i><span>${k}${far?` &middot; up to ${far}&times;`:''}</span><b>${n} lot${n>1?'s':''}</b></li>`;
          }).join('');
          return rows?`<div class="key"><h4>${h}</h4><p>${note}</p><ul>${rows}</ul></div>`:'';
        }).join('')
        +`<div class="key"><h4>What "up to 15&times;" means</h4><p>You may build floor area up to fifteen times the size of the lot. On a 10,000 sq ft lot that is 150,000 sq ft of building, stacked however the rules allow.</p></div>`
        +`<div class="key"><h4>Who holds the floor area on paper</h4><p>MapPLUTO owner type C (city), M (mixed city and private), O (other public authority) or X (fully tax-exempt): ${S.pub} of the ${S.all} lots, carrying ${commas(S.pubUnbuilt)} sq ft, ${pct(S.pubUnbuilt,S.unbuilt)}% of the total. A blank owner type is kept in. ${commas(S.privUnbuilt)} sq ft, on ${S.priv} lots, is on private ground that is not landmarked.</p></div>`
        +`<div class="key"><h4>The other colourings</h4><p>Room left to build: the gap between what the rules permit and what is standing. What cannot be touched: whatever the zoning allows, these cannot grow. When it was built: the year the building on each lot was completed. Outline only: every lot line, no fill.</p></div>`;
      return o;
    }
  },
  TREE_ROW
].filter(L=>L.has);
const row=id=>LAYERS.find(L=>L.id===id);
/* what is drawn before any link or reader has changed it */
const ON_START=LAYERS.filter(L=>L.on).map(L=>L.id).join(',');
/* and what each row is coloured by */
const BY_START=new Map(LAYERS.filter(L=>L.styles).map(L=>[L.id,L.style]));

/* ── panel ────────────────────────────────────────────────────────────── */
function buildPanel(){
  const host=$('#layerList'); let group=null;
  LAYERS.forEach(L=>{
    if(L.group!==group){
      group=L.group; host.append(el('div','group',`<h2>${L.group}</h2>`));
    }
    const r=el('div','layer'); r.dataset.on=L.on; r.dataset.open=L.open;
    /* the whole shut row is one button: the question, its figure, and the unit under it.
       the square before the question says the row is drawn on the map. */
    const bar=el('h3','layer__bar',
      `<button class="layer__head" type="button" id="head-${L.id}" aria-expanded="${L.open}" aria-controls="body-${L.id}">`
      +`<span class="layer__name"><i class="layer__on" aria-hidden="true"></i><span class="sr" data-onsay></span>${L.name}</span>`
      +`<span class="layer__fig"><b></b><small></small></span></button>`);
    const body=el('div','layer__body'); body.id='body-'+L.id;
    body.setAttribute('role','region'); body.setAttribute('aria-labelledby','head-'+L.id);
    r.append(bar,body); host.append(r);
    L._row=r; L._body=body; L._head=bar.querySelector('.layer__head');
    L._head.onclick=()=>{ setOpen(L,!L.open); link(); };
    renderBody(L); headline(L);
  });
  /* the one control that is not a row sits under the last of them, so it belongs to no group */
  const foot=el('div','group group--foot',`<span class="lab"><i class="layer__on layer__on--key" aria-hidden="true"></i>Shown on map</span>`), off=el('button','mini','Hide all'); off.type='button';
  off.setAttribute('aria-label','Hide all from the map');
  off.onclick=()=>LAYERS.forEach(o=>{ if(o.on) toggle(o); });
  foot.append(off); host.append(foot);
  /* a list item is a station like any other, and carries which item it is */
  host.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    const L=LAYERS.find(o=>o._body.contains(b));
    if(b.dataset.pick){ const [id,i]=b.dataset.pick.split(':'), k=PICKS[id][+i], own=row(id);
      if(own&&!own.on) toggle(own);   /* so the item is drawn */
      select({st:k.ft, lot:null, pick:{row:id,i:+i}}); }
    else if(b.dataset.lot) openLot(b.dataset.lot);
    else if('all' in b.dataset&&L){ L.all=!L.all; redraw(L); }
  });
  host.addEventListener('change',e=>{ const t=e.target, L=row('lots');
    if(t.id==='lotNoLm'){ L.noLm=t.checked; redraw(L); link(); }
    else if(t.id==='lotNoPub'){ L.noPub=t.checked; redraw(L); link(); }
    else if(t.id==='visionOn'){ VISION_ON=t.checked; redraw(row('road')); buildRuler(); }
    else if(t.id==='lotFind') findLot(t.value);
  });
}
/* a lot opened from a list stands at its own station */
const lotStation=p=>{ const k=LOT_BAND.get(p.bbl); return p.ft>=k.a&&p.ft<=k.b?p.ft:(k.a+k.b)/2; };
function openLot(bbl){ const p=LOT_BY_BBL.get(String(bbl)); if(!p) return;
  const L=row('lots'); if(L&&!L.on) toggle(L);
  select({st:lotStation(p), lot:String(bbl)}); }
/* the finder: the option picked, else the first lot whose address, owner or BBL holds what was typed.
   both sides are spelled one way first: no punctuation, 42nd as 42, w as west, st as street, 6 av as
   avenue of the americas. so an address pasted from anywhere finds the lot MapPLUTO spells its own way. */
const lotOption=p=>`${p.addr||'Unnamed lot'}, ${p.owner||'owner not recorded'}, ${p.bbl}`;
const ADDR_WORD={w:'west',e:'east',st:'street',str:'street',av:'avenue',ave:'avenue',aven:'avenue',bway:'broadway',pl:'place',
  first:'1',second:'2',third:'3',fifth:'5',sixth:'6',seventh:'7',eighth:'8',ninth:'9',tenth:'10',eleventh:'11',twelfth:'12',amer:'americas'};
const addrKey=t=>(t||'').toLowerCase().replace(/[.,#]/g,' ').replace(/\b(\d+)(st|nd|rd|th)\b/g,'$1')
  .split(/\s+/).filter(Boolean).map(w=>ADDR_WORD[w]||w).join(' ')
  .replace(/\b6 avenue\b/,'avenue of the americas');
function findLot(text){
  const raw=text.trim().toLowerCase(), q=addrKey(text), say=$('#lotFindSay'); if(!q){ if(say) say.textContent=''; return; }
  const all=LOTS.features.map(f=>f.properties), A=p=>addrKey(p.addr);
  /* a whole word must end where the typing ends, so 23 west 42 does not open 234 west 42 */
  const starts=(a,b)=>a===b||a.startsWith(b+' ');
  const hit=all.find(p=>lotOption(p).toLowerCase()===raw)||all.find(p=>A(p)===q)||all.find(p=>starts(A(p),q))
    ||all.find(p=>starts(q,A(p))&&A(p))||all.find(p=>A(p).startsWith(q))||all.find(p=>(' '+addrKey(lotOption(p))).includes(' '+q));
  if(hit){ if(say) say.textContent=''; openLot(hit.bbl); return; }
  /* no lot: name the nearest number on the same street as the sheet spells it, so a miss does not read as a missing lot */
  const num=t=>t.match(/^(\d+) (.+)$/), m=num(q);
  const near=m&&all.filter(p=>{ const k=num(A(p)); return k&&(starts(k[2],m[2])||starts(m[2],k[2])); })
    .sort((x,y)=>Math.abs(num(A(x))[1]-m[1])-Math.abs(num(A(y))[1]-m[1]))[0];
  const eg=all.find(p=>streetNo(p.addr)==='42');
  if(say) say.textContent=near?`No lot on the sheet at that number. Nearest: ${addrShow(near)}.`
    :`No lot on the sheet matches.${eg?` Addresses are spelled as in MapPLUTO: ${eg.addr}.`:''}`;
}

/* the answer on the shut row. called again whenever the figure can move. */
function headline(L){
  const [fig,cap]=L.fig;
  L._row.querySelector('.layer__fig b').innerHTML=fig;
  L._row.querySelector('.layer__fig small').innerHTML=cap;
  L._row.querySelector('[data-onsay]').textContent=L.on?'Shown on map. ':'';
}

/* one row open at a time. opening a row draws it. it stays drawn after the row shuts, until
   the switch inside the row, or Hide all, takes it off. */
function setOpen(L,open){
  if(open) LAYERS.forEach(o=>{ if(o!==L&&o.open){ o.open=false; o._row.dataset.open=false; o._head.setAttribute('aria-expanded',false); } });
  L.open=open; L._row.dataset.open=open; L._head.setAttribute('aria-expanded',open);
  /* the first question opened has the map to itself: the trees drawn at the start step back,
     unless the reader has already chosen what is drawn */
  const t=row('trees');
  if(open&&t&&t!==L&&t.on&&LAYERS.filter(o=>o.on).map(o=>o.id).join(',')===ON_START) toggle(t,true);
  if(open&&!L.on) toggle(L,true);
  buildRuler(); renderCard();
  if(open) requestAnimationFrame(()=>L._row.scrollIntoView({block:'nearest'}));
}

/* the controls are written once. only the sentence and the legend are redrawn after that, so a
   select or a slider being worked by keyboard is never replaced under the reader. */
function renderBody(L){
  let h=`<div data-top></div>`;
  /* one hour slider for the whole sheet */
  if(L.hour)
    h+=`<div class="ctl ctl--hour"><label for="hourIn">Hour of day, weekdays</label>
      <output id="hourOut" for="hourIn">${hourSpan(SEL.hour)}</output>
      <input type="range" id="hourIn" min="0" max="23" step="1" value="${SEL.hour}" aria-valuetext="${hourSpan(SEL.hour)}"></div>`;
  if(L.styles)
    h+=`<div class="ctl"><label for="style-${L.id}">Colour by</label><select id="style-${L.id}">${
      L.styles.map(([v,t])=>`<option value="${v}"${v===L.style?' selected':''}>${t}</option>`).join('')}</select></div>`;
  h+=`<button class="swrow" type="button" aria-pressed="${L.on}" aria-label="Show on map: ${L.name}"><i class="sw" aria-hidden="true"></i><span>Show on map</span></button>`;
  if(L.extras)
    h+=`<div class="opt">${L.extras.map(([k,t])=>
      `<button type="button" data-extra="${k}" aria-pressed="${!!L.extraOn[k]}">${t}</button>`).join('')}</div>`;
  h+=`<div data-legend></div>`;
  if(L.id==='lots') h+=`<datalist id="lotOpts">${LOTS.features.map(f=>`<option value="${lotOption(f.properties).replace(/"/g,'&quot;')}">`).join('')}</datalist>`;
  L._body.innerHTML=h;
  L._sw=L._body.querySelector('.swrow');
  /* stacked, the map sits above the rail and off screen, so what the press changed has to be brought into view */
  L._sw.onclick=()=>{ toggle(L);
    if(L.on&&matchMedia('(max-width:899px)').matches) $('#map').scrollIntoView({block:'nearest'}); };
  const hourIn=L._body.querySelector('#hourIn');
  if(hourIn) hourIn.oninput=e=>setHour(+e.target.value);
  const sel=L._body.querySelector('#style-'+L.id);
  if(sel) sel.onchange=e=>{ L.style=e.target.value; paint(L); redraw(L); link(); };
  L._body.querySelectorAll('[data-extra]').forEach(b=>{
    b.onclick=()=>{ const k=b.dataset.extra; L.extraOn[k]=!L.extraOn[k];
      b.setAttribute('aria-pressed',L.extraOn[k]); paint(L); redraw(L); buildRuler(); };
  });
  redraw(L);
}
/* the sentence and the legend. focus goes back to the same control, and About this data stays as it was. */
function redraw(L){
  const box=L._body.querySelector('[data-legend]'), a=document.activeElement, d=a&&box.contains(a)?a.dataset:null;
  const key=!d?null:a.id?'#'+a.id:d.pick?`[data-pick="${d.pick}"]`:d.lot?`[data-lot="${d.lot}"]`:'all' in d?'[data-all]':null;
  const was=box.querySelector('details.about'), open=!!(was&&was.open);
  L._body.querySelector('[data-top]').innerHTML=`<p class="says">${L.says}</p>`+(L.lead?`<p class="lead">${L.lead}</p>`:'');
  box.innerHTML=L.l2()+srcLine(L.src)+about(L.l3());
  if(open) box.querySelector('details.about').open=true;
  const f=key&&box.querySelector(key); if(f) f.focus();
  markCurrent();
}

function toggle(L,quiet){
  L.on=!L.on; L._row.dataset.on=L.on; L._sw.setAttribute('aria-pressed',L.on);
  headline(L); paint(L);
  if(!quiet) link();
}

/* the item that made the selection, and the open lot, are marked wherever they are listed */
function markCurrent(){
  document.querySelectorAll('#layerList [aria-current], #readout [aria-current]').forEach(b=>b.removeAttribute('aria-current'));
  const o=LAYERS.find(L=>L.open), at=!SEL.pick&&!SEL.lot&&SEL.st!=null&&o&&PICKS[o.id]?PICKS[o.id].findIndex(x=>x.ft===SEL.st):-1;
  const k=SEL.pick||(at>=0?{row:o.id,i:at}:null), b=k&&$(`#layerList [data-pick="${k.row}:${k.i}"]`);
  if(b) b.setAttribute('aria-current','true');
  if(SEL.lot) document.querySelectorAll(`#layerList [data-lot="${SEL.lot}"], #readout .lotrows [data-lot="${SEL.lot}"]`).forEach(x=>x.setAttribute('aria-current','true'));
  return b;
}

/* the one place the hour changes: slider, link and boot all come through here */
function setHour(h){
  SEL.hour=Math.max(0,Math.min(23,Math.round(h)));
  const L=row('bus'); if(!L||!L._body) return;
  const inp=L._body.querySelector('#hourIn');
  if(inp){ inp.value=SEL.hour; inp.setAttribute('aria-valuetext',hourSpan(SEL.hour)); }
  L._body.querySelector('#hourOut').textContent=hourSpan(SEL.hour);
  redraw(L); headline(L);
  if(MAP_OK&&map.getSource&&map.getSource('bus')) map.getSource('bus').setData(busGeo(SEL.hour));
  buildRuler(); link();
  /* an open station card follows the hour. the pick is kept. */
  renderCard();
}

function paint(L){
  if(!L.ids || !map.getLayer(L.ids[0])) return;
  L.ids.forEach(id=>{ if(map.getLayer(id)) map.setLayoutProperty(id,'visibility',L.on?'visible':'none'); });
  if(L.id==='lots'){
    const colour = L.style==='zoning' ? ['match',['get','zone'],...Object.entries(ZONE).flatMap(([k,v])=>[k,v]),'#B9B1A1']
      : L.style==='capacity' ? ['interpolate',['linear'],['get','unbuilt'],...CAP.flatMap(([v,c])=>[v,c])]
      : L.style==='age'      ? ['interpolate',['linear'],['get','year'],...AGE.flatMap(([v,c])=>[v,c])]
      : L.style==='landmark' ? ['case',['==',['get','lm'],1],'#14120F','#E9E4D6']
      : 'rgba(0,0,0,0)';
    map.setPaintProperty('lotFill','fill-color',colour);
    map.setPaintProperty('lotFill','fill-opacity',
      ['case',['boolean',['feature-state','hover'],false],Math.min(1,L.opacity+.32),L.opacity]);
  }
  if(L.id==='trees'){
    map.setPaintProperty('treeDots','circle-color',
      L.style==='cond'?['match',['get','cond'],...Object.entries(COND).flatMap(([k,v])=>[k,v]),'#B9B1A1']:'#2E9E4F');
    map.setPaintProperty('treeDots','circle-opacity',L.opacity);
    if(map.getLayer('gapBand'))
      map.setLayoutProperty('gapBand','visibility',(L.on&&L.extraOn.gaps)?'visible':'none');
  }
  if(L.id==='bus'){ map.setPaintProperty('busLine','line-opacity',L.opacity);
    map.setPaintProperty('busCase','line-opacity',L.opacity); }
  if(L.id==='road'){ map.setPaintProperty('roadLine','line-opacity',L.opacity);
    if(map.getLayer('swLine')) map.setPaintProperty('swLine','line-opacity',L.opacity); }
}

/* ── the drawing ──────────────────────────────────────────────────────── */
map.on('style.load',()=>{
  /* The real config keys. Four of these I had wrong before, which is why
     the points of interest never went away. */
  const cfg=(k,v)=>{ try{ map.setConfigProperty('basemap',k,v); }catch(e){} };
  cfg('lightPreset','day');
  cfg('showPointOfInterestLabels',false);   /* not showPointOfInterest */
  cfg('showTransitLabels',false);
  cfg('showPlaceLabels',false);
  cfg('showRoadLabels',false);
  cfg('showAdminBoundaries',false);
  cfg('showLandmarkIcons',false);
  cfg('showLandmarkIconLabels',false);
  cfg('show3dObjects',false);
  cfg('show3dTrees',false);                 /* the basemap draws its own trees */
  cfg('showPedestrianRoads',true);
  /* paper palette, set on the basemap itself rather than filtered afterwards */
  cfg('colorLand','#FCFAF5'); cfg('colorWater','#DCE7EC'); cfg('colorGreenspace','#E4EDDD');
  cfg('colorBuildings','#F0EADC'); cfg('colorRoads','#FFFFFF'); cfg('colorMotorways','#EFE9DC');
  cfg('colorTrunks','#EFE9DC'); cfg('roadsBrightness',0.9);

  map.addSource('lots',{type:'geojson',data:LOTS,promoteId:'bbl'});
  map.addLayer({id:'lotFill',type:'fill',source:'lots',slot:'middle',
    paint:{'fill-color':'#B9B1A1','fill-opacity':.58,'fill-emissive-strength':1}});
  map.addLayer({id:'lotLine',type:'line',source:'lots',slot:'middle',
    paint:{'line-color':'#14120F','line-opacity':.8,'line-emissive-strength':1,
      'line-width':['interpolate',['linear'],['zoom'],
        13,['case',['any',['boolean',['feature-state','hover'],false],['boolean',['feature-state','picked'],false]],2.4,.35],
        17,['case',['any',['boolean',['feature-state','hover'],false],['boolean',['feature-state','picked'],false]],2.4,1.1]]}});
  map.addLayer({id:'lmHatch',type:'line',source:'lots',slot:'middle',filter:['==',['get','lm'],1],
    layout:{visibility:'none'},
    paint:{'line-color':'#14120F','line-width':3,'line-opacity':.9,'line-dasharray':[1,1.4],'line-emissive-strength':1}});

  if(SW.length){
    map.addSource('sw',{type:'geojson',data:{type:'FeatureCollection',features:SW.map(r=>({
      type:'Feature', properties:{w:r.w, s:r.s, a:r.a, b:r.b},
      geometry:{type:'LineString', coordinates:r.c}}))}});
    map.addLayer({id:'swLine',type:'line',source:'sw',slot:'middle',
      layout:{visibility:'none','line-cap':'butt'},
      paint:{'line-color':'#2E9E4F','line-opacity':.85,'line-emissive-strength':1,
        'line-width':['interpolate',['exponential',2],['zoom'],
          13,['*',['get','w'],0.035], 17,['*',['get','w'],0.56]]}});
  }
  map.addSource('road',{type:'geojson',data:ROAD});
  map.addLayer({id:'roadLine',type:'line',source:'road',slot:'middle',layout:{visibility:'none','line-cap':'butt'},
    paint:{'line-color':'#6E6A62','line-opacity':.85,'line-emissive-strength':1,
      'line-width':['interpolate',['exponential',2],['zoom'],
        13,['*',['get','w'],0.035], 17,['*',['get','w'],0.56]]}});

  if(BUS_STATS){
    /* eastbound runs on the south side, westbound on the north: each bar is set off to its own
       side of the centreline. positive line-offset is to the right of a line drawn west to east. */
    const side=['case',['==',['get','dir'],'E'],1,-1];
    const off=['interpolate',['exponential',2],['zoom'],13,['*',side,2.5],17,['*',side,14]];
    map.addSource('bus',{type:'geojson',data:busGeo(SEL.hour)});
    /* an ink edge, so the pale fast end of the ramp still reads on a pale street */
    map.addLayer({id:'busCase',type:'line',source:'bus',slot:'middle',layout:{visibility:'none','line-cap':'butt'},
      paint:{'line-color':'#14120F','line-emissive-strength':1,'line-offset':off,
        'line-width':['interpolate',['exponential',2],['zoom'],13,4.5,17,13]}});
    map.addLayer({id:'busLine',type:'line',source:'bus',slot:'middle',layout:{visibility:'none','line-cap':'butt'},
      paint:{'line-emissive-strength':1,'line-offset':off,
        'line-color':['case',['==',['get','mph'],null],'rgba(0,0,0,0)',
          ['interpolate',['linear'],['get','mph'],...BUS_RAMP.flat()]],
        'line-width':['interpolate',['exponential',2],['zoom'],13,3,17,10]}});
    /* where no leg is kept: a dashed hairline, so the blank reads as not measured, not as missing */
    map.addSource('busNone',{type:'geojson',data:{type:'FeatureCollection',features:
      Object.entries(BUS_STATS.blank).flatMap(([d,list])=>list.map(([a,b])=>({type:'Feature',properties:{dir:d},
        geometry:{type:'LineString',coordinates:[at(a),...LINE.filter(v=>v[0]>a&&v[0]<b).map(v=>[v[1],v[2]]),at(b)]}})))}});
    map.addLayer({id:'busNone',type:'line',source:'busNone',slot:'middle',layout:{visibility:'none'},
      paint:{'line-color':'#14120F','line-opacity':.5,'line-width':1,'line-dasharray':[2,3],
        'line-offset':off,'line-emissive-strength':1}});
  }

  map.addSource('gaps',{type:'geojson',data:{type:'FeatureCollection',features:TREE_GAPS.map(([a,b])=>{
    const pts=[]; for(let f=a;f<b;f+=60) pts.push(at(f)); pts.push(at(b));
    return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pts}};})}});
  map.addLayer({id:'gapBand',type:'line',source:'gaps',slot:'middle',layout:{visibility:'none'},
    paint:{'line-color':'#FF5A36','line-opacity':.2,'line-blur':4,'line-emissive-strength':1,
      'line-width':['interpolate',['linear'],['zoom'],13,10,17,60]}});

  map.addSource('trees',{type:'geojson',data:{type:'FeatureCollection',features:TREES.map((t,i)=>({
    type:'Feature',id:i,properties:t,geometry:{type:'Point',coordinates:[t.lon,t.lat]}}))}});
  map.addLayer({id:'treeDots',type:'circle',source:'trees',slot:'top',
    paint:{'circle-color':'#2E9E4F','circle-stroke-color':'#FCFAF5','circle-stroke-width':1.2,
      'circle-opacity':1,'circle-emissive-strength':1,
      'circle-radius':['interpolate',['linear'],['zoom'],
        13,['max',1.7,['*',.13,['get','dbh']]], 17,['max',4,['*',.55,['get','dbh']]]]}});

  /* benches solid, the counter a ring: ink only, so neither borrows a data colour */
  const dot=(id,src,paint)=>map.addLayer({id,type:'circle',source:src,slot:'top',layout:{visibility:'none'},
    paint:{'circle-emissive-strength':1,...paint}});
  if(BENCH_STATS){
    map.addSource('benches',{type:'geojson',data:{type:'FeatureCollection',features:BENCHES.map((b,i)=>({
      type:'Feature',properties:{i, ft:b.ft, side:b.side, installed:b.installed||''},geometry:{type:'Point',coordinates:[b.lon,b.lat]}}))}});
    dot('benchDots','benches',{'circle-color':'#14120F','circle-stroke-color':'#FCFAF5','circle-stroke-width':1.5,
      'circle-radius':['interpolate',['linear'],['zoom'],13,3.5,17,8]});
  }
  if(PED_STATS){
    map.addSource('counter',{type:'geojson',data:{type:'FeatureCollection',features:[
      {type:'Feature',properties:{},geometry:{type:'Point',coordinates:[PED.lon,PED.lat]}}]}});
    dot('countDot','counter',{'circle-color':'#FCFAF5','circle-stroke-color':'#14120F','circle-stroke-width':2.5,
      'circle-radius':['interpolate',['linear'],['zoom'],13,4,17,9]});
  }

  /* the metered faces at their own curb line, in ink */
  if(CURB_STATS){
    map.addSource('curb',{type:'geojson',data:{type:'FeatureCollection',features:CURB.map((f,i)=>({
      type:'Feature',properties:{i},geometry:{type:'LineString',coordinates:f.c}}))}});
    map.addLayer({id:'curbLine',type:'line',source:'curb',slot:'middle',layout:{visibility:'none','line-cap':'butt'},
      paint:{'line-color':'#14120F','line-emissive-strength':1,'line-width':['interpolate',['linear'],['zoom'],13,2.5,17,6]}});
  }
  /* a shed permit belongs to a building, so the building's lot is what is marked: filled where a
     permit is in force, outlined where one ran out unsigned. no length of shed is drawn. */
  if(SHED_STATS){
    const bbls=list=>['in',['to-string',['get','bbl']],['literal',list.map(x=>String(x.bbl))]];
    map.addLayer({id:'shedFill',type:'fill',source:'lots',slot:'middle',filter:bbls(SHED_STATS.live),layout:{visibility:'none'},
      paint:{'fill-color':'#14120F','fill-opacity':.72,'fill-emissive-strength':1}});
    map.addLayer({id:'shedLine',type:'line',source:'lots',slot:'middle',filter:bbls(SHEDS),layout:{visibility:'none'},
      paint:{'line-color':'#14120F','line-width':2,'line-emissive-strength':1}});
  }
  /* one circle per place, its area the people injured there */
  if(CRASH_STATS){
    map.addSource('crashes',{type:'geojson',data:{type:'FeatureCollection',features:CRASH_STATS.drawn.map((p,i)=>({
      type:'Feature',properties:{i, inj:p.inj},geometry:{type:'Point',coordinates:[p.lon,p.lat]}}))}});
    dot('crashDots','crashes',{'circle-color':'#14120F','circle-opacity':.6,'circle-stroke-color':'#FCFAF5','circle-stroke-width':1,
      'circle-radius':['interpolate',['linear'],['zoom'],13,['*',1.3,['sqrt',['get','inj']]],17,['*',4.4,['sqrt',['get','inj']]]]});
  }

  map.addSource('aves',{type:'geojson',data:{type:'FeatureCollection',features:AVES.map(([ft,name])=>({
    type:'Feature',properties:{name},geometry:{type:'Point',coordinates:at(ft)}}))}});
  map.addLayer({id:'aveLab',type:'symbol',source:'aves',slot:'top',
    layout:{'text-field':['get','name'],'text-size':13,'text-offset':[0,-1.3],
      'text-font':['DIN Pro Medium','Arial Unicode MS Regular']},
    paint:{'text-color':'#14120F','text-halo-color':'#FCFAF5','text-halo-width':2.2,'text-emissive-strength':1}});
  /* avenue names are not a layer, they are how the sheet is read. always on. */
  map.setLayoutProperty('aveLab','visibility','visible');

  /* the picked item, marked in ink over everything: a ring round a point, a casing along a
     curb face or a shed's lot. its own geometry, no data colour. */
  map.addSource('pick',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  /* zoom has to be the outermost expression, so the ring's extra is added inside it */
  const ringAt=d=>['interpolate',['linear'],['zoom'],13,['+',['get','r13'],d],17,['+',['get','r17'],d]], ringR=ringAt(0), isPt=['==',['geometry-type'],'Point'];
  map.addLayer({id:'pickLine',type:'line',source:'pick',slot:'top',filter:['!',isPt],layout:{'line-cap':'butt','line-join':'round'},
    paint:{'line-color':'#14120F','line-width':4,'line-emissive-strength':1}});
  map.addLayer({id:'pickHalo',type:'circle',source:'pick',slot:'top',filter:isPt,
    paint:{'circle-opacity':0,'circle-radius':ringR,'circle-stroke-color':'#FCFAF5','circle-stroke-width':5.5,'circle-emissive-strength':1}});
  map.addLayer({id:'pickRing',type:'circle',source:'pick',slot:'top',filter:isPt,
    paint:{'circle-opacity':0,'circle-radius':ringAt(1.5),'circle-stroke-color':'#14120F','circle-stroke-width':2.5,'circle-emissive-strength':1}});

  wire(); LAYERS.forEach(paint); syncPick(); syncRuler();
});

/* ── hover and select ─────────────────────────────────────────────────── */
const tip=$('#tip'); let hoverLot=null;
const showTip=(e,html)=>{
  tip.innerHTML=html; tip.dataset.show='true';
  tip.style.left=Math.min(innerWidth-272,e.originalEvent.clientX+15)+'px';
  tip.style.top=(e.originalEvent.clientY+15)+'px';
};
function wire(){
  map.on('mousemove','lotFill',e=>{
    if(hoverLot!==null) map.setFeatureState({source:'lots',id:hoverLot},{hover:false});
    hoverLot=e.features[0].id; map.setFeatureState({source:'lots',id:hoverLot},{hover:true});
    map.getCanvas().style.cursor='pointer';
  });
  map.on('mouseleave','lotFill',()=>{
    if(hoverLot!==null) map.setFeatureState({source:'lots',id:hoverLot},{hover:false});
    hoverLot=null; map.getCanvas().style.cursor='';
  });
  /* any spot on the map is a station. a drawn item under the press is picked at its own station,
     as its list button would. a lot under the press opens inside the same card. */
  const ITEM={benchDots:'benches',countDot:'people',crashDots:'crashes',curbLine:'curb',shedLine:'sheds',shedFill:'sheds'};
  map.on('click',e=>{
    const ids=Object.keys(ITEM).filter(id=>map.getLayer(id)), box=[[e.point.x-5,e.point.y-5],[e.point.x+5,e.point.y+5]];
    const it=ids.length?map.queryRenderedFeatures(box,{layers:ids})[0]:null;
    if(it){ const id=ITEM[it.layer.id], p=it.properties;
      const i=id==='people'?0:id==='sheds'?PICKS.sheds.findIndex(x=>x.bbl===String(p.bbl)):+p.i;
      if(PICKS[id][i]){ const L=row(id);
        if(L&&!L.open&&!STACKED.matches){ setOpen(L,true); }
        select({st:PICKS[id][i].ft, lot:null, pick:{row:id,i}},{fromMap:true}); return; } }
    const hit=map.getLayer('lotFill')?map.queryRenderedFeatures(e.point,{layers:['lotFill']}):[];
    const q=project(e.lngLat.lng,e.lngLat.lat);
    /* a click past the deepest drawn lot is off the sheet, not a place on the street */
    if(!hit.length&&q.off>REACH) return;
    select({st:q.ft, lot:hit.length?String(hit[0].properties.bbl):null},{fromMap:true});
  });
  map.on('mousemove','treeDots',e=>{const p=e.features[0].properties;
    showTip(e,`<b>${p.common}</b><em>${p.latin||''}</em><span>${p.dbh} in trunk &middot; ${p.cond}</span>`);});
  map.on('mouseleave','treeDots',()=>tip.dataset.show='false');
  map.on('mousemove','roadLine',e=>{const p=e.features[0].properties;
    showTip(e,`<b>${p.w} ft of roadway</b><em>${p.dir}</em>`
      +`<span>${p.lanes} travel &middot; ${p.park} parking</span>`);});
  map.on('mouseleave','roadLine',()=>tip.dataset.show='false');
  if(map.getLayer('swLine')){
    map.on('mousemove','swLine',e=>{const p=e.features[0].properties;
      showTip(e,`<b>${p.w} ft of sidewalk</b><em>${p.s==1?'north':'south'} side</em>`
        +`<span>gross width, nothing deducted</span>`);});
    map.on('mouseleave','swLine',()=>tip.dataset.show='false');
  }
  if(map.getLayer('busLine')){
    map.on('mousemove','busLine',e=>{const p=e.features[0].properties;
      showTip(e,`<b>${p.mph!=null?(+p.mph).toFixed(2)+' mph':'no buses measured'}</b><em>${DIRS[p.dir]}, ${p.name}</em>`
        +`<span>${hourSpan(SEL.hour)} &middot; ${commas(p.trips)} buses</span>`);});
    map.on('mouseleave','busLine',()=>tip.dataset.show='false');
  }
  /* both of these are also buttons in their row's legend, for tap and keyboard */
  if(map.getLayer('benchDots')){
    map.on('mousemove','benchDots',e=>{const p=e.features[0].properties;
      showTip(e,`<b>DOT bench</b><em>${p.side==='n'?'north':'south'} side, ${block(between(p.ft))}</em>`
        +`<span>${p.installed?'installed '+day(p.installed):commas(p.ft)+' ft'}</span>`);});
    map.on('mouseleave','benchDots',()=>tip.dataset.show='false');
  }
  if(map.getLayer('countDot')){
    map.on('mousemove','countDot',e=>showTip(e,`<b>${commas(PED_LAST.pm)} people</b><em>${PM_WIN}, one day in ${day(PED_LAST.p)}</em>`
        +`<span>DOT count location ${PED.loc}</span>`));
    map.on('mouseleave','countDot',()=>tip.dataset.show='false');
  }
  /* each of these is also a button in its row's legend, and the card at a crash place's
     station gives the same figure as its circle */
  if(map.getLayer('curbLine')){
    map.on('mousemove','curbLine',e=>{const f=CURB[e.features[0].properties.i];
      showTip(e,`<b>${f.who}</b><em>${f.side==='n'?'north':'south'} side, between ${crossName(f.from)} and ${crossName(f.to)}</em><span>${curbTerms(f)}</span>`);});
    map.on('mouseleave','curbLine',()=>tip.dataset.show='false');
  }
  if(map.getLayer('shedLine')){
    map.on('mousemove','shedLine',e=>{const x=SHED_BY_BBL.get(String(e.features[0].properties.bbl)); if(!x) return;
      showTip(e,`<b>${x.addr}</b><em>shed permit ${shedSays(x)}</em><span>permit record only</span>`);});
    map.on('mouseleave','shedLine',()=>tip.dataset.show='false');
  }
  if(map.getLayer('crashDots')){
    map.on('mousemove','crashDots',e=>{const c=e.lngLat, p=CRASH_STATS.drawn.reduce((x,y)=>
        Math.hypot(y.lon-c.lng,y.lat-c.lat)<Math.hypot(x.lon-c.lng,x.lat-c.lat)?y:x);
      showTip(e,`<b>${commas(p.inj)} injured</b><em>${p.name?`at ${p.name}, `:''}${commas(p.ft)} ft</em><span>${commas(p.n)} crash${p.n===1?'':'es'} &middot; counts only</span>`);});
    map.on('mouseleave','crashDots',()=>tip.dataset.show='false');
  }
  map.on('move',syncRuler);
}

/* a slider must always carry a value: with no station picked it reports the middle of the view */
function restSlider(){
  const r=$('#ruler');
  r.setAttribute('aria-valuenow',Math.round((VIEW[0]+VIEW[1])/2));
  r.setAttribute('aria-valuetext','No station picked');
}
let pin=null, pickedLot=null;
const STACKED=matchMedia('(max-width:899px)');   /* the same width style.css stacks the sheet at */
const REDUCED=matchMedia('(prefers-reduced-motion:reduce)');
const pickOf=()=>SEL.pick?PICKS[SEL.pick.row][SEL.pick.i]:null;
/* the one way a selection changes. a selection is a station and, when a listed or drawn item
   made it, that item: pick={row,i}. a new station that arrives without an item clears the item.
   opt.boot: the layout has not settled. opt.fromMap: the reader pressed the map itself. */
function select(next,opt={}){
  if('st' in next&&!('pick' in next)) next={...next,pick:null};
  Object.assign(SEL,next);
  if(SEL.st!=null) SEL.st=Math.max(0,Math.min(LEN,Math.round(SEL.st)));
  if(SEL.lot&&!LOT_BY_BBL.has(SEL.lot)) SEL.lot=null;
  /* a pick that does not stand at the station is stale */
  if(SEL.pick&&!(PICKS[SEL.pick.row]&&PICKS[SEL.pick.row][SEL.pick.i]&&PICKS[SEL.pick.row][SEL.pick.i].ft===SEL.st)) SEL.pick=null;
  const open=SEL.st!=null;
  const panel=$('#readout'), ruler=$('#ruler');
  panel.hidden=!open; document.body.dataset.card=open;
  if(open){
    const P=stationProfile(SEL.st,SEL.hour), k=pickOf();
    ruler.setAttribute('aria-valuenow',SEL.st);
    ruler.setAttribute('aria-valuetext',`${commas(SEL.st)} ft from the Hudson River. ${where(P)}`
      +(P.vision?`. Published vision, ${VISION.by}: ${P.vision.place}`:''));   /* the band has no other text form */
    const lot=SEL.lot&&LOT_BY_BBL.get(SEL.lot);
    /* one short line is announced, not the whole card. walking the ruler already speaks
       through the slider, so it stays quiet then. */
    $('#said').textContent=document.activeElement===ruler?''
      : lot?`${lot.addr||'Unnamed lot'}. ${lot.owner||'owner not recorded'}.`
      : `${k?pickTitle(k)+'. ':''}Station ${commas(SEL.st)} ft. ${where(P)}.`;
    renderCard(); panel.scrollTop=0;
    /* stacked, the card takes the screen under the ruler, so the ruler goes to the top of it */
    if(!opt.boot&&STACKED.matches) $('#rulerBox').scrollIntoView({block:'start'});
    if(MAP_OK){
      if(!pin) pin=new mapboxgl.Marker({element:el('div','pin'),anchor:'center'});
      pin.setLngLat(at(SEL.st)).addTo(map);
    }
  } else {
    panel.innerHTML=''; $('#said').textContent=''; restSlider();
    if(pin) pin.remove();
  }
  syncPick(opt);
  if(open&&!opt.boot) showStation(!!opt.fromMap);
  link();
}
/* after every selection the list, the map, the ruler and the card show the same station and item */
function syncPick(opt={}){
  const b=markCurrent(), k=pickOf();
  /* an item picked on the map is brought into view in its list. only the rail is scrolled. */
  if(b&&opt.fromMap&&!STACKED.matches){ const rail=$('#layerList'), R=rail.getBoundingClientRect(), B=b.getBoundingClientRect();
    if(B.top<R.top||B.bottom>R.bottom) rail.scrollTop+=B.top-R.top-R.height/3; }
  if(MAP_OK&&map.getSource&&map.getSource('pick'))
    map.getSource('pick').setData({type:'FeatureCollection',features:k?[{type:'Feature',
      properties:{r13:(k.r?k.r[0]:0)+5, r17:(k.r?k.r[1]:0)+5}, geometry:k.geo}]:[]});
  if(MAP_OK&&map.getSource&&map.getSource('lots')&&pickedLot!==SEL.lot){
    if(pickedLot) map.setFeatureState({source:'lots',id:pickedLot},{picked:false});
    pickedLot=SEL.lot; if(pickedLot) map.setFeatureState({source:'lots',id:pickedLot},{picked:true}); }
  const mark=$('#rulerMark'); mark.hidden=SEL.st==null;
  if(SEL.st!=null){ const s=share(SEL.st); mark.style.left=(s*100)+'%'; mark.dataset.flip=s>.8;
    $('#rulerMarkFt').textContent=`${commas(SEL.st)} ft`; }
  pickRing(); printMark(); clearHubs();
  try{ syncRuler(); }catch(e){}
}
/* the view is a link: ?st=4000 opens this card, &lot= opens the lot inside it, &pick=benches.0 is
   the item the station came from, &hr=17 is the hour, &q=benches is the open row, &on=lots,trees is
   what is drawn. hr is written whenever the hour shows: bus drawn, bus row open, or the hour moved.
   on is written once the drawn set or the open row has moved from how the sheet starts, and always
   beside hr, so hr alone stays the hand-typed short form that also switches the bus on.
   &by=lots.capacity is what a row is coloured by, written only once it has moved.
   &no=lm,pub is what the ranked lot list leaves out, written only when ticked. */
function link(){
  const q=new URLSearchParams(location.search), open=SEL.st!=null;
  open?q.set('st',SEL.st):q.delete('st');
  SEL.lot&&open?q.set('lot',SEL.lot):q.delete('lot');
  SEL.pick&&open?q.set('pick',SEL.pick.row+'.'+SEL.pick.i):q.delete('pick');
  const bus=row('bus'), timed=!!bus&&(bus.on||bus.open||SEL.hour!==HOUR_START);
  timed?q.set('hr',SEL.hour):q.delete('hr');
  const o=LAYERS.find(L=>L.open), on=LAYERS.filter(L=>L.on).map(L=>L.id).join(',');
  o?q.set('q',o.id):q.delete('q');
  o||timed||on!==ON_START?q.set('on',on):q.delete('on');
  const by=LAYERS.filter(L=>L.styles&&L.style!==BY_START.get(L.id)).map(L=>L.id+'.'+L.style).join(',');
  by?q.set('by',by):q.delete('by');
  const lots=row('lots'), no=lots?[lots.noLm&&'lm',lots.noPub&&'pub'].filter(Boolean).join(','):'';
  no?q.set('no',no):q.delete('no');
  /* commas are legal in a query, and a link that is printed is read by eye */
  const qs=q.toString().replace(/%2C/g,',');
  try{ history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash); }catch(e){}
  printFoot();
}

/* where a published stretch runs, in the piece's own terms. a stretch the piece gives no cross streets
   for says so, and names the avenue crossings it is drawn between. */
const visionWhere=v=>v.stated?(v.basis?`${v.place}. ${v.basis}`:`${v.place}, as the piece gives it.`)
  : `The piece names ${v.place} without cross streets. Drawn ${v.from?crossName(v.from):'the west end'} to ${v.to?crossName(v.to):'the east end'}, approximate.`;
let MORE_OPEN=false;   /* whether the reader has the long card open. kept across stations. */
/* the card as it stands. the long half and the scroll position are kept. */
function renderCard(){
  if(SEL.st==null) return;
  const p=$('#readout'), t=p.scrollTop, lot=SEL.lot&&LOT_BY_BBL.get(SEL.lot);
  p.innerHTML=lot?lotHTML(lot):stationHTML(stationProfile(SEL.st,SEL.hour));
  p.scrollTop=t; markCurrent();
}
/* the short card: title, the item picked, the position, the cross-section, three facts. the fact
   that belongs to the open row or the picked item comes first. whatever is not shown short is
   under More, and nothing is said twice. */
const ROW_FACT={people:'count',benches:'bench',sheds:'shed',crashes:'crash',bus:'bus',curb:'curb',trees:'trees'};
function stationHTML(P){
  const parts=[['n',P.north,'North walk'],['r',P.road&&P.road.w,'Roadway'],['s',P.south,'South walk']];
  const said=parts.map(([,v,t])=>`${t} ${feet(v)}`).join(', ');
  const none=parts.every(x=>x[1]==null), k=pickOf(), is=id=>!!k&&SEL.pick.row===id;
  const openRow=LAYERS.find(L=>L.open), here=[...P.lots.n,...P.lots.s];
  const openBtn=id=>row(id)&&!row(id).open?`<button class="linkbtn" type="button" data-open-row="${id}">Open ${row(id).name}</button>`:'';
  const fact=(dt,dd,cls)=>`<div${cls?` class="${cls}"`:''}><dt>${dt}</dt><dd>${dd}</dd></div>`;
  const width=v=>v!=null?`${v} ft`:`not measured here <a href="${METHOD}">Method</a>`;
  const shedsHere=here.map(p=>[p,SHED_BY_BBL.get(String(p.bbl))]).filter(x=>x[1]);
  /* every fact the station has, keyed. short takes three, More takes the rest. */
  const F={
    bench:fact('Nearest DOT bench',is('benches')?'this bench':P.bench?`${P.bench.dir?`${feetMiles(P.bench.dist)} ${P.bench.dir}`:'at this station'}, ${block(P.bench)}`:'no DOT bench recorded on the street'),
    bus:P.bus?fact(`M42 bus, ${hourSpan(P.bus.hour)}`,[P.bus.e,P.bus.w].some(Boolean)?[['east',P.bus.e],['west',P.bus.w]].filter(x=>x[1]).map(([d,r])=>
      `${d} ${r.mph!=null?r.mph.toFixed(2)+' mph':'no buses measured'}`).join(' &middot; '):'no M42 speed kept here'):'',
    lot:P.biggest?fact('Largest lot here',`<button class="linkbtn" type="button" data-lot="${P.biggest.bbl}">${addrShow(P.biggest)}</button>`
      +`<span>${P.biggest.zone==='PARK'?'park':P.biggest.unbuilt>0?commas(P.biggest.unbuilt)+' sq ft allowed and unbuilt':'no unbuilt floor area'}</span>`):'',
    count:P.count?fact('Pedestrians counted',`${commas(P.count.pm)}<span>${span(P.count.win)}, one day in ${day(P.count.p)}, ${is('people')?'this counter':`counter ${away(P.count)}, ${block(P.count)}`}</span>`):'',
    shed:SHED_STATS?is('sheds')?fact('Shed permit',`this building<span>${k.sub}</span>`):fact('Shed permit here',shedsHere.length?shedsHere.map(([p,x])=>`${p.addr}<span>${shedSays(x)}</span>`).join(''):'none on record at this station'):'',
    crash:P.crashes?fact('Nearest crash place',(c=>c?`${commas(c.inj)} injured<span>in ${commas(c.n)} crash${c.n===1?'':'es'}${c.name?` at ${crossName(c.name)}`:''}, ${is('crashes')?'this place':away(c)}, counts only</span>`
       :`none within ${P.crashes.reach} ft`)(P.crashes.place)+openBtn('crashes')):'',
    curb:is('curb')?fact('Metered curb',`this side of the block<span>${k.sub}</span>`):P.curb?fact('Metered curb here',[['north',P.curb.n],['south',P.curb.s]].map(([s,f])=>
       `<span>${s}: ${f?`${f.who.toLowerCase()}, ${(f.com||f.all).hours}`:'no meter'}</span>`).join('')):'',
    trees:fact(`Trees within ${TREE_REACH} ft`,`${P.trees.all}${P.trees.all?`<span>${P.trees.n} north, ${P.trees.s} south</span>`:''}`+openBtn('trees'))
  };
  const lead=openRow&&openRow.id==='lots'?'lots':(k&&ROW_FACT[SEL.pick.row])||(openRow&&ROW_FACT[openRow.id]);
  const order=[...new Set([lead,'bench','bus'])].filter(id=>F[id]);
  const short=order.slice(0,3), rest=Object.keys(F).filter(id=>F[id]&&!short.includes(id));
  /* flags come from the record: the lot's own address and whether it is the largest listed here */
  const tags=p=>{const t=[`${commas(p.unbuilt)} sq ft unbuilt`]; if(p.lm===1) t.push('landmark');
    if(p.addr&&streetNo(p.addr)!=='42') t.push('not a 42nd Street address');
    const shed=SHED_BY_BBL.get(String(p.bbl)); if(shed) t.push('shed permit '+shedSays(shed));
    return t.join(' &middot; ');};
  /* with the lots row open, the lots that front this station lead the card */
  const lotsLead=lead==='lots'?`<p class="lab">Lots at this station</p>`+(here.length?`<ul class="lotrows">${here.map(p=>
      `<li><button type="button" data-lot="${p.bbl}"><b>${addrShow(p)}</b><span>${p.side==='n'?'north':'south'} side &middot; ${tags(p)}</span></button></li>`).join('')}</ul>`
    :`<p class="none">No drawn lot fronts the street here.</p>`):'';
  /* a lot the rule took out that fronts here is named, so a gap is not read as a data hole */
  const outList=[...P.outside.n,...P.outside.s].map(p=>`<p class="note">${p.addr} is the nearest lot here. It is outside the lot set because ${p.why}, and the set takes lots within ${window.LOTS_META.front_ft} ft. <a href="${METHOD}#4-the-lot-rule-frontage">Method</a></p>`).join('');
  const walkLab=(t,v)=>`<span><span class="lab">${t}</span><b>${width(v)}</b></span>`;
  return `<div class="card__top"><h3>${where(P)}</h3>`
    +`<button class="mini" type="button" data-close>Close</button></div>`
   +(k?`<p class="card__pick">${pickTitle(k)}</p>`:'')
   +`<p class="lab card__pos">${commas(P.ft)} ft from the Hudson River</p>`
   /* flex-grow is the width in feet, so the bar is to scale by construction */
   +`<div class="xsec${none?' xsec--none':''}" role="img" aria-label="Cross-section, drawn to scale. ${said}.">${parts.map(([c,v])=>
      v!=null?`<i class="xsec__${c}" style="flex:${v} 1 0"></i>`:`<i class="xsec__gap"></i>`).join('')}</div>`
   +`<div class="xsec__lab">${walkLab('North walk',P.north)}`
   +`<span><span class="lab">Roadway</span><b>${width(P.road?P.road.w:null)}</b></span>`
   +walkLab('South walk',P.south)+`</div>`
   +(SW_STATS&&!none?`<p class="lab xsec__ref">Whole street: median sidewalk ${SW_STATS.med} ft, average roadway ${ROAD_STATS.avgW} ft</p>`:'')
   +lotsLead
   +`<dl>${short.filter(id=>!(lead==='lots'&&id==='lot')).map(id=>F[id]).join('')}</dl>`
   /* the card opens short, so it sits under the street and the map never has to move aside for it.
      everything else recorded here is one press away, and stays open while the reader walks the street. */
   +`<details class="more"${MORE_OPEN?' open':''}><summary>More</summary><dl>`
   +(P.road?fact('Roadway lanes',`${P.road.lanes} moving + ${P.road.park} parked`):'')
   +(P.at?'':fact('Along the block',[P.west&&`${commas(P.ft-P.west.ft)} ft past ${aveShort(P.west.name)}`, P.east&&`${commas(P.east.ft-P.ft)} ft to ${aveShort(P.east.name)}`].filter(Boolean).join(', ')))
   +(P.bus&&[P.bus.e,P.bus.w].some(Boolean)?fact('Whole legs',[['east',P.bus.e],['west',P.bus.w]].filter(x=>x[1]).map(([d,r])=>`<span>${d}: ${legName(r)}, ${commas(r.b-r.a)} ft</span>`).join('')):'')
   +(P.bench?fact('Nearest bench',`${P.bench.side==='n'?'north':'south'} side${P.bench.installed?`, installed ${day(P.bench.installed)}`:''}`):'')
   +rest.map(id=>F[id]).join('')
   +(lead==='lots'?'':fact('Lots here',`${here.length}<span>${P.lots.n.length} north, ${P.lots.s.length} south</span>`+openBtn('lots')))
   +(TIER_STATS?fact('DOT pedestrian priority tier',P.tier?`${P.tier.name}<span>tier ${P.tier.rank} of ${TIER_META.length}. A planning rank. It does not count people.</span>`:'no tier in the source here'):'')
   +(P.vision?fact(`Published vision: ${VISION.by}`,P.vision.says,'pub'):'')
   +`</dl>`+`<details class="about"><summary>About this data</summary>`+outList
   +(P.vision?`<p class="note">Published vision: ${visionWhere(P.vision)} <a href="${VISION.url}">${VISION.title}</a>, ${VISION.by}, read ${day(VISION.accessed)}.</p>`:'')+note(NOTE_WALK)+(here.length?note(NOTE_LOT+(shedsHere.length?NOTE_SHED:'')):'')+`</details></details>`
   +`<p class="card__foot"><a href="${METHOD}">Sources and method</a></p>`;
}

function lotHTML(p){
  const used=p.allowed>0?Math.min(100,p.built/p.allowed*100):0, shed=SHED_BY_BBL.get(String(p.bbl));
  const fact=(dt,dd)=>`<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
  return `<div class="card__top"><h3>${addrShow(p)}</h3>`
    +`<button class="mini" type="button" data-close>Close</button></div>`
   +`<p class="lab card__pos">${p.side==='n'?'North side':'South side'}`
   +` <span class="zonechip" style="background:${ZONE[p.zone]||'#B9B1A1'}">${p.zone||'no district'}</span></p>`
   +`<div class="gauge" role="img" aria-label="Built ${p.built} times the lot area, allowed ${p.allowed} times."><i style="width:${used}%"></i></div>`
   +`<div class="gauge__lab"><span class="lab">built ${p.built}&times;</span><span class="lab">allowed ${p.allowed}&times;</span></div>`
   +`<dl>`
   +fact('Owner',p.owner||'not recorded')
   +fact('Lot area',`${commas(p.lotarea)} sq ft`)
   +fact('Floors',p.floors||'not recorded')
   +fact('Year built',p.year||'not recorded')
   +fact('Unbuilt floor area',`${commas(p.unbuilt)} sq ft`)
   +fact('Landmark',p.lm===1?'designated':'none on record')
   +fact('BBL',p.bbl)
   +(shed?fact('Shed permit',shedSays(shed)):'')
   +`</dl>`
   +`<details class="about"><summary>About this data</summary><dl>${fact('Floor area built',p.bldgarea!=null?`${commas(p.bldgarea)} sq ft`:'not recorded')}${fact('Floor area allowed',`${commas(p.allowed*p.lotarea)} sq ft`)}</dl>${note(shed?NOTE_LOT+NOTE_SHED:NOTE_LOT)}</details>`
   +`<p class="card__foot"><button class="linkbtn" type="button" data-back>Back to station ${commas(SEL.st)} ft</button>`
   +`<a href="${METHOD}">Sources and method</a></p>`;
}

/* toggle does not bubble, so it is caught on the way down */
$('#readout').addEventListener('toggle',e=>{ if(e.target.matches('details.more')) MORE_OPEN=e.target.open; },true);
/* one delegated handler for the whole card, bound once */
$('#readout').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const from=SEL.lot;
  if(b.dataset.lot) select({lot:b.dataset.lot});
  else if('back' in b.dataset) select({lot:null});
  else if(b.dataset.openRow){ const L=row(b.dataset.openRow); if(L){ setOpen(L,true); link(); } }
  else if('close' in b.dataset){ closeCard(); return; }
  /* the pressed button is gone after a re-render: back returns to the lot's own row,
     anything else to the first button left */
  const f=('back' in b.dataset&&from&&$(`#readout [data-lot="${from}"]`))||$('#readout button');
  if(f) f.focus();
});
/* the floating card never sits on the station it describes, and a station picked from a list or
   the ruler is brought into the open part of the map. the station is set in the middle of what
   the card leaves uncovered. a press on the map itself moves it only from under the card. */
const PIN_ROOM=24;   /* px kept between the pin and the card's edge */
const PICK_ZOOM=15.5;   /* an item picked from a list is shown at least this close */
function showStation(fromMap){
  if(!MAP_OK||SEL.st==null) return;
  requestAnimationFrame(()=>{ if(SEL.st==null) return;
    const m=map.getContainer().getBoundingClientRect(), p=map.project(at(SEL.st));
    const c=STACKED.matches?null:$('#readout').getBoundingClientRect(), covered=c&&c.width;
    const span=covered?Math.max(120,c.left-m.left):m.width;
    const under=covered&&m.left+p.x>=c.left-PIN_ROOM&&m.top+p.y>=c.top-PIN_ROOM;
    const out=p.x<span*.1||p.x>span*.9||p.y<0||p.y>m.height;
    const close=!fromMap&&SEL.pick&&map.getZoom()<PICK_ZOOM;
    if(!(under||(!fromMap&&(out||close)))) return;
    userMoved=true;
    map.easeTo({center:at(SEL.st), offset:[(span-m.width)/2,0], bearing:BEARING, duration:REDUCED.matches?0:300,
      ...(close?{zoom:PICK_ZOOM}:{})}); });
}
/* wide, the card floats inside the map's box. style.css is told where that box sits in the sheet,
   so the card never covers the first screen. */
function placeCard(){
  const sheet=$('.sheet'), m=$('#map'); if(!sheet||!m) return;
  const S=sheet.getBoundingClientRect(), M=m.getBoundingClientRect();
  const px=(k,v)=>sheet.style.setProperty(k,Math.max(0,Math.round(v))+'px');
  px('--map-top',M.top-S.top); px('--map-bot',S.bottom-M.bottom);
}
if(window.ResizeObserver){ const ro=new ResizeObserver(placeCard); ro.observe($('#map')); ro.observe($('.sheet')); }
addEventListener('resize',placeCard); placeCard();
function closeCard(){ select({st:null,lot:null}); $('#ruler').focus();
  /* stacked, the rail comes back where the reader left it */
  const L=LAYERS.find(o=>o.open); if(L&&STACKED.matches) L._row.scrollIntoView({block:'nearest'}); }
/* Escape in the card shuts the card only. stopped here, or the first screen's handler shuts that too and takes the focus. */
$('#readout').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); closeCard(); } });

/* ── ruler ────────────────────────────────────────────────────────────── */
const NS='http://www.w3.org/2000/svg';
/* the ruler's job is position: the street, the avenues, the four hubs, the map's window and the
   station. it carries one band of evidence, the open row's, drawn to the street's own scale.
   every key is in the row, never on the ruler. ink and the colours already on the sheet. */
/* colours are read from the tokens in style.css, so the sheet has one source for them */
const token=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const INK=token('--ink'), PAPER=token('--paper'), LABEL=token('--ink-3'), LEAF=token('--leaf'), ALARM=token('--alarm');
/* four ink strengths, strongest first, and the lowest tier an outline. every bar is ruled in
   ink, as the bus bars are, so a pale tier still stands off the ruler. */
const tierFill=rank=>({fill:TIER_INK[rank]?token(TIER_INK[rank]):'none',stroke:INK,'stroke-width':.6});
/* a published stretch: ink already on the sheet, dashed where its ends are approximate */
const visionBar=stated=>stated?{fill:token('--hair-2'),stroke:INK,'stroke-width':.6}:{fill:'none',stroke:INK,'stroke-width':.8,'stroke-dasharray':'2 2'};
const blankLine=(add,X,a,b,y)=>add('line',{x1:X(a),x2:X(b),y1:y,y2:y,stroke:INK,'stroke-opacity':.5,'stroke-width':.8,'stroke-dasharray':'2 3'});
const BAND_H=18;
/* one band per row that has one. cap is the ruler's caption while the band shows. an item that
   can be picked carries data-pick, so the ring finds it under the pin. */
const RULER_BANDS={
  people:{ has:!!(TIER_STATS||PED_STATS),
    /* a tier is the plan's rank for a segment. the caption never calls it demand or a count. */
    cap:()=>[TIER_STATS&&'DOT pedestrian priority tier',PED_STATS&&'the DOT counter'].filter(Boolean).join(' and '),
    draw(add,X,y,h){
      if(TIER_STATS){ TIER_STATS.runs.forEach(([a,b,rank])=>add('rect',{x:X(a)+.5,y:y+4,width:Math.max(1,X(b)-X(a)-1),height:h-8,...tierFill(rank)}));
        TIER_STATS.blank.forEach(([a,b])=>blankLine(add,X,a,b,y+h/2)); }
      if(PED_STATS) add('circle',{cx:X(PED.ft),cy:y+h/2,r:4.5,fill:PAPER,stroke:INK,'stroke-width':2,'data-pick':'people:0'}); } },
  benches:{ has:!!BENCH_STATS,
    cap:()=>'DOT benches and stretches with none',
    draw(add,X,y,h){
      BENCH_STATS.none.forEach(([a,b])=>add('rect',{x:X(a),y:y+4,width:Math.max(1,X(b)-X(a)),height:h-8,fill:token('--hair-2')}));
      BENCHES.forEach((b,i)=>add('circle',{cx:X(b.ft),cy:y+h/2,r:5,fill:INK,stroke:PAPER,'stroke-width':1,'data-pick':'benches:'+i})); } },
  sheds:{ has:!!SHED_STATS,
    /* a building with a permit in force is a narrow bar at its station, never a length */
    cap:()=>'Buildings with a shed permit in force',
    draw(add,X,y,h){ add('line',{x1:X(0),x2:X(LEN),y1:y+h/2,y2:y+h/2,stroke:INK,'stroke-opacity':.13,'stroke-width':1});
      SHED_STATS.live.forEach((x,i)=>add('rect',{x:X(x.ft)-1.5,y,width:3,height:h,fill:INK,'data-pick':'sheds:'+i})); } },
  crashes:{ has:!!CRASH_STATS,
    cap:()=>'Places where anyone was injured',
    draw(add,X,y,h){ add('line',{x1:X(0),x2:X(LEN),y1:y+h/2,y2:y+h/2,stroke:INK,'stroke-opacity':.13,'stroke-width':1});
      CRASH_STATS.drawn.forEach((p,i)=>add('rect',{x:X(p.ft)-.75,y:y+2,width:1.5,height:h-4,fill:INK,'fill-opacity':.6,'data-pick':'crashes:'+i})); } },
  bus:{ has:!!BUS_STATS,
    cap:()=>`${BUS_META.route} speed by leg, ${hourSpan(SEL.hour)}, westbound above`,
    /* either side of the band as on the street. one bar per leg at true length. where no leg is
       kept, a dashed blank. the hour's slowest leg is ruled in ink. */
    draw(add,X,y,h){ const Y={W:y,E:y+h/2+1}, bh=h/2-1, slow=busSlowest(SEL.hour);
      BUS.filter(r=>r.h===SEL.hour).forEach(r=>add('rect',{x:X(r.a)+.5,y:Y[r.dir],width:Math.max(1,X(r.b)-X(r.a)-1),height:bh,
        fill:r.mph!=null?busColour(r.mph):'none',stroke:INK,'stroke-width':r===slow?1.5:.6}));
      Object.entries(BUS_STATS.blank).forEach(([d,list])=>list.forEach(([a,b])=>blankLine(add,X,a,b,Y[d]+bh/2))); } },
  trees:{ has:TREES.length>0,
    cap:()=>`Street trees and stretches over ${TREE_GAP_MIN} ft with none`,
    draw(add,X,y,h){
      TREE_GAPS.forEach(([a,b])=>add('rect',{x:X(a),y,width:X(b)-X(a),height:h,fill:ALARM,'fill-opacity':.45}));
      TREES.forEach(t=>add('rect',{x:X(t.ft),y,width:1,height:h,fill:LEAF,'fill-opacity':.9})); } },
  /* both sidewalks as the street's own section laid flat: north up from the middle, south down,
     each stretch as tall as it is wide, in the green the map draws them. the ink lines are the median. */
  road:{ has:!!SW_STATS,
    cap:()=>`Sidewalk width, north side above, street median ${SW_STATS.med} ft ruled`,
    draw(add,X,y,h){ const mid=y+h/2, k=(h/2)/SW_STATS.max;
      SW.forEach(r=>{ const t=Math.max(1,r.w*k); add('rect',{x:X(r.a),y:r.s===1?mid-t:mid,width:Math.max(1,X(r.b)-X(r.a)),height:t,fill:LEAF}); });
      [-1,1].forEach(d=>add('line',{x1:X(0),x2:X(LEN),y1:mid+d*SW_STATS.med*k,y2:mid+d*SW_STATS.med*k,stroke:INK,'stroke-width':.8})); } },
  /* the stretches the piece names, asked for in the ground row. one whose ends the piece gives is
     a ruled bar, one drawn between the nearest avenue crossings is a dashed outline. */
  vision:{ has:!!VISION,
    cap:()=>`Published vision: ${VISION.by}, ${VISION.title}`,
    draw(add,X,y,h){ VISION.stretches.forEach(v=>
      add('rect',{x:X(v.a)+.5,y:y+3.5,width:Math.max(1,X(v.b)-X(v.a)-1),height:h-7,...visionBar(v.stated)})); } }
};
const bandNow=()=>{ const L=LAYERS.find(o=>o.open), id=L&&(L.id==='road'&&VISION_ON?'vision':L.id), B=id&&RULER_BANDS[id];
  return B&&B.has?B:null; };

/* drawn to the ruler's own width, or to a width handed in when the sheet is about to print */
function buildRuler(force){
  const host=$('#ruler'), svg=$('#rulerSvg'), aves=$('#rulerAves');
  /* the street's ends sit where the fitted map draws them. paper keeps the screen's shares. */
  const SCREEN=Math.max(320,Math.round(host.clientWidth||960)), W=force>0?force:SCREEN;
  const fit=streetFit(SCREEN); SCALE={lo:fit.lo,hi:fit.hi};
  const X=ft=>share(ft)*W;
  svg.innerHTML=''; aves.innerHTML='';
  const add=(n,a)=>{const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); svg.appendChild(e); return e;};
  const SANS=token('--sans');
  /* measure for real. an advance-width estimate let a hub name run off the edge on a phone. */
  const label=(txt,px)=>{
    const t=document.createElementNS(NS,'text');
    t.setAttribute('font-family',SANS); t.setAttribute('font-size',px);
    t.textContent=txt; svg.appendChild(t);
    let w=0; try{ w=t.getComputedTextLength(); }catch(e){ w=txt.length*px*.55; }
    if(!w) w=txt.length*px*.55;
    return {node:t, w};
  };
  /* the height one line of label really takes here, and every row below is set out from it */
  const PX=16, LH=(()=>{ const {node}=label('Xg',PX); let h=0; try{ h=node.getBBox().height; }catch(e){}
    node.remove(); return Math.ceil(Math.max(h,PX*1.15)); })();
  const NARROW=W<620, B=bandNow();
  $('#rulerCap').textContent=B?B.cap():`42nd Street, ${commas(LEN)} ft`;
  /* rows from the top: hub names over their brackets, the band, then the axis and the avenues.
     the band's room is kept when no row is open, so the map does not change height under the reader. */
  const hubY=NARROW?0:LH, bandY=hubY+(NARROW?4:10), axis=bandY+BAND_H+6, H=axis+5+LH;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`); host.style.height=H+'px';
  host.style.setProperty('--mark-top',(bandY-3)+'px'); host.style.setProperty('--mark-h',(axis+5-bandY+3)+'px');

  /* the four hubs: a name, and a bracket under it as long as the stretch. a name is dropped
     where it would crowd the one before it. */
  let hubRight=-1e9;
  if(!NARROW) HUBS.forEach(([a,b,name])=>{
    const x=X(a), w=X(b)-X(a), {node,w:tw}=label(name,PX);
    const half=tw/2, cx=Math.min(Math.max(x+w/2,half+3),W-half-3);
    if(tw<=W-6 && cx-half > hubRight+8){
      node.setAttribute('x',cx); node.setAttribute('y',hubY-4);
      node.setAttribute('text-anchor','middle'); node.setAttribute('fill',LABEL); node.setAttribute('class','hubname');
      add('path',{d:`M${x} ${hubY+4}V${hubY+1}H${x+w}V${hubY+4}`,fill:'none',stroke:LABEL,'stroke-width':1});
      hubRight=cx+half;
    } else node.remove();
  });

  if(B) B.draw(add,X,bandY,BAND_H);

  /* the street */
  add('line',{x1:X(0),x2:X(LEN),y1:axis,y2:axis,stroke:INK,'stroke-width':1.5});
  /* avenues, decluttered left to right: a label is drawn only if it clears the last one drawn.
     each drawn label gets a real button over it, as tall as a finger, that stands at the avenue. */
  let lastRight=-1e9; const drawn=[];
  AVES.forEach(([ft,name])=>{
    const x=X(ft);
    add('line',{x1:x,x2:x,y1:axis-4,y2:axis+4,stroke:INK,'stroke-opacity':.62,'stroke-width':1});
    const {node,w:tw}=label(name,PX);
    const half=tw/2;
    let tx=x, anchor='middle';
    /* the end labels stand in from the edge, clear of the view window's border */
    if(x-half<6){ tx=6; anchor='start'; }
    else if(x+half>W-6){ tx=W-6; anchor='end'; }
    const left = anchor==='start' ? tx : anchor==='end' ? tx-tw : x-half;
    if(left > lastRight+(NARROW?14:7)){
      node.setAttribute('x',tx); node.setAttribute('y',axis+5+LH-4);
      node.setAttribute('text-anchor',anchor); node.setAttribute('fill',LABEL);
      lastRight=left+tw; drawn.push({ft,name,node,mid:left+tw/2,tw});
    } else node.remove();
  });
  /* Final guarantee. Font metrics vary by machine, so measure what actually got drawn and drop
     anything that sticks out of the box. A missing label is fine; one sliced by the edge looks broken. */
  [...svg.querySelectorAll('text')].forEach(t=>{
    let bb; try{ bb=t.getBBox(); }catch(e){ return; }
    if(bb.width && (bb.x < 1 || bb.x + bb.width > W - 1)) t.remove();
  });
  const kept=drawn.filter(d=>d.node.isConnected);
  kept.forEach((d,i)=>{
    const room=Math.min(i?d.mid-kept[i-1].mid:1e9, i<kept.length-1?kept[i+1].mid-d.mid:1e9);
    const w=Math.max(d.tw+8,Math.min(44,room)), b=el('button','ruler__ave');
    b.type='button'; b.dataset.ave=d.ft; b.setAttribute('aria-label',`${aveName(d.name)}, ${commas(d.ft)} ft`);
    b.style.left=((d.mid-w/2)/W*100)+'%'; b.style.width=(w/W*100)+'%';
    aves.append(b);
  });
  RULER_GEO={W,top:bandY-3,axis};
  pickRing(); printMark();
  /* the scale may have moved with the width: the mark and the window follow it */
  if(SEL.st!=null) $('#rulerMark').style.left=(share(SEL.st)*100)+'%';
  clearHubs();
  try{ syncRuler(); }catch(e){}
  /* measured last: the foot only takes its second line once the readout has its text */
  stackH();
}
/* stacked, the first screen is fixed to the foot of the window, so the map has to give way by
   exactly what the head and the ruler take. both grow with the reader's minimum font size. */
function stackH(){
  const h=e=>{const n=$(e); return n?n.getBoundingClientRect().height:0;};
  const r=document.documentElement.style;
  r.setProperty('--head-h',Math.ceil(h('.head'))+'px');
  r.setProperty('--ruler-h',Math.ceil(h('#rulerCap')+h('#rulerBox')+h('.ruler__foot'))+'px');
}
/* a hub name the station's feet would sit on is left out while they do. its bracket stays. */
function clearHubs(){
  const lab=$('#rulerMarkFt'), L=SEL.st!=null&&lab.getClientRects().length?lab.getBoundingClientRect():null;
  $('#rulerSvg').querySelectorAll('.hubname').forEach(t=>{ const r=t.getBoundingClientRect();
    t.style.visibility=L&&r.right>L.left-6&&r.left<L.right+6?'hidden':''; });
}
/* the picked item, ringed on the band, so it shows under the pin. in the drawing, so it prints. */
function pickRing(){
  const svg=$('#rulerSvg'); svg.querySelectorAll('.pring').forEach(n=>n.remove());
  const k=SEL.pick, t=k&&svg.querySelector(`[data-pick="${k.row}:${k.i}"]`); if(!t) return;
  let bb; try{ bb=t.getBBox(); }catch(e){ return; }
  const c=document.createElementNS(NS,'circle'); c.setAttribute('class','pring');
  const a={cx:bb.x+bb.width/2,cy:bb.y+bb.height/2,r:Math.max(6,bb.width/2+2.5),fill:'none',stroke:INK,'stroke-width':1.5};
  for(const n in a) c.setAttribute(n,a[n]); svg.appendChild(c);
}
/* the station mark again, inside the drawing, shown only in print. paper scales the svg whole,
   and the mark on screen is ruled in screen px, so it would not land on the bars. */
let RULER_GEO=null;
function printMark(){
  const svg=$('#rulerSvg'); svg.querySelectorAll('.pmark').forEach(n=>n.remove());
  if(SEL.st==null||!RULER_GEO) return;
  const {top,axis}=RULER_GEO, x=share(SEL.st)*RULER_GEO.W;
  const add=(n,a)=>{const e=document.createElementNS(NS,n); e.setAttribute('class','pmark');
    for(const k in a) e.setAttribute(k,a[k]); svg.appendChild(e);};
  add('line',{x1:x,x2:x,y1:top,y2:axis+5,stroke:INK,'stroke-width':3});
  add('circle',{cx:x,cy:top,r:4,fill:INK});
}

/* redraw on resize, debounced, because the drawing is now width-dependent */
let _rulerT; addEventListener('resize',()=>{clearTimeout(_rulerT); _rulerT=setTimeout(buildRuler,120);});

function syncRuler(){
  /* the map is held at the street's bearing, so the street runs across it: the stations at the
     map's left and right edges follow from where its two ends are drawn. they run past 0 and LEN
     when the map shows more than the street, and the window then runs to the ruler's edge. */
  let a=0, c=LEN;
  if(MAP_OK){ const p=map.project(at(0)), q=map.project(at(LEN)), w=map.getContainer().clientWidth;
    if(q.x!==p.x){ a=(0-p.x)/(q.x-p.x)*LEN; c=(w-p.x)/(q.x-p.x)*LEN; } }
  const on=ft=>Math.max(0,Math.min(LEN,ft)), lo=on(Math.min(a,c)), hi=on(Math.max(a,c));
  VIEW=[lo,hi];
  if(SEL.st==null) restSlider();
  const win=$('#rulerWin'), edge=ft=>Math.max(0,Math.min(1,share(ft))), mid=$('#rulerMid');
  if(MAP_OK){ win.style.left=(edge(a)*100)+'%'; win.style.width=Math.max(.5,(edge(c)-edge(a))*100)+'%'; }
  else win.hidden=true;
  /* one feet value on the screen at a time: the station's, in the card's own two strings. with no
     station it names where the map is, and gives no feet. */
  if(SEL.st!=null){ mid.textContent=`${commas(SEL.st)} ft from the Hudson River · ${whereName(placeAt(SEL.st))}`; return; }
  /* with no map there is no view to mark: the ruler says only what it is */
  if(!MAP_OK){ mid.textContent=`The whole street · ${commas(LEN)} ft`; return; }
  const m=(lo+hi)/2, ave=AVES.reduce((x,y)=>Math.abs(y[0]-m)<Math.abs(x[0]-m)?y:x);
  mid.textContent='Map view '+(m<120?'at the Hudson River' : m>LEN-120?'at the East River' : `near ${aveName(ave[1])}`);
}
let VIEW=[0,LEN];
(function drag(){
  /* the handlers sit on the box that holds the slider and the avenue buttons, so a drag can
     start anywhere on it. a press that never became a drag on a button is left to the button. */
  const box=$('#rulerBox'), r=$('#ruler'); let down=false,cap=false,sx=0;
  const ftAt=e=>{const b=r.getBoundingClientRect();
    return Math.max(0,Math.min(LEN,((e.clientX-b.left)/b.width-SCALE.lo)/(SCALE.hi-SCALE.lo)*LEN));};
  const go=e=>{ userMoved=true; map.easeTo({center:at(ftAt(e)),duration:down&&cap?0:600,bearing:BEARING}); };
  const onBtn=e=>!!(e.target.closest&&e.target.closest('.ruler__ave'));
  box.addEventListener('pointerdown',e=>{down=true;cap=false;sx=e.clientX; if(!onBtn(e)) go(e);});
  box.addEventListener('pointermove',e=>{ if(!down) return;
    if(!cap&&Math.abs(e.clientX-sx)>4){cap=true; try{box.setPointerCapture(e.pointerId);}catch(err){}}
    if(cap) go(e);});
  /* a press that never became a drag is a pick: stand at that station */
  box.addEventListener('pointerup',e=>{ if(down&&!cap&&!onBtn(e)) select({st:ftAt(e),lot:null}); });
  addEventListener('pointerup',()=>{ down=false; setTimeout(()=>{cap=false;},0); });
  /* an avenue's name stands at the avenue */
  $('#rulerAves').addEventListener('click',e=>{ const b=e.target.closest('.ruler__ave'); if(b&&!cap) select({st:+b.dataset.ave,lot:null}); });
  /* arrows walk the street 100 ft at a time and the card follows */
  const STEP=100;
  r.addEventListener('keydown',e=>{
    const from=SEL.st!=null?SEL.st:Math.round((VIEW[0]+VIEW[1])/2/STEP)*STEP;
    const to={ArrowRight:from+STEP,ArrowUp:from+STEP,ArrowLeft:from-STEP,ArrowDown:from-STEP,
      Home:0,End:LEN,Enter:from,' ':from}[e.key];
    if(e.key==='Escape'&&SEL.st!=null){ select({st:null,lot:null}); return; }
    if(to===undefined) return;
    e.preventDefault(); select({st:to,lot:null});
  });
})();

/* ── the printed sheet, and the link to this view ─────────────────────── */
/* a WebGL canvas prints blank, and a 2D canvas filled from one prints at the wrong width. so the
   sheet is handed a plain picture. each time the map comes to rest its frame is copied, inside
   the same render while the frame is still there, and kept as one PNG. nothing is kept on the GPU.
   the copy is a strip about the street, which runs across the middle of the view, so map and
   ruler share the first page. */
const PRINT_W=11*96, SHOT_H=284;   /* a letter sheet on its side, in css px, and the strip of it the map gets */
let SHOT=null, SHOT_N=0, SHOT_AT=0, SHOT_BUSY=false, PRINTING=false;
function grab(){
  /* the print layout resizes the map. that frame is not the view, and the picture must not change mid-print. */
  if(PRINTING) return;
  const gl=map.getCanvas(), cw=gl.clientWidth, ch=gl.clientHeight;
  if(!cw||!ch||!gl.width) return;
  const k=gl.width/cw, h=Math.min(ch,cw*SHOT_H/PRINT_W), top=(ch-h)/2;
  const c=document.createElement('canvas'); c.width=Math.round(cw*k); c.height=Math.round(h*k);
  try{ c.getContext('2d').drawImage(gl,0,-Math.round(top*k)); }catch(e){ return; }
  /* north and scale belong to this frame, so they are measured with it: the map's own bearing,
     and the two ends of the centreline as the map places them */
  const a=map.project(at(0)), b=map.project(at(LEN));
  const shot={cw,h,top,w:c.width,ht:c.height,bearing:map.getBearing(),pxFt:Math.hypot(b.x-a.x,b.y-a.y)/LEN}, n=++SHOT_N;
  SHOT_BUSY=true;
  /* pictures can finish out of order. a newer one is never replaced by an older one. */
  c.toBlob(blob=>{ c.width=c.height=0; const end=()=>{ if(n===SHOT_N) SHOT_BUSY=false; };
    if(!blob||n<SHOT_AT) return end();
    const img=new Image(); img.onerror=end;
    img.onload=()=>{ if(n>SHOT_AT&&!PRINTING){ SHOT_AT=n; SHOT=shot; const live=$('#mapPrint'), old=live.src;
        live.width=shot.w; live.height=shot.ht; live.src=img.src; if(old) URL.revokeObjectURL(old); }
      else URL.revokeObjectURL(img.src); end(); };
    img.src=URL.createObjectURL(blob); });
}
if(MAP_OK) map.on('idle',grab);
/* what is set over the picture as the sheet goes to print */
function snapshot(){
  const root=document.documentElement; delete root.dataset.shot;
  if(!MAP_OK||!SHOT) return;
  const {cw,h,top,bearing,pxFt}=SHOT;
  /* the pin is not part of the map's canvas. it is placed as a share of the picture. */
  const pin=$('#shotPin'); pin.hidden=SEL.st==null;
  if(SEL.st!=null){ const p=map.project(at(SEL.st)); pin.style.left=(p.x/cw*100)+'%'; pin.style.top=((p.y-top)/h*100)+'%'; }
  $('#northArrow').setAttribute('transform',`rotate(${-bearing})`);
  /* the bar: the largest of 1, 2 or 5 times a power of ten within a fifth of the strip */
  const room=cw/pxFt/5, pow=10**Math.floor(Math.log10(room)), n=[5,2,1].find(m=>m*pow<=room)*pow;
  $('#scaleBar').style.width=(n*pxFt/cw*100)+'%'; $('#scaleLab').textContent=commas(n)+' ft';
  /* the basemap's credit, in its own words, and its mark */
  const credit=$('#mapCredit'), logo=document.querySelector('#map .mapboxgl-ctrl-logo');
  credit.innerHTML=''; if(logo){ const l=logo.cloneNode(false); l.removeAttribute('href'); credit.append(l); }
  const words=el('span'); words.textContent=basemapCredit(); credit.append(words);
  /* a picture off a narrow screen is enlarged to fill the sheet, and the sheet says so */
  $('#printShot').hidden=cw>=PRINT_W*.6;
  $('#printShotText').textContent=`taken from a screen ${commas(Math.round(cw))} px wide and enlarged to fill the sheet`;
  root.dataset.shot='1';
}
function basemapCredit(){ if(!MAP_OK) return '';
  return [...document.querySelectorAll('#map .mapboxgl-ctrl-attrib-inner a')].filter(a=>!a.classList.contains('mapbox-improve-map'))
    .map(a=>a.textContent.trim()).filter(Boolean).join(' '); }
/* the link to this view. intro is left out: it is how the first screen is asked for, not a view. */
function viewLink(){ return location.href.replace(/([?&])intro=[^&#]*&?/,'$1').replace(/[?&](?=#|$)/,''); }
/* the foot of the printed sheet: where this view lives and the day it was printed */
function printFoot(){
  const d=new Date(), iso=[d.getFullYear(),d.getMonth()+1,d.getDate()].map(n=>String(n).padStart(2,'0')).join('-');
  $('#printLink').textContent=viewLink(); $('#printDate').textContent=day(iso); $('#printMethod').textContent=METHOD;
  /* the basemap is credited only when there is one on the sheet */
  const base=document.documentElement.dataset.shot?basemapCredit():''; $('#printBaseText').textContent=base; $('#printBase').hidden=!base;
}
/* the ruler is set out for the sheet's width, then scaled */
/* on paper the drawing is read first. it is lifted above the rail for the print and put back after. */
function placeDraw(){ const rail=$('#layers'), draw=$('.draw'); PRINTING?rail.before(draw):rail.after(draw); }
addEventListener('beforeprint',()=>{ PRINTING=true; placeDraw(); snapshot(); printFoot(); buildRuler(PRINT_W); });
addEventListener('afterprint',()=>{ PRINTING=false; placeDraw(); buildRuler(); refit(); });
(()=>{ /* the button's own words change, so the confirmation is never colour alone */
  const b=$('#copyLink'), REST=b.textContent; let t;
  /* the live region is shared: it is cleared only if nothing else has spoken since */
  const say=(label,msg)=>{ const said=$('#said'); b.textContent=label; said.textContent=msg; clearTimeout(t);
    t=setTimeout(()=>{ b.textContent=REST; if(said.textContent===msg) said.textContent=''; },2400); };
  /* what was copied, in strings already on the screen: the card's title and the open row */
  const what=()=>{ const lot=SEL.lot&&LOT_BY_BBL.get(SEL.lot), o=LAYERS.find(L=>L.open);
    return [SEL.st==null?null:lot?(lot.addr||'Unnamed lot'):whereName(placeAt(SEL.st)), o&&o.short].filter(Boolean).join(', '); };
  const ok=()=>{ const w=what(), m='Link copied'+(w?': '+w:''); say(m,m+'.'); }, no=()=>say('Not copied','Could not copy. The link is in the address bar.');
  /* the older way, for a page that is not allowed the clipboard */
  const byHand=href=>{ const a=el('textarea','sr'); a.value=href; a.readOnly=true; document.body.append(a); a.select();
    let done=false; try{ done=document.execCommand('copy'); }catch(e){} a.remove(); b.focus(); done?ok():no(); };
  b.onclick=()=>{ const href=viewLink();
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(href).then(ok,()=>byHand(href));
    else byHand(href); };
  /* the button waits, briefly, for a picture of the map as it now stands */
  $('#printSheet').onclick=()=>{ let tries=0;
    const go=()=>{ if(MAP_OK&&(SHOT_BUSY||!SHOT||map.isMoving())&&tries++<30) return setTimeout(go,100); print(); };
    go(); };
})();

/* ── boot ─────────────────────────────────────────────────────────────── */
(()=>{ /* build stamp: the last-modified date of this file, so a stale cache is obvious */
  const el=$('#stamp'); if(!el) return;
  /* sheet number and build time are working notes, not something the public needs.
     they only appear when the page is served from this machine. */
  if(!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return;
  fetch('scripts.js',{method:'HEAD'}).then(r=>{
    const d=r.headers.get('last-modified');
    el.textContent = d ? 'built '+new Date(d).toISOString().slice(0,16).replace('T',' ') : 'build unknown';
  }).catch(()=>{ el.textContent='build unknown'; });
})();
$('#metaExtent').textContent=`Hudson to East River, ${(LEN/5280).toFixed(2)} mi`;
$('#metaLots').textContent=LOTS.features.length+' lots';
$('#metaTrees').textContent=TREES.length+' trees';
$('#printExtent').textContent=$('#metaExtent').textContent;
$('#ruler').setAttribute('aria-valuemax',LEN);
(()=>{ /* ?on=lots,trees is exactly what is drawn. ?hr=17 sets the hour. in a hand-typed link
     with no on, hr also draws the bus and opens its row, and ?q=benches draws the row it opens. */
  const qs=new URLSearchParams(location.search), v=parseInt(qs.get('hr'),10);
  const timed=BUS_STATS&&v>=0&&v<=23, want=row(qs.get('q'))||(timed&&!qs.has('on')?row('bus'):null);
  if(qs.has('on')){ const ids=qs.get('on').split(','); LAYERS.forEach(L=>{ L.on=ids.includes(L.id); }); }
  if(timed){ SEL.hour=v; if(!qs.has('on')) row('bus').on=true; }
  if(want){ LAYERS.forEach(L=>{ L.open=L===want; }); if(!qs.has('on')){ if(row('trees')&&want.id!=='trees') row('trees').on=false; want.on=true; } }
  /* ?by=lots.capacity. a style the row does not offer is ignored. */
  (qs.get('by')||'').split(',').forEach(x=>{ const [id,v]=x.split('.'), L=row(id);
    if(L&&L.styles&&L.styles.some(o=>o[0]===v)) L.style=v; });
  if(row('lots')){ const no=(qs.get('no')||'').split(','); row('lots').noLm=no.includes('lm'); row('lots').noPub=no.includes('pub'); }
})();
buildPanel(); buildRuler();
(()=>{ /* the first screen. shut once, it stays shut on this browser. ?intro=1 opens it again,
     and so does the button in the title block. storage can be blocked, so it is only tried. */
  const card=$('#intro'), KEY='r2r.intro'; if(!card) return;
  /* the strip takes height from the map and gives it back, so the map is measured again */
  const show=open=>{ card.hidden=!open; $('#introOpen').setAttribute('aria-expanded',open); refit(); };
  const shut=()=>{ show(false); try{ localStorage.setItem(KEY,'done'); }catch(e){}
    const f=$('.layer__head'); if(f) f.focus({preventScroll:true}); };
  /* whether it opens is decided once, by the script beside the card in index.html */
  show(!card.hidden);
  $('#introGo').onclick=shut;
  /* Escape shuts it from anywhere on the page, since focus does not start inside it */
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!card.hidden){ e.preventDefault(); shut(); } });
  $('#introOpen').onclick=()=>{ show(card.hidden); if(!card.hidden) $('#introGo').focus(); };
})();
(()=>{ /* a row opened by the link is brought to the top of the rail. only the rail is scrolled,
     never the page, so a stacked layout stays where the station link puts it. */
  const L=LAYERS.find(o=>o.open), rail=$('#layerList'); if(!L||!rail) return;
  const go=()=>requestAnimationFrame(()=>{ if(rail.scrollHeight>rail.clientHeight)
    rail.scrollTop+=L._row.getBoundingClientRect().top-rail.getBoundingClientRect().top;
    /* stacked, the rail is under the map, so a link to a row with no station lands on the row */
    else if(STACKED.matches&&!new URLSearchParams(location.search).has('st')&&!new URLSearchParams(location.search).has('lot')) L._row.scrollIntoView({block:'start'}); });
  if(document.readyState==='complete') go(); else addEventListener('load',go,{once:true});
})();
(()=>{ /* ?st=4000 opens the card at 4,000 ft. ?lot=<bbl> alone stands at that lot. */
  const q=new URLSearchParams(location.search), lot=q.get('lot');
  const p=lot&&LOT_BY_BBL.get(lot), k=p&&LOT_BAND.get(p.bbl);
  let st=q.has('st')?parseFloat(q.get('st')):NaN;
  /* a hand-edited link can name a lot and a station that are nowhere near each other */
  if(p&&!(st>=k.a&&st<=k.b)) st=p.ft>=k.a&&p.ft<=k.b?p.ft:(k.a+k.b)/2;
  /* &pick=benches.0 is kept only if the item exists and stands at this station */
  const [pr,pi]=(q.get('pick')||'').split('.'), item=PICKS[pr]&&PICKS[pr][+pi];
  const pick=item&&Number.isFinite(st)&&item.ft===Math.round(st)?{row:pr,i:+pi}:null;
  if(Number.isFinite(st)) select({st, lot:p?lot:null, pick},{boot:true}); else restSlider();
  /* stacked, the card sits under the map: once the layout has settled, put the ruler at the
     top so the mark and the card share the first screen */
  if(Number.isFinite(st)&&STACKED.matches){
    const go=()=>requestAnimationFrame(()=>$('#rulerBox').scrollIntoView({block:'start'}));
    if(document.readyState==='complete') go(); else addEventListener('load',go,{once:true});
  }
})();
map.on('error',e=>console.warn('map:',e&&e.error&&e.error.message));
})();
