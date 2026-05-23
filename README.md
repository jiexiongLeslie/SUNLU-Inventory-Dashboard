# SUNLU 英美欧库存数据看板

一个用于展示和分析 SUNLU 品牌在英国、欧洲、美国三个地区库存数据的可视化看板系统。

## 项目结构

```
SUNLU-Inventory-Dashboard/
├── frontend/           # 前端文件
│   └── index.html      # 主页面（包含HTML/CSS/JS）
├── backend/            # 后端文件
│   └── server.js       # Node.js HTTP服务器
├── scripts/            # Python数据处理脚本
│   ├── extract_inventory_v*.py    # 数据提取脚本
│   ├── generate_dashboard_v*.py   # 看板生成脚本
│   └── update_dashboard_data.py   # 数据更新脚本
├── data/               # 数据文件
│   ├── data.json       # 当前使用的库存数据
│   └── inventory_data_v*.json     # 历史数据备份
├── start_dashboard.ps1 # 启动脚本
├── stop_dashboard.ps1  # 停止脚本
└── README.md           # 项目说明
```

## 功能特性

- **多地区支持**: 英国站、全球-欧洲、全球-美国
- **数据可视化**: 饼图、热力图、TOP15排行
- **实时筛选**: 按地区、产品、SKU、库存范围筛选
- **数据持久化**: 上传的Excel数据自动保存，多设备共享
- **响应式设计**: 支持桌面和移动设备访问

## 快速开始

### 1. 启动服务

```powershell
# 方式1: 右键点击 start_dashboard.ps1 → "使用 PowerShell 运行"

# 方式2: PowerShell命令行
.\start_dashboard.ps1
```

服务启动后访问:
- 本机: http://localhost:5002
- 局域网: http://<本机IP>:5002
- Shopify 库存页: http://localhost:5002/shopify.html

### 2. 上传数据

1. 点击"选择 Excel 文件"按钮
2. 选择包含库存数据的Excel文件（需包含英国站/全球-欧洲/全球-美国工作表）
3. 系统自动解析并更新看板

### 3. 停止服务

```powershell
.\stop_dashboard.ps1
```

## Excel文件格式要求

Excel文件需包含以下工作表:
- `英国站` - 英国库存数据
- `全球-欧洲` - 欧洲库存数据
- `全球-美国` - 美国库存数据

每个工作表需包含列:
- `品类` - 产品类别
- `颜色` - 产品颜色
- `店铺SKU` - SKU编码
- `总库存` / `独立站库存` / `总库存 欧洲所有通用` - 库存数量（根据地区不同）

## 技术栈

- **前端**: HTML5, CSS3, Vanilla JavaScript, Chart.js
- **后端**: Node.js (原生HTTP模块)
- **数据处理**: Python (openpyxl, pandas)

## 端口配置

默认端口: `5002`

如需修改端口，请编辑:
- `backend/server.js` - 修改 `const PORT = 5002;`
- `start_dashboard.ps1` - 修改 `$port = 5002`
- `stop_dashboard.ps1` - 修改 `$port = 5002`

## 数据存储

- 上传的数据自动保存到 `data/data.json`
- 历史数据备份在 `data/` 目录下
- 所有连接到服务器的设备都能看到相同的数据

## 注意事项

1. 首次启动前请确保已安装 Node.js
2. Excel文件上传后数据会持久化到服务器，刷新页面不会丢失
3. 如需重置数据，可删除 `data/data.json` 文件后重启服务

## 开发约定：Excel 列定位

这个项目依赖的 Excel 文件是宽表结构：列名相对稳定，但列序号会随着每日新增日期、销量、补货和库存列而变化。后续开发不要按固定列号读取数据，必须按表头文本动态定位。

当前前端统一解析入口是 `frontend/excelParser.js`，它会按工作表和列名规则查找：

- 商品维度：`品类`、`颜色`、`店铺SKU`
- 库存字段：如 `总库存`、`独立站 库存`、`总库存 欧洲所有通用`、`库存总计`
- 销量字段：`7天日均销量`、`7天总销量`、`14天总销量`、`近30天总销量`
- 在途字段：`在途库存` / `在途 库存`

新增统计口径时，优先在 `frontend/excelParser.js` 中增加配置规则，再让页面消费解析后的结构化字段。不要在页面渲染逻辑或历史 Python 脚本中散落新的列号判断。

命令行解析可使用新版脚本：

```powershell
py scripts\extract_inventory_dynamic.py "C:\path\to\inventory.xlsx" --summary
py scripts\extract_inventory_dynamic.py "C:\path\to\inventory.xlsx" -o data\data.json
```

解析后的数据会额外保留这些统计字段：

- `in_transit`：在途库存
- `sales_7d_avg`：7 天日均销量
- `sales_7d` / `sales_14d` / `sales_30d`：近 7/14/30 天销量
- `days_of_cover`：库存可售天数
- `risk_level`：库存风险状态
- `source_sheet`：来源工作表

## Shopify 库存统计

Shopify 统计页位于 `frontend/shopify.html`，后端接口会读取项目根目录下的 `shopify_token.env`。这个文件包含敏感凭证，已加入 `.gitignore`，不要提交到仓库。

当前支持的配置格式：

```env
SHOPIFY_UK_STORE=sunluuk.myshopify.com
SHOPIFY_DE_STORE=sunlude.myshopify.com
SHOPIFY_US_STORE=sunlu3d.myshopify.com

client_id=your_client_id
client_secret=your_client_secret
```

后端会使用 `client_id + client_secret` 通过 Shopify client credentials flow 换取临时 access token，再通过 Admin GraphQL API 拉取产品变体库存。统计范围固定为 UK、EU（使用 `SHOPIFY_DE_STORE`）和 US；FR、IT 与 DE 同属欧洲库存，不参与 Shopify 库存统计，避免重复计算。页面会展示产品数、变体数、SKU 数、总库存、零库存和低库存变体，并支持按店铺、库存状态和关键词筛选。

### Shopify 缓存、SKU 映射和数据诊断

- Shopify 页面默认读取缓存；点击“刷新 Shopify 并更新缓存”才会实时调用 Shopify API，并写入 `data/shopify_inventory_cache.json`。
- SKU 映射维护页：`http://localhost:5002/sku-mapping.html`。用于把疑似未匹配 SKU 标记为“单品”并指定产品分类，或标记为“排除”。
- 数据质量诊断页：`http://localhost:5002/quality.html`。用于检查库存表空 SKU、重复 SKU、零库存有销量、Shopify 未匹配单品 SKU、同 SKU 多库存等问题。
- 库龄结构分析页：`http://localhost:5002/inventory-age.html`。从 V3.5 单页系统接入，用于上传库龄文件、查看库龄结构、预警和动销快照。标准表头会自动导入；数据会同步保存到 `data/inventory_age.json`。
- 映射规则保存到 `data/sku_mappings.json`，属于运行时业务配置，已加入 `.gitignore`。
