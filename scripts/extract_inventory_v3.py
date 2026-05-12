#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SUNLU 库存数据提取脚本 v3
- 使用指定库存列：
  - 英国站：AGA 列 (第828列，0-indexed: 827)
  - 欧洲站：RX 列 (第522列，0-indexed: 521)
- 修复合并单元格数据丢失问题（前向填充）
- 按店铺SKU统计SKU数量
"""

import pandas as pd
import json
import sys

def col_to_index(col_str):
    """Excel列名转索引 (A=0, B=1, ..., Z=25, AA=26, ...)"""
    result = 0
    for char in col_str.upper():
        result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1

def extract_inventory(file_path):
    """提取库存数据"""
    results = []
    
    # 列配置：RX = 522列, AGA = 828列
    configs = [
        {'sheet': '英国站', 'region': '英国', 'stock_col_idx': col_to_index('AGA')},
        {'sheet': '全球-欧洲', 'region': '欧洲', 'stock_col_idx': col_to_index('RX')},
    ]
    
    print(f"英国站库存列索引: {col_to_index('AGA')} (AGA)")
    print(f"欧洲站库存列索引: {col_to_index('RX')} (RX)")
    
    for cfg in configs:
        print(f"\n处理 {cfg['sheet']} ({cfg['region']})...")
        
        try:
            df = pd.read_excel(file_path, sheet_name=cfg['sheet'], header=None)
        except Exception as e:
            print(f"  读取失败: {e}")
            continue
        
        header_row = 7
        data_start = 8
        
        cat_col = 0
        color_col = 4
        store_sku_col = 8
        stock_col = cfg['stock_col_idx']
        
        print(f"  使用库存列: {stock_col}")
        
        last_category = ''
        row_count = 0
        
        for row_idx in range(data_start, len(df)):
            row = df.iloc[row_idx]
            
            # 品类（前向填充处理合并单元格）
            cat_val = row.iloc[cat_col]
            if pd.notna(cat_val) and str(cat_val).strip() not in ['', 'nan', 'None']:
                last_category = str(cat_val).replace('\n', ' ').strip()
            
            if not last_category or '总计' in last_category or '合计' in last_category:
                continue
            
            # 颜色
            color_val = row.iloc[color_col]
            if pd.isna(color_val):
                continue
            color = str(color_val).replace('\n', ' ').strip()
            
            # 店铺SKU
            store_sku = ''
            if store_sku_col < len(row):
                sku_val = row.iloc[store_sku_col]
                if pd.notna(sku_val):
                    store_sku = str(sku_val).strip()
            
            # 库存（指定列）
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
    print("SUNLU 库存数据提取 v3 - 使用指定库存列")
    print("=" * 60)
    
    data = extract_inventory(file_path)
    
    # 统计
    uk_data = [d for d in data if d['region'] == '英国']
    eu_data = [d for d in data if d['region'] == '欧洲']
    
    uk_stock = sum(d['stock'] for d in uk_data)
    eu_stock = sum(d['stock'] for d in eu_data)
    
    # 按店铺SKU统计（去重）
    uk_skus = set(d['store_sku'] for d in uk_data if d['store_sku'] and d['stock'] > 0)
    eu_skus = set(d['store_sku'] for d in eu_data if d['store_sku'] and d['stock'] > 0)
    
    print("\n" + "=" * 60)
    print("统计结果:")
    print(f"  英国: {len(uk_data)} 条记录, 总库存 {uk_stock:,}, 店铺SKU {len(uk_skus)} 个")
    print(f"  欧洲: {len(eu_data)} 条记录, 总库存 {eu_stock:,}, 店铺SKU {len(eu_skus)} 个")
    print(f"  合计: {len(data)} 条记录, 总库存 {uk_stock + eu_stock:,}")
    print("=" * 60)
    
    # 保存
    output_file = r'C:\Users\Administrator\Documents\trae\inventory_data_v3.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n数据已保存: {output_file}")
    
    # 显示有库存的前10条
    print("\n有库存的前10条数据:")
    for d in data:
        if d['stock'] > 0:
            print(f"  {d['region']} | {d['category']} | {d['color']} | 库存: {d['stock']} | SKU: {d['store_sku']}")
            if sum(1 for x in data if x['stock'] > 0) > 10:
                break


if __name__ == '__main__':
    main()
