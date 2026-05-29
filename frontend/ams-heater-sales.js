(function() {
  'use strict';

  var state = { data: null, rows: [], loading: false };
  var storeSelect = document.getElementById('storeSelect');
  var sinceInput = document.getElementById('sinceInput');
  var untilInput = document.getElementById('untilInput');
  var searchInput = document.getElementById('searchInput');
  var loadBtn = document.getElementById('loadBtn');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var meta = document.getElementById('meta');
  var kpiGrid = document.getElementById('kpiGrid');
  var countryBody = document.getElementById('countryBody');
  var skuBody = document.getElementById('skuBody');
  var tableBody = document.getElementById('tableBody');
  var countryCount = document.getElementById('countryCount');
  var skuCount = document.getElementById('skuCount');
  var rowCount = document.getElementById('rowCount');
  var charts = {};
  var colors = ['#2f80ed', '#218a54', '#b7791f', '#c53030', '#805ad5', '#0f766e', '#dd6b20', '#4a5568'];

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  function formatMoney(value) {
    return '$' + Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  function setDefaultDates() {
    var now = new Date();
    sinceInput.value = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    untilInput.value = formatDate(now);
  }

  function setLoading(isLoading, text) {
    state.loading = isLoading;
    loadBtn.disabled = isLoading;
    refreshBtn.disabled = isLoading;
    statusText.textContent = text || (isLoading ? '正在加载...' : '准备就绪');
  }

  function fetchData(refresh) {
    var params = new URLSearchParams({
      store: storeSelect.value,
      since: sinceInput.value,
      until: untilInput.value,
      limit: '50000'
    });
    if (refresh) params.set('refresh', '1');
    return fetch('/api/shopify/ams-heater-sales?' + params.toString()).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || data.error) throw new Error(data.error || '请求失败');
        return data;
      });
    });
  }

  function renderKpis() {
    var totals = state.data?.totals || {};
    var rows = state.rows || [];
    var stores = state.data?.stores || [];
    var countryCountValue = new Set(rows.map(function(row) { return row.shipping_country; })).size;
    var skuCountValue = new Set(rows.map(function(row) { return row.product_variant_sku; })).size;
    var avgPrice = totals.net_items_sold ? totals.total_sales / totals.net_items_sold : 0;
    var items = [
      ['总销量', formatNumber(totals.net_items_sold), 'net_items_sold'],
      ['总销售额', formatMoney(totals.total_sales), 'USD'],
      ['覆盖站点', formatNumber(stores.length), 'US / UK / FR / DE / IT'],
      ['销售国家', formatNumber(countryCountValue), 'shipping_country'],
      ['SKU 数', formatNumber(skuCountValue), 'product_variant_sku'],
      ['件均销售额', formatMoney(avgPrice), 'total_sales / net_items_sold']
    ];
    kpiGrid.innerHTML = items.map(function(item) {
      return '<div class="kpi"><div class="label">' + item[0] + '</div><div class="value">' + item[1] + '</div><div class="sub">' + item[2] + '</div></div>';
    }).join('');
  }

  function destroyChart(name) {
    if (charts[name]) {
      charts[name].destroy();
      charts[name] = null;
    }
  }

  function renderCharts() {
    if (typeof Chart === 'undefined' || !state.data) return;
    var daily = state.data.breakdowns?.daily || [];
    var stores = state.data.breakdowns?.by_store || [];

    destroyChart('daily');
    charts.daily = new Chart(document.getElementById('dailyChart'), {
      type: 'line',
      data: {
        labels: daily.map(function(item) { return item.label; }),
        datasets: [
          { label: '销量', data: daily.map(function(item) { return item.net_items_sold; }), borderColor: '#2f80ed', backgroundColor: 'rgba(47,128,237,.12)', tension: .28, yAxisID: 'y' },
          { label: '销售额', data: daily.map(function(item) { return item.total_sales; }), borderColor: '#218a54', backgroundColor: 'rgba(33,138,84,.12)', tension: .28, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#6b7280' }, grid: { color: '#edf2f7' } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#6b7280' } },
          x: { ticks: { color: '#6b7280', maxRotation: 0 }, grid: { display: false } }
        }
      }
    });

    destroyChart('store');
    charts.store = new Chart(document.getElementById('storeChart'), {
      type: 'doughnut',
      data: {
        labels: stores.map(function(item) { return item.label; }),
        datasets: [{ data: stores.map(function(item) { return item.net_items_sold; }), backgroundColor: colors, borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderBreakdown(body, rows, type) {
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3"><div class="empty">暂无数据</div></td></tr>';
      return;
    }
    body.innerHTML = rows.slice(0, 15).map(function(row) {
      var label = type === 'sku'
        ? '<span class="sku">' + escapeHtml(row.label) + '</span>'
        : '<span class="badge">' + escapeHtml(row.label) + '</span>';
      return '<tr><td>' + label + '</td><td class="number">' + formatNumber(row.net_items_sold) + '</td><td class="number">' + formatMoney(row.total_sales) + '</td></tr>';
    }).join('');
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    return [row.store_label, row.shipping_country, row.product_variant_sku, row.day].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function renderTable() {
    var q = searchInput.value.trim().toLowerCase();
    var rows = state.rows.filter(function(row) { return matchesSearch(row, q); });
    rowCount.textContent = formatNumber(rows.length) + ' 条';
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="6"><div class="empty">暂无匹配数据</div></td></tr>';
      return;
    }
    tableBody.innerHTML = rows.map(function(row) {
      return '<tr>' +
        '<td>' + escapeHtml(row.day || '-') + '</td>' +
        '<td><span class="badge">' + escapeHtml(row.store_label || '-') + '</span></td>' +
        '<td>' + escapeHtml(row.shipping_country || '-') + '</td>' +
        '<td><span class="sku">' + escapeHtml(row.product_variant_sku || '-') + '</span></td>' +
        '<td class="number">' + formatNumber(row.net_items_sold) + '</td>' +
        '<td class="number">' + formatMoney(row.total_sales) + '</td>' +
      '</tr>';
    }).join('');
  }

  function render() {
    renderKpis();
    renderCharts();
    var countries = state.data?.breakdowns?.by_country || [];
    var skus = state.data?.breakdowns?.by_sku || [];
    countryCount.textContent = formatNumber(countries.length) + ' 个国家';
    skuCount.textContent = formatNumber(skus.length) + ' 个 SKU';
    renderBreakdown(countryBody, countries, 'country');
    renderBreakdown(skuBody, skus, 'sku');
    renderTable();
    if (state.data) {
      var stores = (state.data.stores || []).map(function(store) { return store.label; }).join(' / ') || '站点';
      var cacheText = state.data.cached_at ? (state.data.from_cache ? '缓存 ' : '已刷新 ') + new Date(state.data.cached_at).toLocaleString('zh-CN') : '';
      meta.textContent = stores + ' · AMS Heater · ' + state.data.since + ' 至 ' + state.data.until + (cacheText ? ' · ' + cacheText : '');
    }
  }

  function loadData(refresh) {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, refresh ? '正在刷新 AMS Heater 销售数据...' : '正在读取 AMS Heater 销售缓存...');
    fetchData(refresh).then(function(data) {
      state.data = data;
      state.rows = data.rows || [];
      setLoading(false, '已加载 ' + formatNumber(state.rows.length) + ' 条 AMS Heater 销售数据');
      render();
    }).catch(function(err) {
      state.data = null;
      state.rows = [];
      Object.keys(charts).forEach(destroyChart);
      kpiGrid.innerHTML = '';
      renderTable();
      setLoading(false, '加载失败：' + err.message);
    });
  }

  storeSelect.addEventListener('change', function() { loadData(false); });
  searchInput.addEventListener('input', renderTable);
  loadBtn.addEventListener('click', function() { loadData(false); });
  refreshBtn.addEventListener('click', function() { loadData(true); });

  setDefaultDates();
  loadData(false);
})();
