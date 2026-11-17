// Token Radar's page: renders the board from the data this entry wrote, with no network at all.
// Every implied value on this page is recomputed from the fit in the data, and the page says how
// many of its recomputed values match the board exactly.

(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) {
    document.getElementById('board-count').textContent = 'No radar data was loaded.';
    return;
  }

  var PAGE = 60;
  var state = { tab: 'radar', q: '', category: '', sort: 'rank', watchlistOnly: false, shown: PAGE, detail: null };

  function $(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function age(n) { return n === null || n === undefined ? '—' : n + 'd'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // The model, as this page states it: the same formula lib/model.ts fitted, run again here.
  function recompute(row) {
    var fit = D.fit, p = D.priors;
    var catAdj = fit.category_adjustment[row.category || 'Uncategorised'] || 0;
    var base = Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd) + catAdj);
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(p.growth_cap, Math.max(p.growth_floor, row.change_7d));
    var growthMult = 1 + (g / 100) * p.growth_weight;
    var ageDays = row.age_days === null || row.age_days === undefined ? D.unknown_age_days : row.age_days;
    var maturityMult = p.maturity_floor + (Math.min(Math.max(ageDays, 0), p.maturity_days) / p.maturity_days) * p.maturity_range;
    var implied = Math.max(1, Math.round(base * growthMult * maturityMult));
    return { base: base, catAdj: catAdj, growthPct: g, growthMult: growthMult, maturityMult: maturityMult, implied: implied };
  }

  function multiple(row) { return row.implied_value_usd / row.tvl_usd; }

  function headStats() {
    var stats = [
      { v: D.board_size, l: 'pre-token rows' },
      { v: D.watchlist_size, l: 'on the watchlist' },
      { v: D.early_size, l: 'early, off the list' },
      { v: D.live_size, l: 'live tokens shown' },
    ];
    $('head-stats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + s.v + '</b><span>' + s.l + '</span></div>';
    }).join('');
  }

  function fitLine() {
    var f = D.fit, v = D.validation;
    $('fit-line').innerHTML =
      'Fitted on <b>' + f.fit_size + '</b> trading protocols: slope <b>' + f.slope.toFixed(3) +
      '</b>, intercept <b>' + f.intercept.toFixed(3) +
      '</b>, global median <b>' + f.global_median_multiple.toFixed(3) +
      '</b> market-cap dollars per TVL dollar. Out of sample (fit on one half, scored on the other ' +
      v.test_size + '): median error <b>' + v.median_abs_log10_error.toFixed(2) +
      '</b> in log10, <b>' + Math.round(v.within_2x * 100) + '%</b> within 2&times;, <b>' +
      Math.round(v.within_3x * 100) + '%</b> within 3&times;, against a flat-multiple baseline of <b>' +
      v.baseline_median_abs_log10_error.toFixed(2) + '</b>.';
    var ok = 0;
    D.rows.forEach(function (r) { if (recompute(r).implied === r.implied_value_usd) ok++; });
    $('check-line').textContent =
      'Model check: this page recomputed every implied value from the fit above — ' + ok + ' of ' + D.rows.length + ' rows match the board exactly.';
  }

  function categories() {
    var seen = {};
    D.rows.forEach(function (r) { seen[r.category || 'Uncategorised'] = true; });
    var sel = $('category');
    Object.keys(seen).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; sel.appendChild(o);
    });
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category && (r.category || 'Uncategorised') !== state.category) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d);
      if (key === 'age') return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days);
      if (key === 'name') return a.name < b.name ? -1 : 1;
      if (key === 'category') return (a.category || '') < (b.category || '') ? -1 : 1;
      if (key === 'multiple') return multiple(b) - multiple(a);
      if (key === 'implied') return b.implied_value_usd - a.implied_value_usd;
      return a.rank - b.rank;
    });
    return rows;
  }

  function renderBoard() {
    var title = $('board-title'), count = $('board-count'), more = $('more');
    if (state.tab === 'live') {
      title.textContent = 'Live tokens';
      count.textContent = D.live.length + ' protocols whose token already trades, by market cap. Their values are the market\'s, not this radar\'s.';
      var live = D.live.filter(function (r) {
        var q = state.q.trim().toLowerCase();
        if (state.category && (r.category || 'Uncategorised') !== state.category) return false;
        if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      $('rows').innerHTML = live.map(function (r, i) {
        return '<tr><td class="num">' + (i + 1) + '</td>' +
          '<td class="name">' + esc(r.name) + '<small>' + esc(r.slug) + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + '</small></td>' +
          '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + pct(r.change_7d) + '</td><td class="num">—</td>' +
          '<td class="num">' + money(r.mcap_usd || 0) + '</td>' +
          '<td class="num">&times;' + (r.mcap_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) : '—') + '</td></tr>';
      }).join('');
      more.style.display = 'none';
      return;
    }
    var rows = filteredRows();
    title.textContent = 'Ranked board';
    count.textContent = rows.length + ' of ' + D.rows.length + ' pre-token rows. Click a row for its model breakdown and farm plan.';
    var shown = rows.slice(0, state.shown);
    $('rows').innerHTML = shown.map(function (r) {
      return '<tr class="row' + (state.detail === r.slug ? ' sel' : '') + '" data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + (r.watchlist ? '<span class="badge">watchlist</span>' : '') +
        '<small>' + esc(r.slug) + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + '</small></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">&times;' + multiple(r).toFixed(2) + '</td></tr>';
    }).join('');
    more.style.display = rows.length > state.shown ? '' : 'none';
    more.textContent = 'Show more (' + Math.min(state.shown, rows.length) + ' of ' + rows.length + ' shown)';
  }

  function openDetail(slug) {
    var row = null;
    D.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    var panel = $('detail');
    if (!row) { panel.hidden = true; state.detail = null; return; }
    state.detail = slug;
    var m = recompute(row);
    $('detail-name').textContent = row.name;
    $('detail-meta').textContent = row.slug + ' · ' + (row.category || 'Uncategorised') + ' · ' +
      (row.chains.join(', ') || 'no chain listed') + ' · TVL ' + money(row.tvl_usd) + ' · 7d ' +
      (row.change_7d === null ? 'n/a' : (row.change_7d > 0 ? '+' : '') + row.change_7d.toFixed(1) + '%') +
      ' · listed ' + (row.listed_at || 'unknown') + ' · age ' + age(row.age_days);
    $('detail-implied').textContent = money(row.implied_value_usd);
    $('detail-model').innerHTML =
      '<tr><td>Base curve value (size curve &times; category adjustment)</td><td>' + money(m.base) + '</td></tr>' +
      '<tr><td>Category adjustment, log10 (' + esc(row.category || 'Uncategorised') + ')</td><td>' + (m.catAdj >= 0 ? '+' : '') + m.catAdj.toFixed(3) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + (row.change_7d === null ? 'n/a' : m.growthPct.toFixed(1) + '%') + ')</td><td>&times;' + m.growthMult.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity multiplier (age ' + age(row.age_days) + (row.age_days === null ? ', pre-token median ' + D.unknown_age_days + 'd used' : '') + ')</td><td>&times;' + m.maturityMult.toFixed(3) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td><b>' + money(m.implied) + '</b></td></tr>';
    $('detail-note').textContent =
      'Records no token — no market cap, no CoinGecko id, no symbol — so it ranks on this implied value, not a market price. The multiple is ×' +
      multiple(row).toFixed(2) + ' of TVL. Fitted on the snapshot as of ' + D.as_of + '; model ' + D.model_version + '.';
    $('detail-steps').innerHTML = row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    panel.hidden = false;
    renderBoard();
  }

  function setTab(tab) {
    state.tab = tab;
    $('tab-radar').classList.toggle('on', tab === 'radar');
    $('tab-live').classList.toggle('on', tab === 'live');
    state.shown = PAGE;
    renderBoard();
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = kv[0], v = kv[1] ? decodeURIComponent(kv[1]) : '';
      if (k === 'detail' && v) state.detail = v;
      if (k === 'q' && v) { state.q = v; $('q').value = v; }
      if (k === 'category' && v) { state.category = v; $('category').value = v; }
      if (k === 'tab' && (v === 'live' || v === 'radar')) setTab(v);
      if (k === 'sort' && v) { state.sort = v; $('sort').value = v; }
    });
  }

  // Wire up the controls.
  $('q').addEventListener('input', function () { state.q = this.value; state.shown = PAGE; renderBoard(); });
  $('category').addEventListener('change', function () { state.category = this.value; state.shown = PAGE; renderBoard(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; state.shown = PAGE; renderBoard(); });
  $('watchlist-only').addEventListener('change', function () { state.watchlistOnly = this.checked; state.shown = PAGE; renderBoard(); });
  $('clear').addEventListener('click', function () {
    state.q = ''; state.category = ''; state.sort = 'rank'; state.watchlistOnly = false; state.shown = PAGE;
    $('q').value = ''; $('category').value = ''; $('sort').value = 'rank'; $('watchlist-only').checked = false;
    renderBoard();
  });
  $('tab-radar').addEventListener('click', function () { setTab('radar'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });
  $('more').addEventListener('click', function () { state.shown += PAGE; renderBoard(); });
  $('detail-close').addEventListener('click', function () { openDetail(null); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (key === 'rank' || key === 'implied') state.sort = 'rank';
      else if (key === 'name') state.sort = 'name';
      else if (key === 'category') state.sort = 'category';
      else if (key === 'tvl') state.sort = 'tvl';
      else if (key === 'growth') state.sort = 'growth';
      else if (key === 'age') state.sort = 'age';
      else if (key === 'multiple') state.sort = 'multiple';
      state.shown = PAGE;
      $('sort').value = state.sort === 'name' || state.sort === 'category' || state.sort === 'multiple' ? 'rank' : state.sort;
      renderBoard();
    });
  });

  headStats();
  fitLine();
  categories();
  $('foot-line').textContent =
    'Snapshot as of ' + D.as_of + ' · source ' + D.source + ' · ' + D.rows.length +
    ' pre-token protocols ranked, ' + D.watchlist_size + ' on the watchlist, ' + D.early_size +
    ' found early · ' + D.excluded_bridges + ' bridges set aside unranked · model ' + D.model_version + '.';
  readHash();
  renderBoard();
  if (state.detail) {
    openDetail(state.detail);
    $('detail').scrollIntoView();
  }
})();
