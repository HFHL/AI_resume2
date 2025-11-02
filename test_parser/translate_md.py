#!/usr/bin/env python3
"""
Markdown 翻译工具
将英文简历 Markdown 翻译为中文
"""
import sys
import argparse
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.translator import ResumeTranslator


def progress_callback(current: int, total: int, section_name: str):
    """进度回调"""
    percent = (current / total) * 100
    print(f"[{current}/{total}] {percent:.1f}% - {section_name}")


def translate_file(input_path: Path, output_path: Path, model: str = "gpt-4o-mini"):
    """翻译单个文件"""
    print(f"\n{'='*80}")
    print(f"📄 翻译文件: {input_path.name}")
    print(f"{'='*80}\n")
    
    # 读取原文
    try:
        original_text = input_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"❌ 读取文件失败: {e}")
        return False
    
    print(f"✅ 原文长度: {len(original_text)} 字符")
    
    # 创建翻译器
    translator = ResumeTranslator(model=model)
    if not translator.is_available():
        print("❌ 翻译器不可用，请检查 LLM 配置")
        return False
    
    print(f"🤖 使用模型: {model}")
    
    # 翻译
    print("\n🔄 开始翻译...\n")
    start_time = datetime.now()
    
    try:
        translated_text = translator.translate_markdown(
            original_text,
            progress_callback=progress_callback
        )
    except Exception as e:
        print(f"\n❌ 翻译失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    print(f"\n✅ 翻译完成！耗时: {duration:.1f}秒")
    print(f"📊 译文长度: {len(translated_text)} 字符")
    
    # 保存译文
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(translated_text, encoding='utf-8')
        print(f"💾 译文已保存: {output_path}")
    except Exception as e:
        print(f"❌ 保存文件失败: {e}")
        return False
    
    return True


def translate_directory(input_dir: Path, output_dir: Path, model: str = "gpt-4o-mini"):
    """翻译整个目录"""
    md_files = list(input_dir.glob("*.md"))
    
    if not md_files:
        print(f"❌ 在 {input_dir} 中没有找到 .md 文件")
        return
    
    print(f"🔍 找到 {len(md_files)} 个 Markdown 文件")
    
    success_count = 0
    for i, input_path in enumerate(md_files, 1):
        print(f"\n\n{'#'*80}")
        print(f"处理第 {i}/{len(md_files)} 个文件")
        print(f"{'#'*80}")
        
        output_path = output_dir / input_path.name
        
        # 如果译文已存在，跳过
        if output_path.exists():
            print(f"⏭️  译文已存在，跳过: {input_path.name}")
            continue
        
        success = translate_file(input_path, output_path, model)
        if success:
            success_count += 1
    
    print(f"\n\n{'='*80}")
    print(f"✅ 翻译完成！成功: {success_count}/{len(md_files)}")
    print(f"{'='*80}")


def main():
    parser = argparse.ArgumentParser(description="翻译简历 Markdown 文件")
    parser.add_argument(
        "input",
        type=str,
        help="输入文件或目录路径"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        help="输出文件或目录路径（默认为 ocr_outputs_zh/）"
    )
    parser.add_argument(
        "-m", "--model",
        type=str,
        default="gpt-4o-mini",
        help="使用的模型（默认: gpt-4o-mini）"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="强制重新翻译已存在的文件"
    )
    
    args = parser.parse_args()
    
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ 输入路径不存在: {input_path}")
        sys.exit(1)
    
    # 确定输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        if input_path.is_file():
            # 单文件：输出到 ocr_outputs_zh/
            output_path = Path(__file__).parent / "ocr_outputs_zh" / input_path.name
        else:
            # 目录：输出到 ocr_outputs_zh/
            output_path = Path(__file__).parent / "ocr_outputs_zh"
    
    # 翻译
    if input_path.is_file():
        # 单文件
        if output_path.exists() and not args.force:
            print(f"⚠️  译文已存在: {output_path}")
            response = input("是否覆盖? (y/N): ")
            if response.lower() != 'y':
                print("取消翻译")
                sys.exit(0)
        
        success = translate_file(input_path, output_path, args.model)
        sys.exit(0 if success else 1)
    else:
        # 目录
        translate_directory(input_path, output_path, args.model)


if __name__ == "__main__":
    main()

