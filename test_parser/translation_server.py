#!/usr/bin/env python3
"""
简历翻译服务器
提供 HTTP API 用于翻译 Markdown 文件
"""
import sys
import argparse
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.translator import ResumeTranslator

BASE_DIR = Path(__file__).parent

app = Flask(__name__)
CORS(app)  # 允许跨域（本地调试更方便）

# 全局翻译器实例
translator = None


def get_translator():
    """获取翻译器实例"""
    global translator
    if translator is None:
        translator = ResumeTranslator(model="gpt-4o-mini")
    return translator


@app.route('/translate', methods=['POST'])
@app.route('/api/test_parser/translate', methods=['POST'])
def translate():
    """翻译 Markdown 文本
    
    请求体:
        {
            "text": "原始 Markdown 文本",
            "file_name": "文件名（可选）"
        }
    
    响应:
        {
            "success": true,
            "translated_text": "翻译后的文本",
            "sections_count": 段落数量
        }
    """
    data = request.get_json()
    
    if not data or 'text' not in data:
        return jsonify({
            'success': False,
            'error': '缺少 text 参数'
        }), 400
    
    original_text = data['text']
    file_name = data.get('file_name', 'unknown.md')
    
    # 获取翻译器
    trans = get_translator()
    if not trans.is_available():
        return jsonify({
            'success': False,
            'error': 'LLM 客户端未初始化，请检查环境变量配置'
        }), 500
    
    try:
        # 分割段落（用于计数）
        sections = trans.split_by_headings(original_text)
        
        # 翻译
        translated_text = trans.translate_markdown(original_text)
        
        return jsonify({
            'success': True,
            'translated_text': translated_text,
            'sections_count': len(sections),
            'original_length': len(original_text),
            'translated_length': len(translated_text)
        })
    
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


def _normalize_input_path(p: str) -> Path:
    """将传入路径归一化为 BASE_DIR 下的真实路径。
    支持以下形式：
      - ocr_outputs/Resume.md
      - /test_parser/ocr_outputs/Resume.md
      - test_parser/ocr_outputs/Resume.md
    """
    s = (p or "").strip().lstrip("/").replace("\\", "/")
    if s.startswith("test_parser/"):
        s = s[len("test_parser/"):]
    return BASE_DIR / s


@app.route('/translate_file', methods=['POST'])
@app.route('/api/test_parser/translate_file', methods=['POST'])
def translate_file():
    """翻译文件
    
    请求体:
        {
            "file_path": "相对于 test_parser 的文件路径"
        }
    
    响应:
        {
            "success": true,
            "translated_text": "翻译后的文本",
            "output_path": "保存的译文路径"
        }
    """
    data = request.get_json()
    
    if not data or 'file_path' not in data:
        return jsonify({
            'success': False,
            'error': '缺少 file_path 参数'
        }), 400
    
    file_path = data['file_path']
    
    # 构建完整路径
    input_path = _normalize_input_path(file_path)
    
    if not input_path.exists():
        return jsonify({'success': False, 'error': f'文件不存在: {file_path}'}), 404
    
    # 确定输出路径
    output_dir = BASE_DIR / "ocr_outputs_zh"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / input_path.name
    
    # 读取文件
    try:
        original_text = input_path.read_text(encoding='utf-8')
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'读取文件失败: {e}'
        }), 500
    
    # 获取翻译器
    trans = get_translator()
    if not trans.is_available():
        return jsonify({
            'success': False,
            'error': 'LLM 客户端未初始化，请检查环境变量配置'
        }), 500
    
    try:
        # 翻译
        translated_text = trans.translate_markdown(original_text)
        
        # 保存
        output_path.write_text(translated_text, encoding='utf-8')
        
        return jsonify({
            'success': True,
            'translated_text': translated_text,
            'output_path': f"test_parser/ocr_outputs_zh/{input_path.name}",
            'sections_count': len(trans.split_by_headings(original_text))
        })
    
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    trans = get_translator()
    return jsonify({
        'status': 'ok',
        'translator_available': trans.is_available()
    })


# ============= 静态资源：提供测试查看器与数据 =============

@app.route('/')
def root():
    return redirect('/test_parser/viewer.html', code=302)


@app.route('/test_parser/')
def tp_index():
    return send_from_directory(str(BASE_DIR), 'viewer.html')


@app.route('/test_parser/<path:filename>')
def tp_static(filename: str):
    # 允许访问 test_parser 目录下所有文件（viewer.html、index.json、ocr_outputs/*.md、images/* 等）
    return send_from_directory(str(BASE_DIR), filename)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Test viewer + translation server')
    parser.add_argument('--port', type=int, default=8000, help='Listen port (default: 8000)')
    args = parser.parse_args()

    port = int(args.port or 8000)
    print("🚀 启动测试查看器与翻译服务...")
    print(f"📄 Viewer:    http://localhost:{port}/test_parser/viewer.html")
    print(f"🧠 Translate: POST http://localhost:{port}/api/test_parser/translate_file")
    print("⚠️  请确保已配置 OPENAI_API_KEY 环境变量")
    app.run(host='0.0.0.0', port=port, debug=True)

