(function() {
  'use strict';

  var stores = [
    { key: 'ALL', label: '全部', color: '#3b6ef5' },
    { key: 'SHOPIFY_US_STORE', label: 'US', color: '#3b6ef5' },
    { key: 'SHOPIFY_UK_STORE', label: 'UK', color: '#059669' },
    { key: 'SHOPIFY_FR_STORE', label: 'FR', color: '#b45309' },
    { key: 'SHOPIFY_DE_STORE', label: 'DE', color: '#dc2626' },
    { key: 'SHOPIFY_IT_STORE', label: 'IT', color: '#805ad5' }
  ];
  var colors = ['#3b6ef5', '#059669', '#b45309', '#dc2626', '#805ad5', '#0f766e', '#dd6b20', '#4a5568', '#0891b2', '#7c3aed'];
  var storeColors = stores.reduce(function(map, store) {
    map[store.label] = store.color;
    return map;
  }, {});
  var state = {
    data: null,
    rows: [],
    filteredRows: [],
    compare: null,
    store: 'ALL',
    page: 1,
    pageSize: 8,
    compareEnabled: false,
    loading: false,
    sortCol: 'sessions',
    sortDir: 'desc'
  };
  var charts = {};

  var sinceInput = document.getElementById('sinceInput');
  var untilInput = document.getElementById('untilInput');
  var compareSinceInput = document.getElementById('compareSinceInput');
  var compareUntilInput = document.getElementById('compareUntilInput');
  var compareToggle = document.getElementById('compareToggle');
  var compareBox = document.getElementById('compareBox');
  var storeTabs = document.getElementById('storeTabs');
  var channelSelect = document.getElementById('channelSelect');
  var searchInput = document.getElementById('searchInput');
  var loadBtn = document.getElementById('loadBtn');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var kpiGrid = document.getElementById('kpiGrid');
  var funnelRange = document.getElementById('funnelRange');
  var funnelGrid = document.getElementById('funnelGrid');
  var channelChartLabel = document.getElementById('channelChartLabel');
  var trafficChartLabel = document.getElementById('trafficChartLabel');
  var tableLabel = document.getElementById('tableLabel');
  var landingChartLabel = document.getElementById('landingChartLabel');
  var dailyLegend = document.getElementById('dailyLegend');
  var pageTable = document.getElementById('pageTable');
  var prevPageBtn = document.getElementById('prevPageBtn');
  var nextPageBtn = document.getElementById('nextPageBtn');
  var pageText = document.getElementById('pageText');
  var pageSizeSelect = document.getElementById('pageSizeSelect');

  function formatNumber(value) {
    return Math.round(Number(value || 0)).toLocaleString('zh-CN');
  }

  function formatRate(value) {
    return (Number(value || 0) * 100).toFixed(2) + '%';
  }

  function formatDuration(value) {
    var seconds = Math.round(Number(value || 0));
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return minutes ? minutes + '分' + String(rest).padStart(2, '0') + '秒' : rest + '秒';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function formatDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function dateAdd(date, days) {
    var next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function daysBetween(since, until) {
    return Math.max(1, Math.round((new Date(until) - new Date(since)) / 86400000) + 1);
  }

  function setComparePreviousPeriod() {
    if (!sinceInput.value || !untilInput.value) return;
    var len = daysBetween(sinceInput.value, untilInput.value);
    var compareUntil = dateAdd(new Date(sinceInput.value), -1);
    var compareSince = dateAdd(compareUntil, -len + 1);
    compareSinceInput.value = formatDate(compareSince);
    compareUntilInput.value = formatDate(compareUntil);
  }

  function setDefaultDates() {
    var now = new Date();
    sinceInput.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    untilInput.value = formatDate(now);
    setComparePreviousPeriod();
  }

  function setPreset(type) {
    var now = new Date();
    if (type === 'month') {
      sinceInput.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    } else {
      sinceInput.value = formatDate(dateAdd(now, -Number(type) + 1));
    }
    untilInput.value = formatDate(now);
    setComparePreviousPeriod();
    loadData(false);
  }

  function setLoading(isLoading, text) {
    state.loading = isLoading;
    loadBtn.disabled = isLoading;
    refreshBtn.disabled = isLoading;
    statusText.textContent = text || (isLoading ? '正在加载...' : '准备就绪');
  }

  function fetchRange(since, until, refresh) {
    var params = new URLSearchParams({
      store: state.store,
      since: since,
      until: until,
      limit: '1000'
    });
    if (channelSelect.value) params.set('channel', channelSelect.value);
    if (refresh) params.set('refresh', '1');
    return fetch('/api/shopify/link-analytics?' + params.toString()).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || data.error) throw new Error(data.error || '请求失败');
        return data;
      });
    });
  }

  function colorFor(label, index) {
    return storeColors[label] || colors[index % colors.length];
  }

  function destroyChart(name) {
    if (charts[name]) {
      charts[name].destroy();
      charts[name] = null;
    }
  }

  function chartTextColor() {
    return '#9ca3af';
  }

  function chartGridColor() {
    return 'rgba(0,0,0,.06)';
  }

  function shortLabel(value, max) {
    value = String(value || '-');
    return value.length > max ? value.slice(0, max - 1) + '…' : value;
  }

  function cvr(row) {
    return Number(row.checkout_conversion_rate || row.conversion_rate || 0);
  }

  function deltaHtml(current, previous, percentInput) {
    previous = Number(previous || 0);
    current = Number(current || 0);
    if (!previous) return '<span class="delta flat">-</span>';
    var diff = percentInput ? current - previous : (current - previous) / previous;
    var label = percentInput ? ((diff * 100).toFixed(2) + 'pt') : (Math.abs(diff) * 100).toFixed(1) + '%';
    var cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    var sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    return '<span class="delta ' + cls + '">' + sign + label + '</span>';
  }

  function kpiCard(highlight, label, value, compareValue, formatter, foot, percentInput) {
    var cmp = state.compareEnabled && state.compare && compareValue != null
      ? '<div class="kcmp">对比：' + formatter(compareValue) + ' ' + deltaHtml(value, compareValue, percentInput) + '</div>'
      : '';
    return '<div class="kpi' + (highlight ? ' hi' : '') + '">' +
      '<div class="kl">' + label + '</div>' +
      '<div class="kv">' + formatter(value) + '</div>' +
      cmp +
      '<div class="kft">' + foot + '</div>' +
    '</div>';
  }

  function linkKey(row) {
    return [
      row.store_label || row.store_key || '',
      row.landing_page_type || '',
      row.landing_page_path || row.url || '',
      row.referring_channel || '',
      row.traffic_type || ''
    ].join('|');
  }

  function attachCompareRows(rows, compareRows) {
    var map = new Map();
    (compareRows || []).forEach(function(row) {
      map.set(linkKey(row), row);
    });
    return (rows || []).map(function(row) {
      var cmp = map.get(linkKey(row)) || {};
      return Object.assign({}, row, {
        compare_online_store_visitors: Number(cmp.online_store_visitors || 0),
        compare_sessions: Number(cmp.sessions || 0),
        compare_added_to_cart_rate: Number(cmp.added_to_cart_rate || 0),
        compare_checkout_conversion_rate: Number(cmp.checkout_conversion_rate || 0),
        compare_conversion_rate: Number(cmp.conversion_rate || 0)
      });
    });
  }

  function renderKpis() {
    var totals = state.data?.totals || {};
    var cmp = state.compare?.totals || {};
    var rows = state.rows || [];
    kpiGrid.innerHTML =
      kpiCard(true, 'Sessions', totals.sessions, cmp.sessions, formatNumber, '链接 ' + formatNumber(rows.length) + ' 条') +
      kpiCard(false, '访客 UV', totals.online_store_visitors, cmp.online_store_visitors, formatNumber, 'Pageviews ' + formatNumber(totals.pageviews)) +
      kpiCard(false, '到达结账', totals.sessions_that_reached_checkout, cmp.sessions_that_reached_checkout, formatNumber, '到达率 ' + formatRate(totals.reached_checkout_rate)) +
      kpiCard(false, '完成结账', totals.sessions_that_completed_checkout, cmp.sessions_that_completed_checkout, formatNumber, '完成率 ' + formatRate(totals.completed_checkout_rate)) +
      kpiCard(true, '转化率', totals.conversion_rate, cmp.conversion_rate, formatRate, '平均时长 ' + formatDuration(totals.average_session_duration), true);
    return;
    kpiGrid.innerHTML =
      '<div class="kpi hi"><div class="kl">Sessions</div><div class="kv">' + formatNumber(totals.sessions) + '</div><div class="kft">链接 ' + formatNumber(rows.length) + ' 条</div></div>' +
      '<div class="kpi"><div class="kl">访客 UV</div><div class="kv">' + formatNumber(totals.online_store_visitors) + '</div><div class="kft">Pageviews ' + formatNumber(totals.pageviews) + '</div></div>' +
      '<div class="kpi"><div class="kl">到达结账</div><div class="kv">' + formatNumber(totals.sessions_that_reached_checkout) + '</div><div class="kft">到达率 ' + formatRate(totals.reached_checkout_rate) + '</div></div>' +
      '<div class="kpi"><div class="kl">完成结账</div><div class="kv">' + formatNumber(totals.sessions_that_completed_checkout) + '</div><div class="kft">完成率 ' + formatRate(totals.completed_checkout_rate) + '</div></div>' +
      '<div class="kpi hi"><div class="kl">转化率</div><div class="kv">' + formatRate(totals.conversion_rate) + '</div><div class="kft">平均时长 ' + formatDuration(totals.average_session_duration) + '</div></div>';
  }

  function renderFunnel() {
    var rows = state.data?.breakdowns?.by_store || [];
    funnelRange.textContent = (state.data?.since || '') + ' ~ ' + (state.data?.until || '') + (state.data?.channel ? ' · ' + state.data.channel : ' · 全部渠道');
    if (!rows.length) {
      funnelGrid.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    funnelGrid.innerHTML = rows.map(function(row, index) {
      var max = Math.max(1, row.sessions || 0);
      var reachedPct = row.sessions ? row.sessions_that_reached_checkout / row.sessions : 0;
      var completedPct = row.sessions ? row.sessions_that_completed_checkout / row.sessions : 0;
      var color = colorFor(row.label, index);
      return '<div class="fn-store">' +
        '<div class="fn-title"><span class="ld" style="background:' + color + '"></span>' + escapeHtml(row.label) + '</div>' +
        '<div class="fn-stages">' +
          funnelRow('Sessions', row.sessions, 1, color, max) +
          funnelRow('到达结账', row.sessions_that_reached_checkout, reachedPct, '#b45309', max) +
          funnelRow('完成结账', row.sessions_that_completed_checkout, completedPct, '#059669', max) +
        '</div>' +
      '</div>';
    }).join('');
  }

  function funnelRow(label, value, pct, color, max) {
    return '<div class="fn-row">' +
      '<div class="fn-lbl">' + label + '</div>' +
      '<div class="fn-bg"><div class="fn-fill" style="background:' + color + ';width:' + Math.max(2, value / max * 100) + '%"></div><span class="fn-num">' + formatNumber(value) + '</span></div>' +
      '<div class="fn-pct">' + Math.round(pct * 100) + '%</div>' +
    '</div>';
  }

  function chartBaseOptions(tickFormatter, showLegend) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: Boolean(showLegend), labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } },
        tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + tickFormatter(ctx.raw); } } }
      },
      scales: {
        x: { ticks: { color: chartTextColor(), font: { size: 9 }, autoSkip: true, maxTicksLimit: 12, maxRotation: 25 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: chartTextColor(), font: { size: 9 }, callback: tickFormatter }, grid: { color: chartGridColor() } }
      }
    };
  }

  function renderChannelChart() {
    var rows = (state.data?.breakdowns?.by_channel || []).slice(0, 12);
    channelChartLabel.textContent = rows.length + ' 个渠道';
    destroyChart('channel');
    charts.channel = new Chart(document.getElementById('channelChart'), {
      type: 'bar',
      data: {
        labels: rows.map(function(row) { return shortLabel(row.label, 16); }),
        datasets: [
          { label: 'Sessions', data: rows.map(function(row) { return row.sessions; }), backgroundColor: '#3b6ef588', borderColor: '#3b6ef5', borderWidth: 1, borderRadius: 4, yAxisID: 'sessions' },
          { label: 'CVR', data: rows.map(cvr), type: 'line', borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,.12)', borderWidth: 2, pointRadius: 3, yAxisID: 'rate', tension: .3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } } },
        scales: {
          x: { ticks: { color: chartTextColor(), font: { size: 9 }, maxRotation: 30, minRotation: 20 }, grid: { display: false } },
          sessions: { beginAtZero: true, ticks: { color: chartTextColor(), font: { size: 9 }, callback: formatNumber }, grid: { color: chartGridColor() } },
          rate: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: chartTextColor(), font: { size: 9 }, callback: function(value) { return (value * 100).toFixed(1) + '%'; } } }
        }
      }
    });
  }

  function renderTrafficChart() {
    var rows = (state.data?.breakdowns?.by_traffic || []).slice(0, 8);
    trafficChartLabel.textContent = rows.length + ' 种类型';
    destroyChart('traffic');
    charts.traffic = new Chart(document.getElementById('trafficChart'), {
      type: 'doughnut',
      data: {
        labels: rows.map(function(row) { return row.label; }),
        datasets: [{ data: rows.map(function(row) { return row.sessions; }), backgroundColor: colors, borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } } } }
    });
  }

  function renderLandingChart() {
    var rows = (state.data?.breakdowns?.by_type || []).slice(0, 10);
    landingChartLabel.textContent = rows.length + ' 类页面';
    destroyChart('landing');
    charts.landing = new Chart(document.getElementById('landingChart'), {
      type: 'bar',
      data: {
        labels: rows.map(function(row) { return shortLabel(row.label, 16); }),
        datasets: [
          { label: 'Sessions', data: rows.map(function(row) { return row.sessions; }), backgroundColor: '#05966988', borderColor: '#059669', borderWidth: 1, borderRadius: 4, yAxisID: 'sessions' },
          { label: 'CVR', data: rows.map(cvr), type: 'line', borderColor: '#dc2626', borderWidth: 2, pointRadius: 3, yAxisID: 'rate', tension: .3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } } },
        scales: {
          x: { ticks: { color: chartTextColor(), font: { size: 9 }, maxRotation: 30, minRotation: 20 }, grid: { display: false } },
          sessions: { beginAtZero: true, ticks: { color: chartTextColor(), font: { size: 9 }, callback: formatNumber }, grid: { color: chartGridColor() } },
          rate: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: chartTextColor(), font: { size: 9 }, callback: function(value) { return (value * 100).toFixed(1) + '%'; } } }
        }
      }
    });
  }

  function renderDailyChart() {
    var rows = state.data?.breakdowns?.daily || [];
    var compareRows = state.compare?.breakdowns?.daily || [];
    var datasets = [
      { label: 'Sessions', data: rows.map(function(row) { return row.sessions; }), borderColor: '#3b6ef5', backgroundColor: 'rgba(59,110,245,.12)', borderWidth: 2, pointRadius: 2, tension: .35 },
      { label: '访客', data: rows.map(function(row) { return row.online_store_visitors; }), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,.12)', borderWidth: 2, pointRadius: 2, tension: .35 }
    ];
    if (state.compareEnabled && state.compare) {
      datasets.push(
        { label: 'Sessions 对比', data: compareRows.map(function(row) { return row.sessions; }), borderColor: '#3b6ef599', borderDash: [5, 3], borderWidth: 2, pointRadius: 1, tension: .35 },
        { label: '访客 对比', data: compareRows.map(function(row) { return row.online_store_visitors; }), borderColor: '#05966999', borderDash: [5, 3], borderWidth: 2, pointRadius: 1, tension: .35 }
      );
    }
    dailyLegend.innerHTML = '<span class="leg"><span class="ld" style="background:#3b6ef5"></span>Sessions</span><span class="leg"><span class="ld" style="background:#059669"></span>访客</span>' + (state.compareEnabled && state.compare ? '<span class="leg"><span class="ld" style="background:#facc15"></span>对比</span>' : '');
    destroyChart('daily');
    charts.daily = new Chart(document.getElementById('dailyChart'), {
      type: 'line',
      data: {
        labels: rows.map(function(row) { return String(row.label).slice(5); }),
        datasets: datasets
      },
      options: chartBaseOptions(formatNumber, false)
    });
    return;
    dailyLegend.innerHTML = '<span class="leg"><span class="ld" style="background:#3b6ef5"></span>Sessions</span><span class="leg"><span class="ld" style="background:#059669"></span>访客</span>';
    destroyChart('daily');
    charts.daily = new Chart(document.getElementById('dailyChart'), {
      type: 'line',
      data: {
        labels: rows.map(function(row) { return String(row.label).slice(5); }),
        datasets: [
          { label: 'Sessions', data: rows.map(function(row) { return row.sessions; }), borderColor: '#3b6ef5', backgroundColor: 'rgba(59,110,245,.12)', borderWidth: 2, pointRadius: 2, tension: .35 },
          { label: '访客', data: rows.map(function(row) { return row.online_store_visitors; }), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,.12)', borderWidth: 2, pointRadius: 2, tension: .35 }
        ]
      },
      options: chartBaseOptions(formatNumber, false)
    });
  }

  function pageTypeClass(type, path) {
    var raw = String(type || '');
    var p = String(path || '');
    if (raw === 'Product' || p.indexOf('/products/') >= 0) return ['产品页', 'pt-prod'];
    if (raw === 'Collection' || p.indexOf('/collections/') >= 0) return ['分类页', 'pt-coll'];
    if (raw === 'Homepage' || p === '/') return ['首页', 'pt-home'];
    if (raw.indexOf('Blog') >= 0 || p.indexOf('/blogs/') >= 0) return ['博客', 'pt-blog'];
    if (raw === 'Cart' || p.indexOf('/cart') >= 0) return ['购物车', 'pt-cart'];
    if (raw === 'Custom Page' || p.indexOf('/pages/') >= 0) return ['页面', 'pt-pg'];
    return [raw || '其他', 'pt-oth'];
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    return [row.title, row.url, row.store_label, row.landing_page_type, row.landing_page_path, row.referring_channel, row.traffic_type].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function compareRows(a, b) {
    var col = state.sortCol;
    var av = a[col];
    var bv = b[col];
    if (typeof av === 'string') {
      return state.sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return state.sortDir === 'asc' ? Number(av || 0) - Number(bv || 0) : Number(bv || 0) - Number(av || 0);
  }

  function sortHeader(label, col, cls) {
    var arrow = state.sortCol === col ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return '<th class="' + (cls || '') + '" data-sort="' + col + '">' + label + arrow + '</th>';
  }

  function applyFilter() {
    var q = searchInput.value.trim().toLowerCase();
    state.filteredRows = state.rows.filter(function(row) { return matchesSearch(row, q); });
    state.page = 1;
    renderTable();
  }

  function renderTable() {
    var rows = state.filteredRows.slice().sort(compareRows);
    var totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = rows.slice(start, start + state.pageSize);
    tableLabel.textContent = formatNumber(rows.length) + ' 条链接';
    pageText.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页';
    prevPageBtn.disabled = state.loading || state.page <= 1;
    nextPageBtn.disabled = state.loading || state.page >= totalPages;
    if (!pageRows.length) {
      pageTable.innerHTML = '<tbody><tr><td><div class="empty">暂无匹配数据</div></td></tr></tbody>';
      return;
    }
    pageTable.innerHTML = '<thead><tr>' +
      '<th style="width:34px">#</th>' +
      sortHeader('站点', 'store_label') +
      sortHeader('标题', 'title') +
      sortHeader('链接', 'url') +
      sortHeader('类型', 'landing_page_type') +
      sortHeader('渠道', 'referring_channel') +
      sortHeader('流量类型', 'traffic_type') +
      sortHeader('访客', 'online_store_visitors', 'r') +
      sortHeader('Sessions', 'sessions', 'r') +
      sortHeader('加购率', 'added_to_cart_rate', 'r') +
      sortHeader('结账转化率', 'checkout_conversion_rate', 'r') +
      sortHeader('转化率', 'conversion_rate', 'r') +
    '</tr></thead><tbody>' +
      pageRows.map(function(row, index) {
        var typeInfo = pageTypeClass(row.landing_page_type, row.landing_page_path);
        return '<tr>' +
          '<td style="color:var(--t3)">' + (start + index + 1) + '</td>' +
          '<td>' + escapeHtml(row.store_label || '-') + '</td>' +
          '<td><div class="link-title">' + escapeHtml(row.title || '-') + '</div></td>' +
          '<td><a class="url" href="' + escapeHtml(row.url || '#') + '" target="_blank" rel="noreferrer">' + escapeHtml(row.url || '-') + '</a></td>' +
          '<td><span class="pt ' + typeInfo[1] + '">' + escapeHtml(typeInfo[0]) + '</span></td>' +
          '<td class="wrap-cell">' + escapeHtml(row.referring_channel || '-') + '</td>' +
          '<td class="wrap-cell">' + escapeHtml(row.traffic_type || '-') + '</td>' +
          '<td class="r">' + formatNumber(row.online_store_visitors) + (state.compareEnabled ? '<div class="kcmp">对比 ' + formatNumber(row.compare_online_store_visitors) + ' ' + deltaHtml(row.online_store_visitors, row.compare_online_store_visitors) + '</div>' : '') + '</td>' +
          '<td class="r"><strong>' + formatNumber(row.sessions) + '</strong>' + (state.compareEnabled ? '<div class="kcmp">对比 ' + formatNumber(row.compare_sessions) + ' ' + deltaHtml(row.sessions, row.compare_sessions) + '</div>' : '') + '</td>' +
          '<td class="r">' + formatRate(row.added_to_cart_rate) + '</td>' +
          '<td class="r">' + formatRate(row.checkout_conversion_rate) + '</td>' +
          '<td class="r">' + formatRate(row.conversion_rate) + (state.compareEnabled ? '<div class="kcmp">对比 ' + formatRate(row.compare_conversion_rate) + ' ' + deltaHtml(row.conversion_rate, row.compare_conversion_rate, true) + '</div>' : '') + '</td>' +
        '</tr>';
      }).join('') + '</tbody>';
  }

  function renderChannelOptions(data) {
    var selected = channelSelect.value;
    var channels = (data?.channel_options || data?.breakdowns?.by_channel || [])
      .map(function(item) { return item.label || 'Unknown'; })
      .filter(Boolean);
    var seen = {};
    channels = channels.filter(function(channel) {
      if (seen[channel]) return false;
      seen[channel] = true;
      return true;
    }).sort(function(a, b) { return a.localeCompare(b); });
    channelSelect.innerHTML = '<option value="">全部渠道</option>' + channels.map(function(channel) {
      return '<option value="' + escapeHtml(channel) + '"' + (channel === selected ? ' selected' : '') + '>' + escapeHtml(channel) + '</option>';
    }).join('');
    if (selected && !seen[selected]) {
      channelSelect.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(selected) + '" selected>' + escapeHtml(selected) + '</option>');
    }
  }

  function renderAll() {
    renderKpis();
    renderFunnel();
    renderChannelChart();
    renderTrafficChart();
    renderLandingChart();
    renderDailyChart();
    applyFilter();
  }

  function loadData(refresh) {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, refresh ? '正在刷新链接流量数据...' : '正在读取链接流量数据...');
    var jobs = [fetchRange(sinceInput.value, untilInput.value, refresh)];
    if (state.compareEnabled && compareSinceInput.value && compareUntilInput.value) {
      jobs.push(fetchRange(compareSinceInput.value, compareUntilInput.value, refresh));
    }
    Promise.all(jobs).then(function(results) {
      var data = results[0];
      state.compare = state.compareEnabled ? (results[1] || null) : null;
      state.data = data;
      state.rows = attachCompareRows(data.rows || [], state.compare?.rows || []);
      state.filteredRows = state.rows;
      state.page = 1;
      renderChannelOptions(data);
      setLoading(false, '已加载 ' + formatNumber(state.rows.length) + ' 条链接数据' + (data.from_cache ? '（缓存）' : ''));
      renderAll();
    }).catch(function(err) {
      state.data = null;
      state.compare = null;
      state.rows = [];
      state.filteredRows = [];
      Object.keys(charts).forEach(destroyChart);
      kpiGrid.innerHTML = '';
      funnelGrid.innerHTML = '<div class="empty">加载失败：' + escapeHtml(err.message) + '</div>';
      pageTable.innerHTML = '';
      setLoading(false, '加载失败：' + err.message);
    });
  }

  function renderStoreTabs() {
    storeTabs.innerHTML = stores.map(function(store) {
      return '<button class="store-tab' + (store.key === state.store ? ' on' : '') + '" data-store="' + store.key + '">' + store.label + '</button>';
    }).join('');
  }

  function bindEvents() {
    document.querySelectorAll('.preset').forEach(function(btn) {
      btn.addEventListener('click', function() { setPreset(btn.dataset.preset); });
    });
    storeTabs.addEventListener('click', function(event) {
      var btn = event.target.closest('[data-store]');
      if (!btn) return;
      state.store = btn.dataset.store;
      renderStoreTabs();
      loadData(false);
    });
    [sinceInput, untilInput].forEach(function(input) {
      input.addEventListener('change', function() {
        setComparePreviousPeriod();
        loadData(false);
      });
    });
    compareToggle.addEventListener('click', function() {
      state.compareEnabled = !state.compareEnabled;
      compareToggle.classList.toggle('on', state.compareEnabled);
      compareToggle.textContent = state.compareEnabled ? '取消对比时段' : '添加对比时段';
      compareBox.style.display = state.compareEnabled ? 'flex' : 'none';
      if (state.compareEnabled) setComparePreviousPeriod();
      loadData(false);
    });
    [compareSinceInput, compareUntilInput].forEach(function(input) {
      input.addEventListener('change', function() {
        if (state.compareEnabled) loadData(false);
      });
    });
    channelSelect.addEventListener('change', function() { loadData(false); });
    searchInput.addEventListener('input', applyFilter);
    loadBtn.addEventListener('click', function() { loadData(false); });
    refreshBtn.addEventListener('click', function() { loadData(true); });
    pageTable.addEventListener('click', function(event) {
      var th = event.target.closest('[data-sort]');
      if (!th) return;
      var col = th.dataset.sort;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = ['store_label', 'title', 'url', 'landing_page_type', 'referring_channel', 'traffic_type'].indexOf(col) >= 0 ? 'asc' : 'desc';
      }
      state.page = 1;
      renderTable();
    });
    prevPageBtn.addEventListener('click', function() {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });
    nextPageBtn.addEventListener('click', function() {
      var totalPages = Math.max(1, Math.ceil((state.filteredRows || []).length / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });
    pageSizeSelect.addEventListener('change', function() {
      state.pageSize = Number(pageSizeSelect.value) || 8;
      state.page = 1;
      renderTable();
    });
  }

  setDefaultDates();
  renderStoreTabs();
  bindEvents();
  loadData(false);
})();
