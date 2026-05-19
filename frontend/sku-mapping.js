(function() {
  'use strict';

  var EUROPE_REGION = '欧洲';
  var state = {
    dataRows: [],
    shopifyRows: [],
    categories: [],
    skuRefs: {},
    mappings: {},
    rows: []
  };

  var searchInput = document.getElementById('searchInput');
  var viewSelect = document.getElementById('viewSelect');
  var saveBtn = document.getElementById('saveBtn');
  var reloadBtn = document.getElementById('reloadBtn');
  var statusText = document.getElementById('statusText');
  var tableBody = document.getElementById('tableBody');
  var rowCount = document.getElementById('rowCount');
  var meta = document.getElementById('meta');

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

  function buildReference() {
    state.skuRefs = {};
    var categorySet = new Set();
    state.dataRows.filter(function(row) { return row.region === EUROPE_REGION; }).forEach(function(row) {
      if (row.category) categorySet.add(row.category);
      if (hasUsableSku(row.store_sku)) {
        state.skuRefs[normalizeSku(row.store_sku)] = row.category;
      }
    });
    state.categories = Array.from(categorySet).sort(function(a, b) { return a.localeCompare(b, 'zh-CN'); });
  }

  function buildRows() {
    var bySku = {};
    state.shopifyRows.forEach(function(item) {
      var sku = normalizeSku(item.sku);
      if (!sku || state.skuRefs[sku]) return;
      if (!bySku[sku]) {
        bySku[sku] = Object.assign({}, item, {
          normalized_sku: sku,
          total_inventory: 0,
          source_count: 0,
          auto_excluded: false
        });
      }
      bySku[sku].total_inventory += Number(item.inventory_quantity) || 0;
      bySku[sku].source_count += Number(item.duplicate_count) || 1;
      bySku[sku].auto_excluded = bySku[sku].auto_excluded || isBundleOrNonSingleSku(item);
    });

    state.rows = Object.keys(bySku).map(function(sku) {
      var row = bySku[sku];
      var mapping = state.mappings[sku];
      row.mapping = mapping || null;
      row.kind = mapping ? mapping.kind : (row.auto_excluded ? 'excluded' : 'single');
      row.category = mapping ? mapping.category : '';
      row.note = mapping ? mapping.note : '';
      return row;
    }).sort(function(a, b) {
      if (a.auto_excluded !== b.auto_excluded) return a.auto_excluded ? 1 : -1;
      return b.total_inventory - a.total_inventory;
    });
  }

  function categoryOptions(selected) {
    return '<option value="">未指定</option>' + state.categories.map(function(category) {
      return '<option value="' + escapeHtml(category) + '"' + (category === selected ? ' selected' : '') + '>' + escapeHtml(category) + '</option>';
    }).join('');
  }

  function render() {
    var q = searchInput.value.trim().toLowerCase();
    var view = viewSelect.value;
    var rows = state.rows.filter(function(row) {
      if (view === 'suspected' && row.auto_excluded) return false;
      if (view === 'excluded' && !row.auto_excluded) return false;
      if (view === 'mapped' && !row.mapping) return false;
      if (q) {
        var text = [row.sku, row.product_title, row.variant_title, row.color, row.note].join(' ').toLowerCase();
        if (text.indexOf(q) < 0) return false;
      }
      return true;
    });

    rowCount.textContent = rows.length + ' 条';
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="8"><div class="empty">没有匹配的数据</div></td></tr>';
      return;
    }

    tableBody.innerHTML = rows.slice(0, 800).map(function(row) {
      var badge = row.auto_excluded
        ? '<span class="badge warn">自动排除</span>'
        : '<span class="badge bad">待确认单品</span>';
      return '<tr data-sku="' + escapeHtml(row.normalized_sku) + '">' +
        '<td class="sku">' + escapeHtml(row.sku || row.normalized_sku) + '<div class="muted">来源 ' + row.source_count + '</div></td>' +
        '<td><strong>' + escapeHtml(row.product_title || '-') + '</strong><div class="muted">' + escapeHtml(row.handle || '') + '</div></td>' +
        '<td>' + escapeHtml(row.color || '-') + '<div class="muted">' + escapeHtml(row.variant_title || '') + '</div></td>' +
        '<td><strong>' + Number(row.total_inventory || 0).toLocaleString('zh-CN') + '</strong></td>' +
        '<td>' + badge + '</td>' +
        '<td><select class="kind"><option value="single"' + (row.kind === 'single' ? ' selected' : '') + '>单品</option><option value="excluded"' + (row.kind === 'excluded' ? ' selected' : '') + '>排除</option></select></td>' +
        '<td><select class="category">' + categoryOptions(row.category) + '</select></td>' +
        '<td><input class="note" value="' + escapeHtml(row.note) + '" placeholder="备注"></td>' +
      '</tr>';
    }).join('');
  }

  function collectMappings() {
    var items = [];
    tableBody.querySelectorAll('tr[data-sku]').forEach(function(tr) {
      var sku = tr.dataset.sku;
      var kind = tr.querySelector('.kind').value;
      var category = tr.querySelector('.category').value;
      var note = tr.querySelector('.note').value.trim();
      if (kind === 'excluded' || category || note) {
        items.push({ sku: sku, kind: kind, category: category, note: note, updated_at: new Date().toISOString() });
      }
    });

    Object.keys(state.mappings).forEach(function(sku) {
      if (!items.some(function(item) { return item.sku === sku; }) && !state.rows.some(function(row) { return row.normalized_sku === sku; })) {
        items.push(state.mappings[sku]);
      }
    });
    return items;
  }

  function saveMappings() {
    statusText.textContent = '正在保存...';
    fetch('/api/sku-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: collectMappings() })
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        statusText.textContent = '已保存 ' + data.count + ' 条映射';
        return loadAll();
      })
      .catch(function(err) {
        statusText.textContent = '保存失败：' + err.message;
      });
  }

  function loadAll() {
    statusText.textContent = '正在读取数据...';
    return Promise.all([
      fetchJson('/api/data'),
      fetchJson('/api/shopify/inventory?store=SHOPIFY_DE_STORE'),
      fetchJson('/api/sku-mappings')
    ]).then(function(results) {
      state.dataRows = results[0] || [];
      state.shopifyRows = results[1].records || [];
      state.mappings = {};
      (results[2].items || []).forEach(function(item) {
        state.mappings[normalizeSku(item.sku)] = item;
      });
      buildReference();
      buildRows();
      meta.textContent = '欧洲产品分类 ' + state.categories.length + ' 个 | Shopify 缓存 ' + state.shopifyRows.length + ' 条 | 已保存映射 ' + Object.keys(state.mappings).length + ' 条';
      statusText.textContent = '准备就绪';
      render();
    }).catch(function(err) {
      statusText.textContent = '读取失败：' + err.message;
    });
  }

  searchInput.addEventListener('input', render);
  viewSelect.addEventListener('change', render);
  saveBtn.addEventListener('click', saveMappings);
  reloadBtn.addEventListener('click', loadAll);
  loadAll();
})();
