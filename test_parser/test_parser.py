#!/usr/bin/env python3
"""
独立的简历解析测试脚本
不依赖 Supabase，可以直接测试解析准确性
"""

import sys
import json
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.parser import parse_resume, extract_work_years
from backend.app.ocr import MinerUProcessor


class StandaloneParser:
    """独立的解析器，不依赖数据库"""
    
    def __init__(self):
        self.ocr_processor = MinerUProcessor()
        self.test_inputs = Path(__file__).parent / "test_inputs"
        self.test_outputs = Path(__file__).parent / "test_outputs"
        self.ocr_outputs = Path(__file__).parent / "ocr_outputs"
        
        # 创建目录
        self.test_inputs.mkdir(exist_ok=True)
        self.test_outputs.mkdir(exist_ok=True)
        self.ocr_outputs.mkdir(exist_ok=True)
    
    def extract_text(self, file_path: Path) -> Optional[str]:
        """提取文本内容"""
        ext = file_path.suffix.lower()
        
        if ext == ".md":
            # 直接读取 Markdown
            try:
                return file_path.read_text(encoding="utf-8")
            except Exception as e:
                print(f"❌ 读取MD文件失败: {e}")
                return None
        
        elif ext == ".pdf":
            # 使用 OCR
            print(f"📄 正在进行 OCR 处理: {file_path.name}")
            text = self.ocr_processor.process_pdf(file_path)
            
            if text:
                # 保存 OCR 结果
                ocr_output = self.ocr_outputs / f"{file_path.stem}.md"
                ocr_output.write_text(text, encoding="utf-8")
                print(f"✅ OCR 结果已保存: {ocr_output}")
            
            return text
        
        else:
            print(f"❌ 不支持的文件格式: {ext}")
            return None
    
    def parse_file(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """解析单个文件"""
        print("\n" + "=" * 80)
        print(f"📋 解析文件: {file_path.name}")
        print("=" * 80)
        
        # 1. 提取文本
        text = self.extract_text(file_path)
        if not text:
            return None
        
        print(f"✅ 文本提取成功，长度: {len(text)} 字符")
        
        # 2. 解析简历
        print(f"\n🔍 开始解析...")
        try:
            parsed = parse_resume(text, resume_file_id=None, file_name=file_path.name)
        except Exception as e:
            print(f"❌ 解析失败: {e}")
            import traceback
            traceback.print_exc()
            return None
        
        # 3. 转换为字典
        result = parsed.to_row()
        
        # 4. 打印关键信息
        self.print_parsed_result(result, file_path.name)
        
        # 5. 保存结果
        output_file = self.test_outputs / f"{file_path.stem}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "file_name": file_path.name,
                "parsed_at": datetime.now().isoformat(),
                "result": result,
            }, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 解析结果已保存: {output_file}")
        
        return result
    
    def print_parsed_result(self, result: Dict[str, Any], filename: str):
        """打印解析结果"""
        print(f"\n📊 解析结果:")
        print(f"  {'姓名:':<20} {result.get('name', '未提取')}")
        print(f"  {'邮箱:':<20} {result.get('email', '未提取')}")
        print(f"  {'手机:':<20} {result.get('phone', '未提取')}")
        print(f"  {'学历:':<20} {result.get('education_degree', '未提取')}")
        
        schools = result.get('education_school') or []
        if schools:
            print(f"  {'学校:':<20} {', '.join(schools[:3])}")
            if len(schools) > 3:
                print(f"  {' '*20} ... 等共 {len(schools)} 所")
        else:
            print(f"  {'学校:':<20} 未提取")
        
        print(f"  {'专业:':<20} {result.get('education_major', '未提取')}")
        print(f"  {'学校层次:':<20} {result.get('education_tier', '未提取')}")
        print(f"  {'分类:':<20} {result.get('category', '未提取')}")
        
        work_years = result.get('work_years')
        print(f"  {'工作年限:':<20} {work_years}年" if work_years is not None else f"  {'工作年限:':<20} 未提取")
        
        # 对比文件名中的年限
        import re
        filename_years = re.search(r'(\d+)\s*年', filename)
        if filename_years and work_years is not None:
            expected = int(filename_years.group(1))
            actual = work_years
            diff = abs(expected - actual)
            
            print(f"\n⚖️  对比分析:")
            print(f"  {'文件名标注:':<20} {expected}年")
            print(f"  {'实际解析:':<20} {actual}年")
            print(f"  {'差异:':<20} {diff}年 {'✅ 准确' if diff <= 1 else '⚠️ 偏差较大'}")
        
        tags = result.get('tag_names') or []
        if tags:
            print(f"\n🏷️  标签 ({len(tags)}个):")
            print(f"  {', '.join(tags[:10])}")
            if len(tags) > 10:
                print(f"  ... 等共 {len(tags)} 个")
        
        skills = result.get('skills') or []
        if skills:
            print(f"\n🔧 技能 ({len(skills)}项):")
            print(f"  {', '.join(skills[:15])}")
            if len(skills) > 15:
                print(f"  ... 等共 {len(skills)} 项")
        
        work_exp = result.get('work_experience') or []
        print(f"\n💼 工作经历 ({len(work_exp)}条):")
        for i, exp in enumerate(work_exp[:3], 1):
            preview = exp[:80] + "..." if len(exp) > 80 else exp
            print(f"  {i}. {preview}")
        if len(work_exp) > 3:
            print(f"  ... 等共 {len(work_exp)} 条")
        
        work_items = result.get('work_experience_struct')
        if work_items and isinstance(work_items, list):
            print(f"\n📊 结构化工作经历 ({len(work_items)}条):")
            for i, item in enumerate(work_items, 1):
                company = item.get('company', '未知公司')
                title = item.get('title', '未知职位')
                start = item.get('start', '?')
                end = item.get('end', '?')
                duration = item.get('duration_months')
                
                print(f"  {i}. {company} - {title}")
                print(f"     {start} ~ {end}", end="")
                if duration:
                    print(f" ({duration}个月, {duration/12:.1f}年)")
                else:
                    print()
        
        proj_exp = result.get('project_experience') or []
        print(f"\n🏗️  项目经历 ({len(proj_exp)}条):")
        for i, exp in enumerate(proj_exp[:3], 1):
            preview = exp[:80] + "..." if len(exp) > 80 else exp
            print(f"  {i}. {preview}")
        if len(proj_exp) > 3:
            print(f"  ... 等共 {len(proj_exp)} 条")
    
    def test_all(self):
        """测试所有输入文件"""
        files = list(self.test_inputs.glob("*.pdf")) + list(self.test_inputs.glob("*.md"))
        
        if not files:
            print("❌ test_inputs/ 目录中没有找到测试文件")
            print("   请将 PDF 或 MD 文件放入该目录")
            return
        
        print(f"🔍 找到 {len(files)} 个测试文件")
        
        results = []
        for file_path in files:
            result = self.parse_file(file_path)
            if result:
                results.append({
                    "file": file_path.name,
                    "result": result
                })
        
        print("\n" + "=" * 80)
        print(f"✅ 测试完成！成功解析 {len(results)}/{len(files)} 个文件")
        print("=" * 80)


def main():
    parser = StandaloneParser()
    
    if len(sys.argv) > 1:
        # 测试指定文件
        file_path = Path(sys.argv[1])
        if not file_path.exists():
            print(f"❌ 文件不存在: {file_path}")
            sys.exit(1)
        parser.parse_file(file_path)
    else:
        # 测试所有文件
        parser.test_all()


if __name__ == "__main__":
    main()

