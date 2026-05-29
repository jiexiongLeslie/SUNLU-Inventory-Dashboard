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
    skuRows: [],
    compare: null,
    compareRows: [],
    compareSkuRows: [],
    store: 'ALL',
    page: 1,
    pageSize: 15,
    compareEnabled: false,
    sortCol: 'qty',
    sortDir: 'desc',
    loading: false
  };
  var charts = {};

  var sinceInput = document.getElementById('sinceInput');
  var untilInput = document.getElementById('untilInput');
  var compareSinceInput = document.getElementById('compareSinceInput');
  var compareUntilInput = document.getElementById('compareUntilInput');
  var compareToggle = document.getElementById('compareToggle');
  var compareBox = document.getElementById('compareBox');
  var storeTabs = document.getElementById('storeTabs');
  var searchInput = document.getElementById('searchInput');
  var loadBtn = document.getElementById('loadBtn');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var kpiGrid = document.getElementById('kpiGrid');
  var dailyLegend = document.getElementById('dailyLegend');
  var skuChartLabel = document.getElementById('skuChartLabel');
  var countryChartLabel = document.getElementById('countryChartLabel');
  var tableLabel = document.getElementById('tableLabel');
  var skuTable = document.getElementById('skuTable');
  var prevPageBtn = document.getElementById('prevPageBtn');
  var nextPageBtn = document.getElementById('nextPageBtn');
  var pageText = document.getElementById('pageText');
  var pageSizeSelect = document.getElementById('pageSizeSelect');

  function formatNumber(value) {
    return Math.round(Number(value || 0)).toLocaleString('zh-CN');
  }

  function formatMoney(value) {
    return '$' + Math.round(Number(value || 0)).toLocaleString('zh-CN');
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
    sinceInput.value = formatDate(new Date(now.getFullYear(), 0, 1));
    untilInput.value = formatDate(now);
    setComparePreviousPeriod();
  }

  function setPreset(type) {
    var now = new Date();
    if (type === 'ytd') {
      sinceInput.value = formatDate(new Date(now.getFullYear(), 0, 1));
    } else if (type === 'month') {
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
      limit: '50000'
    });
    if (refresh) params.set('refresh', '1');
    return fetch('/api/shopify/daily-sku-sales?' + params.toString()).then(function(res) {
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

  function chartOptions(tickFormatter, showLegend) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: Boolean(showLegend), labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } },
        tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + tickFormatter(ctx.raw); } } }
      },
      scales: {
        x: { ticks: { color: chartTextColor(), font: { size: 9 }, autoSkip: true, maxTicksLimit: 14, maxRotation: 0 }, grid: { color: chartGridColor() } },
        y: { beginAtZero: true, ticks: { color: chartTextColor(), font: { size: 9 }, callback: tickFormatter }, grid: { color: chartGridColor() } }
      }
    };
  }

  function getUniqueCount(rows, field) {
    return new Set(rows.map(function(row) { return row[field]; }).filter(Boolean)).size;
  }

  function deltaHtml(current, previous) {
    previous = Number(previous || 0);
    current = Number(current || 0);
    if (!previous) return '<span class="delta flat">-</span>';
    var diff = (current - previous) / previous;
    var cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    var sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    return '<span class="delta ' + cls + '">' + sign + (Math.abs(diff) * 100).toFixed(1) + '%</span>';
  }

  function kpiCard(highlight, label, value, compareValue, formatter, foot) {
    var cmp = state.compareEnabled && state.compare && compareValue != null
      ? '<div class="kcmp">对比：' + formatter(compareValue) + ' ' + deltaHtml(value, compareValue) + '</div>'
      : '';
    return '<div class="kpi' + (highlight ? ' hi' : '') + '">' +
      '<div class="kl">' + label + '</div>' +
      '<div class="kv">' + formatter(value) + '</div>' +
      cmp +
      '<div class="kft">' + foot + '</div>' +
    '</div>';
  }

  function renderKpis() {
    var totals = state.data?.totals || {};
    var cmp = state.compare?.totals || {};
    var rows = state.rows || [];
    var days = state.data?.breakdowns?.daily?.length || 1;
    var avgPrice = totals.net_items_sold ? totals.total_sales / totals.net_items_sold : 0;
    var cmpAvgPrice = cmp.net_items_sold ? cmp.total_sales / cmp.net_items_sold : 0;
    var bestDay = (state.data?.breakdowns?.daily || []).reduce(function(best, row) {
      return row.net_items_sold > (best.net_items_sold || 0) ? row : best;
    }, {});
    kpiGrid.innerHTML =
      kpiCard(true, '销售额', totals.total_sales, cmp.total_sales, formatMoney, '日均 ' + formatMoney(totals.total_sales / days)) +
      kpiCard(false, '总销量（件）', totals.net_items_sold, cmp.net_items_sold, formatNumber, '日均 ' + formatNumber(totals.net_items_sold / days) + ' 件/天') +
      kpiCard(false, '最高单日', bestDay.net_items_sold || 0, null, formatNumber, escapeHtml(bestDay.label || '-')) +
      kpiCard(false, 'SKU 数', getUniqueCount(rows, 'product_variant_sku'), getUniqueCount(state.compareRows || [], 'product_variant_sku'), formatNumber, '产品 ' + formatNumber(getUniqueCount(rows, 'product_title')) + ' 个') +
      kpiCard(true, '件均销售额', avgPrice, cmpAvgPrice, formatMoney, formatNumber(getUniqueCount(rows, 'shipping_country')) + ' 个发货国家');
    return;
    kpiGrid.innerHTML =
      '<div class="kpi hi"><div class="kl">销售额</div><div class="kv">' + formatMoney(totals.total_sales) + '</div><div class="kft">日均 ' + formatMoney(totals.total_sales / days) + '</div></div>' +
      '<div class="kpi"><div class="kl">总销量（件）</div><div class="kv">' + formatNumber(totals.net_items_sold) + '</div><div class="kft">日均 ' + formatNumber(totals.net_items_sold / days) + ' 件/天</div></div>' +
      '<div class="kpi"><div class="kl">最高单日</div><div class="kv">' + formatNumber(bestDay.net_items_sold || 0) + '</div><div class="kft">' + escapeHtml(bestDay.label || '-') + '</div></div>' +
      '<div class="kpi"><div class="kl">SKU 数</div><div class="kv">' + formatNumber(getUniqueCount(rows, 'product_variant_sku')) + '</div><div class="kft">产品 ' + formatNumber(getUniqueCount(rows, 'product_title')) + ' 个</div></div>' +
      '<div class="kpi"><div class="kl">件均销售额</div><div class="kv">' + formatMoney(avgPrice) + '</div><div class="kft">' + formatNumber(getUniqueCount(rows, 'shipping_country')) + ' 个发货国家</div></div>';
  }

  function buildDailyStoreSeries() {
    var days = state.data?.breakdowns?.daily?.map(function(row) { return row.label; }) || [];
    var labels = (state.data?.stores || []).map(function(store) { return store.label; });
    var series = {};
    labels.forEach(function(label) {
      series[label] = days.map(function(day) {
        return state.rows.filter(function(row) {
          return row.day === day && row.store_label === label;
        }).reduce(function(total, row) {
          return total + Number(row.net_items_sold || 0);
        }, 0);
      });
    });
    return { days: days, labels: labels, series: series };
  }

  function buildDailyStoreSeriesFrom(data, rows) {
    var days = data?.breakdowns?.daily?.map(function(row) { return row.label; }) || [];
    var labels = (data?.stores || []).map(function(store) { return store.label; });
    var series = {};
    labels.forEach(function(label) {
      series[label] = days.map(function(day) {
        return (rows || []).filter(function(row) {
          return row.day === day && row.store_label === label;
        }).reduce(function(total, row) {
          return total + Number(row.net_items_sold || 0);
        }, 0);
      });
    });
    return { days: days, labels: labels, series: series };
  }

  function renderDailyChart() {
    var data = buildDailyStoreSeries();
    var compareData = buildDailyStoreSeriesFrom(state.compare, state.compareRows);
    dailyLegend.innerHTML = data.labels.map(function(label, index) {
      return '<span class="leg"><span class="ld" style="background:' + colorFor(label, index) + '"></span>' + escapeHtml(label) + '</span>';
    }).join('') + (state.compareEnabled && state.compare ? '<span class="leg"><span class="ld" style="background:#facc15"></span>对比虚线</span>' : '');
    var datasets = data.labels.map(function(label, index) {
      return {
        label: label,
        data: data.series[label] || [],
        borderColor: colorFor(label, index),
        backgroundColor: colorFor(label, index) + '22',
        borderWidth: 2,
        pointRadius: 2,
        tension: .35
      };
    });
    if (state.compareEnabled && state.compare) {
      data.labels.forEach(function(label, index) {
        datasets.push({
          label: label + ' 对比',
          data: compareData.series[label] || [],
          borderColor: colorFor(label, index) + '99',
          borderDash: [5, 3],
          borderWidth: 2,
          pointRadius: 1,
          tension: .35
        });
      });
    }
    destroyChart('daily');
    charts.daily = new Chart(document.getElementById('dailyChart'), {
      type: 'line',
      data: {
        labels: data.days.map(function(day) { return day.slice(5); }),
        datasets: datasets
      },
      options: chartOptions(formatNumber)
    });
  }

  function groupSkuRows(rows) {
    var map = new Map();
    rows.forEach(function(row) {
      var sku = row.product_variant_sku || 'Unknown';
      if (!map.has(sku)) {
        map.set(sku, {
          sku: sku,
          title: row.product_title || '',
          qty: 0,
          sales: 0,
          countries: new Set(),
          stores: new Set()
        });
      }
      var item = map.get(sku);
      item.qty += Number(row.net_items_sold || 0);
      item.sales += Number(row.total_sales || 0);
      if (row.shipping_country) item.countries.add(row.shipping_country);
      if (row.store_label) item.stores.add(row.store_label);
    });
    return Array.from(map.values()).map(function(item) {
      item.country_count = item.countries.size;
      item.store_count = item.stores.size;
      item.avg_price = item.qty ? item.sales / item.qty : 0;
      delete item.countries;
      delete item.stores;
      return item;
    });
  }

  function attachSkuCompare(rows, compareRows) {
    var map = new Map();
    (compareRows || []).forEach(function(row) {
      map.set(row.sku, row);
    });
    return (rows || []).map(function(row) {
      var cmp = map.get(row.sku) || {};
      return Object.assign({}, row, {
        compare_qty: Number(cmp.qty || 0),
        compare_sales: Number(cmp.sales || 0)
      });
    });
  }

  function renderSkuChart() {
    var top15 = state.skuRows.slice().sort(function(a, b) {
      return b.qty - a.qty || b.sales - a.sales;
    }).slice(0, 15);
    skuChartLabel.textContent = top15.length + ' 个 SKU';
    var datasets = [
      { label: '销量', data: top15.map(function(row) { return row.qty; }), backgroundColor: '#3b6ef588', borderColor: '#3b6ef5', borderWidth: 1, borderRadius: 3, yAxisID: 'qty' },
      { label: '销售额($)', data: top15.map(function(row) { return row.sales; }), type: 'line', borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,.12)', borderWidth: 2, pointRadius: 3, yAxisID: 'sales', tension: .3 }
    ];
    if (state.compareEnabled && state.compare) {
      datasets.splice(1, 0, { label: '销量 对比', data: top15.map(function(row) { return row.compare_qty || 0; }), backgroundColor: '#9ca3af55', borderColor: '#9ca3af', borderWidth: 1, borderRadius: 3, yAxisID: 'qty' });
      datasets.push({ label: '销售额 对比($)', data: top15.map(function(row) { return row.compare_sales || 0; }), type: 'line', borderColor: '#f59e0b99', borderDash: [5, 3], borderWidth: 2, pointRadius: 2, yAxisID: 'sales', tension: .3 });
    }
    destroyChart('sku');
    charts.sku = new Chart(document.getElementById('skuChart'), {
      type: 'bar',
      data: {
        labels: top15.map(function(row) { return row.sku; }),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } } },
        scales: {
          x: { ticks: { color: chartTextColor(), font: { size: 9 }, maxRotation: 45, minRotation: 30 }, grid: { display: false } },
          qty: { beginAtZero: true, ticks: { color: chartTextColor(), font: { size: 9 }, callback: formatNumber }, grid: { color: chartGridColor() } },
          sales: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: chartTextColor(), font: { size: 9 }, callback: function(value) { return '$' + Math.round(value / 1000) + 'k'; } } }
        }
      }
    });
    return;
    destroyChart('sku');
    charts.sku = new Chart(document.getElementById('skuChart'), {
      type: 'bar',
      data: {
        labels: top15.map(function(row) { return row.sku; }),
        datasets: [
          {
            label: '销量',
            data: top15.map(function(row) { return row.qty; }),
            backgroundColor: '#3b6ef588',
            borderColor: '#3b6ef5',
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'qty'
          },
          {
            label: '销售额($)',
            data: top15.map(function(row) { return row.sales; }),
            type: 'line',
            borderColor: '#facc15',
            backgroundColor: 'rgba(250,204,21,.12)',
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: 'sales',
            tension: .3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } } },
        scales: {
          x: { ticks: { color: chartTextColor(), font: { size: 9 }, maxRotation: 45, minRotation: 30 }, grid: { display: false } },
          qty: { beginAtZero: true, ticks: { color: chartTextColor(), font: { size: 9 }, callback: formatNumber }, grid: { color: chartGridColor() } },
          sales: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: chartTextColor(), font: { size: 9 }, callback: function(value) { return '$' + Math.round(value / 1000) + 'k'; } } }
        }
      }
    });
  }

  function renderCountryChart() {
    var rows = state.data?.breakdowns?.by_country || [];
    countryChartLabel.textContent = rows.length + ' 个国家';
    var top = rows.slice(0, 10);
    destroyChart('country');
    charts.country = new Chart(document.getElementById('countryChart'), {
      type: 'doughnut',
      data: {
        labels: top.map(function(row) { return row.label; }),
        datasets: [{ data: top.map(function(row) { return row.net_items_sold; }), backgroundColor: colors, borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 8 } } } }
    });
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    return [row.store_label, row.shipping_country, row.product_title, row.product_variant_sku].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function applyFilter() {
    var q = searchInput.value.trim().toLowerCase();
    state.filteredRows = state.rows.filter(function(row) { return matchesSearch(row, q); });
    state.compareFilteredRows = (state.compareRows || []).filter(function(row) { return matchesSearch(row, q); });
    state.compareSkuRows = groupSkuRows(state.compareFilteredRows);
    state.skuRows = attachSkuCompare(groupSkuRows(state.filteredRows), state.compareSkuRows);
    state.page = 1;
    renderSkuChart();
    renderTable();
  }

  function compareSku(a, b) {
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

  function renderTable() {
    var sorted = state.skuRows.slice().sort(compareSku);
    var totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = sorted.slice(start, start + state.pageSize);
    var totalQty = sorted.reduce(function(total, row) { return total + row.qty; }, 0) || 1;
    var maxQty = Math.max.apply(null, pageRows.map(function(row) { return row.qty; }).concat([1]));
    tableLabel.textContent = formatNumber(sorted.length) + ' 个 SKU';
    pageText.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页';
    prevPageBtn.disabled = state.loading || state.page <= 1;
    nextPageBtn.disabled = state.loading || state.page >= totalPages;

    if (!pageRows.length) {
      skuTable.innerHTML = '<tbody><tr><td><div class="empty">暂无匹配数据</div></td></tr></tbody>';
      return;
    }

    skuTable.innerHTML = '<thead><tr>' +
      '<th style="width:32px">#</th>' +
      sortHeader('SKU', 'sku') +
      sortHeader('产品标题', 'title') +
      sortHeader('销量(件)', 'qty', 'r') +
      sortHeader('销售额', 'sales', 'r') +
      sortHeader('均价', 'avg_price', 'r') +
      sortHeader('覆盖国家', 'country_count', 'r') +
      sortHeader('覆盖店铺', 'store_count', 'r') +
      '<th style="min-width:80px">条</th>' +
    '</tr></thead><tbody>' +
      pageRows.map(function(row, index) {
        var pct = (row.qty / totalQty * 100).toFixed(1);
        return '<tr>' +
          '<td style="color:var(--t3)">' + (start + index + 1) + '</td>' +
          '<td><span class="sku">' + escapeHtml(row.sku) + '</span></td>' +
          '<td>' + escapeHtml(row.title || '-') + '</td>' +
          '<td class="r"><strong>' + formatNumber(row.qty) + '</strong>' + (state.compareEnabled ? '<div class="kcmp">对比 ' + formatNumber(row.compare_qty) + ' ' + deltaHtml(row.qty, row.compare_qty) + '</div>' : '') + '</td>' +
          '<td class="r">' + formatMoney(row.sales) + (state.compareEnabled ? '<div class="kcmp">对比 ' + formatMoney(row.compare_sales) + ' ' + deltaHtml(row.sales, row.compare_sales) + '</div>' : '') + '</td>' +
          '<td class="r">' + formatMoney(row.avg_price) + '</td>' +
          '<td class="r">' + formatNumber(row.country_count) + '</td>' +
          '<td class="r">' + formatNumber(row.store_count) + '</td>' +
          '<td><div class="bar" style="width:' + Math.max(3, Math.round(row.qty / maxQty * 100)) + '%"></div><span style="font-size:9px;color:var(--t3)">' + pct + '%</span></td>' +
        '</tr>';
      }).join('') + '</tbody>';
  }

  function render() {
    renderKpis();
    renderDailyChart();
    renderCountryChart();
    applyFilter();
  }

  function loadData(refresh) {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, refresh ? '正在刷新 SKU 销量数据...' : '正在读取 SKU 销量数据...');
    var jobs = [fetchRange(sinceInput.value, untilInput.value, refresh)];
    if (state.compareEnabled && compareSinceInput.value && compareUntilInput.value) {
      jobs.push(fetchRange(compareSinceInput.value, compareUntilInput.value, refresh));
    }
    Promise.all(jobs).then(function(results) {
      var data = results[0];
      state.compare = state.compareEnabled ? (results[1] || null) : null;
      state.data = data;
      state.rows = data.rows || [];
      state.compareRows = state.compare?.rows || [];
      state.filteredRows = state.rows;
      state.compareSkuRows = groupSkuRows(state.compareRows);
      state.skuRows = attachSkuCompare(groupSkuRows(state.rows), state.compareSkuRows);
      setLoading(false, '已加载 ' + formatNumber(state.rows.length) + ' 条 SKU 销量数据');
      render();
    }).catch(function(err) {
      state.data = null;
      state.compare = null;
      state.rows = [];
      state.compareRows = [];
      state.filteredRows = [];
      state.skuRows = [];
      state.compareSkuRows = [];
      Object.keys(charts).forEach(destroyChart);
      kpiGrid.innerHTML = '';
      skuTable.innerHTML = '<tbody><tr><td><div class="empty">加载失败：' + escapeHtml(err.message) + '</div></td></tr></tbody>';
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
    searchInput.addEventListener('input', applyFilter);
    loadBtn.addEventListener('click', function() { loadData(false); });
    refreshBtn.addEventListener('click', function() { loadData(true); });
    skuTable.addEventListener('click', function(event) {
      var th = event.target.closest('[data-sort]');
      if (!th) return;
      var col = th.dataset.sort;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = col === 'sku' || col === 'title' ? 'asc' : 'desc';
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
      var totalPages = Math.max(1, Math.ceil((state.skuRows || []).length / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });
    pageSizeSelect.addEventListener('change', function() {
      state.pageSize = Number(pageSizeSelect.value) || 15;
      state.page = 1;
      renderTable();
    });
  }

  setDefaultDates();
  renderStoreTabs();
  bindEvents();
  loadData(false);
})();
