#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SUNLU 库存数据提取 v6 - 添加美国站
- 英国站：第0行表头包含"总库存"（不含"欧洲"）
- 全球-欧洲：第0行表头包含"总库存"且包含"欧洲所有通用"
- 全球-美国：第0行表头包含"独立站 库存"
- 店铺SKU：第7行表头包含"店铺SKU"
"""

import pandas as pd
import json

def extract_inventory(file_path):
    results = []
    configs = [
        {'sheet': '英国站', 'region': '英国', 'stock_keyword': '总库存', 'stock_exclude': '欧洲'},
        {'sheet': '全球-欧洲', 'region': '欧洲', 'stock_keyword': '总库存', 'stock_include': '欧洲所有通用'},
        {'sheet': '全球-美国', 'region': '美国', 'stock_keyword': '独立站 库存'},
    ]
    
    for cfg in configs:
        print(f"\n处理 {cfg['sheet']} ({cfg['region']})...")
        try:
            df = pd.read_excel(file_path, sheet_name=cfg['sheet'], header=None)
        except Exception as e:
            print(f"  读取失败: {e}")
            continue
        
        # 第0行：查找库存列（合并表头）
        row0 = df.iloc[0]
        stock_col = -1
        for j in range(len(row0)):
            h = row0.iloc[j]
            if pd.isna(h):
                continue
            h_str = str(h).replace('\n', ' ').strip()
            if cfg['stock_keyword'] in h_str:
                if cfg.get('stock_exclude') and cfg['stock_exclude'] in h_str:
                    continue
                if cfg.get('stock_include') and cfg['stock_include'] not in h_str:
                    continue
                if stock_col == -1:
                    stock_col = j
                    print(f"  库存列={j}, 表头='{h_str}'")
        
        # 第7行：查找品类/颜色/店铺SKU列
        header = df.iloc[7]
        cat_col = 0
        color_col = -1
        store_sku_col = -1
        for j in range(len(header)):
            h = header.iloc[j]
            if pd.isna(h):
                continue
            h_str = str(h).replace('\n', ' ').strip()
            if h_str == '颜色' and color_col == -1:
                color_col = j
            if '店铺SKU' in h_str and store_sku_col == -1:
                store_sku_col = j
        
        print(f"  颜色列={color_col}, SKU列={store_sku_col}")
        
        if color_col == -1 or stock_col == -1:
            print(f"  跳过: 未找到必要列")
            continue
        
        # 提取数据（第8行开始）
        last_category = ''
        row_count = 0
        for row_idx in range(8, len(df)):
            row = df.iloc[row_idx]
            
            cat_val = row.iloc[cat_col]
            if pd.notna(cat_val) and str(cat_val).strip() not in ['', 'nan', 'None']:
                last_category = str(cat_val).replace('\n', ' ').strip()
            if not last_category or '总计' in last_category or '合计' in last_category:
                continue
            
            color_val = row.iloc[color_col]
            if pd.isna(color_val):
                color = ''
            else:
                color = str(color_val).replace('\n', ' ').strip()
            
            store_sku = ''
            if store_sku_col >= 0 and store_sku_col < len(row):
                sku_val = row.iloc[store_sku_col]
                if pd.notna(sku_val):
                    store_sku = str(sku_val).strip()
            
            stock = 0
            if stock_col < len(row):
                stock_val = row.iloc[stock_col]
                if pd.notna(stock_val) and isinstance(stock_val, (int, float)):
                    stock = int(stock_val)
            
            results.append({
                'category': last_category,
                'color': color,
                'store_sku': store_sku,
                'stock': stock,
                'region': cfg['region']
            })
            row_count += 1
        
        print(f"  提取 {row_count} 条记录")
    
    return results


def main():
    file_path = r'c:\Users\Administrator\.trae-cn\attachments\568f0837-b6a9-4fb4-a977-6784d4e4aa31_8a712da7-5bab-4778-85c9-5508b8c4d4c4_2026年-SUNLU独立站库存销量数据表-发货更新5.5;库存更新5.6.xlsx'
    
    print("=" * 60)
    print("SUNLU 库存数据提取 v6 - 添加美国站")
    print("=" * 60)
    
    data = extract_inventory(file_path)
    
    uk_data = [d for d in data if d['region'] == '英国']
    eu_data = [d for d in data if d['region'] == '欧洲']
    us_data = [d for d in data if d['region'] == '美国']
    
    uk_stock = sum(d['stock'] for d in uk_data)
    eu_stock = sum(d['stock'] for d in eu_data)
    us_stock = sum(d['stock'] for d in us_data)
    
    uk_skus = len(set(d['store_sku'] for d in uk_data if d['store_sku'] and d['stock'] > 0))
    eu_skus = len(set(d['store_sku'] for d in eu_data if d['store_sku'] and d['stock'] > 0))
    us_skus = len(set(d['store_sku'] for d in us_data if d['store_sku'] and d['stock'] > 0))
    
    print("\n" + "=" * 60)
    print(f"英国: {len(uk_data)} 条, 总库存 {uk_stock:,}, 店铺SKU {uk_skus} 个")
    print(f"欧洲: {len(eu_data)} 条, 总库存 {eu_stock:,}, 店铺SKU {eu_skus} 个")
    print(f"美国: {len(us_data)} 条, 总库存 {us_stock:,}, 店铺SKU {us_skus} 个")
    print(f"合计: {len(data)} 条, 总库存 {uk_stock + eu_stock + us_stock:,}")
    print("=" * 60)
    
    output_file = r'C:\Users\Administrator\Documents\trae\inventory_data_v6.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n数据已保存: {output_file}")


if __name__ == '__main__':
    main()
