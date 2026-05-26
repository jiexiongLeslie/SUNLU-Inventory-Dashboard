(function() {
  'use strict';

  var ALL_REGION = '全站';
  var UNMATCHED_CATEGORY = '未匹配库存项';
  var SHOPIFY_REFERENCE_REGIONS = ['英国', '欧洲', '美国'];

  var state = {
    shops: [],
    records: [],
    displayRecords: [],
    filtered: [],
    allDataRows: [],
    referenceRows: [],
    referenceRegion: ALL_REGION,
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
  var summarySearchInput = document.getElementById('summarySearchInput');
  var summaryStockOnly = document.getElementById('summaryStockOnly');
  var summarySearchHint = document.getElementById('summarySearchHint');

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

  function productUrl(shop, handle) {
    return shop && handle ? 'https://' + shop + '/products/' + handle : '';
  }

  function normalizeSourceEntries(item) {
    var entries = Array.isArray(item.source_entries) && item.source_entries.length
      ? item.source_entries
      : [{
          store_key: item.store_key,
          store_label: item.store_label,
          shop: item.shop,
          product_id: item.product_id,
          product_title: item.product_title,
          handle: item.handle,
          url: productUrl(item.shop, item.handle),
          variant_id: item.variant_id,
          variant_title: item.variant_title,
          color: item.color || item.variant_title || '',
          sku: item.sku,
          price: item.price,
          inventory_quantity: item.inventory_quantity,
          status: item.status
        }];

    return entries.map(function(entry) {
      return {
        store_key: entry.store_key || item.store_key || '',
        store_label: entry.store_label || item.store_label || '',
        shop: entry.shop || item.shop || '',
        product_id: entry.product_id || item.product_id || '',
        product_title: entry.product_title || item.product_title || '',
        handle: entry.handle || item.handle || '',
        url: entry.url || productUrl(entry.shop || item.shop, entry.handle || item.handle),
        variant_id: entry.variant_id || item.variant_id || '',
        variant_title: entry.variant_title || item.variant_title || '',
        color: entry.color || item.color || item.variant_title || '',
        sku: entry.sku || item.sku || '',
        price: entry.price == null ? (item.price || '') : entry.price,
        inventory_quantity: Number(entry.inventory_quantity == null ? item.inventory_quantity : entry.inventory_quantity) || 0,
        status: entry.status || item.status || ''
      };
    });
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

  function getReferenceRegion() {
    var store = storeSelect.value;
    if (store === 'SHOPIFY_UK_STORE') return '英国';
    if (store === 'SHOPIFY_DE_STORE') return '欧洲';
    if (store === 'SHOPIFY_US_STORE') return '美国';
    return ALL_REGION;
  }

  function referenceScopeLabel() {
    return state.referenceRegion + '产品汇总 ' + formatNumber(state.categoryOrder.length) + ' 个产品';
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
        state.allDataRows = Array.isArray(data) ? data : [];
        rebuildReferenceForSelectedStore();
      })
      .catch(function() {
        state.allDataRows = [];
        state.referenceRows = [];
        buildReferenceMaps([]);
      });
  }

  function rebuildReferenceForSelectedStore() {
    state.referenceRegion = getReferenceRegion();
    state.referenceRows = state.allDataRows.filter(function(row) {
      if (state.referenceRegion === ALL_REGION) {
        return SHOPIFY_REFERENCE_REGIONS.indexOf(row.region) >= 0;
      }
      return row.region === state.referenceRegion;
    });
    buildReferenceMaps(state.referenceRows);
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
          source_variant_ids: Array.isArray(item.source_variant_ids) ? item.source_variant_ids.slice() : [],
          source_entries: normalizeSourceEntries(item)
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
        target.source_entries = target.source_entries.concat(normalizeSourceEntries(item));
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
      [state.referenceRegion + '产品口径', s.reference_products],
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

  function groupMatchesSummarySearch(group, q) {
    if (!q) return true;
    var groupText = [
      group.product_title,
      group.store_label,
      group.reference_stock,
      group.reference_sku_count,
      group.reference_color_count
    ].join(' ').toLowerCase();

    if (groupText.indexOf(q) >= 0) return true;
    return group.items.some(function(item) {
      var itemText = [
        item.mapped_category,
        item.product_title,
        item.variant_title,
        item.mapped_color,
        item.color,
        item.sku,
        item.vendor,
        item.product_type,
        item.store_label,
        item.shop,
        item.status
      ].join(' ').toLowerCase();
      return itemText.indexOf(q) >= 0;
    });
  }

  function uniqueCount(items, picker) {
    var set = new Set();
    items.forEach(function(item) {
      var value = picker(item);
      if (value) set.add(value);
    });
    return set.size;
  }

  function applySummaryStockOnly(groups) {
    if (!summaryStockOnly || !summaryStockOnly.checked) return groups;
    return groups.map(function(group) {
      var visibleItems = group.items.filter(function(item) {
        return Number(item.inventory_quantity || 0) > 0;
      });
      var clone = Object.assign({}, group, {
        items: visibleItems,
        total_inventory: visibleItems.reduce(function(sum, item) {
          return sum + Number(item.inventory_quantity || 0);
        }, 0),
        sku_count: uniqueCount(visibleItems, function(item) { return normalizeSku(item.sku); }),
        color_count: uniqueCount(visibleItems, function(item) { return item.mapped_color || item.color || item.variant_title; }),
        store_count: uniqueCount(visibleItems, function(item) { return item.store_label; }),
        zero_count: 0,
        low_count: visibleItems.filter(function(item) {
          return Number(item.inventory_quantity || 0) > 0 && Number(item.inventory_quantity || 0) < 10;
        }).length,
        duplicate_count: visibleItems.filter(function(item) {
          return (item.duplicate_count || 1) > 1 || (item.display_source_count || 1) > 1;
        }).length,
        conflict_count: visibleItems.filter(function(item) {
          return item.inventory_conflict || item.global_inventory_conflict;
        }).length,
        matched_count: visibleItems.filter(function(item) { return item.matched_reference; }).length,
        unmatched_count: visibleItems.filter(function(item) { return !item.matched_reference; }).length
      });
      return clone;
    }).filter(function(group) {
      return group.total_inventory > 0 && group.items.length > 0;
    });
  }

  function currencyInfo(entry) {
    var text = [
      entry && entry.store_key,
      entry && entry.store_label,
      entry && entry.shop
    ].join(' ').toUpperCase();
    if (/UK|UNITED KINGDOM|GB/.test(text)) return { symbol: '£', cls: 'gbp' };
    if (/DE|FR|IT|EU|EUROPE|欧洲|歐洲/.test(text)) return { symbol: '€', cls: 'eur' };
    return { symbol: '$', cls: 'usd' };
  }

  function formatPrice(value, entry) {
    if (value === '' || value == null) return '-';
    var num = Number(value);
    var info = currencyInfo(entry || {});
    return Number.isFinite(num) ? info.symbol + num.toFixed(2) : info.symbol + String(value);
  }

  function priceSummary(entries) {
    var prices = Array.from(new Set(entries.map(function(entry) {
      return String(entry.price == null ? '' : entry.price).trim() ? formatPrice(entry.price, entry) : '';
    }).filter(Boolean)));
    if (!prices.length) return '<span class="badge warn">缺价格</span>';
    if (prices.length === 1) return '<span class="price-pill">' + escapeHtml(prices[0]) + '</span>';
    var label = prices.slice(0, 3).join(' / ') + (prices.length > 3 ? ' +' + (prices.length - 3) : '');
    return '<span class="badge warn">多价格</span> <span class="price-pill">' + escapeHtml(label) + '</span>';
  }

  function buildSkuSourceGroups(items) {
    var map = new Map();
    items.forEach(function(item) {
      var sku = normalizeSku(item.sku) || 'NO-SKU';
      if (!map.has(sku)) {
        map.set(sku, {
          sku: sku,
          display_sku: item.sku || '无 SKU',
          colorSet: new Set(),
          inventory: 0,
          entries: []
        });
      }
      var group = map.get(sku);
      var itemEntries = normalizeSourceEntries(item);
      var visibleEntries = summaryStockOnly && summaryStockOnly.checked
        ? itemEntries.filter(function(entry) { return Number(entry.inventory_quantity || 0) > 0; })
        : itemEntries;
      visibleEntries.forEach(function(entry) {
        if (entry.color) group.colorSet.add(entry.color);
        group.inventory += Number(entry.inventory_quantity || 0);
        group.entries.push(entry);
      });
    });
    return Array.from(map.values()).filter(function(group) {
      return group.entries.length;
    }).map(function(group) {
      group.colors = Array.from(group.colorSet).join(' / ') || '-';
      group.link_count = uniqueCount(group.entries, function(entry) { return [entry.store_label, entry.url || entry.product_title].join('|'); });
      return group;
    }).sort(function(a, b) {
      return b.inventory - a.inventory || a.display_sku.localeCompare(b.display_sku);
    });
  }

  function renderSkuSourceDetails(items) {
    var groups = buildSkuSourceGroups(items);
    if (!groups.length) {
      return '<tr><td colspan="7"><div class="empty">暂无 Shopify 匹配 SKU</div></td></tr>';
    }
    return groups.map(function(group) {
      var head = '<tr class="sku-group">' +
        '<td colspan="7"><div class="sku-line"><span class="sku">' + escapeHtml(group.display_sku) + '</span>' +
        '<span class="muted">颜色 ' + escapeHtml(group.colors) + '</span>' +
        '<span class="badge ok">库存 ' + formatNumber(group.inventory) + '</span>' +
        '<span class="badge warn">链接 ' + formatNumber(group.link_count) + '</span>' +
        priceSummary(group.entries) + '</div></td></tr>';
      var rows = group.entries
        .slice()
        .sort(function(a, b) {
          return String(a.store_label).localeCompare(String(b.store_label)) || Number(b.inventory_quantity || 0) - Number(a.inventory_quantity || 0);
        })
        .map(function(entry) {
          var currency = currencyInfo(entry);
          var linkText = entry.url ? escapeHtml(entry.product_title || entry.handle || entry.url) : escapeHtml(entry.product_title || '-');
          var link = entry.url
            ? '<a href="' + escapeHtml(entry.url) + '" target="_blank" rel="noreferrer">' + linkText + '</a>'
            : linkText;
          return '<tr>' +
            '<td><span class="store-pill">' + escapeHtml(entry.store_label || '-') + '</span><div class="source-meta">' + escapeHtml(entry.shop || '') + '</div></td>' +
            '<td class="link-cell"><div class="source-title">' + link + '</div><div class="source-meta">' + escapeHtml(entry.handle || '') + '</div></td>' +
            '<td><span class="variant-chip">' + escapeHtml(entry.color || '-') + '</span><div class="source-meta">' + escapeHtml(entry.variant_title || '') + '</div></td>' +
            '<td class="sku">' + escapeHtml(entry.sku || group.display_sku) + '</td>' +
            '<td><span class="price-pill ' + currency.cls + '">' + formatPrice(entry.price, entry) + '</span></td>' +
            '<td><span class="inventory-pill">' + formatNumber(entry.inventory_quantity) + '</span></td>' +
            '<td><span class="status-dot">' + escapeHtml(entry.status || '-') + '</span></td>' +
          '</tr>';
        }).join('');
      return head + rows;
    }).join('');
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
          '<td><strong>' + escapeHtml(item.mapped_category) + '</strong><div class="muted">' + (item.matched_reference ? state.referenceRegion + 'SKU匹配' : '未匹配到' + state.referenceRegion + 'SKU') + '</div></td>' +
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
    var stockOnly = summaryStockOnly && summaryStockOnly.checked;
    var allGroups = applySummaryStockOnly(buildProductSummary(records));
    var summaryQ = summarySearchInput.value.trim().toLowerCase();
    var groups = allGroups.filter(function(group) {
      return groupMatchesSummarySearch(group, summaryQ);
    });
    var referenceCount = state.categoryOrder.length;
    var extraCount = groups.filter(function(group) { return group.product_title === UNMATCHED_CATEGORY && group.items.length; }).length;
    summaryCount.textContent = summaryQ
      ? formatNumber(groups.length) + ' / ' + formatNumber(allGroups.length) + ' 个产品'
      : formatNumber(referenceCount) + ' 个' + state.referenceRegion + '单品' + (extraCount ? ' + 疑似未匹配单品' : '');
    if (stockOnly && !summaryQ) {
      summaryCount.textContent = formatNumber(groups.length) + ' / ' + formatNumber(referenceCount) + ' 个有库存产品';
    }
    summarySearchHint.textContent = (summaryQ ? '已按产品汇总搜索过滤' : '按当前店铺口径过滤') + (stockOnly ? ' · 仅有库存' : '');

    if (!groups.length) {
      summaryBody.innerHTML = '<tr><td colspan="8"><div class="empty">' + (summaryQ ? '没有匹配的产品汇总' : '没有匹配的数据') + '</div></td></tr>';
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
      var details = renderSkuSourceDetails(group.items);
      return '<tr>' +
        '<td><div class="rank-cell"><span class="rank-badge ' + rankCls + '">' + (index + 1) + '</span></div></td>' +
        '<td><span class="expand-btn" data-target="' + id + '"><span class="arrow" id="arrow_' + id + '">&#9654;</span><span class="summary-name" title="' + escapeHtml(group.product_title) + '">' + escapeHtml(group.product_title) + '</span></span><div class="muted">' + state.referenceRegion + '表SKU ' + formatNumber(group.reference_sku_count) + ' / 参考库存 ' + formatNumber(group.reference_stock) + '</div></td>' +
        '<td><span class="badge ' + (group.items.length ? 'ok' : 'warn') + '">' + formatNumber(group.sku_count) + ' SKU</span></td>' +
        '<td>' + formatNumber(group.color_count) + ' 色</td>' +
        '<td class="number">' + formatNumber(group.total_inventory) + '</td>' +
        '<td>' + pct + (pct === '-' ? '' : '%') + '</td>' +
        '<td class="bar-cell"><div class="bar"><div class="fill" style="width:' + barW + '%"></div></div></td>' +
        '<td>' + formatNumber(group.duplicate_count) + '<div class="muted">' + (group.conflict_count ? formatNumber(group.conflict_count) + ' 个冲突' : '已去重') + '</div></td>' +
      '</tr>' +
      '<tr class="detail-row" id="' + id + '"><td colspan="8" class="detail-cell"><div class="detail-inner"><table><thead><tr><th>店铺</th><th>产品链接</th><th>颜色/变体</th><th>SKU</th><th>即时价格</th><th>库存</th><th>状态</th></tr></thead><tbody>' + details + '</tbody></table></div></td></tr>';
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
          return shop.key === 'SHOPIFY_DE_STORE' || shop.label === 'DE' || shop.label === 'EU';
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
    rebuildReferenceForSelectedStore();
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
          ' | 分类口径：独立站' + referenceScopeLabel();
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
  summarySearchInput.addEventListener('input', function() { renderSummary(state.filtered); });
  if (summaryStockOnly) {
    summaryStockOnly.addEventListener('change', function() { renderSummary(state.filtered); });
  }
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
