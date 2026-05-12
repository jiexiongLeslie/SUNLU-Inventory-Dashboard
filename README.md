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
