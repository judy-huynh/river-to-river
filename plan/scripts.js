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
    '<div style="padding:70px 60px;font:15px/1.7 ui-monospace,Menlo,monospace;max-width:70ch">'
    + '<div style="color:#FF5A36;letter-spacing:.18em;font-size:12px">CANNOT RUN FROM A FILE URL</div>'
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
mapboxgl.accessToken=TOKEN;

/* the street's own bounding box, so the opening view frames the subject at any
   window size. a fixed zoom only ever looked right on one screen. */
const STREET_BOUNDS=LINE.reduce((b,[,lng,lat])=>b.extend([lng,lat]),
  new mapboxgl.LngLatBounds(at(0),at(0)));
const FIT={bearing:BEARING, padding:{top:48,bottom:48,left:28,right:28}, maxZoom:15.4};

/* If WebGL is unavailable, the token is rejected or Mapbox fails to construct, the
   old code threw here and killed the rest of this IIFE, so the layer panel, the
   legends, the ruler and every number silently never rendered. All of that data is
   local and does not need the map, so fall back to a stub and keep the sheet
   readable instead of showing a page of empty headings. */
let MAP_OK=true, map;
try{
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
    + 'font:400 14px/1.6 -apple-system,Helvetica,sans-serif;color:rgba(20,18,15,.72)">'
    + '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;'
    + 'text-transform:uppercase;color:#FF5A36">The drawing did not load</div>'
    + '<p>This browser could not start the map. Everything else on this sheet is '
    + 'measured from local data and is still correct: the layer list, the counts, the '
    + 'legends and the ruler all work.</p>'
    + '<p style="font-size:13px">Most often this is WebGL being disabled or unavailable.</p></div>';
  console.warn('map failed to construct:', err && err.message);
}
map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');

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
map.on('load',refit); map.on('load',()=>clearPin());
let _fitT; addEventListener('resize',()=>{clearTimeout(_fitT); _fitT=setTimeout(refit,160);});
map.dragRotate.disable(); map.touchZoomRotate.disableRotation();

/* ═══════════════════════════════════════════════════════════════════════
   THE ROWS. Each is a question, grouped People, Movement, Built, in the order read.
   fig is the answer shown while the row is shut: [figure, what it measures]. sub is one
   plain line under the question. has is false when the row's data is not baked, and the
   row is then left off the rail. Every row opens with one plain sentence before any key.
   ═══════════════════════════════════════════════════════════════════════ */
const TREE_ROW=
  {
    id:'trees', group:'Built', short:'Trees', name:'Street trees', has:TREES.length>0,
    get fig(){ return [commas(TREES.length),'standing']; },
    get sub(){ return `${TREE_GAPS.length} stretch${TREE_GAPS.length===1?'':'es'} of over ${TREE_GAP_MIN} ft with none`; },
    on:true, open:false, ids:['treeDots'], opacity:1,
    says:`Every tree the Parks Department currently records on this street. <b>The dot is the size of the trunk.</b>`,
    styles:[['plain','All the same'],['cond','How healthy they are']], style:'plain',
    extras:[['gaps','Show where there are none']], extraOn:{gaps:false},
    legend(){
      let h='';
      if(this.style==='plain'){
        h+=`<div class="key"><h4>Trunk size</h4>
          <p>Measured across the trunk. The biggest on the street is ${Math.max(...TREES.map(t=>t.dbh||0))} inches.</p>
          <div class="sizes">${[4,12,24].map(d=>
            `<figure><span style="width:${d*1.1}px;height:${d*1.1}px"></span><figcaption>${d}"</figcaption></figure>`).join('')}</div></div>`;
      } else {
        const rows=Object.entries(COND)
          .map(([k,v])=>[k,v,TREES.filter(t=>t.cond===k).length])
          .filter(r=>r[2]>0).sort((a,b)=>b[2]-a[2]);
        h+=`<div class="key"><h4>Condition, as the city rates it</h4>
          <p>${pct(TREES.filter(t=>t.cond==='Good'||t.cond==='Excellent').length,TREES.length)}% are good or better.</p><ul>${
          rows.map(([k,v,n])=>`<li><i class="dot" style="background:${v}"></i><span>${k}</span><b>${n}</b></li>`).join('')}</ul></div>`;
      }
      const sp=[...TREES.reduce((m,t)=>m.set(t.common,(m.get(t.common)||0)+1),new Map())]
        .sort((a,b)=>b[1]-a[1]).slice(0,4);
      const spTop=sp.length?sp[0][1]:1;
      h+=`<div class="key key--rank"><h4>Most common species</h4>
        <p>${new Set(TREES.map(t=>t.common)).size} species in all. Hover any tree on the map for its name.</p><ul>${
        sp.map(([s,c])=>`<li><div class="row"><span>${s}</span><b>${c}</b></div>`
          + `<i class="bar" style="width:${Math.max(3,Math.round(c/spTop*100))}%"></i></li>`).join('')}</ul></div>`;
      if(this.extraOn.gaps)
        h+=`<p class="flag"><b>${commas(GAP_FEET)} feet has no tree at all</b>That is ${pct(GAP_FEET,LEN)}% of the street, in ${TREE_GAPS.length} stretch${TREE_GAPS.length===1?'':'es'} of over ${TREE_GAP_MIN} ft: ${TREE_GAPS.map(g=>g.map(x=>'near '+aveShort(nearAve(x))).join(' to ')).join(', ')}.</p>`;
      return h;
    }
  };
const LAYERS=[
  {
    id:'people', group:'People', short:'Count', name:'How many people are here?', has:!!PED_STATS,
    get fig(){ return [commas(PED_LAST.pm), day(PED_LAST.p)]; },
    /* the bake stops unless the source has exactly one location on 42 Street, so this is the whole set */
    get sub(){ return `${PM_WIN} &middot; the city counts at one place on the street`; },
    get chart(){ return spark(120,18); },
    on:false, open:false, ids:['countDot'],
    get says(){ return `NYC DOT counts people on foot at one place on 42nd Street, twice a year: ${PED.street}, ${PED.from} to ${PED.to}. <b>Each figure is one count day, both sidewalks.</b>`; },
    legend(){
      const S=PED_STATS, P=PED.periods, W=PED.windows||{};
      const gone=S.hole?P.findIndex(p=>p.p===S.hole[1]):-1;
      let o=`<div class="key"><h4>Latest count, ${day(PED_LAST.p)}</h4>
        <p>A total over each window, not a peak hour and not a whole day.</p><ul>${
        ['am','md','pm'].map(k=>`<li><span>${span(W[k])}</span><b>${PED_LAST[k]!=null?commas(PED_LAST[k]):'not counted'}</b></li>`).join('')}</ul></div>`;
      o+=`<div class="key"><h4>Every period, ${PM_WIN}</h4>
        <p>${S.n} count days, ${day(S.first.p)} to ${day(PED_LAST.p)}, to one scale from zero.${S.hole?` No count between ${day(S.hole[0])} and ${day(S.hole[1])}, drawn blank.`:''}</p>
        <div class="hours hours--count" role="img" aria-label="${PM_WIN} count by period. ${P.map(p=>`${day(p.p)} ${p.pm!=null?commas(p.pm):'not counted'}`).join(', ')}.">${
        P.map((p,i)=>(i===gone?'<i class="hours__none"></i>':'')
          +`<i${p===PED_LAST?' data-now':''} style="height:${p.pm!=null?(p.pm/S.hi.pm*100).toFixed(1):0}%"></i>`).join('')}</div>
        <div class="hours__lab"><span class="micro">${day(P[0].p)}</span><span class="micro">${day(P[P.length-1].p)}</span></div>
        <ul><li><span>Highest, ${day(S.hi.p)}</span><b>${commas(S.hi.pm)}</b></li>
        <li><span>Lowest, ${day(S.lo.p)}</span><b>${commas(S.lo.pm)}</b></li></ul></div>`;
      o+=`<div class="opt"><button type="button" data-st="${PED.ft}">Stand at the counter, ${commas(PED.ft)} ft</button></div>`;
      o+=`<p class="flag"><b>Counted on one block, on single days</b>The count is taken across both sidewalks on this block only, on a single weekday and the Saturday next to it. One day's weather or an event moves it, and it does not describe any other block of the street.</p>`;
      o+=`<div class="key"><p>NYC DOT Bi-Annual Pedestrian Counts, location ${PED.loc}${srcDate('PED_COUNT')}. <a href="${METHOD}">Method</a></p></div>`;
      return o;
    }
  },
  {
    id:'benches', group:'People', short:'Benches', name:'Where can you stop?', has:!!BENCH_STATS,
    get fig(){ return [commas(BENCHES.length), `DOT bench${BENCHES.length===1?'':'es'}`]; },
    get sub(){ return `none west of ${aveName(BENCH_STATS.west)} or east of ${aveName(BENCH_STATS.east)}`; },
    on:false, open:false, ids:['benchDots'],
    says:`Every bench NYC DOT records on 42 Street. <b>Only benches DOT placed are in the source.</b> Seating in parks and plazas, or put out by a building or a business improvement district, is not.`,
    legend(){
      const S=BENCH_STATS;
      let o=`<div class="key"><h4>Each bench</h4><p><span class="scr">Pick one to stand at its station.</span></p></div>
        <ul class="lotrows">${BENCHES.map(b=>`<li><button type="button" data-st="${b.ft}">`
          +`<b>${b.side==='n'?'North':'South'} side, ${block(between(b.ft))}</b>`
          +`<span>${commas(b.ft)} ft from the west end${b.installed?` &middot; installed ${day(b.installed)}`:''}</span>`
          +`</button></li>`).join('')}</ul>`;
      o+=`<div class="key key--after"><h4>Stretches with no DOT bench</h4>
        <p>Measured along the street, either side, longest first.</p><ul>${
        S.none.map(([a,b])=>`<li><span>${commas(a)} to ${commas(b)} ft</span><b>${commas(b-a)} ft</b></li>`).join('')}</ul></div>`;
      o+=`<p class="flag"><b>${commas(S.none[0][1]-S.none[0][0])} ft with no DOT bench</b>That is ${pct(S.none[0][1]-S.none[0][0],LEN)}% of the street in one stretch. It is the length of street between DOT benches or a street end. Other places to sit are not in the source.</p>`;
      o+=`<div class="key"><p>NYC DOT Seating Locations${srcDate('BENCHES')}. <a href="${METHOD}">Method</a></p></div>`;
      return o;
    }
  },
  {
    id:'sheds', group:'People', short:'Sheds', name:'What is in the way?', has:!!SHED_STATS,
    get fig(){ const n=SHED_STATS.live.length; return [commas(n), `building${n===1?'':'s'}`]; },
    get sub(){ const S=SHED_STATS; return `with a sidewalk shed permit in force on ${day(SHEDS_META.asof)}`+(S.oldest?` &middot; longest run of permits began ${day(S.oldest.since)}`:''); },
    on:false, open:false, ids:['shedFill','shedLine'],
    says:`Buildings addressed on 42nd Street with a Department of Buildings permit for a sidewalk shed. <b>A permit is a record, not a sighting.</b> It does not say a shed is standing, how long it is, or which side of a corner building it covers.`,
    legend(){
      const S=SHED_STATS, M=SHEDS_META;
      const rows=(list,line)=>`<ul class="lotrows">${list.map(x=>`<li><button type="button" data-st="${x.ft}">`
        +`<b>${x.addr}</b><span>${x.side==='n'?'North':'South'} side &middot; ${commas(x.ft)} ft from the west end</span>`
        +`<span class="num">${line(x)}</span></button></li>`).join('')}</ul>`;
      let o=`<div class="key"><h4><i class="mark mark--full"></i>Permit in force on ${day(M.asof)}</h4><p>${S.live.length} building${S.live.length===1?'':'s'}. <span class="scr">Pick one to stand at its station.</span></p></div>`
        +rows(S.live,x=>`${x.n} permit${x.n===1?'':'s'} in a run since ${day(x.since)} &middot; runs to ${day(x.expires)}`);
      if(S.lapsed.length)
        o+=`<div class="key key--after"><h4><i class="mark"></i>Permit run out, no sign-off recorded</h4><p>${S.lapsed.length} building${S.lapsed.length===1?'':'s'}, newest first. The record does not say whether a shed still stands.</p></div>`
          +rows(S.lapsed,x=>`ran out ${day(x.expires)} &middot; run began ${day(x.since)}`);
      o+=`<p class="flag"><b>The length of a shed is not in the record</b>DOB publishes the address, dates and status of each permit, and not how much sidewalk the shed covers, so no length is given here. Permits at one building are read as one run when each starts within ${M.gap_days} days of the last running out.</p>`;
      o+=`<div class="key"><p>DOB NOW: Build, Approved Permits${srcDate('SHEDS')}, ${commas(M.rows.now)} shed permits on 42 Street. Runs dated with ${commas(M.rows.old)} older permits from DOB Permit Issuance. <a href="${METHOD}">Method</a></p></div>`;
      return o;
    }
  },
  {
    id:'crashes', group:'People', short:'Crashes', name:'Who gets hurt?', has:!!CRASH_STATS,
    get fig(){ return [commas(CRASH_STATS.inj),'people injured']; },
    get sub(){ return `in ${commas(CRASH_STATS.n)} police-reported crashes, ${day(CRASH_META.since)} to ${day(CRASH_META.to)} &middot; a count, not a rate`; },
    on:false, open:false, ids:['crashDots'],
    get says(){ return `Every crash the police reported within ${CRASH_META.near_ft} ft of the centre of 42nd Street. <b>A circle is the people injured at one place.</b> The police put most crashes at the nearest intersection, not at the spot, so a place is an intersection far more often than a spot.`; },
    legend(){
      const S=CRASH_STATS, M=CRASH_META;
      let o=`<div class="key"><h4>People injured, ${day(M.since)} to ${day(M.to)}</h4>
        <p>${commas(S.hurt)} of the ${commas(S.n)} crashes injured someone. The split is the source's own.</p><ul>${
        S.split.map(([k,v])=>`<li><span>${k}</span><b>${commas(v)}</b></li>`).join('')}${
        S.other?`<li><span>In none of the three</span><b>${commas(S.other)}</b></li>`:''}
        <li><span>All injured</span><b>${commas(S.inj)}</b></li>
        <li><span>People killed</span><b>${commas(S.k)}</b></li></ul></div>`;
      o+=`<div class="key"><h4>By year</h4><p>The last year runs to ${day(M.to)} only.</p><ul>${
        S.years.map(([y,v])=>`<li><span>${y} &middot; ${commas(v.n)} crashes</span><b>${commas(v.inj)} injured</b></li>`).join('')}</ul></div>`;
      o+=`<div class="key"><h4>Circle size</h4><p>Area grows with the people injured at one place: the crashes the police put within ${window.STATION.CRASH_JOIN} ft of each other along the street. A place where nobody was injured is not drawn.</p>
        <div class="sizes sizes--ink">${[1,10,40].map(v=>`<figure><span style="width:${(Math.sqrt(v)*4.4).toFixed(1)}px;height:${(Math.sqrt(v)*4.4).toFixed(1)}px"></span><figcaption>${v}</figcaption></figure>`).join('')}</div></div>`;
      const rows=list=>`<ul class="lotrows">${list.map(p=>`<li><button type="button" data-st="${p.ft}">`
          +`<b>${p.name?`At ${p.name}`:whereName(between(p.ft))}</b><span>${commas(p.ft)} ft from the west end</span>`
          +`<span class="num">${commas(p.inj)} injured in ${commas(p.n)} crash${p.n===1?'':'es'}</span></button></li>`).join('')}</ul>`;
      o+=`<div class="key key--after"><h4>The ${Math.min(CRASH_TOP,S.top.length)} places with most injured</h4><p><span class="scr">Pick one to stand at its station.</span></p></div>`+rows(S.top.slice(0,CRASH_TOP));
      o+=`<div class="key key--after"><h4>Every place with anyone injured, west to east</h4><p>${commas(S.drawn.length)} places, one circle each.</p></div>`+rows(S.drawn);
      o+=`<p class="flag"><b>A count, not a rate</b>No source counts how many people walk, cycle or drive along the street, so there is nothing to divide by. These figures say how many people were hurt. They do not say how dangerous the street is for one person using it, and a busy corner cannot be compared with a quiet one.</p>`;
      if(S.fdr.n)
        o+=`<p class="flag"><b>Not every crash here was on 42nd Street</b>The rule is distance, so a crash on an avenue inside one of the street's intersections is counted. ${commas(S.fdr.n)} of the crashes are ones the source names on the FDR Drive, at the east end, with ${commas(S.fdr.inj)} people injured.</p>`;
      if(M.unlocated.n)
        o+=`<p class="flag"><b>${commas(M.unlocated.n)} more crashes have no point</b>The source records them on 42 Street with no coordinates, so they cannot be placed and are not counted above. ${commas(M.unlocated.inj)} people were injured in them.</p>`;
      o+=`<div class="key"><p>NYPD Motor Vehicle Collisions, Crashes${srcDate('CRASHES')}. <a href="${METHOD}">Method</a></p></div>`;
      return o;
    }
  },
  {
    id:'bus', group:'Movement', short:'Bus', name:'How fast does the bus move?', has:!!BUS_STATS, hour:true,
    /* getters: the shut row follows the hour slider */
    get fig(){ const v=busCorridor(SEL.hour);
      return [v!=null?v.toFixed(2):'none', `${v!=null?'mph':'no buses measured'}, ${hourSpan(SEL.hour)}`]; },
    get sub(){ const r=busSlowest(SEL.hour);
      return `average over the measured legs &middot; `+(r?`slowest leg ${r.mph.toFixed(2)} mph &middot; `:'')+`walking reference ${WALK} mph`; },
    on:false, open:false, ids:['busCase','busLine','busNone'], opacity:1,
    says:BUS_STATS?`The M42 on each leg between two MTA timepoints, averaged over the weekdays of ${busMonth()}. <b>One bar is one leg.</b> The speed is the whole leg's, not a reading at any point inside it.`:'',
    legend(){
      if(!BUS_STATS) return '';
      const h=SEL.hour, S=BUS_STATS, rows=BUS.filter(r=>r.h===h);
      let o=`<div class="key"><h4>Miles per hour</h4>
        <p>Blended between these stops. The walking reference is ${WALK} mph.</p><ul>${
        BUS_RAMP.map(([v,c],i)=>`<li><i style="background:${c}"></i><span>${v.toFixed(1)} mph${i===BUS_RAMP.length-1?' and over':''}</span><b>${i?`${i+1}&times; walking reference`:'walking reference'}</b></li>`).join('')}</ul></div>`;
      o+=`<div class="key"><h4>The street by hour</h4>
        <p>All kept legs, both directions, weighted by buses measured. The line is ${WALK} mph.</p>
        <div class="hours" role="img" aria-label="Average speed by hour. ${S.avg.map(([k,v])=>`${hr(k)} ${v.toFixed(1)}`).join(', ')} miles per hour.">${
        S.avg.map(([k,v])=>`<i${k===h?' data-now':''} style="height:${(v/S.top*100).toFixed(1)}%;background:${busColour(v)}"></i>`).join('')}
        <b style="bottom:${(WALK_MPH/S.top*100).toFixed(1)}%"></b></div>
        <div class="hours__lab"><span class="micro">${hr(0)}</span><span class="micro">${hr(12)}</span><span class="micro">${hr(23)}</span></div></div>`;
      o+=`<div class="key"><h4>Each leg, ${hourSpan(h)}</h4>
        <p>Street average ${busCorridor(h).toFixed(2)} mph.</p><ul>${
        rows.map(r=>`<li><i style="background:${r.mph!=null?busColour(r.mph):'transparent'}"></i><span>${DIRS[r.dir]}, ${legName(r)}<br>${commas(r.b-r.a)} ft &middot; ${commas(r.trips)} buses</span><b>${r.mph!=null?r.mph.toFixed(2)+' mph':'no buses'}</b></li>`).join('')}</ul></div>`;
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
          <div class="hours__lab"><span class="micro">${monthName(first.month)}</span><span class="micro">${monthName(last.month)}</span></div>
          <p>Lowest ${T.lo.mph.toFixed(2)} mph in ${monthName(T.lo.month)}, highest ${T.hi.mph.toFixed(2)} mph in ${monthName(T.hi.month)}.${T.under.length?` The months under ${WALK} mph:`:''}</p>${
          T.under.length?`<ul>${T.under.map(r=>`<li><i style="background:${busColour(r.mph)}"></i><span>${monthName(r.month)} &middot; ${commas(r.b-r.a)} ft leg<br>${DIRS[r.dir]}, ${legName(r)}</span><b>${r.mph.toFixed(2)} mph</b></li>`).join('')}</ul>`:''}</div>`;
        o+=`<p class="flag"><b>Each bar is one leg in one hour</b>Each bar is the slowest of that month's legs between ${hourSpan(T.h)}, averaged over its weekdays. It is one leg and does not describe the whole street. The MTA moved its timepoints during the record, so the legs are not the same stretches of street in every month. The legs of ${busMonth()} have been the same since ${monthName(T.sameSince.month)}, ${T.sameN} of the ${T.rows.length} months.</p>`;
      }
      if(BUS_META.dropped.length)
        o+=`<p class="flag"><b>Drawn blank where no leg is kept</b>${BUS_META.dropped.map(d=>
          `${DIRS[d.dir][0].toUpperCase()+DIRS[d.dir].slice(1)}, ${legName(d)} has a timepoint ${Math.max(...d.off)} ft off 42nd Street, so its time on the street cannot be separated and it is left out.`).join(' ')} ${
          Object.entries(S.blank).map(([d,b])=>`No ${DIRS[d]} speed at ${b.map(([x,y])=>`${commas(x)} to ${commas(y)} ft`).join(' and ')}.`).join(' ')}</p>`;
      o+=`<div class="key"><p>MTA Bus Route Segment Speeds, ${BUS_META.route}, ${BUS_META.days[0]} to ${BUS_META.days[BUS_META.days.length-1]}, ${busMonth()}${srcDate('BUS')}.${BUS_HIST_STATS&&BUS_HIST_STATS.old.length?` ${monthName(BUS_HIST_STATS.old[0].month)} to ${monthName(BUS_HIST_STATS.old[BUS_HIST_STATS.old.length-1].month)} are from the MTA's earlier file, ${BUS_HIST_STATS.old[0].src}${srcDate('BUS_OLD')}.`:''} <a href="${METHOD}">Method</a></p></div>`;
      return o;
    }
  },
  {
    id:'road', group:'Movement', short:'Ground', name:'Who gets the ground?', has:ROAD.features.length>0,
    get fig(){ return [SW_STATS?`${ROAD_STATS.avgW} : ${SW_STATS.med}`:ROAD_STATS.avgW,'feet']; },
    get sub(){ return SW_STATS?'average roadway to typical sidewalk, each side':'average roadway &middot; no sidewalk widths baked'; },
    on:false, open:false, ids:['roadLine','swLine'], opacity:.85,
    says:`The roadway and both sidewalks, drawn at their real widths on the same scale. <b>The comparison is the point.</b>`,
    legend(){
      let h=`<div class="key"><h4>Drawn at real width</h4>
        <ul>
          <li><i class="rule" style="border-top-width:7px;border-top-color:#6E6A62"></i><span>Roadway</span><b>${ROAD_STATS.avgW} ft avg</b></li>`;
      if(SW_STATS) h+=`
          <li><i class="rule" style="border-top-width:3px;border-top-color:#2E9E4F"></i><span>Sidewalk, each side</span><b>${SW_STATS.med} ft typical</b></li>`;
      h+=`</ul></div>
        <p class="flag"><b>Six lanes, and two of them do not move</b>On ${ROAD_STATS.share}% of the street it is four lanes for moving traffic and two more for cars that are parked.</p>`;
      if(SW_STATS){
        h+=`<div class="key"><h4>The walking surface</h4>
          <p>Measured across ${SW_STATS.n} stretches of the street's own sidewalk.</p>
          <ul>
            <li><span>Narrowest</span><b>${SW_STATS.narrow.w} ft</b></li>
            <li><span>Typical</span><b>${SW_STATS.med} ft</b></li>
            <li><span>Widest</span><b>${SW_STATS.max} ft</b></li>
          </ul></div>
          <p class="flag"><b>This is gross concrete, not clear width</b>Sheds, stairs, newsstands and kiosks are not deducted, so every figure here is an upper bound on what you can actually walk on. Coverage is ${pct(SW_STATS.coverN,LEN)}% of the north side and ${pct(SW_STATS.coverS,LEN)}% of the south.</p>`;
      }
      return h;
    }
  },
  {
    id:'curb', group:'Movement', short:'Curb', name:'Who is the curb for?', has:!!CURB_STATS,
    get fig(){ return [`${CURB_STATS.who[0][1]} of ${CURB.length}`,'metered block faces']; },
    get sub(){ return `${CURB_STATS.who[0][0].toLowerCase()} &middot; meters along ${pct(CURB_STATS.n+CURB_STATS.s,2*LEN)}% of the length of the two sides`; },
    on:false, open:false, ids:['curbLine'],
    says:`Each side of a block where NYC DOT runs parking meters, and who may pay to stand there. <b>A line is one metered block face.</b> Curb with no line has no meter.`,
    legend(){
      const S=CURB_STATS;
      let o=`<div class="key"><h4>Who may pay to stand</h4><p>The source's own vehicle type, by block face.</p><ul>${
        S.who.map(([k,v])=>`<li><span>${k}</span><b>${v} face${v===1?'':'s'}</b></li>`).join('')}</ul></div>`;
      o+=`<div class="key"><h4>When the meters run</h4><ul>${
        S.hours.map(([k,v])=>`<li><span>${k}</span><b>${v} face${v===1?'':'s'}</b></li>`).join('')}</ul></div>`;
      o+=`<div class="key key--after"><h4>Each block face, west to east</h4><p><span class="scr">Pick one to stand at its middle.</span></p></div>
        <ul class="lotrows">${CURB.map(f=>`<li><button type="button" data-st="${Math.round((f.a+f.b)/2)}">`
          +`<b>${f.side==='n'?'North':'South'} side, between ${f.from} and ${f.to}</b>`
          +`<span>${commas(f.a)} to ${commas(f.b)} ft &middot; ${f.who}</span><span class="num">${curbTerms(f)}</span></button></li>`).join('')}</ul>`;
      o+=`<p class="flag"><b>${pct(2*LEN-S.n-S.s,2*LEN)}% of the length of the two sides has no meter</b>Meters run along ${pct(S.n,LEN)}% of the north side and ${pct(S.s,LEN)}% of the south. Each share is of the whole ${commas(LEN)} ft of the street, avenue crossings included, so it is a share of the street's length and not of the curb a vehicle could use. No meter does not mean free to park. Bus stops, no standing zones and other posted rules apply there, and they are in another source that is not on this sheet.</p>`;
      o+=`<div class="key"><p>NYC DOT Parking Meters, ParkNYC Block Faces${srcDate('CURB')}. <a href="${METHOD}">Method</a></p></div>`;
      return o;
    }
  },
  {
    id:'lots', group:'Built', short:'Lots', name:'What could be built?', has:LOTS.features.length>0,
    /* the sum of unbuilt floor area over the drawn lots, in millions of sq ft (METHODOLOGY 2, 4) */
    get fig(){ return [`${(LOT_STATS.unbuilt/1e6).toFixed(1)}m`,'sq ft on paper']; },
    get sub(){ return `floor area allowed and not built &middot; most of it cannot be used`; },
    on:true, open:false, ids:['lotFill','lotLine','lmHatch'], opacity:.58,
    /* the set as it is drawn, every count from the records (METHODOLOGY 4) */
    get says(){ const S=LOT_STATS, M=window.LOTS_META, out=(window.LOTS_OUT||[]).length;
      return `${S.all} lots front the street, at their boundary from the city tax map (MapPLUTO).`
        +(M?` A lot is in the set when its boundary comes within ${M.front_ft} ft of the middle of the street, whatever its address. ${S.on} are addressed on 42nd Street and ${S.all-S.on} on an avenue or another street. ${out} of the ${M.pool} lots nearby ${out===1?'is':'are'} left out. <a href="${METHOD}#4-the-lot-rule-frontage">Method</a>.`:'')
        +` ${commas(S.unbuilt)} sq ft of floor area is allowed and not built, on ${S.room} of the ${S.all} lots. That is floor area on paper: most of these lots sit in a special district where the base rule is not the rule that governs, and ${commas(S.lmUnbuilt)} sq ft of it is on the ${S.lm} landmarked lots.`
        +` <b class="scr">Click one to see who owns it.</b>`; },
    styles:[['zoning','The rules that govern it'],['capacity','Room left to build'],
      ['landmark','What cannot be touched'],['age','When it was built'],['plain','Outline only']],
    style:'zoning',
    legend(){
      if(this.style==='zoning'){
        return ZONE_GROUPS.map(([h,note,keys])=>{
          const rows=keys.map(k=>{
            const n=LOTS.features.filter(f=>f.properties.zone===k).length;
            if(!n) return '';
            const far=FAR[k];
            return `<li><i style="background:${ZONE[k]}"></i><span>${k}${far?` &middot; up to ${far}&times;`:''}</span><b>${n} lot${n>1?'s':''}</b></li>`;
          }).join('');
          return rows?`<div class="key"><h4>${h}</h4><p>${note}</p><ul>${rows}</ul></div>`:'';
        }).join('')
        + `<p class="flag"><b>What "up to 15&times;" means</b>You may build floor area up to fifteen times the size of the lot. On a 10,000 sq ft lot that is 150,000 sq ft of building, stacked however the rules allow.</p>`;
      }
      if(this.style==='capacity'){
        return `<div class="key"><h4>Floor area allowed and never built</h4>
          <p>The gap between what the rules permit and what is standing.</p><ul>${
          CAP.map(([v,c],i)=>`<li><i style="background:${c}"></i><span>${i===0?'nothing spare':commas(v)+'+ sq ft'}</span></li>`).join('')}</ul></div>
          <p class="flag"><b>Treat this as a screen, not a promise</b>Most of these lots sit in a special district where the base rule is not the rule that governs. ${LOTS.features.filter(f=>f.properties.lm===1).length} are landmarked and cannot be built on at all.</p>`;
      }
      if(this.style==='landmark'){
        const n=LOTS.features.filter(f=>f.properties.lm===1).length;
        return `<div class="key"><h4>Designated landmarks</h4>
          <p>Whatever the zoning allows, these cannot grow.</p><ul>
          <li><i style="background:#14120F"></i><span>designated</span><b>${n} lots</b></li>
          <li><i style="background:#E9E4D6"></i><span>not designated</span><b>${LOTS.features.length-n} lots</b></li>
          </ul></div>
          <p class="flag"><b>This is why the capacity figure is a screen, not a promise</b>A landmarked lot can carry unbuilt floor area on paper and never be able to use it.</p>`;
      }
      if(this.style==='age'){
        return `<div class="key"><h4>Year the building went up</h4>
          <p>The street rebuilt itself in patches, not all at once.</p><ul>${
          AGE.map(([y,c])=>`<li><i style="background:${c}"></i><span>${y}s</span></li>`).join('')}</ul></div>`;
      }
      return `<div class="key"><h4>Boundaries only</h4><p>Every lot line, no fill.</p></div>`;
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
    /* two real buttons side by side: the switch draws the row, the header opens it. the heading
       holds the question alone, and the button's hit area is stretched over the answer beside it. */
    const bar=el('div','layer__bar',
      `<button class="sw" type="button" aria-pressed="${L.on}" aria-label="Show on the map: ${L.name}"></button>
       <div class="layer__q">
         <h3><button class="layer__head" type="button" id="head-${L.id}" aria-expanded="${L.open}" aria-controls="body-${L.id}" aria-describedby="fig-${L.id} ans-${L.id}">${L.name}</button></h3>
         <span class="layer__fig" id="fig-${L.id}"><b></b><small></small></span>
         <span class="layer__caret" aria-hidden="true">&#9654;</span>
         <span class="layer__sub" id="ans-${L.id}"><span class="layer__count"></span>${L.chart||''}</span></div>`);
    const body=el('div','layer__body'); body.id='body-'+L.id;
    body.setAttribute('role','region'); body.setAttribute('aria-labelledby','head-'+L.id);
    r.append(bar,body); host.append(r);
    L._row=r; L._body=body; L._sw=bar.querySelector('.sw'); L._head=bar.querySelector('.layer__head');
    L._sw.onclick=()=>toggle(L);
    L._head.onclick=()=>{ setOpen(L,!L.open); link(); };
    headline(L); renderBody(L);
  });
  /* the one control that is not a row sits under the last of them, so it belongs to no group */
  const foot=el('div','group group--foot'), off=el('button','mini','hide all from the map'); off.type='button';
  off.onclick=()=>LAYERS.forEach(o=>{ if(o.on) toggle(o); });
  foot.append(off); host.append(foot);
  /* a bench or the counter picked in a legend is a station like any other */
  host.addEventListener('click',e=>{ const b=e.target.closest('[data-st]'); if(b) select({st:+b.dataset.st,lot:null}); });
}

/* the answer on the shut row. called again whenever the figure can move. */
function headline(L){
  const [fig,cap]=L.fig;
  L._row.querySelector('.layer__fig b').innerHTML=fig;
  L._row.querySelector('.layer__fig small').innerHTML=cap;
  L._row.querySelector('.layer__count').innerHTML=L.sub;
}

/* one row open at a time, or the rail becomes a single unreadable column */
function setOpen(L,open){
  if(open) LAYERS.forEach(o=>{ if(o!==L&&o.open) setOpen(o,false); });
  L.open=open; L._row.dataset.open=open; L._head.setAttribute('aria-expanded',open);
  if(open) requestAnimationFrame(()=>L._row.scrollIntoView({block:'nearest'}));
}

/* the controls are written once. only the legend is redrawn after that, so a select or a
   chip being worked by keyboard is never replaced under the reader. */
function renderBody(L){
  let h=`<p class="says">${L.says}</p>`;
  if(L.styles)
    h+=`<div class="ctl"><label for="style-${L.id}">${L.short}: colour by</label><select id="style-${L.id}">${
      L.styles.map(([v,t])=>`<option value="${v}"${v===L.style?' selected':''}>${t}</option>`).join('')}</select></div>`;
  if(L.opacity!==undefined)
    h+=`<div class="ctl"><label for="op-${L.id}">${L.short}: opacity</label><div class="slider">
      <input type="range" id="op-${L.id}" min="10" max="100" value="${Math.round(L.opacity*100)}">
      <output for="op-${L.id}">${Math.round(L.opacity*100)}%</output></div></div>`;
  /* one hour slider for the whole sheet */
  if(L.hour)
    h+=`<div class="ctl ctl--hour"><label for="hourIn">${L.short}: hour of day, weekdays</label>
      <output id="hourOut" for="hourIn">${hourSpan(SEL.hour)}</output>
      <input type="range" id="hourIn" min="0" max="23" step="1" value="${SEL.hour}" aria-valuetext="${hourSpan(SEL.hour)}"></div>`;
  h+=`<div data-legend>${L.legend()}</div>`;
  if(L.extras)
    h+=`<div class="opt">${L.extras.map(([k,t])=>
      `<button type="button" data-extra="${k}" aria-pressed="${!!L.extraOn[k]}">${t}</button>`).join('')}</div>`;
  L._body.innerHTML=h;

  const op=L._body.querySelector('#op-'+L.id);
  if(op) op.oninput=e=>{ L.opacity=+e.target.value/100;
    L._body.querySelector('.slider output').textContent=e.target.value+'%'; paint(L); };
  const hourIn=L._body.querySelector('#hourIn');
  if(hourIn) hourIn.oninput=e=>setHour(+e.target.value);
  const sel=L._body.querySelector('#style-'+L.id);
  if(sel) sel.onchange=e=>{ L.style=e.target.value; paint(L); redraw(L); link(); };
  L._body.querySelectorAll('[data-extra]').forEach(b=>{
    b.onclick=()=>{ const k=b.dataset.extra; L.extraOn[k]=!L.extraOn[k];
      b.setAttribute('aria-pressed',L.extraOn[k]); paint(L); redraw(L); };
  });
}
/* the legend alone. if focus was on a station button inside it, it goes back to the same one. */
function redraw(L){
  const box=L._body.querySelector('[data-legend]'), a=document.activeElement;
  const st=box.contains(a)&&a.dataset?a.dataset.st:null;
  box.innerHTML=L.legend();
  const f=st!=null&&box.querySelector(`[data-st="${st}"]`); if(f) f.focus();
}

function toggle(L){
  L.on=!L.on; L._row.dataset.on=L.on; L._sw.setAttribute('aria-pressed',L.on);
  if(L.on&&!L.open) setOpen(L,true);
  paint(L);
  link();
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
  /* an open station card follows the hour, without jumping back to its top */
  if(SEL.st!=null&&!SEL.lot){ const p=$('#readout'), t=p.scrollTop;
    p.innerHTML=stationHTML(stationProfile(SEL.st,SEL.hour)); p.scrollTop=t; }
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
        13,['case',['boolean',['feature-state','hover'],false],2.4,.35],
        17,['case',['boolean',['feature-state','hover'],false],2.4,1.1]]}});
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
    map.addSource('benches',{type:'geojson',data:{type:'FeatureCollection',features:BENCHES.map(b=>({
      type:'Feature',properties:{ft:b.ft, side:b.side, installed:b.installed||''},geometry:{type:'Point',coordinates:[b.lon,b.lat]}}))}});
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
    map.addSource('crashes',{type:'geojson',data:{type:'FeatureCollection',features:CRASH_STATS.drawn.map(p=>({
      type:'Feature',properties:{inj:p.inj},geometry:{type:'Point',coordinates:[p.lon,p.lat]}}))}});
    dot('crashDots','crashes',{'circle-color':'#14120F','circle-opacity':.6,'circle-stroke-color':'#FCFAF5','circle-stroke-width':1,
      'circle-radius':['interpolate',['linear'],['zoom'],13,['*',1.3,['sqrt',['get','inj']]],17,['*',4.4,['sqrt',['get','inj']]]]});
  }

  map.addSource('aves',{type:'geojson',data:{type:'FeatureCollection',features:AVES.map(([ft,name])=>({
    type:'Feature',properties:{name},geometry:{type:'Point',coordinates:at(ft)}}))}});
  map.addLayer({id:'aveLab',type:'symbol',source:'aves',slot:'top',
    layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,-1.5],'text-letter-spacing':.16,
      'text-font':['DIN Pro Medium','Arial Unicode MS Regular'],'text-transform':'uppercase'},
    paint:{'text-color':'#14120F','text-halo-color':'#FCFAF5','text-halo-width':2.2,'text-emissive-strength':1}});
  /* avenue names are not a layer, they are how the sheet is read. always on. */
  map.setLayoutProperty('aveLab','visibility','visible');

  wire(); LAYERS.forEach(paint); syncRuler();
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
  /* any spot on the map is a station. a lot under the click opens inside the same card. */
  map.on('click',e=>{
    const hit=map.getLayer('lotFill')?map.queryRenderedFeatures(e.point,{layers:['lotFill']}):[];
    const q=project(e.lngLat.lng,e.lngLat.lat);
    /* a click past the deepest drawn lot is off the sheet, not a place on the street */
    if(!hit.length&&q.off>REACH) return;
    select({st:q.ft, lot:hit.length?String(hit[0].properties.bbl):null});
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
      showTip(e,`<b>${f.who}</b><em>${f.side==='n'?'north':'south'} side, between ${f.from} and ${f.to}</em><span>${curbTerms(f)}</span>`);});
    map.on('mouseleave','curbLine',()=>tip.dataset.show='false');
  }
  if(map.getLayer('shedLine')){
    map.on('mousemove','shedLine',e=>{const x=SHED_BY_BBL.get(String(e.features[0].properties.bbl)); if(!x) return;
      showTip(e,`<b>${x.addr}</b><em>shed permit ${shedSays(x)}</em><span>a permit, not a sighting</span>`);});
    map.on('mouseleave','shedLine',()=>tip.dataset.show='false');
  }
  if(map.getLayer('crashDots')){
    map.on('mousemove','crashDots',e=>{const c=e.lngLat, p=CRASH_STATS.drawn.reduce((x,y)=>
        Math.hypot(y.lon-c.lng,y.lat-c.lat)<Math.hypot(x.lon-c.lng,x.lat-c.lat)?y:x);
      showTip(e,`<b>${commas(p.inj)} injured</b><em>${p.name?`at ${p.name}, `:''}${commas(p.ft)} ft</em><span>${commas(p.n)} crash${p.n===1?'':'es'} &middot; a count, not a rate</span>`);});
    map.on('mouseleave','crashDots',()=>tip.dataset.show='false');
  }
  map.on('move',syncRuler);
}

/* ── the station card ─────────────────────────────────────────────────── */
/* one selection, one place. st is feet from the west end, lot is a bbl or null, hour is the
   hour of day every timed figure is read at. it opens on the street's slowest hour. */
const HOUR_START=BUS_STATS?BUS_STATS.slowHour[0]:17;
const SEL={st:null, lot:null, hour:HOUR_START};
const AVE_FULL={Mad:'Madison',Lex:'Lexington'};
const aveShort=n=>AVE_FULL[n]||n;
const aveName=n=>aveShort(n)+' Avenue';
/* the numbered street an address names. a label only: the lot rule is frontage (METHODOLOGY 4) */
const streetNo=a=>((a||'').toUpperCase().replace(/\s+/g,' ').trim().replace(/\b(\d+)(ST|ND|RD|TH)\b/g,'$1').match(/^(?:[0-9][0-9A-Z-]* )?(?:EAST|WEST|E|W) (\d+) (?:STREET|ST)$/)||[])[1];
/* the lot row's figures, all from the drawn lots. on is the lots addressed on 42nd Street. */
const LOT_STATS=(()=>{ const P=LOTS.features.map(f=>f.properties), sum=l=>l.reduce((t,p)=>t+(p.unbuilt||0),0), lm=P.filter(p=>p.lm===1);
  return {all:P.length, room:P.filter(p=>p.unbuilt>0).length, on:P.filter(p=>streetNo(p.addr)==='42').length,
    lm:lm.length, unbuilt:sum(P), lmUnbuilt:sum(lm)}; })();
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
  +`police points within ${CRASH_META.near_ft} ft of the centreline, usually the nearest intersection. A count of people hurt, not a rate.`:'')
  +(BUS_STATS?` Bus: MTA Bus Route Segment Speeds, ${BUS_META.route}, weekdays in ${busMonth()}${srcDate('BUS')}. `
  +`A speed is the average over a whole leg between two timepoints, not a reading at this station. `
  +`A leg with a timepoint off 42nd Street is left out, so some stations have none.`:'');
const NOTE_LOT=`Unbuilt floor area is lot area &times; the base floor area ratio of the zoning district, minus `
  +`floor area built. Special district rules are not applied, and a landmarked lot may not be able `
  +`to use it. Lots: NYC MapPLUTO.`
  +(SHED_STATS?` Shed permits: DOB NOW: Build, Approved Permits${srcDate('SHEDS')}, read as of ${day(SHEDS_META.asof)}. `
  +`A permit is a record, not a sighting, and the length of a shed is not in it.`:'');
const note=t=>`<p class="note">${t} <a href="${METHOD}">Method</a></p>`;
/* the line runs on past the first and last avenue, so a station can have one on one side only */
const whereName=x=>x.west&&x.west===x.east?`At ${aveName(x.west)}`
  : !x.west?`West of ${aveName(x.east)}`
  : !x.east?`East of ${aveName(x.west)}`
  : `Between ${aveShort(x.west)} and ${aveName(x.east)}`;
const where=P=>whereName(between(P.ft));

/* a slider must always carry a value: with no station picked it reports the middle of the view */
function restSlider(){
  const r=$('#ruler');
  r.setAttribute('aria-valuenow',Math.round((VIEW[0]+VIEW[1])/2));
  r.setAttribute('aria-valuetext','No station picked');
}
let pin=null;
const STACKED=matchMedia('(max-width:899px)');   /* the same width style.css stacks the sheet at */
function select(next,boot){
  Object.assign(SEL,next);
  if(SEL.st!=null) SEL.st=Math.max(0,Math.min(LEN,Math.round(SEL.st)));
  if(SEL.lot&&!LOT_BY_BBL.has(SEL.lot)) SEL.lot=null;
  const open=SEL.st!=null;
  const panel=$('#readout'), mark=$('#rulerMark'), ruler=$('#ruler');
  panel.hidden=!open; mark.hidden=!open;
  if(open){
    const P=stationProfile(SEL.st,SEL.hour);
    mark.style.left=(share(SEL.st)*100)+'%';
    ruler.setAttribute('aria-valuenow',SEL.st);
    ruler.setAttribute('aria-valuetext',`${commas(SEL.st)} ft from the west end. ${where(P)}`);
    const lot=SEL.lot&&LOT_BY_BBL.get(SEL.lot);
    /* one short line is announced, not the whole card. walking the ruler already speaks
       through the slider, so it stays quiet then. */
    $('#said').textContent=document.activeElement===ruler?''
      : lot?`${lot.addr||'Unnamed lot'}. ${lot.owner||'owner not recorded'}.`
      : `Station ${commas(SEL.st)} ft. ${where(P)}.`;
    panel.innerHTML=lot?lotHTML(lot):stationHTML(P);
    /* the rail is taller than the window, and stacked the card sits below the ruler:
       either way it must be brought into view or it updates out of sight */
    panel.scrollTop=0;
    /* not on the boot call: the layout has not settled and the page lands past the card.
       wide, the card floats inside the map and is already in view. */
    if(!boot&&STACKED.matches) panel.scrollIntoView({block:'nearest'});
    if(MAP_OK){
      if(!pin) pin=new mapboxgl.Marker({element:el('div','pin'),anchor:'center'});
      pin.setLngLat(at(SEL.st)).addTo(map);
      if(!boot) clearPin();
    }
  } else {
    panel.innerHTML=''; $('#said').textContent=''; restSlider();
    if(pin) pin.remove();
  }
  printMark();
  link();
}
/* the view is a link: ?st=4000 opens this card, &lot= opens the lot inside it, &hr=17 is the
   hour, &q=benches is the open row, &on=lots,trees is what is drawn. hr is written whenever the
   hour shows: bus drawn, bus row open, or the hour moved. on is written once the drawn set or
   the open row has moved from how the sheet starts, and always beside hr, so hr alone stays
   the hand-typed short form that also switches the bus on.
   &by=lots.capacity is what a row is coloured by, written only once it has moved. */
function link(){
  const q=new URLSearchParams(location.search), open=SEL.st!=null;
  open?q.set('st',SEL.st):q.delete('st');
  SEL.lot&&open?q.set('lot',SEL.lot):q.delete('lot');
  const bus=row('bus'), timed=!!bus&&(bus.on||bus.open||SEL.hour!==HOUR_START);
  timed?q.set('hr',SEL.hour):q.delete('hr');
  const o=LAYERS.find(L=>L.open), on=LAYERS.filter(L=>L.on).map(L=>L.id).join(',');
  o?q.set('q',o.id):q.delete('q');
  o||timed||on!==ON_START?q.set('on',on):q.delete('on');
  const by=LAYERS.filter(L=>L.styles&&L.style!==BY_START.get(L.id)).map(L=>L.id+'.'+L.style).join(',');
  by?q.set('by',by):q.delete('by');
  /* commas are legal in a query, and a link that is printed is read by eye */
  const qs=q.toString().replace(/%2C/g,',');
  try{ history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash); }catch(e){}
  printFoot();
}

function stationHTML(P){
  const parts=[['n',P.north,'North walk'],['r',P.road&&P.road.w,'Roadway'],['s',P.south,'South walk']];
  const whole=parts.every(x=>x[1]!=null);
  const said=parts.map(([,v,t])=>`${t} ${feet(v)}`).join(', ');
  /* flags come from the record: the lot's own address and whether it is the largest listed here */
  const tags=p=>{const t=[];
    if(P.biggest&&p.bbl===P.biggest.bbl) t.push('largest lot here');
    if(p.addr&&streetNo(p.addr)!=='42') t.push('not a 42 Street address');
    const shed=SHED_BY_BBL.get(String(p.bbl)); if(shed) t.push('shed permit '+shedSays(shed));
    return t.length?`<span class="num">${t.join(' &middot; ')}</span>`:'';};
  const none=parts.every(x=>x[1]==null);
  /* a lot the rule took out that fronts here is named, so a gap is not read as a data hole */
  const outList=out=>out.map(p=>`<p class="none">${p.addr} is the nearest lot here. It is outside the lot set because ${p.why}, and the set takes lots within ${window.LOTS_META.front_ft} ft. <a href="${METHOD}#4-the-lot-rule-frontage">Method</a></p>`).join('');
  const lotList=(side,list,out)=>`<h4 class="micro">${side} side &middot; ${list.length} lot${list.length===1?'':'s'}</h4>`
    +(list.length?`<ul class="lotrows">${list.map(p=>
      `<li><button type="button" data-lot="${p.bbl}">`
      +`<b>${p.addr||'Unnamed lot'}</b><span>${p.owner||'owner not recorded'}</span>`
      +`<span class="num">${commas(p.unbuilt)} sq ft unbuilt${p.lm===1?' &middot; landmark':''}</span>`
      +tags(p)
      +`</button></li>`).join('')}</ul>`
    :`<p class="none">No drawn lot fronts this side here.</p>`)+outList(out);
  return `<div class="card__top"><span class="micro">Station</span>`
    +`<button class="mini" type="button" data-close>close</button></div>`
   +`<h3>${where(P)}</h3>`
   +`<span class="micro">${commas(P.ft)} ft from the west end`
   +(P.at?'':` &middot; `+[P.west&&`${commas(P.ft-P.west.ft)} ft past ${aveShort(P.west.name)}`, P.east&&`${commas(P.east.ft-P.ft)} ft to ${aveShort(P.east.name)}`].filter(Boolean).join(', '))+`</span>`
   /* flex-grow is the width in feet, so the bar is to scale by construction */
   +`<div class="xsec${none?' xsec--none':''}" role="img" aria-label="Cross-section. ${said}.">${parts.map(([k,v])=>
      v!=null?`<i class="xsec__${k}" style="flex:${v} 1 0"></i>`:`<i class="xsec__gap"></i>`).join('')}</div>`
   +`<div class="xsec__lab"><span class="micro">north</span>`
   +`<span class="micro">${whole?'drawn to scale':none?'not measured here':'measured parts to scale'}</span><span class="micro">south</span></div>`
   +`<dl>`
   +`<div><dt><i class="key-n"></i>North walk</dt><dd>${feet(P.north)}</dd></div>`
   +`<div><dt><i class="key-r"></i>Roadway</dt><dd>${P.road?`${P.road.w} ft &middot; ${P.road.lanes} moving + ${P.road.park} parked`:feet(null)}</dd></div>`
   +`<div><dt><i class="key-n"></i>South walk</dt><dd>${feet(P.south)}</dd></div>`
   +`<div><dt>Trees within ${TREE_REACH} ft</dt><dd>${P.trees.all}${P.trees.all?`<span>${P.trees.n} north, ${P.trees.s} south</span>`:''}</dd></div>`
   +`<div><dt>Nearest DOT bench</dt><dd>${P.bench?`${away(P.bench)}<span>${P.bench.side==='n'?'north':'south'} side, ${block(P.bench)}`
     +`${P.bench.installed?`, installed ${day(P.bench.installed)}`:''}</span>`:'no DOT bench recorded on the street'}</dd></div>`
   +(P.bus?`<div><dt>M42 bus here, ${hourSpan(P.bus.hour)}</dt><dd>${[P.bus.e,P.bus.w].some(Boolean)?[P.bus.e,P.bus.w].filter(Boolean).map(r=>
       `${r.mph!=null?r.mph.toFixed(2)+' mph':'no buses measured'} ${DIRS[r.dir]}<span>whole leg, ${legName(r)}, ${commas(r.b-r.a)} ft</span>`).join('')
       :'no M42 speed kept here'}</dd></div>`:'')
   +(P.curb?`<div><dt>Metered curb here</dt><dd>${[['north',P.curb.n],['south',P.curb.s]].map(([k,f])=>
       `<span>${k}: ${f?`${f.who.toLowerCase()}, ${(f.com||f.all).hours}`:'no meter'}</span>`).join('')}</dd></div>`:'')
   +(P.crashes?`<div><dt>Nearest crash place</dt><dd>${(c=>c?`${commas(c.inj)} injured<span>in ${commas(c.n)} crash${c.n===1?'':'es'}${c.name?` at ${c.name}`:''}, ${away(c)}, ${day(CRASH_META.since)} to ${day(CRASH_META.to)}, a count, not a rate</span>`
       :`none within ${P.crashes.reach} ft`)(P.crashes.place)}</dd></div>`:'')
   +(TIER_STATS?`<div><dt>DOT pedestrian priority tier</dt><dd>${P.tier?`${P.tier.name}<span>tier ${P.tier.rank} of ${TIER_META.length}, a planning rank, not a count</span>`:'no tier in the source here'}</dd></div>`:'')
   +(P.count?`<div><dt>Pedestrians counted</dt><dd>${commas(P.count.pm)}<span>${span(P.count.win)}, one day in ${day(P.count.p)}, counter ${away(P.count)}, ${block(P.count)}</span></dd></div>`:'')
   +`</dl>`+note(NOTE_WALK)
   +lotList('North',P.lots.n,P.outside.n)+lotList('South',P.lots.s,P.outside.s)
   +(P.lots.n.length+P.lots.s.length?note(NOTE_LOT):'');
}

function lotHTML(p){
  const used=p.allowed>0?Math.min(100,p.built/p.allowed*100):0;
  return `<div class="card__top"><button class="mini" type="button" data-back>&larr; station ${commas(SEL.st)} ft</button>`
    +`<button class="mini" type="button" data-close>close</button></div>`
   +`<span class="micro">${p.side==='n'?'North side':'South side'} &middot; ${p.year||'year unknown'}</span>`
   +`<h3>${p.addr||'Unnamed lot'}</h3>`
   +`<span class="zonechip" style="background:${ZONE[p.zone]||'#B9B1A1'}">${p.zone||'no district'}</span>`
   +`<div class="gauge"><i style="width:${used}%"></i></div>`
   +`<div class="gauge__lab"><span class="micro">built ${p.built}&times;</span><span class="micro">allowed ${p.allowed}&times;</span></div>`
   +`<dl>`
   +`<div><dt>Owner</dt><dd>${p.owner||'not recorded'}</dd></div>`
   +`<div><dt>Lot area</dt><dd>${commas(p.lotarea)} sq ft</dd></div>`
   +`<div><dt>Floors</dt><dd>${p.floors||'not recorded'}</dd></div>`
   +`<div><dt>Unbuilt floor area</dt><dd>${commas(p.unbuilt)} sq ft</dd></div>`
   +(p.lm===1?`<div><dt>Landmark</dt><dd>protected</dd></div>`:'')
   +`</dl>`+note(NOTE_LOT);
}

/* one delegated handler for the whole card, bound once */
$('#readout').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const from=SEL.lot;
  if(b.dataset.lot) select({lot:b.dataset.lot});
  else if('back' in b.dataset) select({lot:null});
  else if('close' in b.dataset){ closeCard(); return; }
  /* the pressed button is gone after a re-render: back returns to the lot's own row,
     anything else to the first button left */
  const f=('back' in b.dataset&&from&&$(`#readout [data-lot="${from}"]`))||$('#readout button');
  if(f) f.focus();
});
/* the floating card never sits on the station it describes. when the pin would fall under the
   card, the map is moved so the station stands in the middle of the part the card leaves open. */
const PIN_ROOM=24;   /* px kept between the pin and the card's edge */
function clearPin(){
  if(!MAP_OK||STACKED.matches||SEL.st==null) return;
  requestAnimationFrame(()=>{ if(SEL.st==null) return;
    const c=$('#readout').getBoundingClientRect(), m=map.getContainer().getBoundingClientRect(), p=map.project(at(SEL.st));
    if(!c.width||m.left+p.x<c.left-PIN_ROOM||m.top+p.y<c.top-PIN_ROOM) return;
    userMoved=true;
    map.easeTo({center:at(SEL.st), offset:[-(m.right-c.left)/2,0], bearing:BEARING, duration:300}); });
}
/* wide, the card floats inside the map's box. style.css is told where that box sits in the sheet
   and how far down the zoom control comes, so the card never covers the control or the first screen. */
function placeCard(){
  const sheet=$('.sheet'), m=$('#map'); if(!sheet||!m) return;
  const S=sheet.getBoundingClientRect(), M=m.getBoundingClientRect();
  const ctl=m.querySelector('.mapboxgl-ctrl-top-right .mapboxgl-ctrl-group');
  const px=(k,v)=>sheet.style.setProperty(k,Math.max(0,Math.round(v))+'px');
  px('--map-top',M.top-S.top); px('--map-bot',S.bottom-M.bottom);
  px('--map-clear',ctl?ctl.getBoundingClientRect().bottom-M.top:0);
}
if(window.ResizeObserver){ const ro=new ResizeObserver(placeCard); ro.observe($('#map')); ro.observe($('.sheet')); }
addEventListener('resize',placeCard); placeCard();
/* narrow, the title block keeps the title and the subject line: the meta list goes to the foot of
   the page. the node is moved, so reading order is what is seen. paper always has it in the title block. */
const NARROW_HEAD=matchMedia('(max-width:620px)');
function placeMeta(){ const meta=$('#headMeta');
  if(NARROW_HEAD.matches&&!PRINTING) $('#pageFoot').append(meta); else $('.head__tools').before(meta); }
NARROW_HEAD.addEventListener('change',placeMeta);
function closeCard(){ select({st:null,lot:null}); $('#ruler').focus(); }
/* Escape in the card shuts the card only. stopped here, or the first screen's handler shuts that too and takes the focus. */
$('#readout').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); closeCard(); } });

/* ── ruler ────────────────────────────────────────────────────────────── */
const NS='http://www.w3.org/2000/svg';
/* the evidence the ruler carries, top to bottom. each band has a caption and a bar drawn to the
   street's own scale. keep is the order bands are held on to when the ruler runs out of height:
   it shows fewer bands, never smaller type. wide marks a band left off a narrow ruler. bar is
   the bar's height. joins lets a band's caption share the line of the band above when both fit.
   ink and the colours already on the sheet, nothing new. */
const RULER_MAX=128, RULER_MAX_SHORT=96, SHORT_WINDOW=720;   /* px. the ruler's ceiling, and on a window under 720px high */
const RULER_KEEP=2;   /* the DOT tier and the bus are drawn whatever the height comes to */
/* colours are read from the tokens in style.css, so the sheet has one source for them */
const token=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const INK=token('--ink'), PAPER=token('--paper'), LABEL=token('--ink-label'), LEAF=token('--leaf'), ALARM=token('--alarm');
/* four ink strengths, strongest first, and the lowest tier an outline. every bar is ruled in
   ink, as the bus bars are, so a pale tier still stands off the ruler. */
const TIER_INK={1:'--ink-70',2:'--ink-30',3:'--hair-2',4:'--hair'};
const tierFill=rank=>({fill:TIER_INK[rank]?token(TIER_INK[rank]):'none',stroke:INK,'stroke-width':.6});
const blankLine=(add,X,a,b,y)=>add('line',{x1:X(a),x2:X(b),y1:y,y2:y,stroke:INK,'stroke-opacity':.5,'stroke-width':.8,'stroke-dasharray':'2 3'});
const RULER_BANDS=[
  { id:'tier', has:!!TIER_STATS, keep:1,
    /* a tier is the plan's rank for a segment. the caption never calls it demand or a count. */
    caption:()=>[t=>`${t.tier}, tier ${t.rank} of ${TIER_META.length}`, t=>`${t.rank} ${t.tier}`].map(say=>
      [{t:'DOT pedestrian priority tier'}, ...TIER_STATS.on.map(t=>({sw:tierFill(t.rank), t:say(t)}))]),
    draw(add,X,y,h){
      TIER_STATS.runs.forEach(([a,b,rank])=>add('rect',{x:X(a)+.5,y,width:Math.max(1,X(b)-X(a)-1),height:h,...tierFill(rank)}));
      TIER_STATS.blank.forEach(([a,b])=>blankLine(add,X,a,b,y+h/2)); } },
  { id:'bus', has:!!BUS_STATS, keep:2, bar:10,
    /* every stop of the ramp is keyed, and the name says a speed is a leg's average, so the band
       reads with the bus row shut */
    caption:()=>{ const R=BUS_RAMP, n=R.length-1, bar=c=>({fill:c,stroke:INK,'stroke-width':.6}),
        name=long=>({t:`${BUS_META.route} bus, ${long?'average speed over each leg':'speed by leg'}, ${hourSpan(SEL.hour)}`}),
        key=unit=>R.map(([v,c],i)=>({sw:bar(c), t:`${v}${unit||i===0||i===n?' mph':''}${i===0?' or less':i===n?' and over':''}`}));
      return [[name(1),...key(1),{t:'westbound above, eastbound below'}],[name(1),...key(0)],[name(0),...key(0)]]; },
    /* either side of the band as on the street. one bar per leg at true length. where no leg is
       kept, a dashed blank. */
    draw(add,X,y,h){ const Y={W:y,E:y+h/2+1}, bh=h/2-1;
      BUS.filter(r=>r.h===SEL.hour).forEach(r=>add('rect',{x:X(r.a)+.5,y:Y[r.dir],width:Math.max(1,X(r.b)-X(r.a)-1),height:bh,
        fill:r.mph!=null?busColour(r.mph):'none',stroke:INK,'stroke-width':.6}));
      Object.entries(BUS_STATS.blank).forEach(([d,list])=>list.forEach(([a,b])=>blankLine(add,X,a,b,Y[d]+bh/2))); } },
  { id:'trees', has:TREES.length>0, wide:true, keep:4,
    caption:()=>[[{sw:{fill:LEAF,'fill-opacity':.9}, t:'Street trees'},{sw:{fill:ALARM,'fill-opacity':.45}, t:`over ${TREE_GAP_MIN} ft with none`}]],
    draw(add,X,y,h){
      TREE_GAPS.forEach(([a,b])=>add('rect',{x:X(a),y,width:X(b)-X(a),height:h,fill:ALARM,'fill-opacity':.45}));
      TREES.forEach(t=>add('rect',{x:X(t.ft),y,width:1,height:h,fill:LEAF,'fill-opacity':.9})); } },
  { id:'marks', has:!!(BENCH_STATS||PED_STATS||SHED_STATS), keep:3, joins:true,
    /* each bench solid, the counter a ring, as on the map. a building with a shed permit in
       force is a narrow bar at its station, never a length: narrow so it clears the counter's ring */
    caption:()=>[[...(SHED_STATS?[{sw:{fill:INK}, t:`shed permit in force, ${SHED_STATS.live.length} building${SHED_STATS.live.length===1?'':'s'}`}]:[]),
      ...(BENCH_STATS?[{dot:{fill:INK}, t:`DOT bench${BENCHES.length===1?'':'es'}`}]:[]),
      ...(PED_STATS?[{dot:{fill:PAPER,stroke:INK,'stroke-width':1.5}, ring:true, t:'DOT pedestrian counter'}]:[])]],
    draw(add,X,y,h){ const cy=y+h/2;
      add('line',{x1:X(0),x2:X(LEN),y1:cy,y2:cy,stroke:INK,'stroke-opacity':.13,'stroke-width':1});
      if(SHED_STATS) SHED_STATS.live.forEach(x=>add('rect',{x:X(x.ft)-1.5,y,width:3,height:h,fill:INK}));
      if(BENCH_STATS) BENCHES.forEach(b=>add('circle',{cx:X(b.ft),cy,r:3,fill:INK}));
      if(PED_STATS) add('circle',{cx:X(PED.ft),cy,r:4,fill:PAPER,stroke:INK,'stroke-width':1.5}); } }
];

/* drawn to the ruler's own width, or to a width handed in when the sheet is about to print */
function buildRuler(force){
  const host=$('#ruler'), svg=$('#rulerSvg');
  /* the street's ends sit where the fitted map draws them. paper keeps the screen's shares. */
  const SCREEN=Math.max(320,Math.round(host.clientWidth||960)), W=force>0?force:SCREEN;
  const fit=streetFit(SCREEN); SCALE={lo:fit.lo,hi:fit.hi};
  const X=ft=>share(ft)*W;
  svg.innerHTML='';
  const add=(n,a)=>{const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); svg.appendChild(e); return e;};
  const MONO='ui-monospace,SFMono-Regular,Menlo,monospace';
  /* measure for real. an advance-width estimate was close enough on a wide screen
     and let "GRAND CENTRAL" run off the right edge on a phone. */
  const label=(txt,px,tracking)=>{
    const t=document.createElementNS(NS,'text');
    t.setAttribute('font-family',MONO); t.setAttribute('font-size',px);
    if(tracking) t.setAttribute('letter-spacing',tracking);
    t.textContent=txt; svg.appendChild(t);
    let w=0; try{ w=t.getComputedTextLength(); }catch(e){ w=txt.length*px*.66; }
    if(!w) w=txt.length*px*.66;
    return {node:t, w};
  };
  /* the height one line of label really takes here. a reader's minimum font size can make it
     taller than asked for, and every row below is set out from it. */
  const PX=11, LH=(()=>{ const {node}=label('Xg',PX); let h=0; try{ h=node.getBBox().height; }catch(e){}
    node.remove(); return Math.ceil(Math.max(h,PX*1.2)); })();
  const BAR=8, GAP=3, PAD=1;   /* PAD keeps a descender off the bar under it */
  /* a narrow ruler shows fewer bands rather than smaller ones */
  const NARROW=W<620;
  let bands=RULER_BANDS.filter(B=>B.has&&!(NARROW&&B.wide));
  /* a caption is a run of parts, left to right: words, with a swatch, dot or ring before them
     when they are a key. a band offers its caption long and then shorter, and the first that
     fits the ruler on one line is drawn. if none fits, the shortest is wrapped onto more lines
     and the ruler grows, so a key is never dropped or left half said. */
  const MARK=15, SEP=12;
  const sized=parts=>parts.map(p=>{ const {node,w}=label(p.t,PX); node.remove(); return {...p,w:(p.sw||p.dot?MARK:0)+w}; });
  const wide=f=>f.reduce((x,p)=>x+p.w+SEP,4-SEP);
  const lines=forms=>{
    const all=forms.map(sized), one=all.find(f=>wide(f)<=W-4);
    if(one) return [one];
    const out=[[]]; let x=4;
    all[all.length-1].forEach(p=>{ const row=out[out.length-1];
      if(row.length&&x+p.w>W-4){ out.push([p]); x=4+p.w+SEP; } else { row.push(p); x+=p.w+SEP; } });
    return out;
  };
  const caption=(rows,y)=>rows.forEach((parts,k)=>{
    let x=4; const top=y+k*LH, mid=top+LH/2;
    parts.forEach(p=>{
      if(p.gap){ x+=p.gap; return; }
      const {node}=label(p.t,PX), mark=p.sw||p.dot?MARK:0;
      if(p.sw) add('rect',{x,y:mid-4,width:10,height:8,...p.sw});
      if(p.dot) add('circle',{cx:x+5,cy:mid,r:p.ring?4:3,...p.dot});
      node.setAttribute('x',x+mark); node.setAttribute('y',top+LH-3); node.setAttribute('fill',LABEL);
      x+=p.w+SEP;
    });
  });
  /* rows from the top: hub names, then a caption and a bar per band, then the axis and avenues.
     a band that joins has no caption row of its own: its key runs on in the line above, and its
     bar sits under that band's bar. */
  const top=NARROW?4:LH+1;
  const layout=list=>{ let y=top; const set=[];
    list.forEach(B=>{ const rows=lines(B.caption()), h=B.bar||BAR, last=set[set.length-1];
      if(B.joins&&last&&rows.length===1&&last.rows.length===1&&wide(last.rows[0])+2*SEP+wide(rows[0])<=W-4){
        last.rows[0]=[...last.rows[0],{gap:SEP},...rows[0]]; y-=GAP-2;
        set.push({B,rows:[],bar:y,h}); y+=h+GAP; return; }
      set.push({B,rows,y,bar:y+rows.length*LH+PAD,h}); y+=rows.length*LH+PAD+h+GAP; });
    const axis=y+3; return {set,axis,H:axis+5+LH+1}; };
  /* over the ceiling, the band held least goes, down to the ones always drawn */
  const ceiling=!force&&innerHeight<SHORT_WINDOW?RULER_MAX_SHORT:RULER_MAX;
  let laid=layout(bands);
  while(laid.H>ceiling&&bands.length>RULER_KEEP){
    const drop=bands.reduce((x,B)=>B.keep>x.keep?B:x); bands=bands.filter(B=>B!==drop); laid=layout(bands); }
  const {set,axis,H}=laid;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`); host.style.height=H+'px';
  /* the station mark is ruled through the bars and the axis only, never through a caption */
  const inked=[...set.map(({bar,h})=>[bar-1,bar+h+1]),[axis-5,axis+5]];
  host.style.setProperty('--mark-dot',(axis-4)+'px');   /* its dot rides the axis, clear of the hub names */
  host.style.setProperty('--mark-rule',`linear-gradient(to bottom,${inked.map(([a,b])=>
    `transparent ${a}px,currentColor ${a}px,currentColor ${b}px,transparent ${b}px`).join(',')})`);

  /* the four hubs, shaded. label only where it genuinely fits inside its own band. */
  /* Below ~620px the four hub bands are each a few pixels wide and their names
     cannot be placed without crowding or clipping. Draw the shading, drop the
     names: the bands still read as the four busy stretches. */
  let hubRight=-1e9;
  HUBS.forEach(([a,b,name])=>{
    const x=X(a), w=X(b)-X(a);
    add('rect',{x,y:0,width:w,height:H,fill:INK,'fill-opacity':.06});
    if(NARROW) return;
    const {node,w:tw}=label(name.toUpperCase(),PX,.4);
    const half=tw/2, cx=Math.min(Math.max(x+w/2,half+3),W-half-3);
    if(tw<=W-6 && cx-half > hubRight+8){
      node.setAttribute('x',cx); node.setAttribute('y',top-3);
      node.setAttribute('text-anchor','middle'); node.setAttribute('fill','rgba(20,18,15,.5)');
      hubRight=cx+half;
    } else node.remove();
  });

  set.forEach(({B,rows,y,bar,h})=>{ caption(rows,y); B.draw(add,X,bar,h); });

  add('line',{x1:0,x2:W,y1:axis,y2:axis,stroke:INK,'stroke-opacity':.3,'stroke-width':.8});
  /* avenues, decluttered left to right: a label is drawn only if it clears the
     last one drawn, so nothing ever collides no matter how narrow the window */
  let lastRight=-1e9;
  AVES.forEach(([ft,name])=>{
    const x=X(ft);
    add('line',{x1:x,x2:x,y1:axis-4,y2:axis+4,stroke:INK,'stroke-opacity':.35,'stroke-width':.8});
    const {node,w:tw}=label(name,PX);
    const half=tw/2;
    let tx=x, anchor='middle';
    /* the end labels stand in from the edge, clear of the view window's border */
    if(x-half<6){ tx=6; anchor='start'; }
    else if(x+half>W-6){ tx=W-6; anchor='end'; }
    const left = anchor==='start' ? tx : anchor==='end' ? tx-tw : x-half;
    if(left > lastRight+7){
      node.setAttribute('x',tx); node.setAttribute('y',axis+5+LH-3);
      node.setAttribute('text-anchor',anchor); node.setAttribute('fill',LABEL);
      lastRight=left+tw;
    } else node.remove();
  });
  /* Final guarantee. Font metrics vary by machine, so rather than trust any
     placement calculation, measure what actually got drawn and drop anything that
     sticks out of the box. A missing label is fine; a label sliced in half by the
     edge of the ruler looks broken. */
  [...svg.querySelectorAll('text')].forEach(t=>{
    let bb; try{ bb=t.getBBox(); }catch(e){ return; }
    if(bb.width && (bb.x < 1 || bb.x + bb.width > W - 1)) t.remove();
  });
  RULER_GEO={W,inked,axis}; printMark();
  /* the scale may have moved with the width: the mark and the window follow it */
  if(SEL.st!=null) $('#rulerMark').style.left=(share(SEL.st)*100)+'%';
  try{ syncRuler(); }catch(e){}
}
/* the station mark again, inside the drawing, shown only in print. paper scales the svg whole,
   and the mark on screen is ruled in screen px, so it would not land on the bars. */
let RULER_GEO=null;
function printMark(){
  const svg=$('#rulerSvg'); svg.querySelectorAll('.pmark').forEach(n=>n.remove());
  if(SEL.st==null||!RULER_GEO) return;
  const {W,inked,axis}=RULER_GEO, x=share(SEL.st)*W;
  const add=(n,a)=>{const e=document.createElementNS(NS,n); e.setAttribute('class','pmark');
    for(const k in a) e.setAttribute(k,a[k]); svg.appendChild(e);};
  inked.forEach(([a,b])=>add('line',{x1:x,x2:x,y1:a,y2:b,stroke:INK,'stroke-width':1.5}));
  add('circle',{cx:x,cy:axis,r:4,fill:INK});
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
  const win=$('#rulerWin'), edge=ft=>Math.max(0,Math.min(1,share(ft)));
  win.style.left=(edge(a)*100)+'%';
  win.style.width=Math.max(.5,(edge(c)-edge(a))*100)+'%';
  const mid=(lo+hi)/2, ave=AVES.reduce((x,y)=>Math.abs(y[0]-mid)<Math.abs(x[0]-mid)?y:x);
  /* says it is the map, so it is not read as the place of the open station card */
  $('#rulerMid').textContent = 'map view '+(mid<120?'at the Hudson' : mid>LEN-120?'at the East River'
    : `near ${aveName(ave[1])} · ${commas(mid)} ft from the Hudson`);
}
let VIEW=[0,LEN];
(function drag(){
  const r=$('#ruler'); let down=false,cap=false,sx=0;
  const ftAt=e=>{const box=r.getBoundingClientRect();
    return Math.max(0,Math.min(LEN,((e.clientX-box.left)/box.width-SCALE.lo)/(SCALE.hi-SCALE.lo)*LEN));};
  const go=e=>{ userMoved=true; map.easeTo({center:at(ftAt(e)),duration:down&&cap?0:600,bearing:BEARING}); };
  r.addEventListener('pointerdown',e=>{down=true;cap=false;sx=e.clientX;go(e);});
  r.addEventListener('pointermove',e=>{ if(!down) return;
    if(!cap&&Math.abs(e.clientX-sx)>4){cap=true; try{r.setPointerCapture(e.pointerId);}catch(err){}}
    if(cap) go(e);});
  /* a press that never became a drag is a pick: stand at that station */
  r.addEventListener('pointerup',e=>{ if(down&&!cap) select({st:ftAt(e),lot:null}); });
  addEventListener('pointerup',()=>down=false);
  /* arrows walk the street 100 ft at a time and the card follows */
  const STEP=100;
  r.addEventListener('keydown',e=>{
    const from=SEL.st!=null?SEL.st:Math.round((VIEW[0]+VIEW[1])/2/STEP)*STEP;
    const to={ArrowRight:from+STEP,ArrowUp:from+STEP,ArrowLeft:from-STEP,ArrowDown:from-STEP,
      Home:0,End:LEN,Enter:from,' ':from}[e.key];
    if(e.key==='Escape'&&SEL.st!=null){ select({st:null,lot:null}); return; }
    if(to===undefined) return;
    e.preventDefault(); select({st:to,lot:null});
    if(SEL.st<VIEW[0]||SEL.st>VIEW[1]){ userMoved=true; map.easeTo({center:at(SEL.st),duration:300,bearing:BEARING}); }
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
  const words=el('span','mono'); words.textContent=basemapCredit(); credit.append(words);
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
  const base=basemapCredit(); $('#printBaseText').textContent=base; $('#printBase').hidden=!base;
}
/* the ruler is set out for the sheet's width, then scaled */
addEventListener('beforeprint',()=>{ PRINTING=true; placeMeta(); snapshot(); printFoot(); buildRuler(PRINT_W); });
addEventListener('afterprint',()=>{ PRINTING=false; placeMeta(); buildRuler(); refit(); });
(()=>{ /* the button's own words change, so the confirmation is never colour alone */
  const b=$('#copyLink'), REST=b.textContent; let t;
  /* as wide as its longest label, measured as drawn, so the tools do not shift when it answers */
  b.style.minWidth=Math.ceil(Math.max(...[REST,'Link copied','Not copied'].map(w=>{ b.textContent=w; return b.getBoundingClientRect().width; })))+'px';
  b.textContent=REST;
  /* the live region is shared: it is cleared only if nothing else has spoken since */
  const say=(label,msg)=>{ const said=$('#said'); b.textContent=label; said.textContent=msg; clearTimeout(t);
    t=setTimeout(()=>{ b.textContent=REST; if(said.textContent===msg) said.textContent=''; },2400); };
  const ok=()=>say('Link copied','Link to this view copied.'), no=()=>say('Not copied','Could not copy. The link is in the address bar.');
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
  const dev=$('#devline'); if(dev) dev.hidden=false;
  fetch('scripts.js',{method:'HEAD'}).then(r=>{
    const d=r.headers.get('last-modified');
    el.textContent = d ? 'built '+new Date(d).toISOString().slice(0,16).replace('T',' ') : 'build unknown';
  }).catch(()=>{ el.textContent='build unknown'; });
})();
$('#metaExtent').textContent=`Hudson to East River, ${(LEN/5280).toFixed(2)} mi`;
$('#metaLots').textContent=LOTS.features.length+' lots';
$('#metaTrees').textContent=TREES.length+' trees';
$('#ruler').setAttribute('aria-valuemax',LEN);
(()=>{ /* ?on=lots,trees is exactly what is drawn. ?hr=17 sets the hour. in a hand-typed link
     with no on, hr also draws the bus and opens its row, and ?q=benches draws the row it opens. */
  const qs=new URLSearchParams(location.search), v=parseInt(qs.get('hr'),10);
  const timed=BUS_STATS&&v>=0&&v<=23, want=row(qs.get('q'))||(timed&&!qs.has('on')?row('bus'):null);
  if(qs.has('on')){ const ids=qs.get('on').split(','); LAYERS.forEach(L=>{ L.on=ids.includes(L.id); }); }
  if(timed){ SEL.hour=v; if(!qs.has('on')) row('bus').on=true; }
  if(want){ LAYERS.forEach(L=>{ L.open=L===want; }); if(!qs.has('on')) want.on=true; }
  /* ?by=lots.capacity. a style the row does not offer is ignored. */
  (qs.get('by')||'').split(',').forEach(x=>{ const [id,v]=x.split('.'), L=row(id);
    if(L&&L.styles&&L.styles.some(o=>o[0]===v)) L.style=v; });
})();
placeMeta(); buildPanel(); buildRuler();
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
    rail.scrollTop+=L._row.getBoundingClientRect().top-rail.getBoundingClientRect().top; });
  if(document.readyState==='complete') go(); else addEventListener('load',go,{once:true});
})();
(()=>{ /* ?st=4000 opens the card at 4,000 ft. ?lot=<bbl> alone stands at that lot. */
  const q=new URLSearchParams(location.search), lot=q.get('lot');
  const p=lot&&LOT_BY_BBL.get(lot), k=p&&LOT_BAND.get(p.bbl);
  let st=q.has('st')?parseFloat(q.get('st')):NaN;
  /* a hand-edited link can name a lot and a station that are nowhere near each other */
  if(p&&!(st>=k.a&&st<=k.b)) st=p.ft>=k.a&&p.ft<=k.b?p.ft:(k.a+k.b)/2;
  if(Number.isFinite(st)) select({st, lot:p?lot:null},true); else restSlider();
  /* stacked, the card sits under the map: once the layout has settled, put the ruler at the
     top so the mark and the card share the first screen */
  if(Number.isFinite(st)&&STACKED.matches){
    const go=()=>requestAnimationFrame(()=>$('#ruler').scrollIntoView({block:'start'}));
    if(document.readyState==='complete') go(); else addEventListener('load',go,{once:true});
  }
})();
map.on('error',e=>console.warn('map:',e&&e.error&&e.error.message));
})();
