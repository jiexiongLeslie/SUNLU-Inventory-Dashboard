(function(global) {
  'use strict';

  var SHEET_CONFIGS = [
    {
      sheetPattern: '英国站',
      region: '英国',
      headerRows: [0, 1, 7],
      dimensionHeaderRow: 7,
      dataStartRow: 8,
      category: { row: 7, includes: ['品类'] },
      color: { row: 7, exact: '颜色' },
      storeSku: { row: 7, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], exact: '总库存' },
      inTransit: { rows: [0, 1], includes: ['在途', '库存'] }
    },
    {
      sheetPattern: '全球-欧洲',
      region: '欧洲',
      headerRows: [0, 1, 7],
      dimensionHeaderRow: 7,
      dataStartRow: 8,
      category: { row: 7, includes: ['品类'] },
      color: { row: 7, exact: '颜色' },
      storeSku: { row: 7, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], includes: ['总库存', '欧洲所有通用'] },
      inTransit: { rows: [0, 1], includes: ['在途库存'] }
    },
    {
      sheetPattern: '全球-美国',
      region: '美国',
      headerRows: [0, 1, 7],
      dimensionHeaderRow: 7,
      dataStartRow: 8,
      category: { row: 7, includes: ['品类'] },
      color: { row: 7, exact: '颜色' },
      storeSku: { row: 7, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], includes: ['独立站', '库存'] },
      inTransit: { rows: [0, 1], includes: ['在途库存'] }
    },
    {
      sheetPattern: '德国站',
      region: '德国',
      headerRows: [0, 6],
      dimensionHeaderRow: 6,
      dataStartRow: 7,
      category: { row: 6, includes: ['品类'] },
      color: { row: 6, exact: '颜色' },
      storeSku: { row: 6, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], includes: ['库存总计'] }
    },
    {
      sheetPattern: '法国站',
      region: '法国',
      headerRows: [0, 6],
      dimensionHeaderRow: 6,
      dataStartRow: 7,
      category: { row: 6, includes: ['品类'] },
      color: { row: 6, exact: '颜色' },
      storeSku: { row: 6, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], includes: ['库存总计'] }
    },
    {
      sheetPattern: '意大利站',
      region: '意大利',
      headerRows: [0, 6],
      dimensionHeaderRow: 6,
      dataStartRow: 7,
      category: { row: 6, includes: ['品类'] },
      color: { row: 6, exact: '颜色' },
      storeSku: { row: 6, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], includes: ['库存总计'] }
    },
    {
      sheetPattern: '全球-加拿大',
      region: '加拿大',
      headerRows: [0, 1, 7],
      dimensionHeaderRow: 7,
      dataStartRow: 8,
      category: { row: 7, includes: ['品类'] },
      color: { row: 7, exact: '颜色' },
      storeSku: { row: 7, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], exact: '总库存' },
      inTransit: { rows: [0, 1], includes: ['在途', '库存'] }
    },
    {
      sheetPattern: '全球-澳洲',
      region: '澳洲',
      headerRows: [0, 1, 7],
      dimensionHeaderRow: 7,
      dataStartRow: 8,
      category: { row: 7, includes: ['品类'] },
      color: { row: 7, exact: '颜色' },
      storeSku: { row: 7, anyIncludes: ['店铺SKU', 'Store SKU'] },
      stock: { rows: [0, 1], exact: '总库存' },
      inTransit: { rows: [0, 1], includes: ['在途库存'] }
    }
  ];

  var OPTIONAL_METRICS = {
    sales_7d_avg: { rows: [0, 1], includes: ['7天日均销量'] },
    sales_7d: { rows: [0, 1], anyIncludes: ['7天总销量', '近7天总销量'] },
    sales_14d: { rows: [0, 1], anyIncludes: ['14天总销量', '近14天总销量'] },
    sales_30d: { rows: [0, 1], anyIncludes: ['近30天总销量'], excludes: ['TK', '全球站+TK'] }
  };

  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function isEmpty(value) {
    return value == null || normalizeText(value) === '';
  }

  function toNumber(value) {
    if (typeof value === 'number' && isFinite(value)) {
      return value;
    }
    var text = normalizeText(value).replace(/,/g, '');
    if (!text || text === '/' || text === '-') {
      return 0;
    }
    var number = Number(text);
    return isFinite(number) ? number : 0;
  }

  function cellMatches(text, rule) {
    if (!text) {
      return false;
    }
    if (rule.exact && text !== rule.exact) {
      return false;
    }
    if (rule.includes && !rule.includes.every(function(keyword) { return text.indexOf(keyword) >= 0; })) {
      return false;
    }
    if (rule.anyIncludes && !rule.anyIncludes.some(function(keyword) { return text.indexOf(keyword) >= 0; })) {
      return false;
    }
    if (rule.excludes && rule.excludes.some(function(keyword) { return text.indexOf(keyword) >= 0; })) {
      return false;
    }
    return true;
  }

  function findColumn(raw, rule, defaultRows) {
    var rows = rule.rows || (rule.row != null ? [rule.row] : defaultRows || []);
    for (var ri = 0; ri < rows.length; ri++) {
      var rowIndex = rows[ri];
      var row = raw[rowIndex] || [];
      for (var colIndex = 0; colIndex < row.length; colIndex++) {
        if (cellMatches(normalizeText(row[colIndex]), rule)) {
          return { index: colIndex, row: rowIndex, title: normalizeText(row[colIndex]) };
        }
      }
    }
    return null;
  }

  function findSheetName(workbook, pattern) {
    for (var i = 0; i < workbook.SheetNames.length; i++) {
      if (workbook.SheetNames[i].indexOf(pattern) >= 0) {
        return workbook.SheetNames[i];
      }
    }
    return null;
  }

  function getCell(row, col) {
    return col >= 0 && col < row.length ? row[col] : null;
  }

  function classifyRisk(stock, sales7dAvg) {
    if (stock <= 0) {
      return 'out_of_stock';
    }
    if (sales7dAvg <= 0) {
      return stock > 200 ? 'slow_moving' : 'no_recent_sales';
    }
    var days = stock / sales7dAvg;
    if (days < 7) {
      return 'critical';
    }
    if (days < 14) {
      return 'low';
    }
    if (days > 90) {
      return 'overstock';
    }
    return 'healthy';
  }

  function buildRecord(row, cfg, columns, lastCategory, sheetName) {
    var stock = Math.round(toNumber(getCell(row, columns.stock.index)));
    var sales7dAvg = columns.sales_7d_avg ? toNumber(getCell(row, columns.sales_7d_avg.index)) : 0;
    var daysOfCover = sales7dAvg > 0 ? Number((stock / sales7dAvg).toFixed(1)) : null;

    return {
      category: lastCategory,
      color: normalizeText(getCell(row, columns.color.index)),
      store_sku: columns.storeSku ? normalizeText(getCell(row, columns.storeSku.index)) : '',
      stock: stock,
      region: cfg.region,
      in_transit: columns.inTransit ? Math.round(toNumber(getCell(row, columns.inTransit.index))) : 0,
      sales_7d_avg: Number(sales7dAvg.toFixed(2)),
      sales_7d: columns.sales_7d ? Math.round(toNumber(getCell(row, columns.sales_7d.index))) : 0,
      sales_14d: columns.sales_14d ? Math.round(toNumber(getCell(row, columns.sales_14d.index))) : 0,
      sales_30d: columns.sales_30d ? Math.round(toNumber(getCell(row, columns.sales_30d.index))) : 0,
      days_of_cover: daysOfCover,
      risk_level: classifyRisk(stock, sales7dAvg),
      source_sheet: sheetName
    };
  }

  function parseSheet(workbook, cfg) {
    var sheetName = findSheetName(workbook, cfg.sheetPattern);
    var report = {
      sheetPattern: cfg.sheetPattern,
      sheetName: sheetName,
      region: cfg.region,
      records: 0,
      skippedRows: 0,
      columns: {},
      missingColumns: []
    };

    if (!sheetName) {
      report.missingColumns.push('工作表');
      return { records: [], report: report };
    }

    var ws = workbook.Sheets[sheetName];
    var raw = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    var columns = {
      category: findColumn(raw, cfg.category, cfg.headerRows),
      color: findColumn(raw, cfg.color, cfg.headerRows),
      storeSku: findColumn(raw, cfg.storeSku, cfg.headerRows),
      stock: findColumn(raw, cfg.stock, cfg.headerRows),
      inTransit: cfg.inTransit ? findColumn(raw, cfg.inTransit, cfg.headerRows) : null
    };

    Object.keys(OPTIONAL_METRICS).forEach(function(key) {
      columns[key] = findColumn(raw, OPTIONAL_METRICS[key], cfg.headerRows);
    });

    Object.keys(columns).forEach(function(key) {
      if (columns[key]) {
        report.columns[key] = {
          column: columns[key].index + 1,
          row: columns[key].row + 1,
          title: columns[key].title
        };
      }
    });

    ['category', 'color', 'stock'].forEach(function(key) {
      if (!columns[key]) {
        report.missingColumns.push(key);
      }
    });

    if (report.missingColumns.length) {
      return { records: [], report: report };
    }

    var records = [];
    var lastCategory = '';

    for (var rowIndex = cfg.dataStartRow; rowIndex < raw.length; rowIndex++) {
      var row = raw[rowIndex] || [];
      var rawCategory = normalizeText(getCell(row, columns.category.index));
      if (rawCategory && rawCategory.charAt(0) !== '/') {
        lastCategory = rawCategory;
      }
      if (!lastCategory || lastCategory.indexOf('总计') >= 0 || lastCategory.indexOf('合计') >= 0) {
        report.skippedRows++;
        continue;
      }

      var color = normalizeText(getCell(row, columns.color.index));
      var storeSku = columns.storeSku ? normalizeText(getCell(row, columns.storeSku.index)) : '';
      if (!color && (!storeSku || storeSku === '/')) {
        report.skippedRows++;
        continue;
      }

      records.push(buildRecord(row, cfg, columns, lastCategory, sheetName));
    }

    report.records = records.length;
    return { records: records, report: report };
  }

  function summarizeReports(reports) {
    return reports.map(function(report) {
      if (!report.sheetName) {
        return report.sheetPattern + ': 未找到工作表';
      }
      if (report.missingColumns.length) {
        return report.sheetName + ': 缺少 ' + report.missingColumns.join(', ');
      }
      return report.sheetName + ': ' + report.records + ' 条';
    }).join('；');
  }

  function parseExcelWorkbook(workbook, options) {
    var selectedRegions = options && options.regions;
    var records = [];
    var reports = [];

    SHEET_CONFIGS.forEach(function(cfg) {
      if (selectedRegions && selectedRegions.indexOf(cfg.region) < 0) {
        return;
      }
      var parsed = parseSheet(workbook, cfg);
      records = records.concat(parsed.records);
      reports.push(parsed.report);
    });

    return {
      records: records,
      report: {
        generatedAt: new Date().toISOString(),
        summary: summarizeReports(reports),
        sheets: reports
      }
    };
  }

  global.SunluExcelParser = {
    parseExcelWorkbook: parseExcelWorkbook,
    sheetConfigs: SHEET_CONFIGS
  };
})(window);
