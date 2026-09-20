/* Known-good check for stationProfile. Run: node scripts/check/station.js
   Loads the baked data and the lookups exactly as the page does, with no DOM. */
const path=require('path'), assert=require('assert');
global.window={};
require(path.join(__dirname,'../../plan/data.js'));
const S=require(path.join(__dirname,'../../plan/station.js'));

const P=S.stationProfile(4000);
assert.strictEqual(P.north,20.2);
assert.strictEqual(P.south,25.2);
assert.deepStrictEqual([P.road.w,P.road.lanes,P.road.park],[55,4,2]);
assert.strictEqual(P.trees.all,0);
assert.strictEqual(P.biggest.addr,'234 West 42 Street');
assert.strictEqual(P.biggest.owner,'NYC Economic Development Corporation');

/* out of range clamps, and a station with no measurement stays null rather than guessed */
const LEN=window.LINE42[window.LINE42.length-1][0];
assert.strictEqual(S.stationProfile(-50).ft,0);
assert.strictEqual(S.stationProfile(LEN+50).ft,LEN);
const Z=S.stationProfile(0);
[Z.north,Z.south].forEach(v=>assert.ok(v===null||typeof v==='number'));

/* every listed lot really spans the station, and none stands behind another */
for(let ft=0;ft<=LEN;ft+=100){
  const Q=S.stationProfile(ft);
  [...Q.lots.n,...Q.lots.s].forEach(p=>{const k=S.LOT_BAND.get(p.bbl); assert.ok(ft>=k.a&&ft<=k.b);});
  ['n','s'].forEach(sd=>{const c=Q.lots[sd].map(p=>S.crossing(p.bbl,ft));
    assert.ok(c.every(v=>v!==null&&v<=Math.min(...c)+S.FRONT_TOL));});
  assert.strictEqual(Q.trees.n+Q.trees.s<=Q.trees.all,true);
}

/* an L-shaped lot is listed along its frontage, not along its rear arm: at 6,500 ft only
   501 5 Avenue faces the street on the south side */
assert.deepStrictEqual(S.stationProfile(6500).lots.s.map(p=>p.addr),['501 5 Avenue']);
/* the nearest bench is never farther than any other. the counter speaks only inside its reach
   and only on its own block, between the baked avenues either side of it */
const ave=l=>window.AVES.find(v=>v.label===l), PARK=ave('Park'), LEX=ave('Lex');
assert.ok(PARK.ft<window.PED_COUNT.ft&&window.PED_COUNT.ft<LEX.ft);
for(let ft=0;ft<=LEN;ft+=50){
  const Q=S.stationProfile(ft);
  assert.strictEqual(Q.bench.dist,Math.min(...window.BENCHES.map(b=>Math.abs(b.ft-ft))));
  const d=Math.abs(window.PED_COUNT.ft-ft), onBlock=ft>=PARK.ft&&ft<=LEX.ft;
  assert.strictEqual(Q.count!==null,d<=S.COUNT_REACH&&onBlock);
}
const C=S.stationProfile(window.PED_COUNT.ft).count, last=window.PED_COUNT.periods[window.PED_COUNT.periods.length-1];
assert.deepStrictEqual([C.p,C.pm,C.dist],[last.p,last.pm,0]);
/* the bus at a station is the whole leg that covers it, per direction, at the asked hour.
   no hour asked, no bus. east of the last kept timepoint there is none, and none is invented */
assert.strictEqual(P.bus,null);
for(let ft=0;ft<=LEN;ft+=50) for(const h of [3,17]){
  const B=S.stationProfile(ft,h).bus;
  [['e','E'],['w','W']].forEach(([k,d])=>{
    const legs=window.BUS.filter(r=>r.dir===d&&r.h===h&&ft>=r.a&&ft<=r.b);
    assert.strictEqual(B[k]!==null,legs.length>0);
    if(B[k]) assert.ok(legs.includes(B[k])&&B[k].h===h);
  });
}
const lastE=Math.max(...window.BUS.filter(r=>r.dir==='E').map(r=>r.b));
assert.strictEqual(S.stationProfile(lastE+1,17).bus.e,null);
/* where two legs meet, the one the bus is entering */
const meet=window.BUS.find(r=>r.dir==='E'&&r.a>0).a;
assert.strictEqual(S.stationProfile(meet,17).bus.e.a,meet);
assert.strictEqual(S.stationProfile(window.BUS.find(r=>r.dir==='W'&&r.a>100).a,17).bus.w.b,window.BUS.find(r=>r.dir==='W'&&r.a>100).a);
/* the priority tier at a station is the tier of the one source segment that covers it, and
   past either end of the source there is none */
for(let ft=0;ft<=LEN;ft+=50){
  const T=S.stationProfile(ft).tier, hit=window.PED_TIER.filter(r=>ft>=r.a&&ft<=r.b);
  assert.strictEqual(T!==null,hit.length>0);
  if(T) assert.ok(hit.some(r=>r.rank===T.rank&&r.tier===T.name));
}
assert.strictEqual(new Set(window.PED_TIER.map(r=>r.id)).size,window.PED_TIER.length);
assert.strictEqual(S.stationProfile(0).tier,null);
/* the metered face at a station is a baked face on that side that covers it, and where none
   covers it there is none */
for(let ft=0;ft<=LEN;ft+=50){
  const Q=S.stationProfile(ft);
  ['n','s'].forEach(sd=>{ const hit=window.CURB.filter(f=>f.side===sd&&ft>=f.a&&ft<=f.b);
    assert.strictEqual(Q.curb[sd]!==null,hit.length>0);
    if(Q.curb[sd]) assert.ok(hit.includes(Q.curb[sd])); });
}
/* the avenues are baked, in order, inside the line, each middle inside its own crossing, and
   the 14 the ruler ticks are all there */
const A=window.AVES;
assert.strictEqual(A.filter(v=>v.label).length,14);
A.forEach((v,i)=>{ assert.ok(v.a>=0&&v.a<=v.ft&&v.ft<=v.b&&v.b<=LEN&&v.c.length>0); if(i) assert.ok(v.a>A[i-1].b); });
/* the card names a station by those avenues: at one inside its crossing, between the two either
   side otherwise, and one side only past the first and last */
for(let ft=0;ft<=LEN;ft+=25){
  const Q=S.stationProfile(ft), on=A.find(v=>v.label&&ft>=v.a&&ft<=v.b);
  assert.strictEqual(Q.at,on?on.label:null);
  if(!on){ assert.ok(Q.west===null?ft<A[0].ft:Q.west.ft<ft); assert.ok(Q.east===null?ft>A[A.length-1].ft:Q.east.ft>ft);
    assert.ok(!A.some(v=>v.label&&v.ft>(Q.west?Q.west.ft:-1)&&v.ft<(Q.east?Q.east.ft:LEN+1))); }
}
/* two sources name cross streets on their own records. each must agree with the baked avenues:
   a metered face lies between the two streets its source names, with no ticked avenue inside
   it, and between() says the same when both are ticked */
const byName=n=>A.find(v=>v.name===n);
window.CURB.forEach(f=>{ const [x,y]=[byName(f.from),byName(f.to)].sort((p,q)=>p.ft-q.ft);
  assert.ok(x&&y,`curb face ${f.id} names a street the avenues do not hold`);
  assert.ok(f.a>=x.b&&f.b<=y.a,`curb face ${f.id} is not between ${x.name} and ${y.name}`);
  assert.ok(!A.some(v=>v.label&&v.ft>f.a&&v.ft<f.b));
  const B=S.between((f.a+f.b)/2);
  if(x.label) assert.strictEqual(B.west,x.label); if(y.label) assert.strictEqual(B.east,y.label); });
/* a crash that names a baked cross street is stationed at that street's crossing */
const NAME_TOL=25;
window.CRASHES.forEach(c=>{ const v=byName(c.x); if(v) assert.ok(c.ft>=v.a-NAME_TOL&&c.ft<=v.b+NAME_TOL,`crash ${c.id} names ${c.x} at ${c.ft} ft`); });
/* crash places: every crash is in exactly one, the people injured add up, and the card at a
   place's own station reports that place with its own figures, the ones its circle shows */
assert.strictEqual(S.PLACES.reduce((t,p)=>t+p.n,0),window.CRASHES.length);
assert.strictEqual(S.PLACES.reduce((t,p)=>t+p.inj,0),window.CRASHES.reduce((t,c)=>t+(c.inj||0),0));
S.PLACES.forEach((p,i)=>{ if(i) assert.ok(p.list[0].ft-S.PLACES[i-1].list[S.PLACES[i-1].list.length-1].ft>S.CRASH_JOIN);
  const v=byName(p.name); if(v) assert.ok(Math.abs(p.ft-v.ft)<=(v.b-v.a)/2+NAME_TOL);
  const c=S.stationProfile(p.ft).crashes.place;
  assert.deepStrictEqual([c.ft,c.name,c.n,c.inj,c.dist],[p.ft,p.name,p.n,p.inj,0]); });
for(let ft=0;ft<=LEN;ft+=50){ const c=S.stationProfile(ft).crashes.place, d=Math.min(...S.PLACES.map(p=>Math.abs(p.ft-ft)));
  assert.strictEqual(c!==null,d<=S.CRASH_REACH); if(c) assert.strictEqual(c.dist,d); }
/* every crash is inside the distance rule, and the source's split never exceeds its total */
window.CRASHES.forEach(c=>{ assert.ok(c.off<=window.CRASH_META.near_ft&&c.d>=window.CRASH_META.since&&c.d<=window.CRASH_META.to);
  assert.ok((c.ped||0)+(c.cyc||0)+(c.mot||0)<=(c.inj||0)); });
/* a shed permit in force covers the day the set describes, a lapsed one ran out before it,
   and each building's lot is in the drawn set */
window.SHEDS.forEach(s=>{ const D=window.SHEDS_META.asof;
  assert.strictEqual(s.state==='in force',s.expires>=D); assert.ok(s.since<=s.expires);
  assert.ok(S.LOT_BY_BBL.has(String(s.bbl))); });
/* the lot rule is frontage: every drawn lot has a boundary vertex within the baked distance of
   the centreline, no taken-out lot has, no lot is both, the two sets make up the pool, and Grand
   Central Terminal is drawn (METHODOLOGY 4) */
/* nearest is a second derivation of the rule, in the page's own projection and apart from the
   bake's on purpose: it must agree with the bake in both directions */
const nearest=f=>Math.min(...(f.geometry.type==='Polygon'?[f.geometry.coordinates[0]]:f.geometry.coordinates.map(g=>g[0]))
  .flat().map(c=>S.project(c[0],c[1]).off));
const FRONT=window.LOTS_META.front_ft;
window.LOTS_POLY.features.forEach(f=>assert.ok(nearest(f)<=FRONT,f.properties.addr));
window.LOTS_OUT.forEach(f=>{ assert.ok(nearest(f)>FRONT,f.properties.addr); assert.ok(!S.LOT_BY_BBL.has(String(f.properties.bbl)));
  assert.ok(Math.abs(f.properties.off-nearest(f))<0.1,f.properties.addr); assert.ok(f.properties.why); });
assert.strictEqual(window.LOTS_POLY.features.length+window.LOTS_OUT.length,window.LOTS_META.pool);
assert.ok(S.LOT_BY_BBL.has('1012800001'));
/* a taken-out lot that fronts a station is named on that station's card and never counted;
   --lots prints where, for METHODOLOGY 4 */
{ const span=new Map();
  for(let ft=0;ft<=LEN;ft++){ const P=S.stationProfile(ft);
    ['n','s'].forEach(k=>P.outside[k].forEach(p=>{ assert.ok(!P.lots[k].includes(p)); assert.ok(!S.LOT_BY_BBL.has(String(p.bbl)));
      const x=span.get(p.bbl)||{addr:p.addr,side:k,a:ft,b:ft,bare:0}; x.b=ft; if(!P.lots[k].length) x.bare++; span.set(p.bbl,x); })); }
  if(process.argv.includes('--lots')){
    span.forEach(x=>console.log(`${x.addr}  ${x.side}  fronts ${x.a} to ${x.b} ft  no drawn lot beside it for ${x.bare} ft`));
    console.log('taken out, never fronting:',window.LOTS_OUT.filter(f=>!span.has(f.properties.bbl)).map(f=>f.properties.addr).join(', ')||'none');
    const never=window.LOTS_POLY.features.map(f=>f.properties).filter(p=>{ const k=S.LOT_BAND.get(p.bbl);
      for(let ft=Math.ceil(k.a);ft<=k.b;ft++) if(S.stationProfile(ft).lots[p.side].includes(p)) return false; return true; });
    console.log('drawn, never listed at a station:',never.map(p=>p.addr).join(', ')||'none'); } }
console.log('station checks pass');
