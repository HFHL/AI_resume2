# 简历结构化字段迁移工具

该工具用于将简历表中的文本数组字段（work_experience, project_experience）转换为结构化的JSON字段（work_experience_struct, project_experience_struct）。

## 功能特点

- ✅ 自动识别需要迁移的记录（有resume_file_id但缺少结构化字段）
- ✅ 使用LLM智能解析文本数组为结构化数据
- ✅ 支持测试模式（只分析不写入数据库）
- ✅ 详细的日志和错误处理
- ✅ 批量处理和进度跟踪

## 安装依赖

```bash
cd scripts
pip install -r requirements.txt
```

## 配置

1. 复制配置文件模板：
```bash
cp config.env.example config.env
```

2. 编辑 `config.env` 文件，填入正确的配置：
```env
DATABASE_URL=postgresql://username:password@localhost:5432/your_database
OPENAI_API_KEY=sk-your-openai-api-key
```

## 使用方法

### 1. 测试模式（推荐先运行）

```bash
python migrate_to_structured.py
```

测试模式会：
- 查询需要迁移的记录
- 调用LLM分析文本
- 打印建议的结构化数据
- **不会**写入数据库

### 2. 执行模式

确认测试结果无误后，修改脚本中的 `test_mode=False`：

```python
migrator = ResumeStructureMigrator(
    db_connection_string=DB_CONNECTION,
    openai_api_key=OPENAI_API_KEY,
    test_mode=False  # 改为 False
)
```

然后运行：
```bash
python migrate_to_structured.py
```

## 输出示例

```
==========================================
简历ID: 12345
姓名: 张三
需要更新的字段: work_experience_struct, project_experience_struct

工作经验结构化建议:
[
  {
    "start": "2022-06",
    "end": "2024-03",
    "company": "阿里巴巴云智能集团",
    "title": "B端商业技术工程师",
    "title_en": null,
    "description": "负责B端商业产品的技术开发",
    "description_en": null,
    "details": [
      "参与云产品架构设计",
      "优化系统性能，提升用户体验"
    ],
    "details_en": null
  }
]

项目经验结构化建议:
[
  {
    "start": "2023-01",
    "end": "2023-06", 
    "company": "北京烛逢国际旅行公司",
    "title": "产品经理&活动策划",
    "title_en": null,
    "description": "负责旅行产品设计和活动策划",
    "description_en": null,
    "details": [
      "设计旅行产品方案",
      "组织线下活动"
    ],
    "details_en": null
  }
]
```

## 结构化数据格式

转换后的JSON结构包含以下字段：

```json
{
  "start": "开始时间 (YYYY-MM格式)",
  "end": "结束时间 (YYYY-MM格式，至今为null)", 
  "company": "公司名称",
  "title": "职位/项目名称",
  "title_en": "英文职位名（可选）",
  "description": "简要描述", 
  "description_en": "英文描述（可选）",
  "details": ["详细内容数组"],
  "details_en": ["英文详细内容（可选）"]
}
```

## 注意事项

1. **先测试再执行**：务必先运行测试模式确认结果
2. **备份数据**：执行前建议备份数据库
3. **API费用**：LLM调用会产生费用，建议小批量测试
4. **网络要求**：需要稳定的网络连接访问OpenAI API
5. **权限要求**：需要数据库写入权限（执行模式）

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查DATABASE_URL格式是否正确
   - 确认数据库服务是否运行
   - 验证用户名密码和权限

2. **OpenAI API调用失败**
   - 检查API密钥是否有效
   - 确认网络连接正常
   - 检查API配额和余额

3. **JSON解析错误**
   - LLM偶尔返回格式不正确的数据
   - 脚本会跳过错误记录并继续处理
   - 检查日志查看具体错误信息

### 日志查看

脚本会输出详细日志，包括：
- 处理进度
- 错误信息  
- 成功/失败统计

## 扩展功能

可以根据需要修改脚本来支持：
- 不同的LLM模型
- 自定义批次大小
- 特定记录范围处理
- 其他字段的结构化转换