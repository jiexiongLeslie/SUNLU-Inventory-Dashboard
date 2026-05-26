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
  var storeColors = stores.reduce(function(map, store) {
    map[store.label] = store.color;
    return map;
  }, {});
  var metricTitles = {
    total_sales: '销售额趋势',
    orders: '订单数趋势',
    online_store_visitors: '独立访客趋势',
    sessions: '会话数趋势'
  };
  var state = {
    store: 'ALL',
    metric: 'total_sales',
    compareEnabled: false,
    primary: null,
    compare: null,
    loading: false,
    page: 1,
    pageSize: 50
  };
  var charts = {};

  var sinceInput = document.getElementById('sinceInput');
  var untilInput = document.getElementById('untilInput');
  var compareSinceInput = document.getElementById('compareSinceInput');
  var compareUntilInput = document.getElementById('compareUntilInput');
  var compareToggle = document.getElementById('compareToggle');
  var compareBox = document.getElementById('compareBox');
  var storeTabs = document.getElementById('storeTabs');
  var loadBtn = document.getElementById('loadBtn');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var kpiGrid = document.getElementById('kpiGrid');
  var cvrLegend = document.getElementById('cvrLegend');
  var trendLegend = document.getElementById('trendLegend');
  var trendTitle = document.getElementById('trendTitle');
  var storeCount = document.getElementById('storeCount');
  var rangeLabel = document.getElementById('rangeLabel');
  var storeTable = document.getElementById('storeTable');
  var detailTable = document.getElementById('detailTable');
  var rowCount = document.getElementById('rowCount');
  var prevPageBtn = document.getElementById('prevPageBtn');
  var nextPageBtn = document.getElementById('nextPageBtn');
  var pageText = document.getElementById('pageText');

  function formatNumber(value) {
    return Math.round(Number(value || 0)).toLocaleString('zh-CN');
  }

  function formatMoney(value) {
    return '$' + Math.round(Number(value || 0)).toLocaleString('zh-CN');
  }

  function formatPercent(value) {
    return (Number(value || 0) * 100).toFixed(2) + '%';
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

  function setDefaultDates() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 1);
    sinceInput.value = formatDate(start);
    untilInput.value = formatDate(now);
    setComparePreviousPeriod();
  }

  function setComparePreviousPeriod() {
    if (!sinceInput.value || !untilInput.value) return;
    var len = daysBetween(sinceInput.value, untilInput.value);
    var compareUntil = dateAdd(new Date(sinceInput.value), -1);
    var compareSince = dateAdd(compareUntil, -len + 1);
    compareSinceInput.value = formatDate(compareSince);
    compareUntilInput.value = formatDate(compareUntil);
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
      limit: '1000'
    });
    if (refresh) params.set('refresh', '1');
    return fetch('/api/shopify/daily-traffic-sales?' + params.toString()).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || data.error) throw new Error(data.error || '请求失败');
        return data;
      });
    });
  }

  function storeLabels(data) {
    return (data?.stores || []).map(function(store) { return store.label; });
  }

  function colorFor(label, index) {
    return storeColors[label] || ['#3b6ef5', '#059669', '#b45309', '#dc2626', '#805ad5'][index % 5];
  }

  function selectedStoreLabels() {
    if (!state.primary) return [];
    return state.store === 'ALL' ? storeLabels(state.primary) : storeLabels(state.primary).filter(Boolean);
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

  function deltaHtml(current, previous, percentInput) {
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

  function renderKpis() {
    var totals = state.primary?.totals || {};
    var cmp = state.compare?.totals || {};
    var days = state.primary?.breakdowns?.daily?.length || 1;
    kpiGrid.innerHTML =
      kpiCard(true, '总销售额', totals.total_sales, cmp.total_sales, formatMoney, '日均 ' + formatMoney(totals.total_sales / days)) +
      kpiCard(false, '总订单数', totals.orders, cmp.orders, formatNumber, '日均 ' + formatNumber(totals.orders / days)) +
      kpiCard(false, '独立访客 UV', totals.online_store_visitors, cmp.online_store_visitors, formatNumber, '来自 online_store_visitors') +
      kpiCard(false, '会话数 Sessions', totals.sessions, cmp.sessions, formatNumber, 'UV率 ' + (totals.sessions ? Math.round(totals.online_store_visitors / totals.sessions * 100) : 0) + '%') +
      kpiCard(true, '综合 CVR', totals.order_conversion_rate, cmp.order_conversion_rate, formatPercent, 'AOV ' + formatMoney(totals.sales_per_order), true);
  }

  function buildLegend(container, labels) {
    container.innerHTML = labels.map(function(label, index) {
      return '<span class="leg"><span class="ld" style="background:' + colorFor(label, index) + '"></span>' + escapeHtml(label) + '</span>';
    }).join('');
  }

  function dailyByStore(data, field) {
    var days = data?.breakdowns?.daily?.map(function(row) { return row.label; }) || [];
    var labels = storeLabels(data);
    var map = {};
    labels.forEach(function(label) {
      map[label] = days.map(function(day) {
        return (data.rows || []).filter(function(row) {
          return row.day === day && row.store_label === label;
        }).reduce(function(total, row) {
          return total + Number(row[field] || 0);
        }, 0);
      });
    });
    return { days: days, labels: labels, series: map };
  }

  function renderCvrChart() {
    var primary = dailyByStore(state.primary, 'orders');
    var session = dailyByStore(state.primary, 'sessions');
    var labels = selectedStoreLabels();
    buildLegend(cvrLegend, labels);
    var datasets = labels.map(function(label, index) {
      return {
        label: label,
        data: primary.days.map(function(day, dayIndex) {
          var sessions = session.series[label]?.[dayIndex] || 0;
          return sessions ? (primary.series[label][dayIndex] || 0) / sessions * 100 : 0;
        }),
        borderColor: colorFor(label, index),
        backgroundColor: colorFor(label, index) + '22',
        borderWidth: 2,
        pointRadius: 2,
        tension: .35
      };
    });

    if (state.compareEnabled && state.compare) {
      var compareOrders = dailyByStore(state.compare, 'orders');
      var compareSessions = dailyByStore(state.compare, 'sessions');
      labels.forEach(function(label, index) {
        datasets.push({
          label: label + ' 对比',
          data: compareOrders.days.map(function(day, dayIndex) {
            var sessions = compareSessions.series[label]?.[dayIndex] || 0;
            return sessions ? (compareOrders.series[label][dayIndex] || 0) / sessions * 100 : 0;
          }),
          borderColor: colorFor(label, index) + '99',
          borderDash: [5, 3],
          borderWidth: 1.5,
          pointRadius: 1,
          tension: .35
        });
      });
    }

    destroyChart('cvr');
    charts.cvr = new Chart(document.getElementById('cvrChart'), {
      type: 'line',
      data: { labels: primary.days.map(function(day) { return day.slice(5); }), datasets: datasets },
      options: chartOptions(function(value) { return Number(value).toFixed(1) + '%'; })
    });
  }

  function renderMetricChart() {
    var data = dailyByStore(state.primary, state.metric);
    var labels = selectedStoreLabels();
    buildLegend(trendLegend, labels);
    trendTitle.textContent = metricTitles[state.metric] || '趋势';
    var formatter = state.metric === 'total_sales'
      ? function(value) { return '$' + Math.round(value / 1000) + 'k'; }
      : formatNumber;
    var datasets = labels.map(function(label, index) {
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
      var compareData = dailyByStore(state.compare, state.metric);
      labels.forEach(function(label, index) {
        datasets.push({
          label: label + ' 对比',
          data: compareData.series[label] || [],
          borderColor: colorFor(label, index) + '99',
          borderDash: [5, 3],
          borderWidth: 1.5,
          pointRadius: 1,
          tension: .35
        });
      });
    }

    destroyChart('metric');
    charts.metric = new Chart(document.getElementById('metricChart'), {
      type: 'line',
      data: { labels: data.days.map(function(day) { return day.slice(5); }), datasets: datasets },
      options: chartOptions(formatter)
    });
  }

  function renderAovChart() {
    var rows = state.primary?.breakdowns?.by_store || [];
    var labels = rows.map(function(row) { return row.label; });
    var data = rows.map(function(row) { return row.sales_per_order || 0; });
    var datasets = [{
      label: '主时段',
      data: data,
      backgroundColor: labels.map(function(label, index) { return colorFor(label, index) + '99'; }),
      borderColor: labels.map(colorFor),
      borderWidth: 1.5,
      borderRadius: 6
    }];
    if (state.compareEnabled && state.compare) {
      var compareRows = state.compare.breakdowns?.by_store || [];
      var compareMap = compareRows.reduce(function(map, row) {
        map[row.label] = row.sales_per_order || 0;
        return map;
      }, {});
      datasets.push({
        label: '对比时段',
        data: labels.map(function(label) { return compareMap[label] || 0; }),
        backgroundColor: labels.map(function(label, index) { return colorFor(label, index) + '33'; }),
        borderColor: labels.map(colorFor),
        borderWidth: 1,
        borderRadius: 6
      });
    }
    storeCount.textContent = labels.length + ' 站';
    destroyChart('aov');
    charts.aov = new Chart(document.getElementById('aovChart'), {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: chartOptions(function(value) { return '$' + Math.round(value); }, true)
    });
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
        y: { ticks: { color: chartTextColor(), font: { size: 9 }, callback: tickFormatter }, grid: { color: chartGridColor() } }
      }
    };
  }

  function renderStoreTable() {
    var rows = state.primary?.breakdowns?.by_store || [];
    var cmpMap = (state.compare?.breakdowns?.by_store || []).reduce(function(map, row) {
      map[row.label] = row;
      return map;
    }, {});
    rangeLabel.textContent = (state.primary?.since || '') + ' ~ ' + (state.primary?.until || '');
    if (!rows.length) {
      storeTable.innerHTML = '<tbody><tr><td><div class="empty">暂无数据</div></td></tr></tbody>';
      return;
    }
    storeTable.innerHTML = '<thead><tr><th>店铺</th><th class="r">销售额</th><th class="r">订单</th><th class="r">访客UV</th><th class="r">Sessions</th><th class="r">CVR</th><th class="r">AOV</th><th class="r">UV率</th></tr></thead><tbody>' +
      rows.map(function(row, index) {
        var cvr = row.order_conversion_rate || 0;
        var cmp = cmpMap[row.label];
        var cmpLine = state.compareEnabled && cmp ? '<tr><td style="color:var(--am);font-size:10px">对比 ' + escapeHtml(row.label) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + formatMoney(cmp.total_sales) + ' ' + deltaHtml(row.total_sales, cmp.total_sales) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + formatNumber(cmp.orders) + ' ' + deltaHtml(row.orders, cmp.orders) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + formatNumber(cmp.online_store_visitors) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + formatNumber(cmp.sessions) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + formatPercent(cmp.order_conversion_rate) + ' ' + deltaHtml(cvr, cmp.order_conversion_rate, true) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + formatMoney(cmp.sales_per_order) + '</td>' +
          '<td class="r" style="color:var(--am);font-size:10px">' + (cmp.sessions ? Math.round(cmp.online_store_visitors / cmp.sessions * 100) : 0) + '%</td></tr>' : '';
        return '<tr>' +
          '<td><span class="sw" style="background:' + colorFor(row.label, index) + '"></span>' + escapeHtml(row.label) + '</td>' +
          '<td class="r">' + formatMoney(row.total_sales) + '</td>' +
          '<td class="r">' + formatNumber(row.orders) + '</td>' +
          '<td class="r">' + formatNumber(row.online_store_visitors) + '</td>' +
          '<td class="r">' + formatNumber(row.sessions) + '</td>' +
          '<td class="r"><span class="pill ' + (cvr >= .05 ? 'pg' : cvr >= .03 ? 'pa' : 'pr') + '">' + formatPercent(cvr) + '</span></td>' +
          '<td class="r">' + formatMoney(row.sales_per_order) + '</td>' +
          '<td class="r">' + (row.sessions ? Math.round(row.online_store_visitors / row.sessions * 100) : 0) + '%</td>' +
        '</tr>' + cmpLine;
      }).join('') + '</tbody>';
  }

  function renderDetailTable() {
    var rows = state.primary?.rows || [];
    var totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = rows.slice(start, start + state.pageSize);
    rowCount.textContent = formatNumber(rows.length) + ' 条';
    pageText.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页';
    prevPageBtn.disabled = state.page <= 1 || state.loading;
    nextPageBtn.disabled = state.page >= totalPages || state.loading;
    if (!pageRows.length) {
      detailTable.innerHTML = '<tbody><tr><td><div class="empty">暂无数据</div></td></tr></tbody>';
      return;
    }
    detailTable.innerHTML = '<thead><tr><th>日期</th><th>店铺</th><th>Shop Name</th><th class="r">销售额</th><th class="r">订单</th><th class="r">访客UV</th><th class="r">Sessions</th><th class="r">CVR</th><th class="r">AOV</th></tr></thead><tbody>' +
      pageRows.map(function(row) {
        return '<tr>' +
          '<td>' + escapeHtml(row.day) + '</td>' +
          '<td>' + escapeHtml(row.store_label) + '</td>' +
          '<td>' + escapeHtml(row.shop_name) + '</td>' +
          '<td class="r">' + formatMoney(row.total_sales) + '</td>' +
          '<td class="r">' + formatNumber(row.orders) + '</td>' +
          '<td class="r">' + formatNumber(row.online_store_visitors) + '</td>' +
          '<td class="r">' + formatNumber(row.sessions) + '</td>' +
          '<td class="r">' + formatPercent(row.order_conversion_rate) + '</td>' +
          '<td class="r">' + formatMoney(row.sales_per_order) + '</td>' +
        '</tr>';
      }).join('') + '</tbody>';
  }

  function renderAll() {
    renderKpis();
    renderCvrChart();
    renderMetricChart();
    renderAovChart();
    renderStoreTable();
    renderDetailTable();
  }

  function loadData(refresh) {
    if (state.loading) return;
    if (!sinceInput.value || !untilInput.value) {
      setLoading(false, '请先选择完整日期');
      return;
    }
    setLoading(true, refresh ? '正在刷新 Shopify 数据...' : '正在读取 Shopify 数据...');
    var jobs = [fetchRange(sinceInput.value, untilInput.value, refresh)];
    if (state.compareEnabled) {
      jobs.push(fetchRange(compareSinceInput.value, compareUntilInput.value, refresh));
    }
    Promise.all(jobs).then(function(results) {
      state.primary = results[0];
      state.compare = state.compareEnabled ? results[1] : null;
      state.page = 1;
      setLoading(false, '已加载 ' + formatNumber((state.primary.rows || []).length) + ' 条数据');
      renderAll();
    }).catch(function(err) {
      state.primary = null;
      state.compare = null;
      Object.keys(charts).forEach(destroyChart);
      kpiGrid.innerHTML = '';
      storeTable.innerHTML = '<tbody><tr><td><div class="empty">加载失败：' + escapeHtml(err.message) + '</div></td></tr></tbody>';
      detailTable.innerHTML = '';
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
      if (btn.dataset.preset) {
        btn.addEventListener('click', function() { setPreset(btn.dataset.preset); });
      }
    });
    storeTabs.addEventListener('click', function(event) {
      var btn = event.target.closest('[data-store]');
      if (!btn) return;
      state.store = btn.dataset.store;
      renderStoreTabs();
      loadData(false);
    });
    document.querySelectorAll('.metric-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.metric = btn.dataset.metric;
        document.querySelectorAll('.metric-tab').forEach(function(item) { item.classList.remove('on'); });
        btn.classList.add('on');
        if (state.primary) renderMetricChart();
      });
    });
    compareToggle.addEventListener('click', function() {
      state.compareEnabled = !state.compareEnabled;
      compareToggle.classList.toggle('on', state.compareEnabled);
      compareToggle.textContent = state.compareEnabled ? '取消对比时段' : '添加对比时段';
      compareBox.style.display = state.compareEnabled ? 'flex' : 'none';
      loadData(false);
    });
    [sinceInput, untilInput].forEach(function(input) {
      input.addEventListener('change', function() {
        setComparePreviousPeriod();
        loadData(false);
      });
    });
    [compareSinceInput, compareUntilInput].forEach(function(input) {
      input.addEventListener('change', function() {
        if (state.compareEnabled) loadData(false);
      });
    });
    loadBtn.addEventListener('click', function() { loadData(false); });
    refreshBtn.addEventListener('click', function() { loadData(true); });
    prevPageBtn.addEventListener('click', function() {
      if (state.page > 1) {
        state.page -= 1;
        renderDetailTable();
      }
    });
    nextPageBtn.addEventListener('click', function() {
      var rows = state.primary?.rows || [];
      var totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        renderDetailTable();
      }
    });
  }

  setDefaultDates();
  renderStoreTabs();
  bindEvents();
  loadData(false);
})();
