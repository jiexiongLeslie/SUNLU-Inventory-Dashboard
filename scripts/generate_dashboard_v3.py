#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 SUNLU 库存看板 HTML v3 - 添加美国站
"""

import json

# 读取数据
with open(r'C:\Users\Administrator\Documents\trae\inventory_data_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

data_js = json.dumps(data, ensure_ascii=False, indent=2)

# 统计
uk_data = [d for d in data if d['region'] == '英国']
eu_data = [d for d in data if d['region'] == '欧洲']
us_data = [d for d in data if d['region'] == '美国']
uk_stock = sum(d['stock'] for d in uk_data)
eu_stock = sum(d['stock'] for d in eu_data)
us_stock = sum(d['stock'] for d in us_data)
uk_skus = len(set(d['store_sku'] for d in uk_data if d['store_sku'] and d['stock'] > 0))
eu_skus = len(set(d['store_sku'] for d in eu_data if d['store_sku'] and d['stock'] > 0))
us_skus = len(set(d['store_sku'] for d in us_data if d['store_sku'] and d['stock'] > 0))

print(f"英国: {len(uk_data)}条, 库存{uk_stock:,}, SKU{uk_skus}")
print(f"欧洲: {len(eu_data)}条, 库存{eu_stock:,}, SKU{eu_skus}")
print(f"美国: {len(us_data)}条, 库存{us_stock:,}, SKU{us_skus}")
print(f"合计: {len(data)}条, 库存{uk_stock + eu_stock + us_stock:,}")

# 生成HTML
html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SUNLU 英美欧库存数据看板</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --primary: #1a365d; --primary-light: #2b6cb0; --accent: #3182ce;
  --bg: #f0f4f8; --card: #fff; --text: #1a202c; --text2: #718096;
  --border: #e2e8f0; --uk: #2b6cb0; --eu: #2f855a; --us: #c53030;
}
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.container { max-width: 1440px; margin: 0 auto; padding: 24px; }
.header { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%); color: #fff; padding: 28px 36px; border-radius: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.header h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
.header .meta { font-size: 13px; opacity: 0.8; margin-top: 4px; }
.upload-section { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.upload-info { flex: 1; min-width: 200px; }
.upload-info h3 { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.upload-info p { font-size: 12px; color: var(--text2); }
.upload-area { display: flex; align-items: center; gap: 12px; }
.upload-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.upload-btn:hover { background: var(--primary-light); }
.file-name { font-size: 12px; color: var(--text2); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.upload-status { font-size: 12px; padding: 4px 12px; border-radius: 16px; font-weight: 600; display: none; }
.upload-status.success { background: #f0fff4; color: #276749; display: inline-block; }
.upload-status.error { background: #fff5f5; color: #9b2c2c; display: inline-block; }
.upload-status.loading { background: #ebf8ff; color: #2b6cb0; display: inline-block; }
.upload-hint { font-size: 11px; color: var(--text2); background: #f7fafc; padding: 6px 12px; border-radius: 6px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
.kpi-card { background: var(--card); border-radius: 12px; padding: 20px 22px; border: 1px solid var(--border); position: relative; overflow: hidden; }
.kpi-card .kpi-label { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; }
.kpi-card .kpi-value { font-size: 28px; font-weight: 800; letter-spacing: -1px; }
.kpi-card .kpi-unit { font-size: 13px; font-weight: 400; color: var(--text2); margin-left: 3px; }
.kpi-card.uk .kpi-value { color: var(--uk); }
.kpi-card.eu .kpi-value { color: var(--eu); }
.kpi-card.us .kpi-value { color: var(--us); }
.kpi-card.total .kpi-value { color: var(--primary); }
.controls { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
.search-box { flex: 1; min-width: 200px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; outline: none; }
select.filter-select { padding: 9px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; outline: none; background: #fff; min-width: 130px; }
.tabs { display: flex; gap: 0; margin-bottom: 0; border-bottom: 2px solid var(--border); }
.tab { padding: 12px 24px; font-size: 14px; font-weight: 600; border: none; background: transparent; cursor: pointer; color: var(--text2); border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.table-wrapper { background: var(--card); border-radius: 0 12px 12px 12px; border: 1px solid var(--border); border-top: none; overflow: hidden; }
.table-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border); }
.table-header h2 { font-size: 15px; font-weight: 700; }
.table-header .count { font-size: 12px; color: var(--text2); background: #edf2f7; padding: 3px 10px; border-radius: 16px; }
table { width: 100%; border-collapse: collapse; }
thead { background: #f7fafc; }
th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border); cursor: pointer; white-space: nowrap; }
td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f0f4f8; }
tr:hover { background: #f7fafc; }
.region-badge { display: inline-block; padding: 2px 9px; border-radius: 16px; font-size: 11px; font-weight: 600; }
.region-badge.uk { background: #ebf4ff; color: var(--uk); }
.region-badge.eu { background: #f0fff4; color: var(--eu); }
.region-badge.us { background: #fed7d7; color: var(--us); }
.stock-bar { display: flex; align-items: center; gap: 8px; }
.stock-bar .bar { height: 5px; border-radius: 3px; min-width: 2px; }
.stock-bar .bar.uk { background: var(--uk); }
.stock-bar .bar.eu { background: var(--eu); }
.stock-bar .bar.us { background: var(--us); }
.stock-value { font-weight: 600; min-width: 55px; text-align: right; }
.sku-tag { font-size: 11px; color: var(--text2); background: #f7fafc; padding: 2px 6px; border-radius: 4px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 6px; padding: 14px; }
.page-btn { padding: 7px 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; font-size: 12px; }
.page-btn:hover { background: #edf2f7; }
.page-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.summary-section { margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.summary-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); overflow: hidden; }
.summary-card .card-title { padding: 14px 20px; font-size: 14px; font-weight: 700; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.summary-card .card-title .dot { width: 8px; height: 8px; border-radius: 50%; }
.summary-card .card-title .dot.uk { background: var(--uk); }
.summary-card .card-title .dot.eu { background: var(--eu); }
.summary-card .card-title .dot.us { background: var(--us); }
.summary-list { max-height: 400px; overflow-y: auto; }
.summary-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px; border-bottom: 1px solid #f7fafc; font-size: 13px; }
.summary-item:hover { background: #f7fafc; }
.summary-item .rank { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-right: 8px; flex-shrink: 0; }
.summary-item .rank.top1 { background: #fef3c7; color: #d97706; }
.summary-item .rank.top2 { background: #e2e8f0; color: #4a5568; }
.summary-item .rank.top3 { background: #fed7aa; color: #c05621; }
.summary-item .rank.normal { background: #f7fafc; color: var(--text2); }
.summary-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-item .val { font-weight: 700; min-width: 60px; text-align: right; }
.summary-item .bar-mini { width: 60px; height: 4px; background: #edf2f7; border-radius: 2px; margin-left: 8px; overflow: hidden; flex-shrink: 0; }
.summary-item .bar-mini .fill { height: 100%; border-radius: 2px; }
.summary-item .bar-mini .fill.uk { background: var(--uk); }
.summary-item .bar-mini .fill.eu { background: var(--eu); }
.summary-item .bar-mini .fill.us { background: var(--us); }
.toast { position: fixed; top: 24px; right: 24px; padding: 14px 22px; border-radius: 10px; font-size: 13px; font-weight: 600; z-index: 9999; transform: translateX(120%); transition: transform 0.3s ease; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.toast.show { transform: translateX(0); }
.toast.success { background: #f0fff4; color: #276749; border: 1px solid #c6f6d5; }
.toast.error { background: #fff5f5; color: #9b2c2c; border: 1px solid #fed7d7; }
@media (max-width: 768px) {
  .container { padding: 12px; }
  .header { padding: 20px; flex-direction: column; align-items: flex-start; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .summary-section { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>SUNLU 英美欧库存数据看板</h1>
      <div class="meta" id="metaInfo">数据更新：库存更新5.6 | 统计范围：英国站 + 欧洲站 + 美国站 | 按店铺SKU汇总</div>
    </div>
    <div style="font-size:13px;opacity:.9" id="updateTime"></div>
  </div>

  <div class="upload-section">
    <div class="upload-info">
      <h3>上传新库存数据</h3>
      <p>上传最新的 SUNLU 库存销量 Excel 文件，看板将自动解析并刷新所有数据</p>
    </div>
    <div class="upload-area">
      <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none">
      <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        选择 Excel 文件
      </button>
      <span class="file-name" id="fileName">未选择文件</span>
      <span class="upload-status" id="uploadStatus"></span>
    </div>
    <div class="upload-hint">
      需包含工作表：<code>英国站</code>、<code>全球-欧洲</code>、<code>全球-美国</code>。列结构与现有模板一致即可自动识别。
    </div>
  </div>

  <div class="kpi-grid" id="kpiGrid"></div>

  <div class="tabs">
    <button class="tab active" data-tab="detail" onclick="switchTab('detail')">库存明细（按颜色）</button>
    <button class="tab" data-tab="summary" onclick="switchTab('summary')">产品汇总（按产品）</button>
  </div>

  <div id="detailView">
    <div class="controls">
      <input type="text" class="search-box" id="searchInput" placeholder="搜索产品名称或颜色...">
      <select class="filter-select" id="regionFilter">
        <option value="all">全部地区</option>
        <option value="英国">英国</option>
        <option value="欧洲">欧洲</option>
        <option value="美国">美国</option>
      </select>
      <select class="filter-select" id="categoryFilter"><option value="all">全部产品</option></select>
      <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" id="stockOnly"> 仅显示有库存</label>
    </div>
    <div class="table-wrapper">
      <div class="table-header">
        <h2>颜色级库存明细</h2>
        <span class="count" id="tableCount">0 条记录</span>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th data-sort="region">地区 <span style="opacity:.3;font-size:10px">▲▼</span></th>
              <th data-sort="category">产品名称 <span style="opacity:.3;font-size:10px">▲▼</span></th>
              <th data-sort="color">颜色 <span style="opacity:.3;font-size:10px">▲▼</span></th>
              <th data-sort="stock">总库存 <span style="opacity:.3;font-size:10px">▲▼</span></th>
              <th>店铺SKU</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>
  </div>

  <div id="summaryView" style="display:none">
    <div class="controls">
      <select class="filter-select" id="summaryRegionFilter" onchange="renderSummaryTable()">
        <option value="all">全部地区</option>
        <option value="英国">英国</option>
        <option value="欧洲">欧洲</option>
        <option value="美国">美国</option>
      </select>
      <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" id="summaryStockOnly" onchange="renderSummaryTable()"> 仅显示有库存</label>
    </div>
    <div class="table-wrapper">
      <div class="table-header">
        <h2>产品级库存汇总（各颜色合计）</h2>
        <span class="count" id="summaryCount">0 个产品</span>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr><th>排名</th><th>产品名称</th><th>颜色数</th><th>总库存</th><th>占比</th><th>库存分布</th></tr>
          </thead>
          <tbody id="summaryBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="summary-section">
    <div class="summary-card">
      <div class="card-title"><span class="dot uk"></span>英国站 TOP 15</div>
      <div class="summary-list" id="ukSummary"></div>
    </div>
    <div class="summary-card">
      <div class="card-title"><span class="dot eu"></span>欧洲站 TOP 15</div>
      <div class="summary-list" id="euSummary"></div>
    </div>
    <div class="summary-card">
      <div class="card-title"><span class="dot us"></span>美国站 TOP 15</div>
      <div class="summary-list" id="usSummary"></div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let DATA = [], ukTotal = 0, euTotal = 0, usTotal = 0, grandTotal = 0, maxStock = 1, ukSku = 0, euSku = 0, usSku = 0;
let filteredData = [], sortKey = 'stock', sortDir = -1, currentPage = 1;
const PAGE_SIZE = 30;

const DEFAULT_DATA = ''' + data_js + ''';

function parseExcelFile(workbook) {
  var results = [];
  var configs = [
    { pattern: '英国站', region: '英国', stockKeyword: '总库存', stockExclude: '欧洲' },
    { pattern: '全球-欧洲', region: '欧洲', stockKeyword: '总库存', stockInclude: '欧洲所有通用' },
    { pattern: '全球-美国', region: '美国', stockKeyword: '独立站 库存' }
  ];
  
  for (var ci = 0; ci < configs.length; ci++) {
    var cfg = configs[ci];
    var sheetName = null;
    for (var si = 0; si < workbook.SheetNames.length; si++) {
      if (workbook.SheetNames[si].indexOf(cfg.pattern) >= 0) { sheetName = workbook.SheetNames[si]; break; }
    }
    if (!sheetName) continue;
    
    var ws = workbook.Sheets[sheetName];
    var raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    
    var row0 = raw[0];
    var stockCol = -1;
    if (row0) {
      for (var j = 0; j < row0.length; j++) {
        var h = row0[j];
        if (h === null || h === undefined) continue;
        var hStr = String(h).replace(/\n/g, ' ').trim();
        if (hStr.indexOf(cfg.stockKeyword) >= 0) {
          if (cfg.stockExclude && hStr.indexOf(cfg.stockExclude) >= 0) continue;
          if (cfg.stockInclude && hStr.indexOf(cfg.stockInclude) < 0) continue;
          if (stockCol === -1) stockCol = j;
        }
      }
    }
    
    var headerRow = -1;
    for (var i = 0; i < Math.min(20, raw.length); i++) {
      if (raw[i] && raw[i][0] && String(raw[i][0]).indexOf('品类') >= 0) { headerRow = i; break; }
    }
    if (headerRow === -1 || stockCol === -1) continue;
    
    var header = raw[headerRow];
    var catCol = 0, colorCol = -1, storeSkuCol = -1;
    for (var j = 0; j < header.length; j++) {
      var h = header[j];
      if (h === null || h === undefined) continue;
      var hStr = String(h).replace(/\n/g, ' ').trim();
      if (hStr === '颜色' && colorCol === -1) colorCol = j;
      if (hStr.indexOf('店铺SKU') >= 0 && storeSkuCol === -1) storeSkuCol = j;
    }
    if (colorCol === -1) continue;
    
    var lastCategory = '';
    for (var i = headerRow + 1; i < raw.length; i++) {
      var row = raw[i];
      if (!row) continue;
      var rawCat = row[catCol];
      if (rawCat != null && String(rawCat).trim() !== '') lastCategory = String(rawCat).replace(/\n/g, ' ').trim();
      if (!lastCategory || lastCategory.indexOf('总计') >= 0 || lastCategory.indexOf('合计') >= 0) continue;
      var color = row[colorCol] ? String(row[colorCol]).replace(/\n/g, ' ').trim() : '';
      var storeSku = (storeSkuCol >= 0 && storeSkuCol < row.length && row[storeSkuCol]) ? String(row[storeSkuCol]).trim() : '';
      var stock = (stockCol < row.length && row[stockCol] !== null && typeof row[stockCol] === 'number') ? row[stockCol] : 0;
      results.push({ category: lastCategory, color: color, store_sku: storeSku, stock: stock, region: cfg.region });
    }
  }
  return results;
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || 'success') + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 3500);
}

document.getElementById('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var statusEl = document.getElementById('uploadStatus');
  document.getElementById('fileName').textContent = file.name;
  statusEl.className = 'upload-status loading';
  statusEl.textContent = '解析中...';
  
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = new Uint8Array(ev.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var parsed = parseExcelFile(workbook);
      if (parsed.length === 0) {
        statusEl.className = 'upload-status error';
        statusEl.textContent = '解析失败';
        showToast('未找到有效数据', 'error');
        return;
      }
      DATA = parsed;
      refreshAll();
      var timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      document.getElementById('metaInfo').textContent = '数据更新：' + file.name + ' | 更新于 ' + timeStr;
      document.getElementById('updateTime').textContent = new Date().toLocaleDateString('zh-CN');
      statusEl.className = 'upload-status success';
      statusEl.textContent = '解析成功';
      showToast('成功解析 ' + parsed.length + ' 条记录');
    } catch (err) {
      statusEl.className = 'upload-status error';
      statusEl.textContent = '解析失败';
      showToast('文件解析出错：' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

function refreshAll() {
  ukTotal = DATA.filter(d => d.region === '英国').reduce((s, d) => s + d.stock, 0);
  euTotal = DATA.filter(d => d.region === '欧洲').reduce((s, d) => s + d.stock, 0);
  usTotal = DATA.filter(d => d.region === '美国').reduce((s, d) => s + d.stock, 0);
  grandTotal = ukTotal + euTotal + usTotal;
  maxStock = Math.max.apply(null, DATA.map(d => d.stock).concat([1]));
  ukSku = new Set(DATA.filter(d => d.region === '英国' && d.stock > 0).map(d => d.store_sku).filter(s => s)).size;
  euSku = new Set(DATA.filter(d => d.region === '欧洲' && d.stock > 0).map(d => d.store_sku).filter(s => s)).size;
  usSku = new Set(DATA.filter(d => d.region === '美国' && d.stock > 0).map(d => d.store_sku).filter(s => s)).size;
  
  document.getElementById('searchInput').value = '';
  document.getElementById('regionFilter').value = 'all';
  document.getElementById('stockOnly').checked = false;
  document.getElementById('summaryRegionFilter').value = 'all';
  document.getElementById('summaryStockOnly').checked = false;
  
  var catSel = document.getElementById('categoryFilter');
  catSel.innerHTML = '<option value="all">全部产品</option>';
  var cats = [...new Set(DATA.map(d => d.category))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  cats.forEach(c => { var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  
  sortKey = 'stock'; sortDir = -1; currentPage = 1;
  renderKPI();
  applyFilters();
  renderSummaryTable();
  renderTopProducts();
}

function renderKPI() {
  document.getElementById('kpiGrid').innerHTML = 
    '<div class="kpi-card uk"><div class="kpi-label">英国总库存</div><div class="kpi-value">' + ukTotal.toLocaleString() + '<span class="kpi-unit">件</span></div></div>' +
    '<div class="kpi-card eu"><div class="kpi-label">欧洲总库存</div><div class="kpi-value">' + euTotal.toLocaleString() + '<span class="kpi-unit">件</span></div></div>' +
    '<div class="kpi-card us"><div class="kpi-label">美国总库存</div><div class="kpi-value">' + usTotal.toLocaleString() + '<span class="kpi-unit">件</span></div></div>' +
    '<div class="kpi-card total"><div class="kpi-label">英美欧合计</div><div class="kpi-value">' + grandTotal.toLocaleString() + '<span class="kpi-unit">件</span></div></div>' +
    '<div class="kpi-card uk"><div class="kpi-label">英国店铺SKU</div><div class="kpi-value">' + ukSku + '<span class="kpi-unit">个</span></div></div>' +
    '<div class="kpi-card eu"><div class="kpi-label">欧洲店铺SKU</div><div class="kpi-value">' + euSku + '<span class="kpi-unit">个</span></div></div>' +
    '<div class="kpi-card us"><div class="kpi-label">美国店铺SKU</div><div class="kpi-value">' + usSku + '<span class="kpi-unit">个</span></div></div>' +
    '<div class="kpi-card total"><div class="kpi-label">总记录数</div><div class="kpi-value">' + DATA.length + '<span class="kpi-unit">条</span></div></div>';
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('detailView').style.display = tab === 'detail' ? '' : 'none';
  document.getElementById('summaryView').style.display = tab === 'summary' ? '' : 'none';
}

function applyFilters() {
  var q = document.getElementById('searchInput').value.toLowerCase().trim();
  var region = document.getElementById('regionFilter').value;
  var cat = document.getElementById('categoryFilter').value;
  var stockOnly = document.getElementById('stockOnly').checked;
  filteredData = DATA.filter(d => {
    if (region !== 'all' && d.region !== region) return false;
    if (cat !== 'all' && d.category !== cat) return false;
    if (stockOnly && d.stock === 0) return false;
    if (q) { var text = (d.category + ' ' + d.color + ' ' + d.region + ' ' + d.store_sku).toLowerCase(); if (!text.includes(q)) return false; }
    return true;
  });
  filteredData.sort((a, b) => {
    var va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') return sortDir * va.localeCompare(vb, 'zh-CN');
    return sortDir * (va - vb);
  });
  currentPage = 1;
  renderTable();
}

function renderTable() {
  var tbody = document.getElementById('tableBody');
  var total = filteredData.length;
  var totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageData = filteredData.slice(start, start + PAGE_SIZE);
  document.getElementById('tableCount').textContent = total + ' 条记录';
  if (!pageData.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text2)">暂无匹配数据</td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }
  tbody.innerHTML = pageData.map(d => {
    var cls = d.region === '英国' ? 'uk' : d.region === '欧洲' ? 'eu' : 'us';
    var pct = Math.round(d.stock / maxStock * 100);
    var skuDisplay = d.store_sku ? '<span class="sku-tag" title="' + d.store_sku + '">' + d.store_sku + '</span>' : '-';
    return '<tr><td><span class="region-badge ' + cls + '">' + d.region + '</span></td><td style="font-weight:600">' + d.category + '</td><td>' + (d.color || '-') + '</td><td><div class="stock-bar"><span class="stock-value">' + d.stock.toLocaleString() + '</span><div class="bar ' + cls + '" style="width:' + pct + '%"></div></div></td><td>' + skuDisplay + '</td><td style="color:var(--text2);font-size:12px">' + (d.stock > 0 ? (d.stock / grandTotal * 100).toFixed(2) + '%' : '-') + '</td></tr>';
  }).join('');
  var ph = '<button class="page-btn" onclick="goPage(' + (currentPage - 1) + ')" ' + (currentPage <= 1 ? 'disabled' : '') + '>上一页</button>';
  var range = getPageRange(currentPage, totalPages);
  range.forEach(p => { if (p === '...') ph += '<span style="font-size:12px;color:var(--text2)">...</span>'; else ph += '<button class="page-btn ' + (p === currentPage ? 'active' : '') + '" onclick="goPage(' + p + ')">' + p + '</button>'; });
  ph += '<button class="page-btn" onclick="goPage(' + (currentPage + 1) + ')" ' + (currentPage >= totalPages ? 'disabled' : '') + '>下一页</button>';
  ph += '<span style="font-size:12px;color:var(--text2);margin-left:8px">' + (start + 1) + '-' + Math.min(start + PAGE_SIZE, total) + ' / ' + total + '</span>';
  document.getElementById('pagination').innerHTML = ph;
}

function getPageRange(c, t) {
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
  if (c <= 4) { var r = []; for (var i = 1; i <= 5; i++) r.push(i); r.push('...', t); return r; }
  if (c >= t - 3) { var r = [1, '...']; for (var i = t - 4; i <= t; i++) r.push(i); return r; }
  return [1, '...', c - 1, c, c + 1, '...', t];
}

function goPage(p) {
  var tp = Math.ceil(filteredData.length / PAGE_SIZE) || 1;
  if (p < 1 || p > tp) return;
  currentPage = p;
  renderTable();
  document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSummaryTable() {
  var region = document.getElementById('summaryRegionFilter').value;
  var stockOnly = document.getElementById('summaryStockOnly').checked;
  var src = DATA.filter(d => region === 'all' || d.region === region);
  var m = {}, colorCount = {};
  src.forEach(d => {
    if (stockOnly && d.stock === 0) return;
    m[d.category] = (m[d.category] || 0) + d.stock;
    if (!colorCount[d.category]) colorCount[d.category] = new Set();
    if (d.stock > 0) colorCount[d.category].add(d.color);
  });
  var items = Object.entries(m).sort((a, b) => b[1] - a[1]);
  var refTotal = region === 'all' ? grandTotal : (region === '英国' ? ukTotal : region === '欧洲' ? euTotal : usTotal);
  var maxVal = items.length ? items[0][1] : 1;
  document.getElementById('summaryCount').textContent = items.length + ' 个产品';
  document.getElementById('summaryBody').innerHTML = items.map(([name, val], i) => {
    var pct = (val / refTotal * 100).toFixed(2);
    var barW = Math.round(val / maxVal * 100);
    var colors = colorCount[name] ? colorCount[name].size : 0;
    var rankCls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : 'normal';
    var barColor = region === 'all' ? 'var(--primary)' : region === '英国' ? 'var(--uk)' : region === '欧洲' ? 'var(--eu)' : 'var(--us)';
    return '<tr><td><span class="rank ' + rankCls + '">' + (i + 1) + '</span></td><td style="font-weight:600">' + name + '</td><td style="color:var(--text2)">' + colors + ' 色</td><td style="font-weight:700">' + val.toLocaleString() + '</td><td style="color:var(--text2);font-size:12px">' + pct + '%</td><td><div style="width:100%;height:6px;background:#edf2f7;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + barW + '%;background:' + barColor + ';border-radius:3px"></div></div></td></tr>';
  }).join('');
}

function renderTopProducts() {
  ['uk', 'eu', 'us'].forEach(r => {
    var byProduct = {};
    DATA.filter(d => d.region === (r === 'uk' ? '英国' : r === 'eu' ? '欧洲' : '美国')).forEach(d => { byProduct[d.category] = (byProduct[d.category] || 0) + d.stock; });
    var sorted = Object.entries(byProduct).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 15);
    var maxVal = sorted.length ? sorted[0][1] : 1;
    document.getElementById(r + 'Summary').innerHTML = sorted.map(([name, val], i) => {
      var rc = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : 'normal';
      return '<div class="summary-item"><span class="rank ' + rc + '">' + (i + 1) + '</span><span class="name">' + name + '</span><span class="val">' + val.toLocaleString() + '</span><div class="bar-mini"><div class="fill ' + r + '" style="width:' + (val / maxVal * 100) + '%"></div></div></div>';
    }).join('');
  });
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('regionFilter').addEventListener('change', applyFilters);
  document.getElementById('categoryFilter').addEventListener('change', applyFilters);
  document.getElementById('stockOnly').addEventListener('change', applyFilters);
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      var key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'stock' ? -1 : 1; }
      document.querySelectorAll('th').forEach(t => t.classList.remove('sorted'));
      th.classList.add('sorted');
      applyFilters();
    });
  });
}

function init() {
  DATA = DEFAULT_DATA;
  document.getElementById('updateTime').textContent = new Date().toLocaleDateString('zh-CN');
  refreshAll();
  bindEvents();
}

init();
</script>
</body>
</html>'''

# 保存
output_file = r'C:\Users\Administrator\Documents\trae\index.html'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"\n看板已生成: {output_file}")
print(f"文件大小: {len(html):,} 字符")
