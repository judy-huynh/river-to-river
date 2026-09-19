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

/* what the roadway is, summarised once */
const ROAD_STATS=(()=>{
  let total=0, fourPlusTwo=0, wSum=0;
  ROAD.features.forEach(f=>{const p=f.properties, l=p.b-p.a;
    total+=l; wSum+=p.w*l; if(p.lanes>=4&&p.park>=2) fourPlusTwo+=l;});
  return {total, share:pct(fourPlusTwo,total), avgW:Math.round(wSum/total)};
})();

/* ── map ──────────────────────────────────────────────────────────────── */
mapboxgl.accessToken=TOKEN;
const map=new mapboxgl.Map({container:'map', style:'mapbox://styles/mapbox/standard',
  center:at(LEN/2), zoom:14.05, bearing:BEARING, pitch:0, antialias:true});
map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
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
      h+=`<div class="key"><h5>Most common species</h5>
        <p>${new Set(TREES.map(t=>t.common)).size} species in all. Hover any tree on the map for its name.</p><ul>${
        sp.map(([s,c])=>`<li><i class="dot" style="background:#2E9E4F;opacity:.55"></i><span>${s}</span><b>${c}</b></li>`).join('')}</ul></div>`;
      if(this.extraOn.gaps)
        h+=`<p class="flag"><b>${commas(GAP_FEET)} feet has no tree at all</b>That is ${pct(GAP_FEET,LEN)}% of the street, in two stretches, and both are the famous ones: 8th through Times Square to 6th, and Madison through Grand Central to 3rd.</p>`;
      return h;
    }
  },
  {
    id:'road', name:'The roadway', count:ROAD_STATS.avgW+' ft wide on average',
    on:false, open:false, ids:['roadLine'], opacity:.85,
    says:`How much of the ground is given to vehicles, from the city's own street file. <b>The line is drawn at the real width of the roadway.</b>`,
    legend(){
      return `<div class="key"><h5>What the lanes are for</h5>
        <p>On ${ROAD_STATS.share}% of the street it is four lanes for moving traffic and two more for parked cars.</p>
        <ul>
          <li><i class="rule" style="border-top-width:7px;border-top-color:#6E6A62"></i><span>66 ft</span><b>widest</b></li>
          <li><i class="rule" style="border-top-width:5px;border-top-color:#6E6A62"></i><span>55 ft</span><b>most of it</b></li>
          <li><i class="rule" style="border-top-width:3px;border-top-color:#6E6A62"></i><span>32 ft</span><b>narrowest</b></li>
        </ul></div>
        <p class="flag"><b>Six lanes, and two of them do not move</b>Two of the six are for cars that are parked. Hover any stretch for its exact width and lane count.</p>`;
    }
  },
  {
    id:'lots', name:'Lots and what may be built', count:LOTS.features.length+' fronting the street',
    on:true, open:true, ids:['lotFill','lotLine'], opacity:.58,
    says:`Every property fronting 42nd Street, at its real boundary from the city tax map. <b>Click one to see who owns it.</b>`,
    styles:[['zoning','The rules that govern it'],['capacity','Room left to build'],['age','When it was built'],['plain','Outline only']],
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
          <p class="flag"><b>Treat this as a screen, not a promise</b>Most of these lots sit in a special district where the base rule is not the rule that governs. Nine are landmarked and cannot be built on at all.</p>`;
      }
      if(this.style==='age'){
        return `<div class="key"><h5>Year the building went up</h5>
          <p>The street rebuilt itself in patches, not all at once.</p><ul>${
          AGE.map(([y,c])=>`<li><i style="background:${c}"></i><span>${y}s</span></li>`).join('')}</ul></div>`;
      }
      return `<div class="key"><h5>Boundaries only</h5><p>Every lot line, no fill.</p></div>`;
    }
  },
  {
    id:'landmarks', name:'Protected buildings', count:LOTS.features.filter(f=>f.properties.lm===1).length+' designated landmarks',
    on:false, open:false, ids:['lmHatch'], opacity:1,
    says:`Buildings the Landmarks Preservation Commission has designated. <b>Whatever the zoning says, these cannot grow.</b>`,
    legend(){ return `<div class="key"><h5>Designated</h5><ul>
      <li><i class="rule" style="border-top-width:3px;border-top-style:dashed;border-top-color:#14120F"></i><span>landmark boundary</span></li></ul></div>`; }
  },
  {
    id:'labels', name:'Avenue names', count:'14 crossings',
    on:true, open:false, ids:['aveLab'], opacity:1,
    says:`The only labels on this map. Every name the basemap ships with is switched off.`,
    legend(){ return ''; }
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
    bar.onclick=()=>{ row.dataset.open = row.dataset.open==='true'?'false':'true'; };
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
  if(L.id==='road') map.setPaintProperty('roadLine','line-opacity',L.opacity);
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
  map.on('move',syncRuler);
}

function showLot(p){
  const panel=$('#readout'); panel.hidden=false;
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
  const svg=$('#rulerSvg'), W=1000, H=50, X=ft=>ft/LEN*W;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.innerHTML='';
  const add=(n,a)=>{const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); svg.appendChild(e); return e;};
  HUBS.forEach(([a,b,name])=>{
    add('rect',{x:X(a),y:0,width:X(b)-X(a),height:H,fill:'#14120F','fill-opacity':.06});
    const t=add('text',{x:X(a)+3,y:10,'font-family':'ui-monospace,Menlo,monospace','font-size':6.5,
      'letter-spacing':.8,fill:'rgba(20,18,15,.45)'}); t.textContent=name.toUpperCase();
  });
  TREE_GAPS.forEach(([a,b])=>add('rect',{x:X(a),y:H-10,width:X(b)-X(a),height:5,fill:'#FF5A36','fill-opacity':.45}));
  TREES.forEach(t=>add('rect',{x:X(t.ft),y:H-10,width:1,height:5,fill:'#2E9E4F','fill-opacity':.9}));
  add('line',{x1:0,x2:W,y1:H/2+2,y2:H/2+2,stroke:'#14120F','stroke-opacity':.3,'stroke-width':.6});
  AVES.forEach(([ft,name])=>{
    add('line',{x1:X(ft),x2:X(ft),y1:H/2-4,y2:H/2+8,stroke:'#14120F','stroke-opacity':.35,'stroke-width':.6});
    const t=add('text',{x:X(ft),y:H/2-7,'text-anchor':'middle','font-family':'ui-monospace,Menlo,monospace',
      'font-size':6.5,fill:'rgba(20,18,15,.5)'}); t.textContent=name;
  });
}
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
$('#metaLots').textContent=LOTS.features.length+' lots';
$('#metaTrees').textContent=TREES.length+' trees';
buildPanel(); buildRuler();
map.on('error',e=>console.warn('map:',e&&e.error&&e.error.message));
})();
