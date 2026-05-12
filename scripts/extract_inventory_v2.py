#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SUNLU 库存数据提取脚本 v2
- 修复合并单元格数据丢失问题（前向填充）
- 汇总所有日期列作为总库存
- 按店铺SKU统计SKU数量
"""

import pandas as pd
import json
import sys

def extract_inventory(file_path):
    """提取库存数据"""
    results = []
    
    # 配置：工作表名称、地区、关键列索引
    configs = [
        {'sheet': '英国站', 'region': '英国', 'cat_col': 0, 'color_col': 4, 'store_sku_col': 8},
        {'sheet': '全球-欧洲', 'region': '欧洲', 'cat_col': 0, 'color_col': 4, 'store_sku_col': 8},
    ]
    
    for cfg in configs:
        print(f"\n处理 {cfg['sheet']} ({cfg['region']})...")
        
        try:
            # 读取数据，不设置表头
            df = pd.read_excel(file_path, sheet_name=cfg['sheet'], header=None)
        except Exception as e:
            print(f"  读取失败: {e}")
            continue
        
        # 表头在第8行（索引7）
        header_row = 7
        data_start = 8
        
        # 找到所有日期列（从列9开始，值是数字的列）
        date_cols = []
        for col_idx in range(9, len(df.columns)):
            # 检查表头是否是日期格式（数字或日期字符串）
            header_val = df.iloc[header_row, col_idx]
            if pd.notna(header_val):
                # 如果是数字（Excel日期序列）或包含日期的字符串
                if isinstance(header_val, (int, float)) or ('2025' in str(header_val) or '2026' in str(header_val)):
                    date_cols.append(col_idx)
        
        print(f"  找到 {len(date_cols)} 个日期库存列")
        
        # 提取数据行
        last_category = ''
        row_count = 0
        
        for row_idx in range(data_start, len(df)):
            row = df.iloc[row_idx]
            
            # 获取品类（处理合并单元格）
            cat_val = row.iloc[cfg['cat_col']]
            if pd.notna(cat_val) and str(cat_val).strip() not in ['', 'nan', 'None']:
                last_category = str(cat_val).replace('\n', ' ').strip()
            
            # 跳过无效行
            if not last_category or '总计' in last_category or '合计' in last_category:
                continue
            
            # 获取颜色
            color_val = row.iloc[cfg['color_col']]
            if pd.isna(color_val):
                continue
            color = str(color_val).replace('\n', ' ').strip()
            
            # 获取店铺SKU
            store_sku = ''
            if cfg['store_sku_col'] < len(row):
                sku_val = row.iloc[cfg['store_sku_col']]
                if pd.notna(sku_val):
                    store_sku = str(sku_val).strip()
            
            # 计算总库存（汇总所有日期列）
            total_stock = 0
            for col_idx in date_cols:
                if col_idx < len(row):
                    val = row.iloc[col_idx]
                    if pd.notna(val) and isinstance(val, (int, float)):
                        total_stock += int(val)
            
            # 添加到结果
            results.append({
                'category': last_category,
                'color': color,
                'store_sku': store_sku,
                'stock': total_stock,
                'region': cfg['region']
            })
            row_count += 1
        
        print(f"  提取 {row_count} 条记录")
    
    return results


def main():
    # 文件路径
    file_path = r'c:\Users\Administrator\.trae-cn\attachments\568f0837-b6a9-4fb4-a977-6784d4e4aa31_8a712da7-5bab-4778-85c9-5508b8c4d4c4_2026年-SUNLU独立站库存销量数据表-发货更新5.5;库存更新5.6.xlsx'
    
    print("=" * 60)
    print("SUNLU 库存数据提取 v2")
    print("=" * 60)
    
    # 提取数据
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
    print(f"  英国: {len(uk_data)} 条记录, 总库存 {uk_stock}, 店铺SKU {len(uk_skus)} 个")
    print(f"  欧洲: {len(eu_data)} 条记录, 总库存 {eu_stock}, 店铺SKU {len(eu_skus)} 个")
    print(f"  合计: {len(data)} 条记录, 总库存 {uk_stock + eu_stock}")
    print("=" * 60)
    
    # 保存为JSON
    output_file = r'C:\Users\Administrator\Documents\trae\inventory_data_v2.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n数据已保存: {output_file}")
    
    # 显示前5条示例
    print("\n前5条数据示例:")
    for d in data[:5]:
        print(f"  {d}")


if __name__ == '__main__':
    main()
