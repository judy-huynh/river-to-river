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
   and only on its own block, Park (7,520) to Lexington (8,021) */
for(let ft=0;ft<=LEN;ft+=50){
  const Q=S.stationProfile(ft);
  assert.strictEqual(Q.bench.dist,Math.min(...window.BENCHES.map(b=>Math.abs(b.ft-ft))));
  const d=Math.abs(window.PED_COUNT.ft-ft), onBlock=ft>=7520&&ft<=8021;
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
console.log('station checks pass');
