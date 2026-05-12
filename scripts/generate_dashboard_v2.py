#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 SUNLU 库存看板 HTML v2
- 使用最新库存数据
- 修复合并单元格数据丢失
- 按店铺SKU统计
"""

import json

# 读取数据
with open(r'C:\Users\Administrator\Documents\trae\inventory_data_v2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 转换为JS格式
data_js = json.dumps(data, ensure_ascii=False, indent=2)

# 统计
uk_data = [d for d in data if d['region'] == '英国']
eu_data = [d for d in data if d['region'] == '欧洲']
uk_stock = sum(d['stock'] for d in uk_data)
eu_stock = sum(d['stock'] for d in eu_data)
uk_skus = len(set(d['store_sku'] for d in uk_data if d['store_sku'] and d['stock'] > 0))
eu_skus = len(set(d['store_sku'] for d in eu_data if d['store_sku'] and d['stock'] > 0))

print(f"英国: {len(uk_data)}条记录, 库存{uk_stock}, SKU{uk_skus}")
print(f"欧洲: {len(eu_data)}条记录, 库存{eu_stock}, SKU{eu_skus}")
print(f"合计: {len(data)}条记录, 库存{uk_stock + eu_stock}")

# HTML模板
html_template = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SUNLU 英欧库存数据看板</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{
  --primary:#1a365d;--primary-light:#2b6cb0;--accent:#3182ce;
  --bg:#f0f4f8;--card:#fff;--text:#1a202c;--text2:#718096;
  --border:#e2e8f0;--uk:#2b6cb0;--eu:#2f855a;
}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}}
.container{{max-width:1440px;margin:0 auto;padding:24px}}

.header{{background:linear-gradient(135deg,var(--primary) 0%,var(--primary-light) 100%);color:#fff;padding:28px 36px;border-radius:16px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}}
.header h1{{font-size:26px;font-weight:700;letter-spacing:-0.5px}}
.header .meta{{font-size:13px;opacity:.8;margin-top:4px}}

/* Upload Section */
.upload-section{{background:var(--card);border-radius:12px;border:1px solid var(--border);padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}}
.upload-section .upload-info{{flex:1;min-width:200px}}
.upload-section .upload-info h3{{font-size:14px;font-weight:700;margin-bottom:4px}}
.upload-section .upload-info p{{font-size:12px;color:var(--text2)}}
.upload-area{{display:flex;align-items:center;gap:12px}}
.upload-btn{{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}}
.upload-btn:hover{{background:var(--primary-light);transform:translateY(-1px)}}
.upload-btn svg{{width:16px;height:16px}}
.upload-btn:disabled{{opacity:.5;cursor:not-allowed;transform:none}}
.file-name{{font-size:12px;color:var(--text2);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.upload-status{{font-size:12px;padding:4px 12px;border-radius:16px;font-weight:600}}
.upload-status.success{{background:#f0fff4;color:#276749}}
.upload-status.error{{background:#fff5f5;color:#9b2c2c}}
.upload-status.loading{{background:#ebf8ff;color:#2b6cb0}}
.upload-hint{{font-size:11px;color:var(--text2);background:#f7fafc;padding:6px 12px;border-radius:6px;line-height:1.5}}
.upload-hint code{{background:#edf2f7;padding:1px 5px;border-radius:3px;font-size:11px}}

.kpi-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:24px}}
.kpi-card{{background:var(--card);border-radius:12px;padding:20px 22px;border:1px solid var(--border);position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s}}
.kpi-card:hover{{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}}
.kpi-card .kpi-label{{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:4px}}
.kpi-card .kpi-value{{font-size:30px;font-weight:800;letter-spacing:-1px}}
.kpi-card .kpi-unit{{font-size:13px;font-weight:400;color:var(--text2);margin-left:3px}}
.kpi-card.uk .kpi-value{{color:var(--uk)}}
.kpi-card.eu .kpi-value{{color:var(--eu)}}
.kpi-card.total .kpi-value{{color:var(--primary)}}
.kpi-card::after{{content:'';position:absolute;top:0;right:0;width:70px;height:70px;border-radius:0 0 0 70px;opacity:.07}}
.kpi-card.uk::after{{background:var(--uk)}}
.kpi-card.eu::after{{background:var(--eu)}}
.kpi-card.total::after{{background:var(--primary)}}

.controls{{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center}}
.search-box{{flex:1;min-width:200px;padding:9px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;outline:none;transition:border-color .2s}}
.search-box:focus{{border-color:var(--accent)}}
select.filter-select{{padding:9px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;outline:none;background:#fff;cursor:pointer;min-width:130px}}
select.filter-select:focus{{border-color:var(--accent)}}
.stock-filter{{display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer}}
.stock-filter input{{accent-color:var(--accent);width:15px;height:15px;cursor:pointer}}

.tabs{{display:flex;gap:0;margin-bottom:0;border-bottom:2px solid var(--border)}}
.tab{{padding:12px 24px;font-size:14px;font-weight:600;border:none;background:transparent;cursor:pointer;color:var(--text2);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .2s}}
.tab.active{{color:var(--primary);border-bottom-color:var(--primary)}}
.tab:hover:not(.active){{color:var(--text);background:#f7fafc}}

.table-wrapper{{background:var(--card);border-radius:0 12px 12px 12px;border:1px solid var(--border);border-top:none;overflow:hidden}}
.table-header{{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border)}}
.table-header h2{{font-size:15px;font-weight:700}}
.table-header .count{{font-size:12px;color:var(--text2);background:#edf2f7;padding:3px 10px;border-radius:16px}}
table{{width:100%;border-collapse:collapse}}
thead{{background:#f7fafc}}
th{{padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);cursor:pointer;user-select:none;white-space:nowrap}}
th:hover{{color:var(--accent)}}
th .sort-icon{{margin-left:3px;opacity:.3;font-size:10px}}
th.sorted .sort-icon{{opacity:1;color:var(--accent)}}
td{{padding:10px 14px;font-size:13px;border-bottom:1px solid #f0f4f8}}
tr:last-child td{{border-bottom:none}}
tr:hover{{background:#f7fafc}}
.region-badge{{display:inline-block;padding:2px 9px;border-radius:16px;font-size:11px;font-weight:600}}
.region-badge.uk{{background:#ebf4ff;color:var(--uk)}}
.region-badge.eu{{background:#f0fff4;color:var(--eu)}}
.stock-bar{{display:flex;align-items:center;gap:8px}}
.stock-bar .bar{{height:5px;border-radius:3px;min-width:2px;transition:width .3s}}
.stock-bar .bar.uk{{background:var(--uk)}}
.stock-bar .bar.eu{{background:var(--eu)}}
.stock-value{{font-weight:600;min-width:55px;text-align:right}}
.stock-value.zero{{color:#cbd5e0;font-weight:400}}
.sku-tag{{font-size:11px;color:var(--text2);background:#f7fafc;padding:2px 6px;border-radius:4px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}}

.pagination{{display:flex;justify-content:center;align-items:center;gap:6px;padding:14px}}
.page-btn{{padding:7px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-size:12px;transition:all .2s}}
.page-btn:hover{{background:#edf2f7}}
.page-btn.active{{background:var(--primary);color:#fff;border-color:var(--primary)}}
.page-btn:disabled{{opacity:.4;cursor:not-allowed}}
.page-info{{font-size:12px;color:var(--text2)}}

.summary-section{{margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:18px}}
.summary-card{{background:var(--card);border-radius:12px;border:1px solid var(--border);overflow:hidden}}
.summary-card .card-title{{padding:14px 20px;font-size:14px;font-weight:700;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}}
.summary-card .card-title .dot{{width:8px;height:8px;border-radius:50%}}
.summary-card .card-title .dot.uk{{background:var(--uk)}}
.summary-card .card-title .dot.eu{{background:var(--eu)}}
.summary-list{{max-height:440px;overflow-y:auto}}
.summary-item{{display:flex;justify-content:space-between;align-items:center;padding:9px 20px;border-bottom:1px solid #f7fafc;font-size:13px;transition:background .15s}}
.summary-item:hover{{background:#f7fafc}}
.summary-item:last-child{{border-bottom:none}}
.summary-item .rank{{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-right:10px;flex-shrink:0}}
.summary-item .rank.top1{{background:#fef3c7;color:#d97706}}
.summary-item .rank.top2{{background:#e2e8f0;color:#4a5568}}
.summary-item .rank.top3{{background:#fed7aa;color:#c05621}}
.summary-item .rank.normal{{background:#f7fafc;color:var(--text2)}}
.summary-item .name{{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.summary-item .val{{font-weight:700;min-width:70px;text-align:right}}
.summary-item .bar-mini{{width:90px;height:4px;background:#edf2f7;border-radius:2px;margin-left:10px;overflow:hidden;flex-shrink:0}}
.summary-item .bar-mini .fill{{height:100%;border-radius:2px;transition:width .3s}}
.summary-item .bar-mini .fill.uk{{background:var(--uk)}}
.summary-item .bar-mini .fill.eu{{background:var(--eu)}}

/* Toast notification */
.toast{{position:fixed;top:24px;right:24px;padding:14px 22px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;transform:translateX(120%);transition:transform .3s ease;box-shadow:0 8px 24px rgba(0,0,0,.12)}}
.toast.show{{transform:translateX(0)}}
.toast.success{{background:#f0fff4;color:#276749;border:1px solid #c6f6d5}}
.toast.error{{background:#fff5f5;color:#9b2c2c;border:1px solid #fed7d7}}

::-webkit-scrollbar{{width:5px}}
::-webkit-scrollbar-track{{background:#f7fafc}}
::-webkit-scrollbar-thumb{{background:#cbd5e0;border-radius:3px}}

@media(max-width:768px){{
  .container{{padding:12px}}
  .header{{padding:20px;flex-direction:column;align-items:flex-start}}
  .header h1{{font-size:20px}}
  .upload-section{{flex-direction:column;align-items:flex-start}}
  .kpi-grid{{grid-template-columns:repeat(2,1fr)}}
  .summary-section{{grid-template-columns:1fr}}
  .controls{{flex-direction:column}}
  .search-box{{width:100%}}
  th,td{{padding:8px 10px;font-size:11px}}
}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>SUNLU 英欧库存数据看板</h1>
      <div class="meta" id="metaInfo">数据更新：库存更新5.6 &nbsp;|&nbsp; 统计范围：英国站 + 欧洲站 &nbsp;|&nbsp; 按店铺SKU汇总</div>
    </div>
    <div style="font-size:13px;opacity:.9" id="updateTime"></div>
  </div>

  <!-- Upload Section -->
  <div class="upload-section">
    <div class="upload-info">
      <h3>上传新库存数据</h3>
      <p>上传最新的 SUNLU 库存销量 Excel 文件，看板将自动解析并刷新所有数据</p>
    </div>
    <div class="upload-area">
      <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none">
      <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        选择 Excel 文件
      </button>
      <span class="file-name" id="fileName">未选择文件</span>
      <span class="upload-status" id="uploadStatus" style="display:none"></span>
    </div>
    <div class="upload-hint">
      需包含工作表：<code>英国站</code>、<code>全球-欧洲</code>。列结构与现有模板一致即可自动识别。
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
      </select>
      <select class="filter-select" id="categoryFilter">
        <option value="all">全部产品</option>
      </select>
      <label class="stock-filter"><input type="checkbox" id="stockOnly"> 仅显示有库存</label>
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
              <th data-sort="region">地区 <span class="sort-icon">▲▼</span></th>
              <th data-sort="category">产品名称 <span class="sort-icon">▲▼</span></th>
              <th data-sort="color">颜色 <span class="sort-icon">▲▼</span></th>
              <th data-sort="stock">总库存 <span class="sort-icon">▲▼</span></th>
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
      </select>
      <label class="stock-filter"><input type="checkbox" id="summaryStockOnly" onchange="renderSummaryTable()"> 仅显示有库存</label>
    </div>
    <div class="table-wrapper">
      <div class="table-header">
        <h2>产品级库存汇总（各颜色合计）</h2>
        <span class="count" id="summaryCount">0 个产品</span>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>产品名称</th>
              <th>颜色数</th>
              <th>总库存</th>
              <th>占比</th>
              <th>库存分布</th>
            </tr>
          </thead>
          <tbody id="summaryBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="summary-section">
    <div class="summary-card">
      <div class="card-title"><span class="dot uk"></span>英国站 TOP 20 产品（按总库存）</div>
      <div class="summary-list" id="ukSummary"></div>
    </div>
    <div class="summary-card">
      <div class="card-title"><span class="dot eu"></span>欧洲站 TOP 20 产品（按总库存）</div>
      <div class="summary-list" id="euSummary"></div>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
/* ============================
   Global State (mutable)
   ============================ */
let DATA = [];
let ukTotal = 0, euTotal = 0, grandTotal = 0, maxStock = 1, ukSku = 0, euSku = 0;
let filteredData = [];
let sortKey = 'stock', sortDir = -1, currentPage = 1;
const PAGE_SIZE = 30;

/* ============================
   Default Data (built-in) - 最新库存数据 2026-05-06
   ============================ */
const DEFAULT_DATA = {data_js};

/* ============================
   Excel Parsing - 适配新表格结构
   ============================ */
function parseExcelFile(workbook) {{
  const results = [];
  
  const configs = [
    {{ pattern: '英国站', region: '英国' }},
    {{ pattern: '全球-欧洲', region: '欧洲' }}
  ];
  
  for (const cfg of configs) {{
    const sheetName = workbook.SheetNames.find(n => n.includes(cfg.pattern));
    if (!sheetName) continue;
    
    const ws = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, {{ header: 1, defval: null }});
    
    // 找表头行（包含"品类"的行）
    let headerRow = -1;
    for (let i = 0; i < Math.min(20, raw.length); i++) {{
      const row = raw[i];
      if (row && row[0] && String(row[0]).includes('品类')) {{
        headerRow = i;
        break;
      }}
    }}
    if (headerRow === -1) continue;
    
    // 找关键列索引
    const header = raw[headerRow];
    let catCol = 0;
    let colorCol = header.findIndex(h => h && String(h).trim() === '颜色');
    let storeSkuCol = header.findIndex(h => h && String(h).includes('店铺SKU'));
    
    // 找日期列（从第9列开始，表头是数字或日期的列）
    const dateCols = [];
    for (let i = 9; i < header.length; i++) {{
      const h = header[i];
      if (h !== null && h !== undefined) {{
        if (typeof h === 'number' || (typeof h === 'string' && (/2025|2026/.test(h)))) {{
          dateCols.push(i);
        }}
      }}
    }}
    
    if (colorCol === -1) continue;
    
    // 提取数据
    let lastCategory = '';
    for (let i = headerRow + 1; i < raw.length; i++) {{
      const row = raw[i];
      if (!row) continue;
      
      // 品类（处理合并单元格 - 前向填充）
      const rawCat = row[catCol];
      if (rawCat != null && String(rawCat).trim() !== '') {{
        lastCategory = String(rawCat).replace(/\\n/g, ' ').trim();
      }}
      if (!lastCategory || lastCategory.includes('总计') || lastCategory.includes('合计')) continue;
      
      // 颜色
      const color = row[colorCol] ? String(row[colorCol]).replace(/\\n/g, ' ').trim() : '';
      if (!color) continue;
      
      // 店铺SKU
      let storeSku = '';
      if (storeSkuCol >= 0 && storeSkuCol < row.length) {{
        storeSku = row[storeSkuCol] ? String(row[storeSkuCol]).trim() : '';
      }}
      
      // 总库存（汇总所有日期列）
      let totalStock = 0;
      for (const colIdx of dateCols) {{
        if (colIdx < row.length) {{
          const val = row[colIdx];
          if (val !== null && typeof val === 'number') {{
            totalStock += val;
          }}
        }}
      }}
      
      results.push({{
        category: lastCategory,
        color: color,
        store_sku: storeSku,
        stock: totalStock,
        region: cfg.region
      }});
    }}
  }}
  
  return results;
}}

/* ============================
   Toast Notification
   ============================ */
function showToast(msg, type = 'success') {{
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}}

/* ============================
   Upload Handler
   ============================ */
document.getElementById('fileInput').addEventListener('change', function(e) {{
  const file = e.target.files[0];
  if (!file) return;
  
  const statusEl = document.getElementById('uploadStatus');
  const nameEl = document.getElementById('fileName');
  nameEl.textContent = file.name;
  statusEl.style.display = '';
  statusEl.className = 'upload-status loading';
  statusEl.textContent = '解析中...';
  
  const reader = new FileReader();
  reader.onload = function(ev) {{
    try {{
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, {{ type: 'array' }});
      
      const parsed = parseExcelFile(workbook);
      if (parsed.length === 0) {{
        statusEl.className = 'upload-status error';
        statusEl.textContent = '解析失败：未找到有效数据';
        showToast('未找到英国站或欧洲站的有效数据，请检查文件格式', 'error');
        return;
      }}
      
      DATA = parsed;
      refreshAll();
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString('zh-CN', {{ hour:'2-digit', minute:'2-digit' }});
      document.getElementById('metaInfo').textContent =
        `数据更新：${{file.name}} &nbsp;|&nbsp; 统计范围：英国站 + 欧洲站 &nbsp;|&nbsp; 按店铺SKU汇总 &nbsp;|&nbsp; 更新于 ${{timeStr}}`;
      document.getElementById('updateTime').textContent = now.toLocaleDateString('zh-CN');
      
      statusEl.className = 'upload-status success';
      statusEl.textContent = '解析成功';
      showToast(`成功解析 ${{parsed.length}} 条记录（英国 ${{parsed.filter(d=>d.region==='英国').length}} + 欧洲 ${{parsed.filter(d=>d.region==='欧洲').length}}）`);
    }} catch (err) {{
      statusEl.className = 'upload-status error';
      statusEl.textContent = '解析失败';
      showToast('文件解析出错：' + err.message, 'error');
      console.error(err);
    }}
  }};
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}});

/* ============================
   Refresh All Components
   ============================ */
function refreshAll() {{
  // 计算总库存
  ukTotal = DATA.filter(d => d.region === '英国').reduce((s, d) => s + d.stock, 0);
  euTotal = DATA.filter(d => d.region === '欧洲').reduce((s, d) => s + d.stock, 0);
  grandTotal = ukTotal + euTotal;
  maxStock = Math.max(...DATA.map(d => d.stock), 1);
  
  // 按店铺SKU统计（去重）
  const ukStoreSkus = new Set(DATA.filter(d => d.region === '英国' && d.stock > 0).map(d => d.store_sku).filter(s => s));
  const euStoreSkus = new Set(DATA.filter(d => d.region === '欧洲' && d.stock > 0).map(d => d.store_sku).filter(s => s));
  ukSku = ukStoreSkus.size;
  euSku = euStoreSkus.size;
  
  // 重置筛选
  document.getElementById('searchInput').value = '';
  document.getElementById('regionFilter').value = 'all';
  document.getElementById('stockOnly').checked = false;
  document.getElementById('summaryRegionFilter').value = 'all';
  document.getElementById('summaryStockOnly').checked = false;
  
  // 重建产品筛选
  const catSel = document.getElementById('categoryFilter');
  catSel.innerHTML = '<option value="all">全部产品</option>';
  populateCategoryFilter();
  
  // 重新渲染
  sortKey = 'stock'; sortDir = -1; currentPage = 1;
  renderKPI();
  applyFilters();
  renderSummaryTable();
  renderTopProducts();
}}

/* ============================
   Core Render Functions
   ============================ */
function init() {{
  DATA = DEFAULT_DATA;
  document.getElementById('updateTime').textContent = new Date().toLocaleDateString('zh-CN');
  refreshAll();
  bindEvents();
}}

function renderKPI() {{
  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card uk"><div class="kpi-label">英国总库存</div><div class="kpi-value">${{ukTotal.toLocaleString()}}<span class="kpi-unit">件</span></div></div>
    <div class="kpi-card eu"><div class="kpi-label">欧洲总库存</div><div class="kpi-value">${{euTotal.toLocaleString()}}<span class="kpi-unit">件</span></div></div>
    <div class="kpi-card total"><div class="kpi-label">英欧合计</div><div class="kpi-value">${{grandTotal.toLocaleString()}}<span class="kpi-unit">件</span></div></div>
    <div class="kpi-card uk"><div class="kpi-label">英国店铺SKU</div><div class="kpi-value">${{ukSku}}<span class="kpi-unit">个</span></div></div>
    <div class="kpi-card eu"><div class="kpi-label">欧洲店铺SKU</div><div class="kpi-value">${{euSku}}<span class="kpi-unit">个</span></div></div>
    <div class="kpi-card total"><div class="kpi-label">总记录数</div><div class="kpi-value">${{DATA.length}}<span class="kpi-unit">条</span></div></div>
  `;
}}

function populateCategoryFilter() {{
  const cats = [...new Set(DATA.map(d => d.category))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const sel = document.getElementById('categoryFilter');
  cats.forEach(c => {{ const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); }});
}}

function switchTab(tab) {{
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('detailView').style.display = tab === 'detail' ? '' : 'none';
  document.getElementById('summaryView').style.display = tab === 'summary' ? '' : 'none';
}}

function applyFilters() {{
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const region = document.getElementById('regionFilter').value;
  const cat = document.getElementById('categoryFilter').value;
  const stockOnly = document.getElementById('stockOnly').checked;
  filteredData = DATA.filter(d => {{
    if (region !== 'all' && d.region !== region) return false;
    if (cat !== 'all' && d.category !== cat) return false;
    if (stockOnly && d.stock === 0) return false;
    if (q) {{ const text = (d.category + ' ' + d.color + ' ' + d.region + ' ' + d.store_sku).toLowerCase(); if (!text.includes(q)) return false; }}
    return true;
  }});
  filteredData.sort((a, b) => {{
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') return sortDir * va.localeCompare(vb, 'zh-CN');
    return sortDir * (va - vb);
  }});
  currentPage = 1;
  renderTable();
}}

function renderTable() {{
  const tbody = document.getElementById('tableBody');
  const total = filteredData.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = filteredData.slice(start, start + PAGE_SIZE);
  document.getElementById('tableCount').textContent = total + ' 条记录';
  if (!pageData.length) {{ tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text2)">暂无匹配数据</td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }}
  tbody.innerHTML = pageData.map(d => {{
    const isUk = d.region === '英国', cls = isUk ? 'uk' : 'eu';
    const pct = Math.round(d.stock / maxStock * 100);
    const z = d.stock === 0 ? 'zero' : '';
    const skuDisplay = d.store_sku ? `<span class="sku-tag" title="${{d.store_sku}}">${{d.store_sku}}</span>` : '-';
    return `<tr>
      <td><span class="region-badge ${{cls}}">${{d.region}}</span></td>
      <td style="font-weight:600">${{d.category}}</td>
      <td>${{d.color || '-'}}</td>
      <td><div class="stock-bar"><span class="stock-value ${{z}}">${{d.stock.toLocaleString()}}</span><div class="bar ${{cls}}" style="width:${{pct}}%"></div></div></td>
      <td>${{skuDisplay}}</td>
      <td style="color:var(--text2);font-size:12px">${{d.stock > 0 ? (d.stock / grandTotal * 100).toFixed(2) + '%' : '-'}}</td>
    </tr>`;
  }}).join('');
  let ph = `<button class="page-btn" onclick="goPage(${{currentPage - 1}})" ${{currentPage <= 1 ? 'disabled' : ''}}>上一页</button>`;
  const range = getPageRange(currentPage, totalPages);
  range.forEach(p => {{ if (p === '...') ph += '<span class="page-info">...</span>'; else ph += `<button class="page-btn ${{p === currentPage ? 'active' : ''}}" onclick="goPage(${{p}})">${{p}}</button>`; }});
  ph += `<button class="page-btn" onclick="goPage(${{currentPage + 1}})" ${{currentPage >= totalPages ? 'disabled' : ''}}>下一页</button>`;
  ph += `<span class="page-info">${{start + 1}}-${{Math.min(start + PAGE_SIZE, total)}} / ${{total}}</span>`;
  document.getElementById('pagination').innerHTML = ph;
}}

function getPageRange(c, t) {{
  if (t <= 7) return Array.from({{ length: t }}, (_, i) => i + 1);
  if (c <= 4) {{ const r = []; for (let i = 1; i <= 5; i++) r.push(i); r.push('...', t); return r; }}
  if (c >= t - 3) {{ const r = [1, '...']; for (let i = t - 4; i <= t; i++) r.push(i); return r; }}
  return [1, '...', c - 1, c, c + 1, '...', t];
}}

function goPage(p) {{
  const tp = Math.ceil(filteredData.length / PAGE_SIZE) || 1;
  if (p < 1 || p > tp) return;
  currentPage = p;
  renderTable();
  document.querySelector('.table-wrapper').scrollIntoView({{ behavior: 'smooth', block: 'start' }});
}}

function renderSummaryTable() {{
  const region = document.getElementById('summaryRegionFilter').value;
  const stockOnly = document.getElementById('summaryStockOnly').checked;
  const src = DATA.filter(d => region === 'all' || d.region === region);
  const m = {{}};
  const colorCount = {{}};
  src.forEach(d => {{
    if (stockOnly && d.stock === 0) return;
    m[d.category] = (m[d.category] || 0) + d.stock;
    if (!colorCount[d.category]) colorCount[d.category] = new Set();
    if (d.stock > 0) colorCount[d.category].add(d.color);
  }});
  const items = Object.entries(m).sort((a, b) => b[1] - a[1]);
  const refTotal = region === 'all' ? grandTotal : (region === '英国' ? ukTotal : euTotal);
  const maxVal = items.length ? items[0][1] : 1;
  document.getElementById('summaryCount').textContent = items.length + ' 个产品';
  document.getElementById('summaryBody').innerHTML = items.map(([name, val], i) => {{
    const pct = (val / refTotal * 100).toFixed(2);
    const barW = Math.round(val / maxVal * 100);
    const colors = colorCount[name] ? colorCount[name].size : 0;
    const rankCls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : 'normal';
    return `<tr>
      <td><span class="rank ${{rankCls}}">${{i + 1}}</span></td>
      <td style="font-weight:600">${{name}}</td>
      <td style="color:var(--text2)">${{colors}} 色</td>
      <td style="font-weight:700">${{val.toLocaleString()}}</td>
      <td style="color:var(--text2);font-size:12px">${{pct}}%</td>
      <td><div style="width:100%;height:6px;background:#edf2f7;border-radius:3px;overflow:hidden"><div style="height:100%;width:${{barW}}%;background:${{region === '欧洲' || region === 'all' ? 'var(--eu)' : 'var(--uk)'};border-radius:3px"></div></div></td>
    </tr>`;
  }}).join('');
}}

function renderTopProducts() {{
  const ukByProduct = {{}};
  DATA.filter(d => d.region === '英国').forEach(d => {{ ukByProduct[d.category] = (ukByProduct[d.category] || 0) + d.stock; }});
  const ukSorted = Object.entries(ukByProduct).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const ukMax = ukSorted.length ? ukSorted[0][1] : 1;
  document.getElementById('ukSummary').innerHTML = ukSorted.map(([name, val], i) => {{
    const rc = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : 'normal';
    return `<div class="summary-item"><span class="rank ${{rc}}">${{i + 1}}</span><span class="name">${{name}}</span><span class="val">${{val.toLocaleString()}}</span><div class="bar-mini"><div class="fill uk" style="width:${{val / ukMax * 100}}%"></div></div></div>`;
  }}).join('');
  
  const euByProduct = {{}};
  DATA.filter(d => d.region === '欧洲').forEach(d => {{ euByProduct[d.category] = (euByProduct[d.category] || 0) + d.stock; }});
  const euSorted = Object.entries(euByProduct).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const euMax = euSorted.length ? euSorted[0][1] : 1;
  document.getElementById('euSummary').innerHTML = euSorted.map(([name, val], i) => {{
    const rc = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : 'normal';
    return `<div class="summary-item"><span class="rank ${{rc}}">${{i + 1}}</span><span class="name">${{name}}</span><span class="val">${{val.toLocaleString()}}</span><div class="bar-mini"><div class="fill eu" style="width:${{val / euMax * 100}}%"></div></div></div>`;
  }}).join('');
}}

function bindEvents() {{
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('regionFilter').addEventListener('change', applyFilters);
  document.getElementById('categoryFilter').addEventListener('change', applyFilters);
  document.getElementById('stockOnly').addEventListener('change', applyFilters);
  document.querySelectorAll('th[data-sort]').forEach(th => {{
    th.addEventListener('click', () => {{
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1; else {{ sortKey = key; sortDir = key === 'stock' ? -1 : 1; }}
      document.querySelectorAll('th').forEach(t => t.classList.remove('sorted'));
      th.classList.add('sorted');
      applyFilters();
    }});
  }});
}}

init();
</script>
</body>
</html>
'''

# 替换数据
html_content = html_template.replace('{data_js}', data_js)

# 保存
output_file = r'C:\Users\Administrator\Documents\trae\SUNLU英欧库存数据看板.html'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"\n看板已生成: {output_file}")
print(f"文件大小: {len(html_content):,} 字符")
