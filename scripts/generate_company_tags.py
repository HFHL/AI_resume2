#!/usr/bin/env python3
"""
生成公司标签分类JSON格式
输出格式：金融量化：公司a，公司b，web3：公司c，公司d
"""

import pandas as pd
import json
from typing import Dict, List

def process_company_categories(file_path: str) -> Dict[str, List[str]]:
    """处理公司分类数据"""
    
    # 类别映射 - 将sheet名称映射到更简洁的类别名
    category_mapping = {
        '知名公司列表-金融量化': '金融量化',
        '知名公司表插件-web3': 'web3',
        '知名公司表插件-互联网': '互联网',
        '知名公司表插件-量化': '量化',
        '知名公司表插件-金融': '金融',
        '知名公司表插件-AI': 'AI',
        '知名公司插件-外包公司': '外包公司',
        '插件-黑名单': '黑名单'
    }
    
    result = {}
    excel_file = pd.ExcelFile(file_path)
    
    for sheet_name in excel_file.sheet_names:
        if sheet_name not in category_mapping:
            continue
            
        category_name = category_mapping[sheet_name]
        
        # 读取数据
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        df = df.dropna(how='all')
        
        companies = set()  # 使用set避免重复
        
        # 遍历所有单元格提取公司名称
        for index, row in df.iterrows():
            for col in df.columns:
                value = row[col]
                if pd.notna(value) and isinstance(value, str):
                    company = str(value).strip()
                    # 过滤掉明显不是公司名的内容
                    if (company and 
                        len(company) > 1 and 
                        not company.startswith('http') and
                        not company.endswith('亿+') and
                        '（' not in company[:10] and  # 过滤长描述
                        len(company) < 50):  # 过滤长文本
                        companies.add(company)
        
        if companies:
            result[category_name] = sorted(list(companies))
    
    return result

def generate_simple_format(categories: Dict[str, List[str]]) -> str:
    """生成简单格式输出"""
    
    # 只保留主要类别，排除黑名单和外包公司
    main_categories = ['金融量化', 'web3', '互联网', '量化', '金融', 'AI']
    
    output_parts = []
    
    for category in main_categories:
        if category in categories:
            companies = categories[category]
            # 只显示前10个公司，避免输出过长
            display_companies = companies[:10]
            company_list = '，'.join(display_companies)
            if len(companies) > 10:
                company_list += f"...（共{len(companies)}家）"
            
            output_parts.append(f"{category}：{company_list}")
    
    return '；'.join(output_parts)

def main():
    file_path = "/Users/apple/project/AI_resume2/data/AI高亮公司表.xlsx"
    
    # 处理数据
    categories = process_company_categories(file_path)
    
    # 生成完整JSON
    complete_json = json.dumps(categories, ensure_ascii=False, indent=2)
    
    # 生成简单格式
    simple_format = generate_simple_format(categories)
    
    print("=== 完整JSON格式 ===")
    print(complete_json)
    
    print("\n=== 简洁格式输出 ===")
    print(simple_format)
    
    # 保存到文件
    with open("/Users/apple/project/AI_resume2/data/company_tags.json", 'w', encoding='utf-8') as f:
        json.dump(categories, f, ensure_ascii=False, indent=2)
    
    print(f"\n=== 统计信息 ===")
    total_companies = 0
    for category, companies in categories.items():
        count = len(companies)
        total_companies += count
        print(f"{category}: {count}家公司")
    
    print(f"总计: {total_companies}家公司")

if __name__ == "__main__":
    main()