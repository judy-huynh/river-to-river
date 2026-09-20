/* ═══════════════════════════════════════════════════════════════════════
   42nd STREET · STATION LOOKUPS
   Pure functions over the baked globals in data.js. No DOM, no map.
   In node: global.window={}; require('./data.js'); require('./station.js')
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const LINE=window.LINE42, LOTS=window.LOTS_POLY, TREES=window.TREES, ROAD=window.ROAD;
const SW=window.SIDEWALK||[];
const BENCHES=window.BENCHES||[], PED=window.PED_COUNT||null, BUS=window.BUS||[];
const TIER=window.PED_TIER||[];
const CURB=window.CURB||[], SHEDS=window.SHEDS||[], CRASHES=window.CRASHES||[];
const LEN=LINE[LINE.length-1][0];
/* where each cross street meets the line, baked from the city centerline. AVES is the ticked
   avenues as [station, label, west edge, east edge]; nothing here is typed */
const CROSS=window.AVES||[];
const AVES=CROSS.filter(v=>v.label).map(v=>[v.ft,v.label,v.a,v.b]);

/* true perpendicular projection onto LINE42. same maths as scripts/bake/station.py,
   so a map click stations exactly the way a baked record does. */
const KY=364000, KX=KY*Math.cos(LINE.reduce((t,v)=>t+v[2],0)/LINE.length*Math.PI/180);
const XY=LINE.map(v=>[v[1]*KX,v[2]*KY]);
function project(lon,lat){
  const px=lon*KX, py=lat*KY; let best=null;
  for(let i=0;i<XY.length-1;i++){
    const [ax,ay]=XY[i], [bx,by]=XY[i+1], dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy;
    if(!L2) continue;
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L2));
    const d=Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
    if(!best||d<best.off) best={ft:LINE[i][0]+t*(LINE[i+1][0]-LINE[i][0]), off:d};
  }
  return best;
}
/* each lot's boundary in street terms: every vertex as [station, offset]. a and b are the
   lot's extent along the street, off and far its nearest and farthest reach from it. */
const FRONT_TOL=15;
const LOT_EDGE=new Map(), LOT_BAND=new Map();
LOTS.features.forEach(f=>{
  const rings=f.geometry.type==='Polygon'?[f.geometry.coordinates[0]]:f.geometry.coordinates.map(g=>g[0]);
  const q=rings.map(r=>r.map(c=>project(c[0],c[1])));
  const v=q.flat(), fts=v.map(x=>x.ft), offs=v.map(x=>x.off);
  LOT_EDGE.set(f.properties.bbl,q);
  LOT_BAND.set(f.properties.bbl,{a:Math.min(...fts), b:Math.max(...fts), off:Math.min(...offs), far:Math.max(...offs)});
});
/* how far out the lot's boundary first crosses the perpendicular raised at a station.
   null when the lot does not reach that station. */
function crossing(bbl,ft){
  let best=null;
  LOT_EDGE.get(bbl).forEach(r=>{ for(let i=0;i<r.length-1;i++){
    const p=r[i], q=r[i+1], lo=Math.min(p.ft,q.ft), hi=Math.max(p.ft,q.ft);
    if(ft<lo||ft>hi) continue;
    const d=hi>lo?p.off+(ft-p.ft)/(q.ft-p.ft)*(q.off-p.off):Math.min(p.off,q.off);
    if(best===null||d<best) best=d;
  }});
  return best;
}
/* how far from the centreline the drawn lots reach. a map click beyond it is not on the sheet. */
const REACH=Math.max(...[...LOT_BAND.values()].map(k=>k.far));
const LOT_BY_BBL=new Map(LOTS.features.map(f=>[String(f.properties.bbl),f.properties]));
const TREE_REACH=200;
/* the nearest crash place is looked for this far either way along the street. the police put
   most crashes at an intersection, so a station between two avenues often has none */
const CRASH_REACH=150;
/* a place is the crashes the police put within CRASH_JOIN ft of each other along the street,
   which merges the two points they use for some intersections. named by the street its crashes
   name most often. the map's circle, the row's list and the card all read this one list. */
const CRASH_JOIN=10;
const PLACES=(()=>{ const out=[];
  [...CRASHES].sort((x,y)=>x.ft-y.ft).forEach(c=>{ const p=out[out.length-1];
    if(p&&c.ft-p.last<=CRASH_JOIN){ p.list.push(c); p.last=c.ft; } else out.push({list:[c],last:c.ft}); });
  return out.map(p=>{ const L=p.list, mean=k=>L.reduce((t,c)=>t+c[k],0)/L.length;
    const names=[...L.reduce((m,c)=>c.x?m.set(c.x,(m.get(c.x)||0)+1):m,new Map())].sort((x,y)=>y[1]-x[1]||(x[0]<y[0]?-1:1));
    return {ft:Math.round(mean('ft')), lon:mean('lon'), lat:mean('lat'), n:L.length,
      inj:L.reduce((t,c)=>t+(c.inj||0),0), name:names.length?names[0][0]:null, list:L}; });
})();
/* a shed permit is for a building, so it is read through the building's lot */
const SHED_BY_BBL=new Map(SHEDS.map(s=>[String(s.bbl),s]));
/* the counter speaks for a station only this close to it along the street, and never past
   the avenues either side of it: it counts one block */
const COUNT_REACH=300;
/* the ticked avenue to the west and to the east of a station. inside an avenue's own crossing
   both are that avenue. null where the line runs on past the last avenue. */
const flank=ft=>{ const on=AVES.find(a=>ft>=a[2]&&ft<=a[3]); if(on) return [on,on];
  let w=null; AVES.forEach(a=>{ if(a[0]<=ft) w=a; });
  return [w, AVES.find(a=>a[0]>=ft)||null]; };
const between=ft=>{ const [w,e]=flank(ft); return {west:w?w[1]:null, east:e?e[1]:null}; };
const COUNT_SPAN=PED?(([w,e])=>[Math.max(PED.ft-COUNT_REACH,w?w[0]:0), Math.min(PED.ft+COUNT_REACH,e?e[0]:LEN)])(flank(PED.ft)):null;
/* the counter's newest period that has a PM figure. null when the series has none. */
const PED_LAST=PED?[...PED.periods].reverse().find(p=>p.pm!=null)||null:null;

/* the bus leg that covers a station, per direction, at one hour. a leg is one bar: the speed
   is the whole leg's, never a reading at the station. where two legs meet, the one the bus is
   entering. null where no kept leg reaches. */
function busAt(ft,hour){
  const pick=d=>{const hit=BUS.filter(r=>r.dir===d&&r.h===hour&&ft>=r.a&&ft<=r.b);
    return (d==='E'?hit.find(r=>ft<r.b):hit.find(r=>ft>r.a))||hit[0]||null;};
  return {hour, e:pick('E'), w:pick('W')};
}

/* everything known at one station. pure: data in, plain object out, no DOM.
   a null width means the source has no measurement there, and it stays null. */
function stationProfile(ft,hour){
  ft=Math.max(0,Math.min(LEN,Math.round(ft)));
  /* bands share endpoints, so prefer the one that continues east. zero-length
     fragments are skipped, a width read off under a foot of line is noise. */
  const covering=(list,get)=>{
    const hit=list.filter(r=>{const [a,b]=get(r); return b>a&&ft>=a&&ft<=b;});
    return hit.find(r=>ft<get(r)[1])||hit[hit.length-1]||null;
  };
  const walk=s=>{const r=covering(SW.filter(x=>x.s===s),x=>[x.a,x.b]); return r?r.w:null;};
  const rd=covering(ROAD.features.map(f=>f.properties),x=>[x.a,x.b]);
  /* the plan's tier for the segment under the station. null past either end of the source. */
  const tr=covering(TIER,x=>[x.a,x.b]);
  const [w,e]=flank(ft);
  const near=TREES.filter(t=>Math.abs(t.ft-ft)<=TREE_REACH);
  /* the lots that face the reader: the first boundary the perpendicular meets on each side,
     and any other within FRONT_TOL of it. a lot standing behind another is not listed. */
  const lots=side=>{
    const hit=LOTS.features.map(f=>f.properties).filter(p=>p.side===side)
      .map(p=>[p,crossing(p.bbl,ft)]).filter(x=>x[1]!==null).sort((x,y)=>x[1]-y[1]);
    return hit.filter(x=>x[1]<=hit[0][1]+FRONT_TOL).map(x=>x[0]);
  };
  const n=lots('n'), s=lots('s');
  /* nearest bench along the street, either side. a tie goes to the one to the west. */
  const bn=BENCHES.reduce((x,y)=>!x||Math.abs(y.ft-ft)<Math.abs(x.ft-ft)?y:x,null);
  const bench=bn?{ft:bn.ft, dist:Math.abs(bn.ft-ft), dir:bn.ft>ft?'east':bn.ft<ft?'west':null,
    side:bn.side, installed:bn.installed, ...between(bn.ft)}:null;
  const count=PED&&PED_LAST&&ft>=COUNT_SPAN[0]&&ft<=COUNT_SPAN[1]?{ft:PED.ft, dist:Math.abs(PED.ft-ft),
    dir:PED.ft>ft?'east':PED.ft<ft?'west':null, p:PED_LAST.p, pm:PED_LAST.pm, win:PED.windows?PED.windows.pm:null,
    ...between(PED.ft)}:null;
  /* the metered face under the station, per side. null is a curb with no meter, not a free one. */
  const face=sd=>covering(CURB.filter(f=>f.side===sd),f=>[f.a,f.b]);
  /* the one place nearest the station, so the card gives the figure the map's circle gives.
     a tie goes to the one to the west. none when the nearest is out of reach. */
  const pl=PLACES.reduce((x,y)=>!x||Math.abs(y.ft-ft)<Math.abs(x.ft-ft)?y:x,null);
  const place=pl&&Math.abs(pl.ft-ft)<=CRASH_REACH?pl:null;
  const biggest=[...n,...s].reduce((x,y)=>!x||y.lotarea>x.lotarea?y:x,null);
  const side=v=>v?{ft:v[0],name:v[1]}:null;
  return {ft, at:w&&w===e?w[1]:null, west:side(w), east:side(e),
    north:walk(1), south:walk(-1),
    road:rd?{w:rd.w, lanes:rd.lanes, park:rd.park, dir:rd.dir}:null,
    trees:{n:near.filter(t=>t.side==='n').length, s:near.filter(t=>t.side==='s').length, all:near.length},
    tier:tr?{rank:tr.rank, name:tr.tier}:null,
    curb:CURB.length?{n:face('n'), s:face('s')}:null,
    crashes:CRASHES.length?{reach:CRASH_REACH, place:place?{ft:place.ft, name:place.name, n:place.n, inj:place.inj,
      dist:Math.abs(place.ft-ft), dir:place.ft>ft?'east':place.ft<ft?'west':null}:null}:null,
    bench, count, bus:hour==null?null:busAt(ft,hour), lots:{n,s}, biggest};
}

const api={AVES, CROSS, TREE_REACH, CRASH_REACH, CRASH_JOIN, PLACES, SHED_BY_BBL, COUNT_REACH, COUNT_SPAN, PED_LAST, between, FRONT_TOL, REACH, LOT_BAND, crossing, LOT_BY_BBL, project, busAt, stationProfile};
window.STATION=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})();
