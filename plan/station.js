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
const LEN=LINE[LINE.length-1][0];
const AVES=[[0,'12th'],[903,'11th'],[1890,'10th'],[2699,'9th'],[3473,'8th'],[4542,'7th'],[5480,'6th'],
  [6417,'5th'],[6932,'Mad'],[7520,'Park'],[8021,'Lex'],[8940,'3rd'],[9730,'2nd'],[10411,'1st']];

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
/* the counter speaks for a station only this close to it along the street, and never past
   the avenues either side of it: it counts one block */
const COUNT_REACH=300;
const flank=ft=>{ let w=AVES[0]; AVES.forEach(a=>{ if(a[0]<=ft) w=a; });
  return [w, AVES.find(a=>a[0]>=ft)||AVES[AVES.length-1]]; };
const between=ft=>{ const [w,e]=flank(ft); return {west:w[1], east:e[1]}; };
const COUNT_SPAN=PED?[Math.max(PED.ft-COUNT_REACH,flank(PED.ft)[0][0]), Math.min(PED.ft+COUNT_REACH,flank(PED.ft)[1][0])]:null;
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
  let w=AVES[0], e=AVES[AVES.length-1];
  AVES.forEach(a=>{ if(a[0]<=ft) w=a; });
  e=AVES.find(a=>a[0]>=ft)||e;
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
  const biggest=[...n,...s].reduce((x,y)=>!x||y.lotarea>x.lotarea?y:x,null);
  return {ft, west:{ft:w[0],name:w[1]}, east:{ft:e[0],name:e[1]},
    north:walk(1), south:walk(-1),
    road:rd?{w:rd.w, lanes:rd.lanes, park:rd.park, dir:rd.dir}:null,
    trees:{n:near.filter(t=>t.side==='n').length, s:near.filter(t=>t.side==='s').length, all:near.length},
    bench, count, bus:hour==null?null:busAt(ft,hour), lots:{n,s}, biggest};
}

const api={AVES, TREE_REACH, COUNT_REACH, COUNT_SPAN, PED_LAST, between, FRONT_TOL, REACH, LOT_BAND, crossing, LOT_BY_BBL, project, busAt, stationProfile};
window.STATION=api;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})();
