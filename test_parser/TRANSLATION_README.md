# 简历翻译功能使用说明

## 功能概述

这个翻译模块可以将英文简历 Markdown 文件自动翻译为中文，保持格式和专业性。

## 安装依赖

```bash
pip install flask flask-cors
```

或者使用现有的 requirements.txt：

```bash
cd backend
pip install -r requirements.txt
```

## 使用方式

### 方式一：命令行翻译

#### 翻译单个文件

```bash
python test_parser/translate_md.py ocr_outputs/ResumeRyan.md
```

输出将保存到 `ocr_outputs_zh/ResumeRyan.md`

#### 翻译整个目录

```bash
python test_parser/translate_md.py ocr_outputs/
```

所有 `.md` 文件将被翻译并保存到 `ocr_outputs_zh/` 目录

#### 指定输出路径

```bash
python test_parser/translate_md.py input.md -o output.md
```

#### 使用不同的模型

```bash
python test_parser/translate_md.py input.md -m gpt-4
```

#### 强制重新翻译

```bash
python test_parser/translate_md.py input.md --force
```

### 方式二：Web 界面翻译

#### 1. 启动翻译服务器

```bash
python test_parser/translation_server.py
```

服务器将在 `http://localhost:5001` 启动

#### 2. 打开查看器

在浏览器中打开 `test_parser/viewer.html`

#### 3. 使用翻译功能

1. 在文件列表中选择一个文件
2. 点击 Markdown 卡片下方的 "🌐 翻译" 按钮
3. 等待翻译完成（通常需要 10-30 秒）
4. 翻译后的文件会自动保存到 `ocr_outputs_zh/` 目录
5. 点击 "Toggle Original/Translated" 查看译文

## 翻译原理

### 分段策略

翻译器会按照 Markdown 的 `#` 标题分割文档，逐段翻译，这样可以：

- 保持上下文准确性
- 避免 token 限制
- 提高翻译质量
- 更好地处理长文档

### 翻译规则

翻译遵循以下专业规则：

1. **保持专业性**：使用正式、专业的中文表达
2. **保留格式**：Markdown 格式（标题、列表、加粗）完全保留
3. **保留专有名词**：
   - 公司名：Google, AWS, Nexon 等
   - 产品名：MapleStory, React, Python 等
   - 技术术语：API, SDK, KOL, ROI 等
4. **准确翻译职位**：
   - Business Development Manager → 商务发展经理
   - Senior Engineer → 高级工程师
5. **保持数字格式**：60K+, 35%, $45M 等保持原样
6. **逐句直译**：不省略、不总结，保持信息完整

### 翻译质量

- 使用 `gpt-4o-mini` 作为默认模型（性价比高）
- 可切换到 `gpt-4` 以获得更高质量（成本较高）
- 支持自定义翻译提示词

## API 接口

### POST /translate

翻译文本

**请求体：**
```json
{
  "text": "原始 Markdown 文本",
  "file_name": "文件名（可选）"
}
```

**响应：**
```json
{
  "success": true,
  "translated_text": "翻译后的文本",
  "sections_count": 5,
  "original_length": 1234,
  "translated_length": 2345
}
```

### POST /translate_file

翻译文件

**请求体：**
```json
{
  "file_path": "ocr_outputs/ResumeRyan.md"
}
```

**响应：**
```json
{
  "success": true,
  "translated_text": "...",
  "output_path": "ocr_outputs_zh/ResumeRyan.md",
  "sections_count": 5
}
```

### GET /health

健康检查

**响应：**
```json
{
  "status": "ok",
  "translator_available": true
}
```

## 环境变量

翻译功能需要配置以下环境变量：

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选
OPENAI_MODEL=gpt-4o-mini  # 可选，默认值
```

## 常见问题

### Q: 翻译速度很慢？

A: 这是正常的。翻译器会逐段调用 LLM，一个包含多个段落的简历可能需要 20-60 秒。

### Q: 翻译失败或卡住？

A: 检查：
1. OPENAI_API_KEY 是否正确配置
2. 网络连接是否正常
3. API 配额是否充足
4. 查看终端日志获取详细错误信息

### Q: 翻译质量不满意？

A: 可以尝试：
1. 使用 `gpt-4` 模型（`-m gpt-4`）
2. 修改 `translator.py` 中的提示词
3. 手动调整译文

### Q: 部分内容没有翻译？

A: 翻译器会自动检测语言，如果某段主要是中文，会保持不变。

## 目录结构

```
test_parser/
├── translate_md.py           # 命令行翻译工具
├── translation_server.py     # Web API 服务器
├── viewer.html              # 可视化查看器（含翻译按钮）
├── ocr_outputs/            # 原始 OCR 输出（英文）
├── ocr_outputs_zh/         # 翻译输出（中文）
└── TRANSLATION_README.md   # 本文档

backend/app/
└── translator.py           # 翻译核心模块
```

## 示例

### 翻译前（英文）

```markdown
# Business Development Manager
Feb. 2024~ Present
MapleStory Universe, Nexon

Major Achievements
▪ Led 35+ partnerships with major brands
▪ Increased user acquisition by 480K+
▪ Reduced CAC by 22%
```

### 翻译后（中文）

```markdown
# 商务发展经理
2024年2月 ~ 至今
MapleStory Universe, Nexon

主要成就
▪ 主导了35个以上与主要品牌的合作
▪ 增加了48万以上的用户获取
▪ 降低了22%的客户获取成本
```

## 开发

### 修改翻译提示词

编辑 `backend/app/translator.py` 中的 `_build_translation_prompt()` 方法。

### 添加新功能

1. 修改 `ResumeTranslator` 类
2. 更新 `translation_server.py` 的 API 端点
3. 更新 `viewer.html` 的前端交互

## 许可

本模块是 AI_resume2 项目的一部分。

