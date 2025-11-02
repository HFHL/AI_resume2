#!/usr/bin/env python3
"""测试简历解析准确性的脚本"""

import sys
import json
from pathlib import Path
from datetime import date

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.app.parser import (
    parse_resume,
    extract_work_years,
    extract_first_email,
    extract_first_phone,
    extract_schools,
    _extract_periods,
    _merge_periods,
    _months_between,
)


def test_work_years_extraction():
    """测试工作年限提取"""
    
    # 读取测试简历
    test_file = Path("backend/uploads/ocr_output/【【AI infra】AI工程师_深圳 50-70K】赵天一 4年/auto/【【AI infra】AI工程师_深圳 50-70K】赵天一 4年.md")
    
    if not test_file.exists():
        print(f"❌ 测试文件不存在: {test_file}")
        return
    
    text = test_file.read_text(encoding="utf-8")
    
    print("=" * 80)
    print("📄 测试文件:", test_file.name)
    print("=" * 80)
    
    # 1. 测试时间段提取
    print("\n🔍 步骤1: 提取时间段")
    periods = _extract_periods(text)
    print(f"找到 {len(periods)} 个时间段:")
    for start, end in periods:
        months = _months_between(start, end)
        print(f"  - {start.strftime('%Y年%m月')} 至 {end.strftime('%Y年%m月')} ({months}个月)")
    
    # 2. 测试合并后的时间段
    print("\n🔍 步骤2: 合并重叠时间段")
    merged = _merge_periods(periods)
    total_months = sum(_months_between(s, e) for s, e in merged)
    print(f"合并后 {len(merged)} 个时间段，总计 {total_months} 个月 ({total_months/12:.1f}年):")
    for start, end in merged:
        months = _months_between(start, end)
        print(f"  - {start.strftime('%Y年%m月')} 至 {end.strftime('%Y年%m月')} ({months}个月)")
    
    # 3. 测试最终工作年限
    print("\n🔍 步骤3: 计算工作年限")
    work_years = extract_work_years(text)
    print(f"✅ 工作年限: {work_years} 年")
    
    # 4. 完整解析
    print("\n🔍 步骤4: 完整简历解析")
    parsed = parse_resume(text, resume_file_id=None, file_name=test_file.name)
    
    print(f"\n📋 解析结果:")
    print(f"  姓名: {parsed.name}")
    print(f"  邮箱: {parsed.email}")
    print(f"  手机: {parsed.phone}")
    print(f"  学历: {parsed.education_degree}")
    print(f"  学校: {parsed.education_school}")
    print(f"  专业: {parsed.education_major}")
    print(f"  学校层次: {parsed.education_tier}")
    print(f"  工作年限: {parsed.work_years} 年")
    print(f"  分类: {parsed.category}")
    print(f"  标签: {parsed.tag_names}")
    
    print(f"\n💼 工作经历 ({len(parsed.work_experience or [])}条):")
    for i, exp in enumerate(parsed.work_experience or [], 1):
        preview = exp[:100] + "..." if len(exp) > 100 else exp
        print(f"  {i}. {preview}")
    
    print(f"\n🏗️ 项目经历 ({len(parsed.project_experience or [])}条):")
    for i, exp in enumerate(parsed.project_experience or [], 1):
        preview = exp[:100] + "..." if len(exp) > 100 else exp
        print(f"  {i}. {preview}")
    
    print(f"\n🔧 技能 ({len(parsed.skills or [])}项):")
    if parsed.skills:
        print(f"  {', '.join(parsed.skills[:20])}")
        if len(parsed.skills) > 20:
            print(f"  ... 等共 {len(parsed.skills)} 项")
    
    # 5. 结构化工作经历
    if parsed.work_experience_items:
        print(f"\n📊 结构化工作经历 ({len(parsed.work_experience_items)}条):")
        for i, item in enumerate(parsed.work_experience_items, 1):
            print(f"  {i}. {item.get('company', '未知公司')}")
            print(f"     职位: {item.get('title', '未知')}")
            print(f"     时间: {item.get('start', '?')} - {item.get('end', '?')}")
            if item.get('duration_months'):
                print(f"     时长: {item['duration_months']}个月 ({item['duration_months']/12:.1f}年)")
    
    print("\n" + "=" * 80)
    
    # 6. 对比文件名中的年限
    import re
    filename_years = re.search(r'(\d+)\s*年', test_file.name)
    if filename_years:
        expected_years = int(filename_years.group(1))
        actual_years = parsed.work_years or 0
        diff = abs(expected_years - actual_years)
        
        print(f"\n⚖️ 对比分析:")
        print(f"  文件名标注: {expected_years} 年")
        print(f"  实际解析: {actual_years} 年")
        print(f"  差异: {diff} 年")
        
        if diff > 1:
            print(f"  ⚠️ 警告: 差异超过1年，可能存在解析问题")
        else:
            print(f"  ✅ 差异在合理范围内")


def test_multiple_formats():
    """测试不同时间格式"""
    test_cases = [
        ("2021年8月 – 2022年11月", "中文年月格式"),
        ("2024年2-7月", "简写月份"),
        ("2023年8月–2024年3月", "全角破折号"),
        ("2021.08 - 2022.11", "点号分隔"),
        ("2024.2 - 2024.7", "单数字月份"),
        ("Aug 2021 - Nov 2022", "英文月份"),
        ("2019 年 8 月获得", "描述性文本"),
        ("2021 年 5 月获得", "描述性文本2"),
    ]
    
    print("\n" + "=" * 80)
    print("🧪 测试不同时间格式识别")
    print("=" * 80)
    
    for text, desc in test_cases:
        periods = _extract_periods(text)
        if periods:
            start, end = periods[0]
            months = _months_between(start, end)
            print(f"✅ {desc}: {text}")
            print(f"   识别为: {start.strftime('%Y-%m')} 至 {end.strftime('%Y-%m')} ({months}个月)")
        else:
            print(f"❌ {desc}: {text}")
            print(f"   未能识别")
        print()


if __name__ == "__main__":
    test_work_years_extraction()
    test_multiple_formats()

