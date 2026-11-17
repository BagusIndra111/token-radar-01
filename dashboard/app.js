// Pulse — the token launch radar's page (own work, no framework, no network).
//
// Reads window.RADAR (written by main.ts from the sealed snapshot), renders
// the ranked board, filters it, sorts it, and opens a detail view for any
// protocol. State lives in the URL (?slug, ?scope, ?cat, ?chain, ?q, ?min,
// ?sort) so a view can be linked to and a screenshot can be reproduced.

const D = window.RADAR;
const $ = (id) => document.getElementById(id);

function fmtUsd(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return sign + n.toFixed(1) + '%';
}

function fmtAge(days) {
  if (days === null || days === undefined) return '—';
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  return days + 'd';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---- header, stats, model note ---- */
$('asof').textContent =
  'Snapshot ' + D.asOf + ' · ' + D.rankedSize + ' protocols that record no token, ranked by what their token would be worth.';

function stat(value, label) {
  return '<div class="stat"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
}
$('stats').innerHTML =
  stat(D.rankedSize, 'ranked launches') +
  stat(D.watchlistSize, 'on the watchlist') +
  stat(D.preTokenSize, 'pre-token in snapshot') +
  stat(fmtUsd(D.boardTvlUsd), 'board TVL');

$('model-note').innerHTML =
  '<b>How implied value is computed:</b> <code>TVL × 0.30</code> × growth (7-day TVL change) × maturity (age with no token) × category × chains. ' +
  esc(D.model.growthNote) + ' ' + esc(D.model.maturityNote) +
  ' The watchlist is the floor, never the ceiling: protocols below it are ranked too.';

$('source-line').textContent = 'Source: ' + D.source + ' · Floor: ' + fmtUsd(D.floorUsd) + ' · Model ' + D.model.version + '.';

/* ---- filter options ---- */
const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
for (const c of cats) $('cat').append(new Option(c, c));
for (const c of chains) $('chain').append(new Option(c, c));

/* ---- state ---- */
const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') || '',
  cat: params.get('cat') || '',
  chain: params.get('chain') || '',
  scope: params.get('scope') || 'all',
  min: Number(params.get('min') || 0),
  sort: params.get('sort') || 'implied',
  slug: params.get('slug') || '',
};
$('q').value = state.q;
$('cat').value = state.cat;
$('chain').value = state.chain;
$('scope').value = state.scope;
$('minTvl').value = String(state.min);
$('sort').value = state.sort;

function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.cat) p.set('cat', state.cat);
  if (state.chain) p.set('chain', state.chain);
  if (state.scope !== 'all') p.set('scope', state.scope);
  if (state.min) p.set('min', String(state.min));
  if (state.sort !== 'implied') p.set('sort', state.sort);
  if (state.slug) p.set('slug', state.slug);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = D.rows.filter((r) => {
    if (state.scope === 'watchlist' && !r.watchlist) return false;
    if (state.scope === 'floor' && r.tvl_usd >= D.floorUsd) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (r.tvl_usd < state.min) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
    return true;
  });
  const by = {
    implied: (a, b) => a.implied_value_usd - b.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -999) - (a.change_7d ?? -999),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
  };
  rows = rows.slice().sort(by[state.sort] || by.implied);
  if (state.sort === 'implied') rows.reverse();
  return rows;
}

const topImplied = D.rows[0] ? D.rows[0].implied_value_usd : 1;

function renderBoard() {
  const rows = visibleRows();
  $('count').textContent = rows.length + ' of ' + D.rows.length + ' shown';
  $('empty').hidden = rows.length > 0;
  $('rows').innerHTML = rows.map((r) => {
    const cls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
    const pct = 100 * (r.implied_value_usd / topImplied);
    return '<tr data-slug="' + esc(r.slug) + '" class="' +
      (r.rank <= 3 ? 'top3 ' : '') + (r.slug === state.slug ? 'sel' : '') + '">' +
      '<td class="rank">' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span></span></td>' +
      '<td><span class="tag' + (r.watchlist ? ' watch' : '') + '">' + esc(r.category || '—') +
      (r.watchlist ? ' · ★' : '') + '</span></td>' +
      '<td>' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + cls + '">' + fmtPct(r.change_7d) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num"><span class="implied">' + fmtUsd(r.implied_value_usd) + '</span>' +
      '<span class="bar"><i style="width:' + Math.max(2, pct).toFixed(1) + '%"></i></span></td>' +
      '</tr>';
  }).join('');
  document.querySelectorAll('#rows tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      state.slug = tr.getAttribute('data-slug') || '';
      syncUrl();
      renderBoard();
      renderDetail();
    });
  });
}

function renderDetail() {
  const box = $('detail');
  const r = D.rows.find((x) => x.slug === state.slug);
  if (!r) {
    box.innerHTML = '<div class="card"><p class="placeholder">Select a protocol on the board to see its detail: implied value, what moves it, and the five steps to farm it.</p></div>';
    return;
  }
  const base = r.tvl_usd * D.model.baseMultiple;
  const factorRow = (label, value) =>
    '<tr><td>' + esc(label) + '</td><td>' + esc(value) + '</td></tr>';
  box.innerHTML = '<div class="card">' +
    '<h2>' + esc(r.name) + '</h2><div class="slug">' + esc(r.slug) + '</div>' +
    '<div class="big"><b>' + fmtUsd(r.implied_value_usd) + '</b><span>implied value · rank #' + r.rank + ' of ' + D.rows.length +
    (r.watchlist ? ' · on the watchlist' : r.tvl_usd < D.floorUsd ? ' · below the floor' : ' · above the floor, not on the watchlist') + '</span></div>' +
    '<div class="kv">' +
    '<div><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b></div>' +
    '<div><span>7-day change</span><b>' + fmtPct(r.change_7d) + '</b></div>' +
    '<div><span>Age with no token</span><b>' + fmtAge(r.age_days) + '</b></div>' +
    '<div><span>Category</span><b>' + esc(r.category || '—') + '</b></div>' +
    '<div><span>Chains</span><b>' + esc(r.chains.join(', ')) + '</b></div>' +
    '<div><span>Tracked since</span><b>' + esc(r.listed_at || '—') + '</b></div>' +
    '</div>' +
    '<div class="factors"><h3>What moves the value</h3><table>' +
    factorRow('TVL × 0.30 (base)', fmtUsd(base)) +
    factorRow('Growth ' + fmtPct(r.growth_pct) + ' in 7 days', '× ' + r.growth_mult.toFixed(2)) +
    factorRow('Maturity (' + fmtAge(r.age_days) + ' with no token)', '× ' + r.maturity_mult.toFixed(2)) +
    factorRow('Category (' + (r.category || 'other') + ')', '× ' + r.category_mult.toFixed(2)) +
    factorRow('Chains (' + r.chains.length + ')', '× ' + r.chain_mult.toFixed(2)) +
    factorRow('Implied value', fmtUsd(r.implied_value_usd)) +
    '</table></div>' +
    '<div class="steps"><h3>Farm it — five steps</h3><ol>' +
    r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') +
    '</ol></div>' +
    '<p class="hint">Records no token — never “has none”: its DefiLlama record may simply not carry one. Nothing here predicts whether or when a token is issued.</p>' +
    '</div>';
}

/* ---- live-token comparison ---- */
$('live').innerHTML = '<thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Token</th></tr></thead><tbody>' +
  D.live.map((p) => '<tr><td><span class="name">' + esc(p.name) + '</span></td><td>' + esc(p.category || '—') + '</td>' +
    '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
    '<td class="num">' + esc(p.symbol || '—') + '</td></tr>').join('') + '</tbody>';

/* ---- wire the filters ---- */
function bind(id, key, parse) {
  const el = $(id);
  const apply = () => {
    state[key] = parse ? parse(el.value) : el.value;
    syncUrl();
    renderBoard();
  };
  // Selects fire change, text inputs fire input: listen to both so a filter
  // always applies, however the control was set.
  el.addEventListener('input', apply);
  el.addEventListener('change', apply);
}
bind('q', 'q');
bind('cat', 'cat');
bind('chain', 'chain');
bind('scope', 'scope');
bind('minTvl', 'min', (v) => Number(v));
bind('sort', 'sort');

renderBoard();
renderDetail();
