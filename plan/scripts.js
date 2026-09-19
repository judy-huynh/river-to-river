/* ═══════════════════════════════════════════════════════════════════════
   42nd STREET — PLAN SHEET
   Sources, all baked into data.js so the page calls Mapbox and nothing else:
     LINE42     centreline, used only as the measuring axis
     LOTS_POLY  NYC MapPLUTO tax lots, real boundaries
     TREES      NYC Parks Forestry Tree Points, current inventory
     ROAD       NYC CSCL street centerline, width and lane counts
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

function at(ft){
  const t=Math.max(0,Math.min(LEN,ft));
  for(let i=0;i<LINE.length-1;i++) if(t>=LINE[i][0]&&t<=LINE[i+1][0]){
    const k=(t-LINE[i][0])/((LINE[i+1][0]-LINE[i][0])||1);
    return [LINE[i][1]+(LINE[i+1][1]-LINE[i][1])*k, LINE[i][2]+(LINE[i+1][2]-LINE[i][2])*k];
  }
  return [LINE.at(-1)[1], LINE.at(-1)[2]];
}
const AVES=[[0,'12th'],[903,'11th'],[1890,'10th'],[2699,'9th'],[3473,'8th'],[4542,'7th'],[5480,'6th'],
  [6417,'5th'],[6932,'Mad'],[7520,'Park'],[8021,'Lex'],[8940,'3rd'],[9730,'2nd'],[10411,'1st']];
const HUBS=[[2699,3473,'Port Authority'],[4380,4760,'Times Sq'],[5480,6417,'Bryant Park'],[7520,8021,'Grand Central']];

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

const TREE_GAPS=(()=>{const out=[];let prev=0;
  TREES.forEach(t=>{if(t.ft-prev>400) out.push([prev,t.ft]); prev=Math.max(prev,t.ft);});
  if(LEN-prev>400) out.push([prev,LEN]); return out;})();
const GAP_FEET=TREE_GAPS.reduce((s,[a,b])=>s+(b-a),0);

/* the walking surface, summarised once. gross concrete, not clear width. */
const SW=window.SIDEWALK||[];
const SW_STATS=(()=>{
  if(!SW.length) return null;
  const w=SW.map(r=>r.w).sort((a,b)=>a-b);
  const med=w[Math.floor(w.length/2)];
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
map.on('dragstart',()=>{userMoved=true;}); map.on('zoomstart',()=>{userMoved=true;});
const refit=()=>{ if(userMoved||!MAP_OK) return;
  try{ map.resize(); map.fitBounds(STREET_BOUNDS,{...FIT,duration:0}); }catch(e){} };
map.on('load',refit);
let _fitT; addEventListener('resize',()=>{clearTimeout(_fitT); _fitT=setTimeout(refit,160);});
map.dragRotate.disable(); map.touchZoomRotate.disableRotation();

/* ═══════════════════════════════════════════════════════════════════════
   LAYERS. Drawing order, top of the list draws on top.
   Every layer opens with one plain sentence before any key.
   ═══════════════════════════════════════════════════════════════════════ */
const LAYERS=[
  {
    id:'trees', name:'Street trees', count:TREES.length+' standing today',
    on:true, open:true, ids:['treeDots'], opacity:1,
    says:`Every tree the Parks Department currently records on this street. <b>The dot is the size of the trunk.</b>`,
    styles:[['plain','All the same'],['cond','How healthy they are']], style:'plain',
    extras:[['gaps','Show where there are none']], extraOn:{gaps:false},
    legend(){
      let h='';
      if(this.style==='plain'){
        h+=`<div class="key"><h5>Trunk size</h5>
          <p>Measured across the trunk. The biggest on the street is 28 inches.</p>
          <div class="sizes">${[4,12,24].map(d=>
            `<figure><span style="width:${d*1.1}px;height:${d*1.1}px"></span><figcaption>${d}"</figcaption></figure>`).join('')}</div></div>`;
      } else {
        const rows=Object.entries(COND)
          .map(([k,v])=>[k,v,TREES.filter(t=>t.cond===k).length])
          .filter(r=>r[2]>0).sort((a,b)=>b[2]-a[2]);
        h+=`<div class="key"><h5>Condition, as the city rates it</h5>
          <p>${pct(TREES.filter(t=>t.cond==='Good'||t.cond==='Excellent').length,TREES.length)}% are good or better.</p><ul>${
          rows.map(([k,v,n])=>`<li><i class="dot" style="background:${v}"></i><span>${k}</span><b>${n}</b></li>`).join('')}</ul></div>`;
      }
      const sp=[...TREES.reduce((m,t)=>m.set(t.common,(m.get(t.common)||0)+1),new Map())]
        .sort((a,b)=>b[1]-a[1]).slice(0,4);
      const spTop=sp.length?sp[0][1]:1;
      h+=`<div class="key key--rank"><h5>Most common species</h5>
        <p>${new Set(TREES.map(t=>t.common)).size} species in all. Hover any tree on the map for its name.</p><ul>${
        sp.map(([s,c])=>`<li><div class="row"><span>${s}</span><b>${c}</b></div>`
          + `<i class="bar" style="width:${Math.max(3,Math.round(c/spTop*100))}%"></i></li>`).join('')}</ul></div>`;
      if(this.extraOn.gaps)
        h+=`<p class="flag"><b>${commas(GAP_FEET)} feet has no tree at all</b>That is ${pct(GAP_FEET,LEN)}% of the street, in two stretches, and both are the famous ones: 8th through Times Square to 6th, and Madison through Grand Central to 3rd.</p>`;
      return h;
    }
  },
  {
    id:'road', name:'Who gets the ground',
    count: SW_STATS ? ROAD_STATS.avgW+' ft of roadway, '+SW_STATS.med+' ft of sidewalk'
                    : ROAD_STATS.avgW+' ft wide on average',
    on:false, open:false, ids:['roadLine','swLine'], opacity:.85,
    says:`The roadway and both sidewalks, drawn at their real widths on the same scale. <b>The comparison is the point.</b>`,
    legend(){
      let h=`<div class="key"><h5>Drawn at real width</h5>
        <ul>
          <li><i class="rule" style="border-top-width:7px;border-top-color:#6E6A62"></i><span>Roadway</span><b>${ROAD_STATS.avgW} ft avg</b></li>`;
      if(SW_STATS) h+=`
          <li><i class="rule" style="border-top-width:3px;border-top-color:#2E9E4F"></i><span>Sidewalk, each side</span><b>${SW_STATS.med} ft typical</b></li>`;
      h+=`</ul></div>
        <p class="flag"><b>Six lanes, and two of them do not move</b>On ${ROAD_STATS.share}% of the street it is four lanes for moving traffic and two more for cars that are parked.</p>`;
      if(SW_STATS){
        h+=`<div class="key"><h5>The walking surface</h5>
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
    id:'lots', name:'Lots and what may be built', count:LOTS.features.length+' fronting the street',
    on:true, open:false, ids:['lotFill','lotLine','lmHatch'], opacity:.58,
    says:`Every property fronting 42nd Street, at its real boundary from the city tax map. <b>Click one to see who owns it.</b>`,
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
          return rows?`<div class="key"><h5>${h}</h5><p>${note}</p><ul>${rows}</ul></div>`:'';
        }).join('')
        + `<p class="flag"><b>What "up to 15&times;" means</b>You may build floor area up to fifteen times the size of the lot. On a 10,000 sq ft lot that is 150,000 sq ft of building, stacked however the rules allow.</p>`;
      }
      if(this.style==='capacity'){
        return `<div class="key"><h5>Floor area allowed and never built</h5>
          <p>The gap between what the rules permit and what is standing.</p><ul>${
          CAP.map(([v,c],i)=>`<li><i style="background:${c}"></i><span>${i===0?'nothing spare':commas(v)+'+ sq ft'}</span></li>`).join('')}</ul></div>
          <p class="flag"><b>Treat this as a screen, not a promise</b>Most of these lots sit in a special district where the base rule is not the rule that governs. ${LOTS.features.filter(f=>f.properties.lm===1).length} are landmarked and cannot be built on at all.</p>`;
      }
      if(this.style==='landmark'){
        const n=LOTS.features.filter(f=>f.properties.lm===1).length;
        return `<div class="key"><h5>Designated landmarks</h5>
          <p>Whatever the zoning allows, these cannot grow.</p><ul>
          <li><i style="background:#14120F"></i><span>designated</span><b>${n} lots</b></li>
          <li><i style="background:#E9E4D6"></i><span>not designated</span><b>${LOTS.features.length-n} lots</b></li>
          </ul></div>
          <p class="flag"><b>This is why the capacity figure is a screen, not a promise</b>A landmarked lot can carry unbuilt floor area on paper and never be able to use it.</p>`;
      }
      if(this.style==='age'){
        return `<div class="key"><h5>Year the building went up</h5>
          <p>The street rebuilt itself in patches, not all at once.</p><ul>${
          AGE.map(([y,c])=>`<li><i style="background:${c}"></i><span>${y}s</span></li>`).join('')}</ul></div>`;
      }
      return `<div class="key"><h5>Boundaries only</h5><p>Every lot line, no fill.</p></div>`;
    }
  }
];

/* ── panel ────────────────────────────────────────────────────────────── */
function buildPanel(){
  const host=$('#layerList');
  LAYERS.forEach(L=>{
    const row=el('div','layer'); row.dataset.on=L.on; row.dataset.open=L.open;
    const bar=el('div','layer__bar',
      `<span class="sw" role="switch" aria-checked="${L.on}" tabindex="0"></span>
       <span><span class="layer__name">${L.name}</span><span class="layer__count">${L.count}</span></span>
       <span class="layer__caret">&#9654;</span>`);
    const sw=bar.querySelector('.sw');
    sw.onclick=e=>{e.stopPropagation(); toggle(L,row,sw);};
    sw.onkeydown=e=>{ if(e.key===' '||e.key==='Enter'){e.preventDefault(); e.stopPropagation(); toggle(L,row,sw);} };
    bar.onclick=()=>{
      const opening = row.dataset.open!=='true';
      /* one legend open at a time, or the rail becomes a single unreadable column */
      if(opening) LAYERS.forEach(o=>{ if(o._row && o._row!==row) o._row.dataset.open='false'; });
      row.dataset.open = opening ? 'true' : 'false';
      if(opening) requestAnimationFrame(()=>row.scrollIntoView({block:'nearest'}));
    };
    const body=el('div','layer__body');
    row.append(bar,body); host.append(row);
    L._row=row; L._body=body; renderBody(L);
  });
  $('#allOff').onclick=()=>LAYERS.forEach(L=>{ if(L.on) toggle(L,L._row,L._row.querySelector('.sw')); });
}

function renderBody(L){
  let h=`<p class="says">${L.says}</p>`;
  if(L.styles)
    h+=`<div class="ctl"><span>Colour by</span><select data-style>${
      L.styles.map(([v,t])=>`<option value="${v}"${v===L.style?' selected':''}>${t}</option>`).join('')}</select></div>`;
  if(L.opacity!==undefined)
    h+=`<div class="ctl"><span>Opacity</span><div class="slider">
      <input type="range" min="10" max="100" value="${Math.round(L.opacity*100)}" data-op>
      <output>${Math.round(L.opacity*100)}%</output></div></div>`;
  h+=L.legend();
  if(L.extras)
    h+=`<div class="opt">${L.extras.map(([k,t])=>
      `<button type="button" data-extra="${k}" aria-pressed="${!!L.extraOn[k]}">${t}</button>`).join('')}</div>`;
  L._body.innerHTML=h;

  const op=L._body.querySelector('[data-op]');
  if(op) op.oninput=e=>{ L.opacity=+e.target.value/100;
    L._body.querySelector('output').textContent=e.target.value+'%'; paint(L); };
  const sel=L._body.querySelector('[data-style]');
  if(sel) sel.onchange=e=>{ L.style=e.target.value; paint(L); renderBody(L); };
  L._body.querySelectorAll('[data-extra]').forEach(b=>{
    b.onclick=()=>{ L.extraOn[b.dataset.extra]=!L.extraOn[b.dataset.extra]; paint(L); renderBody(L); };
  });
}

function toggle(L,row,sw){
  L.on=!L.on; row.dataset.on=L.on; if(sw) sw.setAttribute('aria-checked',L.on);
  if(L.on && row.dataset.open!=='true') row.dataset.open='true';
  paint(L);
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
      'line-width':['case',['boolean',['feature-state','hover'],false],2.4,
        ['interpolate',['linear'],['zoom'],13,.35,17,1.1]]}});
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
  map.on('click','lotFill',e=>showLot(e.features[0].properties));
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
  map.on('move',syncRuler);
}

function showLot(p){
  const panel=$('#readout'); panel.hidden=false;
  /* the rail is taller than the window; without this the readout updates out of sight */
  panel.scrollTop=0; panel.scrollIntoView({block:'nearest'});
  const used=p.allowed>0?Math.min(100,p.built/p.allowed*100):0;
  panel.innerHTML=
    `<span class="micro">${p.side==='n'?'North side':'South side'} &middot; ${p.year||'year unknown'}</span>`
   +`<h3>${p.addr||'Unnamed lot'}</h3>`
   +`<span class="zonechip" style="background:${ZONE[p.zone]||'#B9B1A1'}">${p.zone||'no district'}</span>`
   +`<div class="gauge"><i style="width:${used}%"></i></div>`
   +`<div class="gauge__lab"><span class="micro">built ${p.built}&times;</span><span class="micro">allowed ${p.allowed}&times;</span></div>`
   +`<dl>`
   +`<div><dt>Owner</dt><dd>${p.owner||'—'}</dd></div>`
   +`<div><dt>Lot area</dt><dd>${commas(p.lotarea)} sq ft</dd></div>`
   +`<div><dt>Floors</dt><dd>${p.floors||'—'}</dd></div>`
   +`<div><dt>Room left</dt><dd>${commas(p.unbuilt)} sq ft</dd></div>`
   +(p.lm===1?`<div><dt>Landmark</dt><dd>protected</dd></div>`:'')
   +`</dl>`;
}

/* ── ruler ────────────────────────────────────────────────────────────── */
const NS='http://www.w3.org/2000/svg';
function buildRuler(){
  const host=$('#ruler'), svg=$('#rulerSvg');
  const W=Math.max(320,Math.round(host.clientWidth||960)), H=58, X=ft=>ft/LEN*W;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.innerHTML='';
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

  /* the four hubs, shaded. label only where it genuinely fits inside its own band. */
  /* Below ~620px the four hub bands are each a few pixels wide and their names
     cannot be placed without crowding or clipping. Draw the shading, drop the
     names: the bands still read as the four busy stretches. */
  const HUB_LABELS = W >= 620;
  let hubRight=-1e9;
  HUBS.forEach(([a,b,name])=>{
    const x=X(a), w=X(b)-X(a);
    add('rect',{x,y:0,width:w,height:H,fill:'#14120F','fill-opacity':.06});
    if(!HUB_LABELS) return;
    const {node,w:tw}=label(name.toUpperCase(),10,.4);
    const half=tw/2, cx=Math.min(Math.max(x+w/2,half+3),W-half-3);
    if(tw<=W-6 && cx-half > hubRight+8){
      node.setAttribute('x',cx); node.setAttribute('y',14);
      node.setAttribute('text-anchor','middle'); node.setAttribute('fill','rgba(20,18,15,.5)');
      hubRight=cx+half;
    } else node.remove();
  });

  /* trees along the bottom, and the stretches with none */
  TREE_GAPS.forEach(([a,b])=>add('rect',{x:X(a),y:H-8,width:X(b)-X(a),height:5,fill:'#FF5A36','fill-opacity':.45}));
  TREES.forEach(t=>add('rect',{x:X(t.ft),y:H-8,width:1,height:5,fill:'#2E9E4F','fill-opacity':.9}));

  add('line',{x1:0,x2:W,y1:27,y2:27,stroke:'#14120F','stroke-opacity':.3,'stroke-width':.8});

  /* avenues, decluttered left to right: a label is drawn only if it clears the
     last one drawn, so nothing ever collides no matter how narrow the window */
  const PX=11; let lastRight=-1e9;
  AVES.forEach(([ft,name])=>{
    const x=X(ft);
    add('line',{x1:x,x2:x,y1:21,y2:33,stroke:'#14120F','stroke-opacity':.35,'stroke-width':.8});
    const {node,w:tw}=label(name,PX);
    const half=tw/2;
    let tx=x, anchor='middle';
    if(x-half<2){ tx=2; anchor='start'; }
    else if(x+half>W-2){ tx=W-2; anchor='end'; }
    const left = anchor==='start' ? tx : anchor==='end' ? tx-tw : x-half;
    if(left > lastRight+7){
      node.setAttribute('x',tx); node.setAttribute('y',46);
      node.setAttribute('text-anchor',anchor); node.setAttribute('fill','rgba(20,18,15,.58)');
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
}

/* redraw on resize, debounced, because the drawing is now width-dependent */
let _rulerT; addEventListener('resize',()=>{clearTimeout(_rulerT); _rulerT=setTimeout(buildRuler,120);});

function syncRuler(){
  const b=map.getBounds();
  const near=(lng,lat)=>{let best=0,bd=1e9;
    for(let f=0;f<=LEN;f+=120){const p=at(f),d=Math.hypot(p[0]-lng,p[1]-lat); if(d<bd){bd=d;best=f;}}
    return best;};
  const a=near(b.getWest(),b.getNorth()), c=near(b.getEast(),b.getSouth());
  const lo=Math.max(0,Math.min(a,c)), hi=Math.min(LEN,Math.max(a,c));
  const win=$('#rulerWin');
  win.style.left=(lo/LEN*100)+'%';
  win.style.width=Math.max(.5,(hi-lo)/LEN*100)+'%';
  const mid=(lo+hi)/2, ave=AVES.reduce((x,y)=>Math.abs(y[0]-mid)<Math.abs(x[0]-mid)?y:x);
  $('#rulerMid').textContent = mid<120?'at the Hudson' : mid>LEN-120?'at the East River'
    : `near ${ave[1]} Avenue · ${commas(mid)} ft from the Hudson`;
}
(function drag(){
  const r=$('#ruler'); let down=false,cap=false,sx=0;
  const go=e=>{const box=r.getBoundingClientRect();
    const ft=Math.max(0,Math.min(LEN,(e.clientX-box.left)/box.width*LEN));
    map.easeTo({center:at(ft),duration:down?0:600,bearing:BEARING});};
  r.addEventListener('pointerdown',e=>{down=true;cap=false;sx=e.clientX;go(e);});
  r.addEventListener('pointermove',e=>{ if(!down) return;
    if(!cap&&Math.abs(e.clientX-sx)>4){cap=true; try{r.setPointerCapture(e.pointerId);}catch(err){}}
    if(cap) go(e);});
  addEventListener('pointerup',()=>down=false);
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
$('#metaLots').textContent=LOTS.features.length+' lots';
$('#metaTrees').textContent=TREES.length+' trees';
buildPanel(); buildRuler();
map.on('error',e=>console.warn('map:',e&&e.error&&e.error.message));
})();
