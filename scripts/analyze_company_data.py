#!/usr/bin/env python3
"""
分析AI高亮公司表格数据
"""

import pandas as pd
import json
from typing import Dict, List, Any

def analyze_excel_structure(file_path: str):
    """分析Excel文件的结构"""
    
    print("=== Excel文件结构分析 ===")
    
    # 读取所有sheet名称
    excel_file = pd.ExcelFile(file_path)
    sheet_names = excel_file.sheet_names
    print(f"Sheet数量: {len(sheet_names)}")
    print(f"Sheet名称: {sheet_names}")
    
    # 分析每个sheet的结构
    for sheet_name in sheet_names:
        print(f"\n--- Sheet: {sheet_name} ---")
        
        # 读取数据
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        
        print(f"行数: {len(df)}")
        print(f"列数: {len(df.columns)}")
        print(f"列名: {list(df.columns)}")
        
        # 显示前几行数据
        print("前5行数据:")
        print(df.head())
        
        # 分析数据类型
        print("数据类型:")
        print(df.dtypes)
        
        # 检查缺失值
        print("缺失值统计:")
        print(df.isnull().sum())
        
        print("-" * 50)

def process_company_data(file_path: str) -> Dict[str, List[str]]:
    """处理公司数据，按类别分组"""
    
    result = {}
    
    # 读取所有sheet
    excel_file = pd.ExcelFile(file_path)
    
    for sheet_name in excel_file.sheet_names:
        print(f"处理Sheet: {sheet_name}")
        
        # 读取数据
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        
        # 去除空行
        df = df.dropna(how='all')
        
        companies = []
        
        # 遍历数据框，提取公司信息
        for index, row in df.iterrows():
            # 遍历每一列，查找公司名称
            for col in df.columns:
                value = row[col]
                if pd.notna(value) and isinstance(value, str):
                    # 清理数据
                    company = str(value).strip()
                    if company and company not in companies:
                        companies.append(company)
        
        # 将sheet名称作为类别
        if companies:
            result[sheet_name] = companies
    
    return result

def main():
    file_path = "/Users/apple/project/AI_resume2/data/AI高亮公司表.xlsx"
    
    # 1. 分析文件结构
    analyze_excel_structure(file_path)
    
    # 2. 处理数据
    print("\n=== 数据处理结果 ===")
    company_data = process_company_data(file_path)
    
    # 3. 输出JSON格式
    print("\n=== JSON格式输出 ===")
    json_output = json.dumps(company_data, ensure_ascii=False, indent=2)
    print(json_output)
    
    # 4. 保存到文件
    output_file = "/Users/apple/project/AI_resume2/data/company_categories.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(company_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n结果已保存到: {output_file}")
    
    # 5. 生成统计信息
    print("\n=== 统计信息 ===")
    for category, companies in company_data.items():
        print(f"{category}: {len(companies)}家公司")
        print(f"  公司: {', '.join(companies[:5])}{'...' if len(companies) > 5 else ''}")

if __name__ == "__main__":
    main()