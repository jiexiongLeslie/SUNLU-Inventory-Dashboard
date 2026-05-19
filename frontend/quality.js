(function() {
  'use strict';

  var EUROPE_REGION = '欧洲';
  var state = { dataRows: [], shopifyRows: [], mappings: {} };

  var statusText = document.getElementById('statusText');
  var refreshBtn = document.getElementById('refreshBtn');
  var meta = document.getElementById('meta');
  var kpiGrid = document.getElementById('kpiGrid');
  var inventoryBody = document.getElementById('inventoryBody');
  var shopifyBody = document.getElementById('shopifyBody');
  var skuBody = document.getElementById('skuBody');
  var inventoryCount = document.getElementById('inventoryCount');
  var shopifyCount = document.getElementById('shopifyCount');
  var skuCount = document.getElementById('skuCount');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function normalizeSku(value) {
    return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function hasUsableSku(value) {
    var sku = normalizeSku(value);
    return Boolean(sku && sku !== '/' && sku !== '-' && sku !== '旧品无需SKU');
  }

  function isBundleOrNonSingleSku(item) {
    var sku = String(item.sku || '');
    var text = [item.sku, item.product_title, item.variant_title, item.color, item.product_type].join(' ').toLowerCase();
    if (!hasUsableSku(sku)) return true;
    if (/customs[-_ ]?clearance|clearance|räumung|räumungsverkäufe|gift|sample|test|shipping|route|insurance|anzahlung/.test(text)) return true;
    if (/\b(combo|bundle|kit|set|pack|packs|sammlungen|kombination|zufalls|random|moq|rabatt|mystery)\b/.test(text)) return true;
    if (/bundle|mysterybox|mystery box|bündel|sätze|satz/.test(text)) return true;
    if (/\d+\s*[*x×]\s*(0\.25|0\.5|1|2|3|5)\s*kg/i.test(text)) return true;
    if (/\+\s*(pla|petg|abs|ptfe|fc|s[124]fd|fd|filament|resin|harz|\d+\s*kg)/i.test(sku)) return true;
    if (/[a-z]{2}\*[2-9]|\*[2-9]|1kg\*3|kg\*3/i.test(sku)) return true;
    if (/(bk|wt|wh|rd|yl|or|gn|bl|gy|dg|tp|sb|gg|pk|pp)&[a-z0-9&]+/i.test(sku)) return true;
    return false;
  }

  function fetchJson(url) {
    return fetch(url).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || data.error) throw new Error(data.error || '请求失败');
        return data;
      });
    });
  }

  function issueRow(issue) {
    var cls = issue.level === 'bad' ? 'bad' : issue.level === 'warn' ? 'warn' : 'ok';
    return '<tr><td><span class="badge ' + cls + '">' + escapeHtml(issue.type) + '</span></td><td>' + escapeHtml(issue.message) + '</td><td><strong>' + Number(issue.count || 0).toLocaleString('zh-CN') + '</strong></td></tr>';
  }

  function analyzeInventory() {
    var issues = [];
    var byRegionSku = {};
    var emptySku = 0;
    var placeholderSku = 0;
    var missingCategory = 0;
    var zeroWithSales = 0;

    state.dataRows.forEach(function(row) {
      if (!row.category) missingCategory += 1;
      if (!hasUsableSku(row.store_sku)) {
        emptySku += 1;
        if (String(row.store_sku || '').trim()) placeholderSku += 1;
      }
      if ((Number(row.stock) || 0) <= 0 && ((Number(row.sales_7d) || 0) > 0 || (Number(row.sales_14d) || 0) > 0 || (Number(row.sales_30d) || 0) > 0)) {
        zeroWithSales += 1;
      }
      var key = [row.region, normalizeSku(row.store_sku)].join('|');
      if (hasUsableSku(row.store_sku)) byRegionSku[key] = (byRegionSku[key] || 0) + 1;
    });

    var duplicateSku = Object.keys(byRegionSku).filter(function(key) { return byRegionSku[key] > 1; }).length;
    issues.push({ type: '空/占位 SKU', message: '库存表中无法用于自动映射的 SKU 行', count: emptySku, level: emptySku ? 'warn' : 'ok' });
    issues.push({ type: '占位 SKU', message: '例如旧品无需SKU、新品暂无SKU，建议不作为自动映射依据', count: placeholderSku, level: placeholderSku ? 'warn' : 'ok' });
    issues.push({ type: '重复 SKU', message: '同地区同 SKU 出现多行，可能会影响颜色级明细', count: duplicateSku, level: duplicateSku ? 'warn' : 'ok' });
    issues.push({ type: '缺产品分类', message: 'category 为空的库存表行', count: missingCategory, level: missingCategory ? 'bad' : 'ok' });
    issues.push({ type: '零库存有销量', message: '库存为 0 但近期仍有销量，建议检查断货或库存同步', count: zeroWithSales, level: zeroWithSales ? 'bad' : 'ok' });
    return issues;
  }

  function analyzeShopify() {
    var europeSku = {};
    var europeCategories = new Set();
    state.dataRows.filter(function(row) { return row.region === EUROPE_REGION; }).forEach(function(row) {
      if (row.category) europeCategories.add(row.category);
      if (hasUsableSku(row.store_sku)) europeSku[normalizeSku(row.store_sku)] = row.category;
    });

    var inventoryBySku = {};
    var matchedSku = new Set();
    var suspected = [];
    var excluded = 0;
    var manualRules = Object.keys(state.mappings).length;

    state.shopifyRows.forEach(function(row) {
      var sku = normalizeSku(row.sku);
      if (!sku) return;
      if (!inventoryBySku[sku]) inventoryBySku[sku] = new Set();
      inventoryBySku[sku].add(Number(row.inventory_quantity) || 0);

      var mapping = state.mappings[sku];
      if (europeSku[sku] || (mapping && mapping.kind === 'single' && mapping.category)) {
        matchedSku.add(sku);
        return;
      }
      if ((mapping && mapping.kind === 'excluded') || isBundleOrNonSingleSku(row)) {
        excluded += 1;
        return;
      }
      suspected.push(row);
    });

    var conflicts = Object.keys(inventoryBySku).filter(function(sku) { return inventoryBySku[sku].size > 1; }).length;
    return {
      issues: [
        { type: '欧洲产品口径', message: '来自主库存表欧洲产品汇总的单品分类数', count: europeCategories.size, level: 'ok' },
        { type: '匹配单品 SKU', message: 'Shopify SKU 可映射到欧洲单品口径', count: matchedSku.size, level: 'ok' },
        { type: '排除捆绑/套装', message: '自动或手动排除，不计入单品库存', count: excluded, level: 'ok' },
        { type: '疑似未匹配单品', message: '需要在 SKU 映射页确认或补充分类', count: suspected.length, level: suspected.length ? 'bad' : 'ok' },
        { type: '同 SKU 多库存', message: '同 SKU 出现多个库存值，需检查 Shopify 变体', count: conflicts, level: conflicts ? 'warn' : 'ok' },
        { type: '手动映射', message: 'SKU 映射维护页已保存的规则数量', count: manualRules, level: 'ok' }
      ],
      suspected: suspected
    };
  }

  function renderKpis(invIssues, shopResult) {
    var records = state.dataRows.length;
    var shopifyRecords = state.shopifyRows.length;
    var suspected = shopResult.suspected.length;
    var badIssues = invIssues.concat(shopResult.issues).filter(function(issue) { return issue.level === 'bad' && issue.count > 0; }).length;
    var items = [
      ['库存表记录', records],
      ['Shopify SKU', shopifyRecords],
      ['严重问题项', badIssues],
      ['疑似未匹配单品', suspected],
      ['映射规则', Object.keys(state.mappings).length]
    ];
    kpiGrid.innerHTML = items.map(function(item) {
      return '<div class="kpi"><div class="label">' + escapeHtml(item[0]) + '</div><div class="value">' + Number(item[1] || 0).toLocaleString('zh-CN') + '</div></div>';
    }).join('');
  }

  function render() {
    var invIssues = analyzeInventory();
    var shopResult = analyzeShopify();
    renderKpis(invIssues, shopResult);

    inventoryCount.textContent = invIssues.filter(function(item) { return item.count > 0; }).length + ' 项';
    shopifyCount.textContent = shopResult.issues.filter(function(item) { return item.count > 0; }).length + ' 项';
    inventoryBody.innerHTML = invIssues.map(issueRow).join('');
    shopifyBody.innerHTML = shopResult.issues.map(issueRow).join('');

    var rows = shopResult.suspected
      .filter(function(row) { return (Number(row.inventory_quantity) || 0) > 0; })
      .sort(function(a, b) { return (Number(b.inventory_quantity) || 0) - (Number(a.inventory_quantity) || 0); })
      .slice(0, 80);
    skuCount.textContent = rows.length + ' 条';
    skuBody.innerHTML = rows.length ? rows.map(function(row) {
      return '<tr><td class="sku">' + escapeHtml(row.sku || '-') + '</td><td><span class="badge bad">未映射单品</span></td><td>' + escapeHtml(row.product_title || '-') + '<div class="muted">' + escapeHtml(row.color || row.variant_title || '') + '</div></td><td><strong>' + Number(row.inventory_quantity || 0).toLocaleString('zh-CN') + '</strong></td></tr>';
    }).join('') : '<tr><td colspan="4"><div class="empty">没有需要优先检查的正库存 SKU</div></td></tr>';
  }

  function loadAll() {
    statusText.textContent = '正在诊断...';
    return Promise.all([
      fetchJson('/api/data'),
      fetchJson('/api/shopify/inventory?store=SHOPIFY_DE_STORE'),
      fetchJson('/api/sku-mappings')
    ]).then(function(results) {
      state.dataRows = results[0] || [];
      state.shopifyRows = results[1].records || [];
      state.mappings = {};
      (results[2].items || []).forEach(function(item) { state.mappings[normalizeSku(item.sku)] = item; });
      meta.textContent = '库存表 ' + state.dataRows.length + ' 行 | Shopify ' + state.shopifyRows.length + ' 条 | Shopify 数据' + (results[1].from_cache ? '来自缓存' : '已刷新');
      statusText.textContent = '诊断完成';
      render();
    }).catch(function(err) {
      statusText.textContent = '诊断失败：' + err.message;
    });
  }

  refreshBtn.addEventListener('click', loadAll);
  loadAll();
})();
