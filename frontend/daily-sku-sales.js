(function() {
  'use strict';

  var state = { data: null, rows: [], filteredRows: [], page: 1, pageSize: 50, loading: false };
  var storeSelect = document.getElementById('storeSelect');
  var sinceInput = document.getElementById('sinceInput');
  var untilInput = document.getElementById('untilInput');
  var searchInput = document.getElementById('searchInput');
  var loadBtn = document.getElementById('loadBtn');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var meta = document.getElementById('meta');
  var kpiGrid = document.getElementById('kpiGrid');
  var productBody = document.getElementById('productBody');
  var skuBody = document.getElementById('skuBody');
  var tableBody = document.getElementById('tableBody');
  var productCount = document.getElementById('productCount');
  var skuCount = document.getElementById('skuCount');
  var rowCount = document.getElementById('rowCount');
  var prevPageBtn = document.getElementById('prevPageBtn');
  var nextPageBtn = document.getElementById('nextPageBtn');
  var pageText = document.getElementById('pageText');
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
    sinceInput.value = formatDate(new Date(now.getFullYear(), 0, 1));
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
      limit: '1000'
    });
    if (refresh) params.set('refresh', '1');
    return fetch('/api/shopify/daily-sku-sales?' + params.toString()).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || data.error) throw new Error(data.error || '请求失败');
        return data;
      });
    });
  }

  function destroyChart(name) {
    if (charts[name]) {
      charts[name].destroy();
      charts[name] = null;
    }
  }

  function getUniqueCount(rows, field) {
    return new Set(rows.map(function(row) { return row[field]; }).filter(Boolean)).size;
  }

  function renderKpis() {
    var totals = state.data?.totals || {};
    var rows = state.rows || [];
    var stores = state.data?.stores || [];
    var avgPrice = totals.net_items_sold ? totals.total_sales / totals.net_items_sold : 0;
    var items = [
      ['总销量', formatNumber(totals.net_items_sold), 'net_items_sold'],
      ['总销售额', formatMoney(totals.total_sales), 'USD'],
      ['覆盖站点', formatNumber(stores.length), 'US / UK / FR / DE / IT'],
      ['销售国家', formatNumber(getUniqueCount(rows, 'shipping_country')), 'shipping_country'],
      ['产品数', formatNumber(getUniqueCount(rows, 'product_title')), 'product_title'],
      ['SKU 数', formatNumber(getUniqueCount(rows, 'product_variant_sku')), 'product_variant_sku'],
      ['件均销售额', formatMoney(avgPrice), 'total_sales / net_items_sold']
    ];
    kpiGrid.innerHTML = items.map(function(item) {
      return '<div class="kpi"><div class="label">' + item[0] + '</div><div class="value">' + item[1] + '</div><div class="sub">' + item[2] + '</div></div>';
    }).join('');
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
          x: { ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } }
        }
      }
    });

    destroyChart('store');
    charts.store = new Chart(document.getElementById('storeChart'), {
      type: 'doughnut',
      data: {
        labels: stores.map(function(item) { return item.label; }),
        datasets: [{ data: stores.map(function(item) { return item.total_sales; }), backgroundColor: colors, borderWidth: 0 }]
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
        : '<div class="product">' + escapeHtml(row.label) + '</div>';
      return '<tr><td>' + label + '</td><td class="number">' + formatNumber(row.net_items_sold) + '</td><td class="number">' + formatMoney(row.total_sales) + '</td></tr>';
    }).join('');
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    return [
      row.store_label,
      row.shop_name,
      row.shipping_country,
      row.product_title,
      row.product_variant_sku,
      row.day
    ].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function applyFilter() {
    var q = searchInput.value.trim().toLowerCase();
    state.filteredRows = state.rows.filter(function(row) { return matchesSearch(row, q); });
    state.page = 1;
    renderTable();
  }

  function renderTable() {
    var rows = state.filteredRows || [];
    var totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = rows.slice(start, start + state.pageSize);
    rowCount.textContent = formatNumber(rows.length) + ' 条';
    pageText.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页';
    prevPageBtn.disabled = state.loading || state.page <= 1;
    nextPageBtn.disabled = state.loading || state.page >= totalPages;

    if (!pageRows.length) {
      tableBody.innerHTML = '<tr><td colspan="7"><div class="empty">暂无匹配数据</div></td></tr>';
      return;
    }
    tableBody.innerHTML = pageRows.map(function(row) {
      return '<tr>' +
        '<td>' + escapeHtml(row.day || '-') + '</td>' +
        '<td><span class="badge">' + escapeHtml(row.store_label || '-') + '</span></td>' +
        '<td>' + escapeHtml(row.shipping_country || '-') + '</td>' +
        '<td><div class="product">' + escapeHtml(row.product_title || '-') + '</div></td>' +
        '<td><span class="sku">' + escapeHtml(row.product_variant_sku || '-') + '</span></td>' +
        '<td class="number">' + formatNumber(row.net_items_sold) + '</td>' +
        '<td class="number">' + formatMoney(row.total_sales) + '</td>' +
      '</tr>';
    }).join('');
  }

  function render() {
    renderKpis();
    renderCharts();
    var products = state.data?.breakdowns?.by_product || [];
    var skus = state.data?.breakdowns?.by_sku || [];
    productCount.textContent = formatNumber(products.length) + ' 个产品';
    skuCount.textContent = formatNumber(skus.length) + ' 个 SKU';
    renderBreakdown(productBody, products, 'product');
    renderBreakdown(skuBody, skus, 'sku');
    applyFilter();
    if (state.data) {
      var stores = (state.data.stores || []).map(function(store) { return store.label; }).join(' / ') || '站点';
      var cacheText = state.data.cached_at ? (state.data.from_cache ? '缓存 ' : '已刷新 ') + new Date(state.data.cached_at).toLocaleString('zh-CN') : '';
      meta.textContent = stores + ' · sales · ' + state.data.since + ' 至 ' + state.data.until + (cacheText ? ' · ' + cacheText : '');
    }
  }

  function loadData(refresh) {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, refresh ? '正在刷新每日 SKU 销量数据...' : '正在读取每日 SKU 销量缓存...');
    fetchData(refresh).then(function(data) {
      state.data = data;
      state.rows = data.rows || [];
      state.filteredRows = state.rows;
      setLoading(false, '已加载 ' + formatNumber(state.rows.length) + ' 条每日 SKU 销量数据');
      render();
    }).catch(function(err) {
      state.data = null;
      state.rows = [];
      state.filteredRows = [];
      Object.keys(charts).forEach(destroyChart);
      kpiGrid.innerHTML = '';
      productBody.innerHTML = '<tr><td colspan="3"><div class="empty">加载失败</div></td></tr>';
      skuBody.innerHTML = '<tr><td colspan="3"><div class="empty">加载失败</div></td></tr>';
      renderTable();
      setLoading(false, '加载失败：' + err.message);
    });
  }

  storeSelect.addEventListener('change', function() { loadData(false); });
  searchInput.addEventListener('input', applyFilter);
  loadBtn.addEventListener('click', function() { loadData(false); });
  refreshBtn.addEventListener('click', function() { loadData(true); });
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

  setDefaultDates();
  loadData(false);
})();
