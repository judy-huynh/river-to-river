/* ═══════════════════════════════════════════════════════════════════════
   42nd STREET, LOT BY LOT
   Data: window.LINE42 (centreline, [ft, lon, lat]) and window.LOTS42
   (82 tax lots from NYC PLUTO). Everything below is presentation.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiajAwYnkiLCJhIjoiY2x1bHUzbXZnMGhuczJxcG83YXY4czJ3ayJ9.S5PZpU9VDwLMjoX_0x5FDQ';

const LINE = window.LINE42;
const LOTS = window.LOTS42;
const FT_MIN = LINE[0][0];
const FT_MAX = LINE[LINE.length - 1][0];

const COLOR = {
  ink:'#100E0C', paper:'#F7F4EC', volt:'#D8F546', flare:'#FF5A36',
  magenta:'#E5006D', cobalt:'#1B4CFF', grape:'#7C3AED', stone:'#B9B1A1'
};

/* ── helpers ──────────────────────────────────────────────────────────── */
const $  = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const commas  = n => Math.round(n).toLocaleString('en-US');
const millions = n => (Math.round(n / 1e5) / 10).toFixed(1);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Point on the centreline at a given distance in feet from 12th Avenue. */
function at(ft) {
  const t = Math.max(FT_MIN, Math.min(FT_MAX, ft));
  for (let i = 0; i < LINE.length - 1; i++) {
    if (t >= LINE[i][0] && t <= LINE[i + 1][0]) {
      const k = (t - LINE[i][0]) / ((LINE[i + 1][0] - LINE[i][0]) || 1);
      return [LINE[i][1] + (LINE[i + 1][1] - LINE[i][1]) * k,
              LINE[i][2] + (LINE[i + 1][2] - LINE[i][2]) * k];
    }
  }
  return [LINE.at(-1)[1], LINE.at(-1)[2]];
}

/* ── the four hubs, in feet along the street ──────────────────────────── */
const HUBS = [
  { a: 2699, b: 3473, name: 'Port Authority' },
  { a: 4380, b: 4760, name: 'Times Square' },
  { a: 5480, b: 6417, name: 'Bryant Park + Library' },
  { a: 7520, b: 8021, name: 'Grand Central' }
];
const hubFeet = HUBS.reduce((s, h) => s + (h.b - h.a), 0);
const inHub   = ft => HUBS.some(h => ft >= h.a && ft <= h.b);

/* ── Judy's observations ──────────────────────────────────────────────────
   Empty on purpose. The eight entries that used to sit here were written for
   her and every one of them was painted onto the map with the word
   "Placeholder" in front of it. Nothing goes back in here that is not in her
   own words. The layer below reads this array and draws nothing while it is
   empty, so the chapter degrades to its prose instead of to fake pins. */
const FIELD_NOTES = [];

/* ── confidence grading ───────────────────────────────────────────────────
   PLUTO carries a base district FAR. It does not carry the rules that
   actually govern a lot inside a special district, and it happily reports
   unbuilt floor area on a landmark you can never build on. So every lot is
   graded before its capacity is quoted.
   ────────────────────────────────────────────────────────────────────── */
const GRADE = {
  plain:    { label: 'Plain zoning',      note: 'No special district, no landmark. The figure stands on its own.' },
  special:  { label: 'Special district',  note: 'Inside Midtown, Clinton or Transit Land Use. The governing rules are not the base FAR, so the figure is a screen, not an entitlement.' },
  landmark: { label: 'Landmarked',        note: 'Individual or interior landmark. The floor area is on paper only and cannot be built.' }
};
const gradeSum = g => LOTS.filter(l => l.grade === g).reduce((s, l) => s + l.unbuilt, 0);
const gradeCount = g => LOTS.filter(l => l.grade === g).length;

/* ── derived statistics ───────────────────────────────────────────────── */
const stats = (() => {
  const unbuilt = LOTS.reduce((s, l) => s + l.unbuilt, 0);
  const built   = LOTS.reduce((s, l) => s + l.bldgarea, 0);
  const publicLots = LOTS.filter(l => l.own !== 'Private');
  const outside = LOTS.filter(l => !inHub(l.ft));
  const outsideUnbuilt = outside.reduce((s, l) => s + l.unbuilt, 0);
  const ranked = [...LOTS].sort((a, b) => b.unbuilt - a.unbuilt);
  return {
    unbuilt, built, publicLots, outside, outsideUnbuilt, ranked,
    biggest: ranked[0],
    hubShare: Math.round(hubFeet / (FT_MAX - FT_MIN) * 100),
    outsideShare: Math.round(outsideUnbuilt / unbuilt * 100),
    plain: gradeSum('plain'),
    survives: Math.round(gradeSum('plain') / unbuilt * 100)
  };
})();

/* ══════════════════════════════════════════════════════════════════════
   HEADLINE FIGURES
   ══════════════════════════════════════════════════════════════════════ */
const FIGURES = [
  { value: LOTS.length,        label: 'lots front the street' },
  { value: stats.unbuilt,      label: 'square feet the zoning data appears to allow', big: true },
  { value: stats.survives,     label: 'of that survives a first check against special districts and landmarks',
    suffix: '%', accent: true },
  { value: stats.outsideShare, label: 'of the capacity sits outside the four famous hubs', suffix: '%' }
];

function renderFigures() {
  const wrap = $('#figures');
  FIGURES.forEach(f => {
    const box = el('div');
    const out = el('output', 'figure');
    out.dataset.to = f.value;
    out.dataset.mode = f.big ? 'millions' : 'plain';
    if (f.suffix) out.dataset.suffix = f.suffix;
    if (f.accent) out.dataset.accent = 'true';
    out.textContent = '0';
    box.append(out, el('span', 'figure__label', f.label));
    wrap.append(box);
  });
  countUp();
}

/** Count the headline numbers up once they scroll into view. */
function countUp() {
  const paint = (node, v) => {
    const suffix = node.dataset.suffix || '';
    const text = node.dataset.mode === 'millions' ? millions(v) + 'm' : commas(v);
    node.innerHTML = (node.dataset.accent === 'true' ? '<em>' + text + '</em>' : text) + suffix;
  };
  const run = node => {
    const to = +node.dataset.to;
    if (reduced) return paint(node, to);
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      paint(node, to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
  }, { threshold: .4 });
  document.querySelectorAll('.figures .figure').forEach(n => io.observe(n));
}

/* ══════════════════════════════════════════════════════════════════════
   CHAPTERS
   ══════════════════════════════════════════════════════════════════════ */
const CHAPTERS = [
  {
    id: 'hubs', step: 'Start here', title: 'The famous quarter',
    figure: stats.hubShare + '%', label: 'of the street is the part you know',
    body: `Port Authority, Times Square, Bryant Park and Grand Central take up about a quarter of 42nd Street between them. The other three quarters is the part nobody photographs, and it holds ${stats.outsideShare} per cent of every square foot of unused zoning capacity on the street.`,
    legend: [[COLOR.ink, 'Inside a hub'], [COLOR.flare, 'Everywhere else']]
  },
  {
    id: 'owners', step: 'Then', title: 'Who holds it',
    figure: stats.publicLots.length + ' of ' + LOTS.length, label: 'lots are public, or pay no tax',
    body: 'City agencies, public authorities and tax exempt institutions hold a quarter of the lots fronting this street. That is ground which can change without anyone having to buy it first.',
    legend: [[COLOR.cobalt, 'City'], [COLOR.grape, 'Tax exempt or mixed'], [COLOR.stone, 'Private']]
  },
  {
    id: 'capacity', step: 'The finding', title: 'What zoning already allows',
    figure: millions(stats.unbuilt) + 'm sq ft', label: 'permitted, and never built',
    body: `Against ${millions(stats.built)} million square feet standing today, zoning already permits another ${commas(stats.unbuilt)} square feet on these 82 lots. No rezoning, no variance, no argument. The largest single piece of it sits on a lot the city owns itself.`,
    legend: [['rgba(16,14,12,.16)', 'Built out'], [COLOR.volt, 'Room to spare'], [COLOR.flare, 'A lot of room'], [COLOR.magenta, 'The biggest']]
  },
  {
    id: 'field', step: 'And', title: 'What it is like to be here',
    figure: '—', label: 'observed, not yet measured',
    body: 'Sidewalks that are wide and still not wide enough. Trucks. A bus lane that gives up behind traffic at rush hour. None of this is in the parcel data, which is exactly why somebody has to walk it.',
    legend: [[COLOR.magenta, 'Something worth noticing']]
  }
];
let chapter = CHAPTERS[0];

function renderChapters() {
  const nav = $('#chapters');
  CHAPTERS.forEach(c => {
    const b = el('button', 'chapter', `<i>${c.step}</i><b>${c.title}</b>`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(c === chapter));
    b.addEventListener('click', () => setChapter(c));
    nav.append(b);
  });
  nav.setAttribute('role', 'tablist');
  addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = CHAPTERS.indexOf(chapter);
    const next = e.key === 'ArrowRight'
      ? (i + 1) % CHAPTERS.length
      : (i - 1 + CHAPTERS.length) % CHAPTERS.length;
    setChapter(CHAPTERS[next]);
  });
}

function setChapter(c) {
  chapter = c;
  [...$('#chapters').children].forEach((b, i) =>
    b.setAttribute('aria-selected', String(CHAPTERS[i] === c)));
  $('#chapterBig').textContent   = c.figure;
  $('#chapterLabel').textContent = c.label;
  $('#chapterBody').textContent  = c.body;
  $('#legend').innerHTML = c.legend
    .map(([col, txt]) => `<span><i style="background:${col}"></i>${txt}</span>`).join('');
  paintMap();
}

/* ══════════════════════════════════════════════════════════════════════
   MAP
   ══════════════════════════════════════════════════════════════════════ */
mapboxgl.accessToken = MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: at(5200), zoom: 14.05, bearing: 28.9,
  attributionControl: true
});
map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

const collection = features => ({ type: 'FeatureCollection', features });
const lineAlong = (a, b, step = 60) => {
  const pts = [];
  for (let f = a; f < b; f += step) pts.push(at(f));
  pts.push(at(b));
  return pts;
};

map.on('load', () => {
  /* the street */
  map.addSource('street', { type: 'geojson', data: {
    type: 'Feature', geometry: { type: 'LineString', coordinates: LINE.map(p => [p[1], p[2]]) } } });
  map.addLayer({ id: 'street', type: 'line', source: 'street',
    paint: { 'line-color': COLOR.ink, 'line-width': 2, 'line-opacity': .45 } });

  /* the four hubs */
  map.addSource('hubs', { type: 'geojson', data: collection(HUBS.map(h => ({
    type: 'Feature', properties: { name: h.name },
    geometry: { type: 'LineString', coordinates: lineAlong(h.a, h.b) } }))) });
  map.addLayer({ id: 'hubBand', type: 'line', source: 'hubs',
    paint: { 'line-color': COLOR.ink, 'line-width': 24, 'line-opacity': .12, 'line-blur': 1 } }, 'street');
  map.addLayer({ id: 'hubLabel', type: 'symbol', source: 'hubs',
    layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'], 'text-size': 12,
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, -2.1],
      'text-letter-spacing': .06 },
    paint: { 'text-color': COLOR.ink, 'text-halo-color': COLOR.paper, 'text-halo-width': 2 } });

  /* the lots */
  map.addSource('lots', { type: 'geojson', data: collection(LOTS.map((l, i) => ({
    type: 'Feature', id: i,
    properties: { i, unbuilt: l.unbuilt, own: l.own, hub: inHub(l.ft), addr: l.addr, owner: l.owner },
    geometry: { type: 'Point', coordinates: [l.lon, l.lat] } }))) });
  map.addLayer({ id: 'lots', type: 'circle', source: 'lots',
    paint: {
      'circle-color': COLOR.flare, 'circle-radius': 6, 'circle-opacity': .85,
      'circle-stroke-color': COLOR.paper, 'circle-stroke-width': 1.4,
      'circle-color-transition': { duration: 420 }, 'circle-radius-transition': { duration: 420 }
    } });
  map.addLayer({ id: 'lotHalo', type: 'circle', source: 'lots',
    filter: ['==', ['get', 'i'], -1],
    paint: { 'circle-radius': 17, 'circle-color': 'transparent',
      'circle-stroke-color': COLOR.ink, 'circle-stroke-width': 2 } });

  /* the field notes */
  map.addSource('field', { type: 'geojson', data: collection(FIELD_NOTES.map((n, i) => ({
    type: 'Feature', properties: { i, t: n.t },
    geometry: { type: 'Point', coordinates: at(n.ft) } }))) });
  map.addLayer({ id: 'field', type: 'circle', source: 'field',
    paint: { 'circle-radius': 7, 'circle-color': COLOR.magenta,
      'circle-stroke-color': COLOR.paper, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'fieldLabel', type: 'symbol', source: 'field',
    layout: { 'text-field': ['get', 't'], 'text-size': 11, 'text-offset': [0, 1.6],
      'text-max-width': 15, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'] },
    paint: { 'text-color': COLOR.magenta, 'text-halo-color': COLOR.paper, 'text-halo-width': 2 } });

  wireInteraction();
  setChapter(chapter);
});

function paintMap() {
  if (!map.getLayer('lots')) return;
  const show = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  show('hubBand',    chapter.id === 'hubs');
  show('hubLabel',   chapter.id === 'hubs');
  show('field',      chapter.id === 'field' && FIELD_NOTES.length > 0);
  show('fieldLabel', chapter.id === 'field' && FIELD_NOTES.length > 0);

  map.setPaintProperty('lots', 'circle-color',
    chapter.id === 'owners'
      ? ['match', ['get', 'own'],
          'City', COLOR.cobalt,
          'Tax exempt', COLOR.grape,
          'City and private', COLOR.grape,
          COLOR.stone]
    : chapter.id === 'capacity'
      ? ['interpolate', ['linear'], ['get', 'unbuilt'],
          0, 'rgba(16,14,12,.16)', 50000, COLOR.volt, 220000, COLOR.flare, 540000, COLOR.magenta]
    : ['case', ['boolean', ['get', 'hub'], false], COLOR.ink, COLOR.flare]);

  map.setPaintProperty('lots', 'circle-radius',
    chapter.id === 'capacity'
      ? ['interpolate', ['linear'], ['zoom'],
          13, ['max', 3, ['*', .011, ['sqrt', ['get', 'unbuilt']]]],
          16, ['max', 5, ['*', .05,  ['sqrt', ['get', 'unbuilt']]]]]
      : ['interpolate', ['linear'], ['zoom'], 13, 4.5, 16, 9]);
}

/* ── hover, select, fly ───────────────────────────────────────────────── */
const tooltip = $('#tooltip');

function wireInteraction() {
  map.on('mousemove', 'lots', e => {
    const f = e.features[0];
    map.getCanvas().style.cursor = 'pointer';
    tooltip.innerHTML = `<b>${f.properties.addr || 'Unnamed lot'}</b>` +
      `<span>${commas(f.properties.unbuilt)} sq ft unbuilt</span>`;
    tooltip.dataset.show = 'true';
    tooltip.style.left = Math.min(innerWidth - 265, e.originalEvent.clientX + 16) + 'px';
    tooltip.style.top  = (e.originalEvent.clientY + 16) + 'px';
    highlight(f.properties.i);
  });
  map.on('mouseleave', 'lots', () => {
    map.getCanvas().style.cursor = '';
    tooltip.dataset.show = 'false';
    highlight(-1);
  });
  map.on('click', 'lots', e => selectLot(LOTS[e.features[0].properties.i]));

  map.on('mouseenter', 'field', () => map.getCanvas().style.cursor = 'help');
  map.on('mouseleave', 'field', () => map.getCanvas().style.cursor = '');
}

function highlight(i) {
  if (map.getLayer('lotHalo')) map.setFilter('lotHalo', ['==', ['get', 'i'], i]);
  document.querySelectorAll('.row').forEach(r =>
    r.classList.toggle('is-active', +r.dataset.i === i));
}

function selectLot(lot) {
  const panel = $('#lotPanel');
  panel.dataset.empty = 'false';
  $('#lotEyebrow').textContent =
    `${lot.side === 'n' ? 'North side' : 'South side'} · ${lot.zone || 'no district'} · ${lot.year || 'year unknown'}`;
  $('#lotAddress').textContent = lot.addr || 'Unnamed lot';

  $('#lotCapacity').hidden = false;
  const pct = lot.allowed ? Math.min(100, lot.built / lot.allowed * 100) : 0;
  $('#capBuilt').style.width = pct + '%';
  $('#capBuiltLabel').textContent   = 'built ' + lot.built.toFixed(1);
  $('#capAllowedLabel').textContent = 'allowed ' + lot.allowed.toFixed(1);

  const rows = [
    ['Owner', lot.owner || 'Unknown'],
    ['Ownership', lot.own],
    ['Land use', lot.use],
    ['Lot area', commas(lot.lotarea) + ' sq ft'],
    ['Floors', lot.floors || '—'],
    ['Standing today', commas(lot.bldgarea) + ' sq ft'],
    ['Unbuilt, allowed now', commas(lot.unbuilt) + ' sq ft']
  ];
  $('#lotFacts').innerHTML = rows
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function flyToLot(lot) {
  map.flyTo({ center: [lot.lon, lot.lat], zoom: 16.4, bearing: 28.9, duration: reduced ? 0 : 1200 });
  selectLot(lot);
  highlight(LOTS.indexOf(lot));
  $('#instrument').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════════════════
   LEAGUE TABLE
   ══════════════════════════════════════════════════════════════════════ */
function renderLeague() {
  const top = stats.ranked.slice(0, 10);
  const max = top[0].unbuilt;
  const list = $('#leagueTable');
  top.forEach((lot, n) => {
    const li = el('li');
    const row = el('button', 'row', `
      <span class="row__rank">${String(n + 1).padStart(2, '0')}</span>
      <span class="row__addr">${lot.addr || 'Unnamed lot'}${
        lot.grade !== 'plain' ? `<i class="flag flag--${lot.grade}">${lot.grade === 'landmark' ? 'landmark' : 'special district'}</i>` : ''
      }</span>
      <span class="row__owner">${lot.owner || 'Unknown'}</span>
      <span class="row__num">${commas(lot.unbuilt)}</span>
      <span class="row__bar"><i style="width:${(lot.unbuilt / max * 100).toFixed(1)}%"></i></span>`);
    row.type = 'button';
    row.dataset.i = LOTS.indexOf(lot);
    row.addEventListener('mouseenter', () => highlight(+row.dataset.i));
    row.addEventListener('mouseleave', () => highlight(-1));
    row.addEventListener('click', () => flyToLot(lot));
    li.append(row);
    list.append(li);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   OWNERSHIP
   ══════════════════════════════════════════════════════════════════════ */
function renderOwnership() {
  const groups = [
    { key: 'City, coded as such',  color: COLOR.cobalt, test: l => l.ownertype === 'C' },
    { key: 'Tax exempt or mixed',  color: COLOR.grape,  test: l => l.ownertype === 'X' || l.ownertype === 'M' },
    { key: 'Not coded by the city', color: COLOR.stone, test: l => !l.ownertype || l.ownertype === 'P' }
  ].map(g => {
    const lots = LOTS.filter(g.test);
    return { ...g, lots, count: lots.length, unbuilt: lots.reduce((s, l) => s + l.unbuilt, 0) };
  });

  $('#ownershipSplit').innerHTML = groups.map(g => `
    <div>
      <output class="figure">${g.count}</output>
      <span class="figure__label"><i class="swatch" style="background:${g.color}"></i>${g.key}</span>
      <span class="figure__label">${commas(g.unbuilt)} sq ft unbuilt</span>
    </div>`).join('');

  const waffle = $('#waffle');
  groups.forEach(g => g.lots.forEach(() => {
    const cell = el('span');
    cell.style.background = g.color;
    waffle.append(cell);
  }));

  /* the comparison that does the arguing */
  const city = groups[0], rest = groups[2];
  $('#ownershipNote').innerHTML =
    `Lots the city codes as its own carry <b>${commas(city.unbuilt)} square feet</b> of apparent capacity across ${city.count} lots. ` +
    `The ${rest.count} lots PLUTO leaves uncoded, which are mostly but not certainly private, carry <b>${commas(rest.unbuilt)}</b>. ` +
    `That is a real gap, but it compares a field the city filled in against one it left blank, so it points a direction rather than proving one.`;
}


/* ══════════════════════════════════════════════════════════════════════
   THE RECORD
   Standard public chronology of the 42nd Street Development Project.
   Flagged in the page as needing a check against Sagalyn before publishing.
   ══════════════════════════════════════════════════════════════════════ */
const TIMELINE = [
  { year: '1976', text: 'Mayor\u2019s Office of Midtown Enforcement reports on the street.' },
  { year: '1980', text: 'City and State announce the 42nd Street Development Project.', key: true },
  { year: '1984', text: 'Plan approved. Four office towers at Times Square, theatres restored.' },
  { year: '1990', text: 'The State condemns the properties. The block changes hands.', key: true },
  { year: '1992', text: '42nd Street Now! An interim plan, after the office market collapses.', key: true },
  { year: '1995', text: 'The New Amsterdam is leased to Disney.' },
  { year: '1997', text: 'The New Victory and the restored theatres reopen.' },
  { year: '2000s', text: 'The towers finally get built, two decades after they were drawn.' }
  /* no entry for her. whether she appears on this chronology, and in what
     words, is hers to decide. the previous line said 2026; she has lived in
     Hell's Kitchen since June 2025. */
];

const LESSONS = [
  { h: 'It takes longer than a career',
    p: 'The project outlasted four mayors. Sagalyn calls the failure mode the disease of bureaucracy: passed from staff person to staff person, none with more than limited concern for its overall well being, and no institutional knowledge to inform the effort.' },
  { h: 'It is political suicide by default',
    p: 'Large, slow, complicated projects do not fit the normal time horizon of elected office, which rewards quick results and visible wins. Anyone who starts one is gambling.' },
  { h: 'Coalitions are the actual material',
    p: 'Implementation is not static. Alliances shift, opponents sometimes sign on late, and the planner\u2019s job becomes forming the public interest rather than merely serving it.' },
  { h: 'Individuals still move it',
    p: 'Specific people, placed well when an opportunity opens, make things happen apart from market and political forces. That is the encouraging half of the argument.' }
];

function renderRecord() {
  $('#timeline').innerHTML = TIMELINE.map(t =>
    `<li${t.key ? ' data-key="true"' : ''}><b>${t.year}</b><span>${t.text}</span></li>`).join('');
  $('#lessons').innerHTML = LESSONS.map(l =>
    `<div><h4>${l.h}</h4><p>${l.p}</p></div>`).join('');
}

/* ══════════════════════════════════════════════════════════════════════
   INSTRUMENTS
   Koch's toolkit, per Sagalyn, set against the ground it can still reach.
   ══════════════════════════════════════════════════════════════════════ */
function renderInstruments() {
  const has = l => l.unbuilt > 0;
  const sets = [
    { name: 'Financial assistance',
      reach: 'Abatements, subsidy and loan programmes. Reaches private owners sitting on capacity they have not used.',
      lots: LOTS.filter(l => l.own === 'Private' && has(l)) },
    { name: 'Supportive land use policy',
      reach: 'The whole street. Every lot is governed by a district that could be changed, and most were last set decades ago.',
      lots: LOTS.filter(has) },
    { name: 'Negotiated development deals',
      reach: 'Where the city is already the landowner and can trade floor area for something it wants.',
      lots: LOTS.filter(l => l.own === 'City' && has(l)) },
    { name: 'Midtown rezoning',
      reach: 'Lots already built to or past their allowance, where more space needs a change in the rules rather than a deal.',
      note: 'The figure is small precisely because these lots are full. Rezoning is the only instrument that reaches them at all.',
      lots: LOTS.filter(l => l.allowed > 0 && l.built / l.allowed > 0.85) },
    { name: 'Special institutional arrangements',
      reach: 'Tax exempt and mixed ownership. Institutions, not markets, and they move on different logic.',
      lots: LOTS.filter(l => (l.own === 'Tax exempt' || l.own === 'City and private') && has(l)) },
    { name: 'Enlisting the state',
      reach: 'The authorities. Port Authority and MTA hold the two ends of the street and answer to Albany, not City Hall.',
      note: 'They hold the terminals at both ends and almost no unused zoning capacity on the street itself, which is its own finding.',
      lots: LOTS.filter(l => /authority|state of new york|transit/i.test(l.owner || '')) }
  ].map(s => ({ ...s, count: s.lots.length, capacity: s.lots.reduce((a, l) => a + l.unbuilt, 0) }));

  sets.forEach(s => { s.plain = s.lots.filter(l => l.grade === 'plain').reduce((a, l) => a + l.unbuilt, 0); });
  const max = Math.max(...sets.map(s => s.capacity)) || 1;
  $('#matrix').innerHTML = sets.map((s, i) => `
    <div class="instrument-row">
      <span class="instrument-row__n">${String(i + 1).padStart(2, '0')}</span>
      <span class="instrument-row__name">${s.name}</span>
      <span class="instrument-row__reach">${s.reach}${s.note ? `<em class="instrument-row__note">${s.note}</em>` : ''}</span>
      <span class="instrument-row__num">${commas(s.capacity)}<em>sq ft on ${s.count} lots<br>${commas(s.plain)} of it unqualified</em></span>
      <span class="instrument-row__bar"><i style="width:${(s.capacity / max * 100).toFixed(1)}%"></i></span>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════════════
   HOW THIS COULD BE WRONG
   ══════════════════════════════════════════════════════════════════════ */
const CAVEATS = [
  { h: 'PLUTO reports a base FAR, not the governing rule',
    p: '66 of the 82 lots sit inside the Special Midtown, Special Clinton or Special Transit Land Use districts. In those districts the base residential and commercial FAR in the data is not what actually controls the site. Bonuses, subdistrict caps and transferable theatre rights all sit outside this dataset. Every figure on those lots is a screen, not an entitlement.' },
  { h: 'Nine lots are landmarked',
    p: 'Together they carry 435,901 square feet of floor area that exists only on paper. The New Amsterdam on West 42nd is an individual and interior landmark and appeared fifth in the ranking before this check. It is flagged now.' },
  { h: 'The ownership field is half empty',
    p: 'The city codes ownership for only 24 of the 82 lots. The other 58 are blank, and blank usually means private but is not a statement that it is. Any claim comparing public to private holdings on this street is comparing a filled field against an empty one.' },
  { h: 'Owner name is not always the owner',
    p: 'The second largest opening is recorded to a limited liability company while the ownership field says city. On the development project blocks the city or state can hold the land while a private entity holds the lease. The name in the data is not proof of control.' },
  { h: 'The lot set is drawn by distance, not by frontage',
    p: 'A lot counts if its centre falls within 125 feet of the centreline, or if it is addressed on 42nd Street within 230 feet. That is a reasonable rule and it is still a rule I chose. A few lots addressed on the avenues and side streets are in, and a few deep lots that front 42nd may be out.' },
  { h: 'What would settle it',
    p: 'Read the Special Midtown District text for each subdistrict, pull the Landmarks Preservation Commission designations, check the ZoLa entry lot by lot, and confirm ownership through ACRIS rather than PLUTO. That is the work between a screening number and a defensible one.' }
];

function renderCaveats() {
  const grades = ['plain', 'special', 'landmark'].map(g => ({
    g, ...GRADE[g], count: gradeCount(g), sqft: gradeSum(g)
  }));
  const total = grades.reduce((s, x) => s + x.sqft, 0) || 1;
  $('#gradeBars').innerHTML = grades.map(x => `
    <div class="grade grade--${x.g}">
      <span class="grade__bar" style="flex-basis:${(x.sqft / total * 100).toFixed(1)}%"></span>
      <output class="figure">${commas(x.sqft)}</output>
      <span class="figure__label">${x.label}, ${x.count} lots</span>
      <p>${x.note}</p>
    </div>`).join('');
  $('#caveats').innerHTML = CAVEATS.map((c, i) => `
    <div class="caveat">
      <span class="caveat__n">${String(i + 1).padStart(2, '0')}</span>
      <div><h4>${c.h}</h4><p>${c.p}</p></div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════ */
renderFigures();
renderRecord();
renderChapters();
renderLeague();
renderOwnership();
renderInstruments();
renderCaveats();
setChapter(chapter);

})();
