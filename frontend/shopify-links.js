(function() {
  'use strict';

  var state = {
    current: null,
    compare: null,
    rows: [],
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
  var statusText = document.getElementById('statusText');
  var meta = document.getElementById('meta');
  var kpiGrid = document.getElementById('kpiGrid');
  var tableCount = document.getElementById('tableCount');
  var tableBody = document.getElementById('tableBody');

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
    statusText.textContent = text || (isLoading ? '正在加载...' : '准备就绪');
  }

  function fetchRange(since, until) {
    var params = new URLSearchParams({
      store: storeSelect.value,
      since: since,
      until: until,
      limit: '1000'
    });
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

  function renderTable() {
    var q = searchInput.value.trim().toLowerCase();
    var rows = state.rows.filter(function(row) { return matchesSearch(row, q); });
    tableCount.textContent = formatNumber(rows.length) + ' 条';
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="21"><div class="empty">没有匹配的数据</div></td></tr>';
      return;
    }
    tableBody.innerHTML = rows.slice(0, Number(limitSelect.value) || 10).map(function(row, index) {
      var pctClass = deltaClass(row.sessions_delta_pct);
      return '<tr>' +
        '<td class="rank">' + (index + 1) + '</td>' +
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
    renderTable();
    if (state.current) {
      var storeNames = (state.current.stores || []).map(function(store) { return store.label; }).join(' / ') || '站点';
      meta.textContent = storeNames + ' · 当前 ' + state.current.since + ' 至 ' + state.current.until +
        ' · 对比 ' + state.compare.since + ' 至 ' + state.compare.until;
    }
  }

  function loadData() {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value || !compareSinceInput.value || !compareUntilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, '正在读取 Shopify 链接访问量...');
    Promise.all([
      fetchRange(sinceInput.value, untilInput.value),
      fetchRange(compareSinceInput.value, compareUntilInput.value)
    ]).then(function(results) {
      state.current = results[0];
      state.compare = results[1];
      state.rows = combineRows(state.current.rows || [], state.compare.rows || []);
      setLoading(false, '已加载 ' + formatNumber(state.rows.length) + ' 条链接数据');
      render();
    }).catch(function(err) {
      state.current = null;
      state.compare = null;
      state.rows = [];
      renderTable();
      kpiGrid.innerHTML = '';
      setLoading(false, '加载失败：' + err.message);
    });
  }

  sinceInput.addEventListener('change', syncCompareDates);
  untilInput.addEventListener('change', syncCompareDates);
  searchInput.addEventListener('input', renderTable);
  limitSelect.addEventListener('change', renderTable);
  loadBtn.addEventListener('click', loadData);

  setDefaultDates();
  renderTable();
  loadData();
})();
