#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
更新看板内置数据
"""

import json
import re

# 读取新数据
with open(r'C:\Users\Administrator\Documents\trae\inventory_data_v3.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

data_js = json.dumps(data, ensure_ascii=False, indent=2)

# 统计
uk_data = [d for d in data if d['region'] == '英国']
eu_data = [d for d in data if d['region'] == '欧洲']
uk_stock = sum(d['stock'] for d in uk_data)
eu_stock = sum(d['stock'] for d in eu_data)
uk_skus = len(set(d['store_sku'] for d in uk_data if d['store_sku'] and d['stock'] > 0))
eu_skus = len(set(d['store_sku'] for d in eu_data if d['store_sku'] and d['stock'] > 0))

print(f"英国: {len(uk_data)}条, 库存{uk_stock:,}, SKU{uk_skus}")
print(f"欧洲: {len(eu_data)}条, 库存{eu_stock:,}, SKU{eu_skus}")
print(f"合计: {len(data)}条, 库存{uk_stock + eu_stock:,}")

# 读取HTML
html_path = r'C:\Users\Administrator\Documents\trae\SUNLU英欧库存数据看板.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 替换 DEFAULT_DATA
pattern = r'const DEFAULT_DATA = \[.*?\];'
replacement = 'const DEFAULT_DATA = ' + data_js + ';'
html_new = re.sub(pattern, replacement, html, flags=re.DOTALL)

# 保存
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_new)

print(f"\n看板数据已更新: {html_path}")
print(f"文件大小: {len(html_new):,} 字符")
