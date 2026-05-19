(function() {
  'use strict';

  var EUROPE_REGION = '欧洲';
  var UNMATCHED_CATEGORY = '未匹配库存项';

  var state = {
    shops: [],
    records: [],
    displayRecords: [],
    filtered: [],
    referenceRows: [],
    categoryOrder: [],
    categoryMeta: {},
    skuReference: {},
    skuMappings: {},
    activeView: 'summary',
    loading: false
  };

  var storeSelect = document.getElementById('storeSelect');
  var riskSelect = document.getElementById('riskSelect');
  var searchInput = document.getElementById('searchInput');
  var refreshBtn = document.getElementById('refreshBtn');
  var statusText = document.getElementById('statusText');
  var meta = document.getElementById('meta');
  var kpiGrid = document.getElementById('kpiGrid');
  var tableBody = document.getElementById('tableBody');
  var tableCount = document.getElementById('tableCount');
  var summaryPanel = document.getElementById('summaryPanel');
  var detailPanel = document.getElementById('detailPanel');
  var summaryBody = document.getElementById('summaryBody');
  var summaryCount = document.getElementById('summaryCount');

  function setLoading(isLoading, text) {
    state.loading = isLoading;
    refreshBtn.disabled = isLoading;
    statusText.textContent = text || (isLoading ? '正在加载...' : '准备就绪');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

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

  function riskLabel(risk) {
    if (risk === 'out_of_stock') return { text: '零库存', cls: 'bad' };
    if (risk === 'low') return { text: '低库存', cls: 'warn' };
    return { text: '正常', cls: 'ok' };
  }

  function categorySort(items) {
    return items.sort(function(a, b) {
      return b.reference_stock - a.reference_stock || a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function buildReferenceMaps(rows) {
    var byCategory = {};
    state.skuReference = {};

    rows.forEach(function(row) {
      var category = String(row.category || '').trim();
      if (!category) return;

      if (!byCategory[category]) {
        byCategory[category] = {
          name: category,
          reference_stock: 0,
          reference_skus: new Set(),
          reference_colors: new Set()
        };
      }

      byCategory[category].reference_stock += Number(row.stock) || 0;
      if (row.color) byCategory[category].reference_colors.add(row.color);

      if (hasUsableSku(row.store_sku)) {
        var sku = normalizeSku(row.store_sku);
        byCategory[category].reference_skus.add(sku);
        if (!state.skuReference[sku]) {
          state.skuReference[sku] = [];
        }
        state.skuReference[sku].push({
          category: category,
          color: row.color || '',
          reference_stock: Number(row.stock) || 0
        });
      }
    });

    state.categoryOrder = categorySort(Object.keys(byCategory).map(function(name) {
      return byCategory[name];
    })).map(function(item) {
      return item.name;
    });

    state.categoryMeta = {};
    Object.keys(byCategory).forEach(function(name) {
      state.categoryMeta[name] = {
        reference_stock: byCategory[name].reference_stock,
        reference_sku_count: byCategory[name].reference_skus.size,
        reference_color_count: byCategory[name].reference_colors.size
      };
    });
  }

  function loadReferenceData() {
    return fetch('/api/data')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        state.referenceRows = Array.isArray(data)
          ? data.filter(function(row) { return row.region === EUROPE_REGION; })
          : [];
        buildReferenceMaps(state.referenceRows);
      })
      .catch(function() {
        state.referenceRows = [];
        buildReferenceMaps([]);
      });
  }

  function loadSkuMappings() {
    return fetch('/api/sku-mappings')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        state.skuMappings = {};
        (data.items || []).forEach(function(item) {
          if (item.sku) {
            state.skuMappings[normalizeSku(item.sku)] = item;
          }
        });
      })
      .catch(function() {
        state.skuMappings = {};
      });
  }

  function pickReferenceCategory(item) {
    var sku = normalizeSku(item.sku);
    var refs = state.skuReference[sku];
    if (!refs || !refs.length) {
      return null;
    }

    if (refs.length === 1) {
      return refs[0];
    }

    var text = [item.product_title, item.variant_title, item.color, item.product_type, item.vendor].join(' ').toLowerCase();
    var matched = refs.find(function(ref) {
      return ref.color && text.indexOf(String(ref.color).toLowerCase()) >= 0;
    });
    return matched || refs[0];
  }

  function isBundleOrNonSingleSku(item) {
    var sku = String(item.sku || '');
    var text = [
      item.sku,
      item.product_title,
      item.variant_title,
      item.color,
      item.product_type
    ].join(' ').toLowerCase();

    if (!hasUsableSku(sku)) return true;
    if (/customs[-_ ]?clearance|clearance|räumung|räumungsverkäufe|gift|sample|test|shipping|route|insurance|anzahlung/.test(text)) return true;
    if (/\b(combo|bundle|kit|set|pack|packs|sammlungen|kombination|zufalls|random|moq|rabatt|mystery)\b/.test(text)) return true;
    if (/bundle|mysterybox|mystery box/.test(text)) return true;
    if (/bündel|sätze|satz/.test(text)) return true;
    if (/\d+\s*[*x×]\s*(0\.25|0\.5|1|2|3|5)\s*kg/i.test(text)) return true;
    if (/\+\s*(pla|petg|abs|ptfe|fc|s[124]fd|fd|filament|resin|harz|\d+\s*kg)/i.test(sku)) return true;
    if (/[a-z]{2}\*[2-9]|\*[2-9]|1kg\*3|kg\*3/i.test(sku)) return true;
    if (/(bk|wt|wh|rd|yl|or|gn|bl|gy|dg|tp|sb|gg|pk|pp)&[a-z0-9&]+/i.test(sku)) return true;
    return false;
  }

  function dedupeForDisplay(records) {
    var inventoryBySku = {};
    records.forEach(function(item) {
      var sku = normalizeSku(item.sku);
      if (!sku) return;
      if (!inventoryBySku[sku]) inventoryBySku[sku] = new Set();
      inventoryBySku[sku].add(Number(item.inventory_quantity) || 0);
    });

    var map = {};
    records.forEach(function(item) {
      var sku = normalizeSku(item.sku);
      var inventory = Number(item.inventory_quantity) || 0;
      var key = sku ? sku + '|' + inventory : [item.store_key, item.variant_id || item.product_id || item.product_title, inventory].join('|');

      if (!map[key]) {
        map[key] = Object.assign({}, item, {
          normalized_sku: sku,
          inventory_quantity: inventory,
          duplicate_count: Number(item.duplicate_count) || 1,
          display_source_count: 1,
          source_store_set: new Set([item.store_label || item.store_key || '']),
          source_product_set: new Set([item.product_title || ''].filter(Boolean)),
          source_variant_set: new Set([item.variant_title || ''].filter(Boolean)),
          source_color_set: new Set([item.color || ''].filter(Boolean)),
          source_variant_ids: Array.isArray(item.source_variant_ids) ? item.source_variant_ids.slice() : []
        });
      } else {
        var target = map[key];
        target.duplicate_count += Number(item.duplicate_count) || 1;
        target.display_source_count += 1;
        if (item.store_label || item.store_key) target.source_store_set.add(item.store_label || item.store_key);
        if (item.product_title) target.source_product_set.add(item.product_title);
        if (item.variant_title) target.source_variant_set.add(item.variant_title);
        if (item.color) target.source_color_set.add(item.color);
        if (Array.isArray(item.source_variant_ids)) {
          target.source_variant_ids = target.source_variant_ids.concat(item.source_variant_ids);
        }
      }
    });

    return Object.keys(map).map(function(key) {
      var item = map[key];
      item.store_label = Array.from(item.source_store_set).filter(Boolean).join(' / ') || item.store_label;
      item.product_title = Array.from(item.source_product_set).filter(Boolean).join(' / ') || item.product_title;
      item.variant_title = Array.from(item.source_variant_set).filter(Boolean).join(' / ') || item.variant_title;
      item.color = Array.from(item.source_color_set).filter(Boolean).join(' / ') || item.color;
      item.global_inventory_conflict = item.normalized_sku && inventoryBySku[item.normalized_sku] && inventoryBySku[item.normalized_sku].size > 1;
      item.risk_level = item.inventory_quantity <= 0 ? 'out_of_stock' : item.inventory_quantity < 10 ? 'low' : 'healthy';

      delete item.source_store_set;
      delete item.source_product_set;
      delete item.source_variant_set;
      delete item.source_color_set;
      return item;
    });
  }

  function enrichRecord(item) {
    var mapping = state.skuMappings[normalizeSku(item.sku)];
    if (mapping && mapping.kind === 'excluded') {
      return Object.assign({}, item, {
        mapped_category: UNMATCHED_CATEGORY,
        mapped_color: item.color || item.variant_title || '',
        matched_reference: false,
        is_excluded_non_single: true,
        is_suspected_single_unmatched: false,
        mapping_note: mapping.note || ''
      });
    }

    if (mapping && mapping.kind === 'single' && mapping.category) {
      return Object.assign({}, item, {
        mapped_category: mapping.category,
        mapped_color: item.color || item.variant_title || '',
        matched_reference: true,
        is_excluded_non_single: false,
        is_suspected_single_unmatched: false,
        mapping_note: mapping.note || ''
      });
    }

    var ref = pickReferenceCategory(item);
    var category = ref ? ref.category : UNMATCHED_CATEGORY;
    var excluded = !ref && isBundleOrNonSingleSku(item);
    return Object.assign({}, item, {
      mapped_category: category,
      mapped_color: ref && ref.color ? ref.color : (item.color || item.variant_title || ''),
      matched_reference: Boolean(ref),
      is_excluded_non_single: excluded,
      is_suspected_single_unmatched: !ref && !excluded
    });
  }

  function getDisplayRecords() {
    return dedupeForDisplay(state.records).map(enrichRecord);
  }

  function buildProductSummary(records) {
    var includeReferenceShell = !searchInput.value.trim() && !riskSelect.value;
    var map = {};

    if (includeReferenceShell) {
      state.categoryOrder.forEach(function(category) {
        var refMeta = state.categoryMeta[category] || {};
        map[category] = {
          product_title: category,
          reference_stock: refMeta.reference_stock || 0,
          reference_sku_count: refMeta.reference_sku_count || 0,
          reference_color_count: refMeta.reference_color_count || 0,
          skuSet: new Set(),
          colorSet: new Set(),
          storeSet: new Set(),
          total_inventory: 0,
          zero_count: 0,
          low_count: 0,
          duplicate_count: 0,
          conflict_count: 0,
          matched_count: 0,
          unmatched_count: 0,
          items: []
        };
      });
    }

    records.forEach(function(item) {
      var category = item.mapped_category || UNMATCHED_CATEGORY;
      if (!map[category]) {
        var refMeta = state.categoryMeta[category] || {};
        map[category] = {
          product_title: category,
          reference_stock: refMeta.reference_stock || 0,
          reference_sku_count: refMeta.reference_sku_count || 0,
          reference_color_count: refMeta.reference_color_count || 0,
          skuSet: new Set(),
          colorSet: new Set(),
          storeSet: new Set(),
          total_inventory: 0,
          zero_count: 0,
          low_count: 0,
          duplicate_count: 0,
          conflict_count: 0,
          matched_count: 0,
          unmatched_count: 0,
          items: []
        };
      }

      var group = map[category];
      if (item.sku) group.skuSet.add(normalizeSku(item.sku));
      if (item.mapped_color || item.color) group.colorSet.add(item.mapped_color || item.color);
      if (item.store_label) group.storeSet.add(item.store_label);
      group.total_inventory += Number(item.inventory_quantity) || 0;
      if (item.inventory_quantity <= 0) group.zero_count += 1;
      if (item.inventory_quantity > 0 && item.inventory_quantity < 10) group.low_count += 1;
      if ((item.duplicate_count || 1) > 1 || (item.display_source_count || 1) > 1) group.duplicate_count += 1;
      if (item.inventory_conflict || item.global_inventory_conflict) group.conflict_count += 1;
      if (item.matched_reference) group.matched_count += 1;
      if (!item.matched_reference) group.unmatched_count += 1;
      group.items.push(item);
    });

    var orderIndex = {};
    state.categoryOrder.forEach(function(category, index) {
      orderIndex[category] = index;
    });

    return Object.keys(map).map(function(category) {
      var group = map[category];
      group.sku_count = group.skuSet.size;
      group.color_count = group.colorSet.size || group.reference_color_count;
      group.store_count = group.storeSet.size;
      group.store_label = Array.from(group.storeSet).join(' / ') || '-';
      delete group.skuSet;
      delete group.colorSet;
      delete group.storeSet;
      return group;
    }).sort(function(a, b) {
      if (a.product_title === UNMATCHED_CATEGORY) return 1;
      if (b.product_title === UNMATCHED_CATEGORY) return -1;
      if (b.total_inventory !== a.total_inventory) return b.total_inventory - a.total_inventory;
      var ai = orderIndex[a.product_title] == null ? 9999 : orderIndex[a.product_title];
      var bi = orderIndex[b.product_title] == null ? 9999 : orderIndex[b.product_title];
      return ai - bi;
    });
  }

  function computeSummary(records) {
    var products = new Set();
    var skus = new Set();
    var singleInventory = 0;
    var zero = 0;
    var low = 0;
    var duplicateGroups = 0;
    var conflictGroups = 0;
    var suspectedUnmatched = 0;
    var excluded = 0;
    var excludedInventory = 0;
    var rawSources = 0;

    records.forEach(function(item) {
      if (item.is_excluded_non_single) {
        excluded += 1;
        excludedInventory += Number(item.inventory_quantity) || 0;
        return;
      }

      if (item.matched_reference && item.mapped_category) {
        products.add(item.mapped_category);
        singleInventory += Number(item.inventory_quantity) || 0;
      }
      if (item.sku && item.matched_reference) skus.add(normalizeSku(item.sku));
      if (item.inventory_quantity <= 0) zero += 1;
      if (item.inventory_quantity > 0 && item.inventory_quantity < 10) low += 1;
      if ((item.duplicate_count || 1) > 1 || (item.display_source_count || 1) > 1) duplicateGroups += 1;
      if (item.inventory_conflict || item.global_inventory_conflict) conflictGroups += 1;
      if (item.is_suspected_single_unmatched) suspectedUnmatched += 1;
      rawSources += Number(item.duplicate_count) || 1;
    });

    return {
      reference_products: state.categoryOrder.length,
      matched_products: products.size,
      unique_items: records.length,
      skus: skus.size,
      single_inventory: singleInventory,
      zero_stock_variants: zero,
      low_stock_variants: low,
      duplicate_groups: duplicateGroups,
      inventory_conflicts: conflictGroups,
      suspected_unmatched_items: suspectedUnmatched,
      excluded_items: excluded,
      excluded_inventory: excludedInventory,
      raw_sources: rawSources
    };
  }

  function renderKpis(records) {
    var s = computeSummary(records);
    var items = [
      ['欧洲产品口径', s.reference_products],
      ['已匹配产品', s.matched_products],
      ['匹配单品SKU', s.skus],
      ['单品SKU库存', s.single_inventory],
      ['排除捆绑SKU', s.excluded_items],
      ['疑似未匹配单品SKU', s.suspected_unmatched_items],
      ['库存冲突SKU', s.inventory_conflicts]
    ];
    kpiGrid.innerHTML = items.map(function(item) {
      return '<div class="kpi"><div class="label">' + escapeHtml(item[0]) + '</div><div class="value">' + formatNumber(item[1]) + '</div></div>';
    }).join('');
  }

  function itemMatchesSearch(item, q) {
    if (!q) return true;
    var haystack = [
      item.mapped_category,
      item.product_title,
      item.variant_title,
      item.mapped_color,
      item.color,
      item.sku,
      item.vendor,
      item.product_type,
      item.store_label,
      item.status
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) >= 0;
  }

  function applyFilters() {
    var q = searchInput.value.trim().toLowerCase();
    var risk = riskSelect.value;
    state.displayRecords = getDisplayRecords();
    state.filtered = state.displayRecords.filter(function(item) {
      if (item.is_excluded_non_single) return false;
      if (risk && item.risk_level !== risk) return false;
      return itemMatchesSearch(item, q);
    });
    render();
  }

  function renderTable(records) {
    tableCount.textContent = formatNumber(records.length) + ' 条';
    if (!records.length) {
      tableBody.innerHTML = '<tr><td colspan="10"><div class="empty">没有匹配的数据</div></td></tr>';
      return;
    }

    var rows = records
      .slice()
      .sort(function(a, b) {
        if (a.matched_reference !== b.matched_reference) return a.matched_reference ? -1 : 1;
        if (a.inventory_quantity !== b.inventory_quantity) return a.inventory_quantity - b.inventory_quantity;
        return String(a.mapped_category).localeCompare(String(b.mapped_category), 'zh-CN');
      })
      .slice(0, 700)
      .map(function(item) {
        var risk = riskLabel(item.risk_level);
        return '<tr>' +
          '<td><strong>' + escapeHtml(item.mapped_category) + '</strong><div class="muted">' + (item.matched_reference ? '欧洲SKU匹配' : '未匹配到欧洲SKU') + '</div></td>' +
          '<td>' + escapeHtml(item.mapped_color || item.color || '-') + '<div class="muted">' + escapeHtml(item.variant_title || '') + '</div></td>' +
          '<td class="sku">' + (item.sku ? escapeHtml(item.sku) : '<span class="muted">无 SKU</span>') + '</td>' +
          '<td class="number">' + formatNumber(item.inventory_quantity) + '</td>' +
          '<td><span class="badge ' + risk.cls + '">' + risk.text + '</span><div class="muted">' + escapeHtml(item.status || '-') + '</div></td>' +
          '<td>' + escapeHtml(item.store_label || '-') + '<div class="muted">' + escapeHtml(item.shop || '') + '</div></td>' +
          '<td>' + escapeHtml(item.product_title || '-') + '<div class="muted">' + escapeHtml(item.handle || '') + '</div></td>' +
          '<td>' + escapeHtml(item.vendor || '-') + '</td>' +
          '<td>' + formatNumber(item.duplicate_count || 1) + '<div class="muted">' + (item.global_inventory_conflict ? '同SKU多库存' : '来源数') + '</div></td>' +
          '<td>' + (item.inventory_tracked ? '是' : '<span class="muted">否</span>') + '</td>' +
        '</tr>';
      });
    tableBody.innerHTML = rows.join('');
  }

  function renderSummary(records) {
    var groups = buildProductSummary(records);
    var referenceCount = state.categoryOrder.length;
    var extraCount = groups.filter(function(group) { return group.product_title === UNMATCHED_CATEGORY && group.items.length; }).length;
    summaryCount.textContent = formatNumber(referenceCount) + ' 个欧洲单品' + (extraCount ? ' + 疑似未匹配单品' : '');

    if (!groups.length) {
      summaryBody.innerHTML = '<tr><td colspan="8"><div class="empty">没有匹配的数据</div></td></tr>';
      return;
    }

    var total = groups.reduce(function(sum, group) {
      return sum + group.total_inventory;
    }, 0) || 1;
    var maxVal = groups.reduce(function(max, group) {
      return Math.max(max, group.total_inventory);
    }, 1);

    summaryBody.innerHTML = groups.map(function(group, index) {
      var id = 'summary_' + index;
      var pct = group.total_inventory ? (group.total_inventory / total * 100).toFixed(2) : '-';
      var barW = Math.round(group.total_inventory / maxVal * 100);
      var rankCls = index === 0 ? 'top1' : index === 1 ? 'top2' : index === 2 ? 'top3' : 'normal';
      var details = group.items.length
        ? group.items
          .slice()
          .sort(function(a, b) { return b.inventory_quantity - a.inventory_quantity; })
          .map(function(item) {
            var risk = riskLabel(item.risk_level);
            return '<tr>' +
              '<td>' + escapeHtml(item.mapped_color || item.color || '-') + '</td>' +
              '<td class="sku">' + (item.sku ? escapeHtml(item.sku) : '<span class="muted">无 SKU</span>') + '</td>' +
              '<td class="number">' + formatNumber(item.inventory_quantity) + '</td>' +
              '<td>' + escapeHtml(item.store_label || '-') + '</td>' +
              '<td><span class="badge ' + risk.cls + '">' + risk.text + '</span></td>' +
              '<td>' + formatNumber(item.duplicate_count || 1) + (item.global_inventory_conflict ? '<div class="muted">同SKU多库存</div>' : '') + '</td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="6"><div class="empty">暂无 Shopify 匹配 SKU</div></td></tr>';

      return '<tr>' +
        '<td><div class="rank-cell"><span class="rank-badge ' + rankCls + '">' + (index + 1) + '</span></div></td>' +
        '<td><span class="expand-btn" data-target="' + id + '"><span class="arrow" id="arrow_' + id + '">&#9654;</span><span class="summary-name" title="' + escapeHtml(group.product_title) + '">' + escapeHtml(group.product_title) + '</span></span><div class="muted">欧洲表SKU ' + formatNumber(group.reference_sku_count) + ' / 参考库存 ' + formatNumber(group.reference_stock) + '</div></td>' +
        '<td><span class="badge ' + (group.items.length ? 'ok' : 'warn') + '">' + formatNumber(group.sku_count) + ' SKU</span></td>' +
        '<td>' + formatNumber(group.color_count) + ' 色</td>' +
        '<td class="number">' + formatNumber(group.total_inventory) + '</td>' +
        '<td>' + pct + (pct === '-' ? '' : '%') + '</td>' +
        '<td class="bar-cell"><div class="bar"><div class="fill" style="width:' + barW + '%"></div></div></td>' +
        '<td>' + formatNumber(group.duplicate_count) + '<div class="muted">' + (group.conflict_count ? formatNumber(group.conflict_count) + ' 个冲突' : '已去重') + '</div></td>' +
      '</tr>' +
      '<tr class="detail-row" id="' + id + '"><td colspan="8" class="detail-cell"><div class="detail-inner"><table><thead><tr><th>颜色</th><th>SKU</th><th>库存</th><th>店铺</th><th>状态</th><th>来源</th></tr></thead><tbody>' + details + '</tbody></table></div></td></tr>';
    }).join('');
  }

  function switchView(view) {
    state.activeView = view;
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    summaryPanel.style.display = view === 'summary' ? '' : 'none';
    detailPanel.style.display = view === 'detail' ? '' : 'none';
  }

  function render() {
    renderKpis(state.displayRecords.length ? state.displayRecords : state.filtered);
    renderSummary(state.filtered);
    renderTable(state.filtered);
  }

  function renderShopOptions(shops) {
    storeSelect.innerHTML = '<option value="">全部店铺</option>' + shops.map(function(shop) {
      return '<option value="' + escapeHtml(shop.key) + '">' + escapeHtml(shop.label + ' - ' + shop.shop) + '</option>';
    }).join('');
  }

  function loadShops() {
    return fetch('/api/shopify/shops')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        state.shops = data.stores || [];
        renderShopOptions(state.shops);
        var deShop = state.shops.find(function(shop) {
          return shop.key === 'SHOPIFY_DE_STORE' || shop.label === 'DE';
        });
        if (deShop && !storeSelect.value) {
          storeSelect.value = deShop.key;
        }
        if (!data.has_client_id || !data.has_client_secret) {
          setLoading(false, '缺少 Shopify client_id/client_secret');
        }
      });
  }

  function loadInventory(forceRefresh) {
    if (state.loading) return;
    var store = storeSelect.value;
    var params = [];
    if (store) params.push('store=' + encodeURIComponent(store));
    if (forceRefresh) params.push('refresh=1');
    var url = '/api/shopify/inventory' + (params.length ? '?' + params.join('&') : '');
    setLoading(true, forceRefresh ? '正在从 Shopify 拉取最新库存...' : '正在读取 Shopify 库存缓存...');
    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        state.records = data.records || [];
        meta.textContent = (data.from_cache ? '缓存：' : '更新：') + new Date(data.cached_at || data.generated_at).toLocaleString('zh-CN') +
          ' | Shopify店铺：' + (data.stores || []).map(function(s) { return s.store_label; }).join(', ') +
          ' | 分类口径：独立站欧洲产品汇总 ' + formatNumber(state.categoryOrder.length) + ' 个产品';
        setLoading(false, '已加载 ' + formatNumber(state.records.length) + ' 条 Shopify SKU' + (data.from_cache ? '（缓存）' : '（已刷新缓存）'));
        applyFilters();
      })
      .catch(function(err) {
        state.records = [];
        state.filtered = [];
        render();
        setLoading(false, '加载失败：' + err.message);
      });
  }

  refreshBtn.addEventListener('click', function() { loadInventory(true); });
  storeSelect.addEventListener('change', function() { loadInventory(false); });
  riskSelect.addEventListener('change', applyFilters);
  searchInput.addEventListener('input', applyFilters);
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchView(this.dataset.view);
    });
  });
  summaryBody.addEventListener('click', function(e) {
    var btn = e.target.closest('.expand-btn');
    if (!btn) return;
    var id = btn.dataset.target;
    var row = document.getElementById(id);
    var arrow = document.getElementById('arrow_' + id);
    if (!row || !arrow) return;
    var open = row.classList.toggle('show');
    arrow.classList.toggle('open', open);
  });

  renderKpis([]);
  renderSummary([]);
  renderTable([]);
  Promise.all([loadReferenceData(), loadSkuMappings(), loadShops()])
    .then(function() { loadInventory(false); })
    .catch(function(err) {
      setLoading(false, '配置读取失败：' + err.message);
    });
})();
