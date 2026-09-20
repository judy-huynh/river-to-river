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
console.log('station checks pass');
