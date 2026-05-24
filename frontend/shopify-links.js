(function() {
  'use strict';

  var state = {
    current: null,
    compare: null,
    rows: [],
    page: 1,
    loading: false
  };

  var storeSelect = document.getElementById('storeSelect');
  var sinceInput = document.getElementById('sinceInput');
  var untilInput = document.getElementById('untilInput');
  var compareSinceInput = document.getElementById('compareSinceInput');
  var compareUntilInput = document.getElementById('compareUntilInput');
  var limitSelect = document.getElementById('limitSelect');
  var searchInput = document.getElementById('searchInput');
  var loadBtn = document.getElementById('loadBtn');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var meta = document.getElementById('meta');
  var kpiGrid = document.getElementById('kpiGrid');
  var tableCount = document.getElementById('tableCount');
  var tableBody = document.getElementById('tableBody');
  var pagerInfo = document.getElementById('pagerInfo');
  var pagerButtons = document.getElementById('pagerButtons');
  var trendHint = document.getElementById('trendHint');
  var chartRefs = {};
  var chartColors = ['#2f80ed', '#218a54', '#b7791f', '#c53030', '#805ad5', '#0f766e', '#dd6b20', '#4a5568'];

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN');
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

  function toDate(value) {
    return new Date(value + 'T00:00:00');
  }

  function formatDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function diffDays(start, end) {
    return Math.round((toDate(end) - toDate(start)) / 86400000) + 1;
  }

  function setDefaultDates() {
    sinceInput.value = '2026-05-01';
    untilInput.value = '2026-05-23';
    syncCompareDates();
  }

  function syncCompareDates() {
    if (!sinceInput.value || !untilInput.value) return;
    var days = diffDays(sinceInput.value, untilInput.value);
    var currentStart = toDate(sinceInput.value);
    var compareEnd = new Date(currentStart);
    compareEnd.setDate(compareEnd.getDate() - 1);
    var compareStart = new Date(compareEnd);
    compareStart.setDate(compareStart.getDate() - days + 1);
    compareSinceInput.value = formatDate(compareStart);
    compareUntilInput.value = formatDate(compareEnd);
  }

  function setLoading(isLoading, text) {
    state.loading = isLoading;
    loadBtn.disabled = isLoading;
    refreshBtn.disabled = isLoading;
    statusText.textContent = text || (isLoading ? '正在加载...' : '准备就绪');
  }

  function fetchRange(since, until, refresh) {
    var params = new URLSearchParams({
      store: storeSelect.value,
      since: since,
      until: until,
      limit: '1000'
    });
    if (refresh) params.set('refresh', '1');
    return fetch('/api/shopify/link-analytics?' + params.toString()).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || data.error) throw new Error(data.error || '请求失败');
        return data;
      });
    });
  }

  function rowKey(row) {
    return [row.store_key || row.store_label || '', row.landing_page_type || '', row.landing_page_path || row.url].join('|');
  }

  function deltaPct(current, previous) {
    current = Number(current || 0);
    previous = Number(previous || 0);
    if (!previous && !current) return 0;
    if (!previous) return 100;
    return (current - previous) / previous * 100;
  }

  function deltaClass(value) {
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return '';
  }

  function deltaText(current, previous) {
    var pct = deltaPct(current, previous);
    var sign = pct > 0 ? '+' : '';
    return sign + pct.toFixed(1) + '%';
  }

  function shortLabel(value, max) {
    value = String(value || '-');
    return value.length > max ? value.slice(0, max - 1) + '…' : value;
  }

  function destroyChart(name) {
    if (chartRefs[name]) {
      chartRefs[name].destroy();
      chartRefs[name] = null;
    }
  }

  function chartBaseOptions(extra) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#4b5563', boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ' ' + ctx.dataset.label + ': ' + formatNumber(ctx.parsed.y == null ? ctx.parsed : ctx.parsed.y);
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#6b7280', maxRotation: 0 }, grid: { color: '#edf2f7' } },
        y: { ticks: { color: '#6b7280' }, grid: { color: '#edf2f7' } }
      }
    }, extra || {});
  }

  function renderCharts() {
    if (typeof Chart === 'undefined' || !state.current) return;
    var breakdowns = state.current.breakdowns || {};
    var totals = state.current.totals || {};

    destroyChart('trend');
    var channels = (breakdowns.by_channel || []).slice(0, 10);
    trendHint.textContent = channels.length + ' 个主要渠道';
    chartRefs.trend = new Chart(document.getElementById('trendChart'), {
      type: 'bar',
      data: {
        labels: channels.map(function(item) { return shortLabel(item.label, 18); }),
        datasets: [
          { label: 'Sessions', data: channels.map(function(item) { return item.sessions; }), backgroundColor: '#2f80ed' },
          { label: 'Pageviews', data: channels.map(function(item) { return item.pageviews; }), backgroundColor: 'rgba(33,138,84,.72)' }
        ]
      },
      options: chartBaseOptions({
        scales: {
          x: { ticks: { color: '#6b7280', maxRotation: 25 }, grid: { display: false } },
          y: { ticks: { color: '#6b7280' }, grid: { color: '#edf2f7' } }
        }
      })
    });

    destroyChart('store');
    var stores = (breakdowns.by_store || []).slice(0, 8);
    chartRefs.store = new Chart(document.getElementById('storeChart'), {
      type: 'bar',
      data: {
        labels: stores.map(function(item) { return item.label; }),
        datasets: [{ label: 'Sessions', data: stores.map(function(item) { return item.sessions; }), backgroundColor: chartColors }]
      },
      options: chartBaseOptions({ plugins: { legend: { display: false } } })
    });

    destroyChart('type');
    var types = (breakdowns.by_type || []).slice(0, 7);
    chartRefs.type = new Chart(document.getElementById('typeChart'), {
      type: 'doughnut',
      data: {
        labels: types.map(function(item) { return shortLabel(item.label, 18); }),
        datasets: [{ label: 'Sessions', data: types.map(function(item) { return item.sessions; }), backgroundColor: chartColors, borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: '#4b5563', boxWidth: 10, font: { size: 11 } } } } }
    });

    destroyChart('funnel');
    chartRefs.funnel = new Chart(document.getElementById('funnelChart'), {
      type: 'bar',
      data: {
        labels: ['Sessions', '到达结账', '完成结账'],
        datasets: [{
          label: '数量',
          data: [totals.sessions || 0, totals.sessions_that_reached_checkout || 0, totals.sessions_that_completed_checkout || 0],
          backgroundColor: ['#2f80ed', '#b7791f', '#218a54']
        }]
      },
      options: chartBaseOptions({
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#6b7280' }, grid: { color: '#edf2f7' } },
          y: { ticks: { color: '#6b7280' }, grid: { display: false } }
        }
      })
    });
  }

  function combineRows(currentRows, compareRows) {
    var compareMap = {};
    compareRows.forEach(function(row) {
      compareMap[rowKey(row)] = row;
    });
    return currentRows.map(function(row) {
      var previous = compareMap[rowKey(row)] || {};
      return Object.assign({}, row, {
        compare_sessions: Number(previous.sessions || 0),
        sessions_delta_pct: deltaPct(row.sessions, previous.sessions)
      });
    });
  }

  function renderKpis() {
    var cur = state.current?.totals || {};
    var cmp = state.compare?.totals || {};
    var items = [
      ['总访客', cur.online_store_visitors, cmp.online_store_visitors],
      ['Sessions', cur.sessions, cmp.sessions],
      ['到达结账', cur.sessions_that_reached_checkout, cmp.sessions_that_reached_checkout],
      ['到达并完成结账', cur.sessions_that_reached_and_completed_checkout, cmp.sessions_that_reached_and_completed_checkout],
      ['完成结账', cur.sessions_that_completed_checkout, cmp.sessions_that_completed_checkout],
      ['Pageviews', cur.pageviews, cmp.pageviews],
      ['跳出率', cur.bounce_rate, cmp.bounce_rate, 'rate'],
      ['平均时长', cur.average_session_duration, cmp.average_session_duration, 'duration'],
      ['加购率', cur.added_to_cart_rate, cmp.added_to_cart_rate, 'rate'],
      ['到达结账率', cur.reached_checkout_rate, cmp.reached_checkout_rate, 'rate'],
      ['完成结账率', cur.completed_checkout_rate, cmp.completed_checkout_rate, 'rate'],
      ['结账转化率', cur.checkout_conversion_rate, cmp.checkout_conversion_rate, 'rate'],
      ['转化率', cur.conversion_rate, cmp.conversion_rate, 'rate']
    ];
    kpiGrid.innerHTML = items.map(function(item) {
      var pct = deltaPct(item[1], item[2]);
      var value = item[3] === 'rate' ? formatRate(item[1]) : item[3] === 'duration' ? formatDuration(item[1]) : formatNumber(item[1]);
      return '<div class="kpi"><div class="label">' + escapeHtml(item[0]) + '</div>' +
        '<div class="value">' + value + '</div>' +
        '<div class="delta ' + deltaClass(pct) + '">环比 ' + deltaText(item[1], item[2]) + '</div></div>';
    }).join('');
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    return [
      row.title,
      row.url,
      row.store_label,
      row.landing_page_type,
      row.landing_page_path,
      row.referring_channel,
      row.traffic_type
    ].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function renderPager(total, pageSize) {
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = total ? (state.page - 1) * pageSize + 1 : 0;
    var end = Math.min(total, state.page * pageSize);
    pagerInfo.textContent = formatNumber(start) + '-' + formatNumber(end) + ' / ' + formatNumber(total);

    var buttons = [
      '<button type="button" class="page-btn" data-page="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>上一页</button>'
    ];
    var from = Math.max(1, state.page - 2);
    var to = Math.min(totalPages, state.page + 2);
    if (from > 1) {
      buttons.push('<button type="button" class="page-btn" data-page="1">1</button>');
      if (from > 2) buttons.push('<button type="button" class="page-btn" disabled>...</button>');
    }
    for (var page = from; page <= to; page += 1) {
      buttons.push('<button type="button" class="page-btn ' + (page === state.page ? 'active' : '') + '" data-page="' + page + '">' + page + '</button>');
    }
    if (to < totalPages) {
      if (to < totalPages - 1) buttons.push('<button type="button" class="page-btn" disabled>...</button>');
      buttons.push('<button type="button" class="page-btn" data-page="' + totalPages + '">' + totalPages + '</button>');
    }
    buttons.push('<button type="button" class="page-btn" data-page="' + (state.page + 1) + '"' + (state.page >= totalPages ? ' disabled' : '') + '>下一页</button>');
    pagerButtons.innerHTML = buttons.join('');
  }

  function renderTable() {
    var q = searchInput.value.trim().toLowerCase();
    var rows = state.rows.filter(function(row) { return matchesSearch(row, q); });
    var pageSize = Number(limitSelect.value) || 5;
    var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var offset = (state.page - 1) * pageSize;
    tableCount.textContent = formatNumber(rows.length) + ' 条';
    renderPager(rows.length, pageSize);
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="21"><div class="empty">没有匹配的数据</div></td></tr>';
      return;
    }
    tableBody.innerHTML = rows.slice(offset, offset + pageSize).map(function(row, index) {
      var pctClass = deltaClass(row.sessions_delta_pct);
      return '<tr>' +
        '<td class="rank">' + (offset + index + 1) + '</td>' +
        '<td><span class="type">' + escapeHtml(row.store_label || '-') + '</span></td>' +
        '<td class="title">' + escapeHtml(row.title || '-') + '</td>' +
        '<td><a class="url" href="' + escapeHtml(row.url) + '" target="_blank" rel="noreferrer">' + escapeHtml(row.url) + '</a></td>' +
        '<td><span class="type">' + escapeHtml(row.landing_page_type || '-') + '</span></td>' +
        '<td>' + escapeHtml(row.referring_channel || '-') + '</td>' +
        '<td>' + escapeHtml(row.traffic_type || '-') + '</td>' +
        '<td class="number">' + formatNumber(row.online_store_visitors) + '</td>' +
        '<td class="number">' + formatNumber(row.sessions) + '</td>' +
        '<td class="number"><span class="delta ' + pctClass + '">' + deltaText(row.sessions, row.compare_sessions) + '</span><div class="muted">对比 ' + formatNumber(row.compare_sessions) + '</div></td>' +
        '<td class="number">' + formatNumber(row.sessions_that_reached_checkout) + '</td>' +
        '<td class="number">' + formatNumber(row.sessions_that_reached_and_completed_checkout) + '</td>' +
        '<td class="number">' + formatNumber(row.sessions_that_completed_checkout) + '</td>' +
        '<td class="number">' + formatNumber(row.pageviews) + '</td>' +
        '<td class="number">' + formatRate(row.bounce_rate) + '</td>' +
        '<td class="number">' + formatDuration(row.average_session_duration) + '</td>' +
        '<td class="number">' + formatRate(row.added_to_cart_rate) + '</td>' +
        '<td class="number">' + formatRate(row.reached_checkout_rate) + '</td>' +
        '<td class="number">' + formatRate(row.completed_checkout_rate) + '</td>' +
        '<td class="number">' + formatRate(row.checkout_conversion_rate) + '</td>' +
        '<td class="number">' + formatRate(row.conversion_rate) + '</td>' +
      '</tr>';
    }).join('');
  }

  function render() {
    renderKpis();
    renderCharts();
    renderTable();
    if (state.current) {
      var storeNames = (state.current.stores || []).map(function(store) { return store.label; }).join(' / ') || '站点';
      meta.textContent = storeNames + ' · 当前 ' + state.current.since + ' 至 ' + state.current.until +
        ' · 对比 ' + state.compare.since + ' 至 ' + state.compare.until;
      if (state.current.cached_at || state.compare.cached_at) {
        meta.textContent += ' | 当前' + cacheLabel(state.current) + ' | 对比' + cacheLabel(state.compare);
      }
    }
  }

  function cacheLabel(data) {
    if (!data || !data.cached_at) return '';
    var label = data.from_cache ? '缓存' : '已刷新';
    return label + ' ' + new Date(data.cached_at).toLocaleString('zh-CN');
  }

  function loadData(refresh) {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value || !compareSinceInput.value || !compareUntilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, refresh ? '正在刷新 Shopify 链接访问量...' : '正在读取链接访问量缓存...');
    Promise.all([
      fetchRange(sinceInput.value, untilInput.value, refresh),
      fetchRange(compareSinceInput.value, compareUntilInput.value, refresh)
    ]).then(function(results) {
      state.current = results[0];
      state.compare = results[1];
      state.rows = combineRows(state.current.rows || [], state.compare.rows || []);
      state.page = 1;
      setLoading(false, '已加载 ' + formatNumber(state.rows.length) + ' 条链接数据 | 当前' + cacheLabel(state.current) + ' | 对比' + cacheLabel(state.compare));
      render();
    }).catch(function(err) {
      state.current = null;
      state.compare = null;
      state.rows = [];
      renderTable();
      kpiGrid.innerHTML = '';
      Object.keys(chartRefs).forEach(destroyChart);
      setLoading(false, '加载失败：' + err.message);
    });
  }

  sinceInput.addEventListener('change', syncCompareDates);
  untilInput.addEventListener('change', syncCompareDates);
  searchInput.addEventListener('input', function() {
    state.page = 1;
    renderTable();
  });
  limitSelect.addEventListener('change', function() {
    state.page = 1;
    renderTable();
  });
  pagerButtons.addEventListener('click', function(e) {
    var btn = e.target.closest('.page-btn');
    if (!btn || btn.disabled || !btn.dataset.page) return;
    state.page = Number(btn.dataset.page) || 1;
    renderTable();
  });
  loadBtn.addEventListener('click', function() { loadData(false); });
  refreshBtn.addEventListener('click', function() { loadData(true); });

  setDefaultDates();
  renderTable();
  loadData(false);
})();
