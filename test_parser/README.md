# 简历解析测试环境

独立的简历解析测试环境，不依赖 Supabase 数据库。

## 目录结构

```
test_parser/
├── README.md           # 说明文档
├── test_inputs/        # 测试输入文件（PDF或MD）
├── test_outputs/       # 测试输出结果（JSON）
├── ocr_outputs/        # OCR提取的markdown文件
├── test_parser.py      # 主测试脚本
└── requirements.txt    # 依赖包
```

## 使用方法

### 1. 安装依赖
```bash
pip install -r requirements.txt
```

### 2. 准备测试文件
将简历文件放入 `test_inputs/` 目录：
- PDF 文件：将自动进行 OCR
- MD 文件：直接解析

### 3. 运行测试
```bash
python test_parser.py
```

或测试单个文件：
```bash
python test_parser.py test_inputs/某简历.pdf
```

### 4. 查看结果
- 解析结果保存在 `test_outputs/` 目录
- OCR 结果保存在 `ocr_outputs/` 目录
- 控制台会显示详细的解析信息

## 配置

在 `.env` 文件中配置（可选）：
```
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

## 功能特性

- ✅ 支持 PDF/MD 文件解析
- ✅ 自动 OCR 提取
- ✅ 详细的解析过程展示
- ✅ JSON 格式输出结果
- ✅ 不依赖数据库
- ✅ 可视化对比文件名和解析结果

