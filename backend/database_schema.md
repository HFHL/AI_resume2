# 数据库表结构文档

## 表概览

本项目包含以下数据库表：
- `keywords` - 关键词表
- `positions` - 职位表
- `resume_files` - 简历文件表
- `resumes` - 简历信息表
- `tags` - 标签表

## 详细表结构

### 1. keywords（关键词表）

| 列名 | 数据类型 | 是否可空 | 默认值 | 说明 |
|------|----------|----------|---------|------|
| id | serial | NOT NULL | - | 主键，自增ID |
| keyword | varchar(255) | NOT NULL | - | 关键词内容 |
| created_at | timestamp | NULL | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | timestamp | NULL | CURRENT_TIMESTAMP | 更新时间 |

**触发器：** `update_keywords_timestamp_trigger` - 自动更新 updated_at 字段

### 2. positions（职位表）

| 列名 | 数据类型 | 是否可空 | 默认值 | 说明 |
|------|----------|----------|---------|------|
| id | serial | NOT NULL | - | 主键，自增ID |
| position_name | varchar(255) | NOT NULL | - | 职位名称 |
| position_description | text | NOT NULL | - | 职位描述 |
| position_category | varchar(50) | NOT NULL | - | 职位类别 |
| required_keywords | text[] | NULL | - | 必需关键词数组 |
| match_type | varchar(10) | NULL | 'any' | 匹配类型 |
| tags | text[] | NULL | - | 标签数组 |
| created_at | timestamp | NULL | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | timestamp | NULL | CURRENT_TIMESTAMP | 更新时间 |

**触发器：** `update_positions_timestamp_trigger` - 自动更新 updated_at 字段

### 3. resume_files（简历文件表）

| 列名 | 数据类型 | 是否可空 | 默认值 | 说明 |
|------|----------|----------|---------|------|
| id | serial | NOT NULL | - | 主键，自增ID |
| file_name | varchar(255) | NOT NULL | - | 文件名 |
| file_path | text | NOT NULL | - | 文件路径 |
| uploaded_by | varchar(255) | NOT NULL | - | 上传者 |
| status | varchar(50) | NULL | '待处理' | 处理状态 |
| created_at | timestamp | NULL | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | timestamp | NULL | CURRENT_TIMESTAMP | 更新时间 |

**触发器：** `update_resume_files_timestamp_trigger` - 自动更新 updated_at 字段

**索引：** `idx_resume_files_file_name`（btree，file_name）

**状态枚举（约定，未做枚举约束）：**
- `未处理`（前端上传完成后初始状态，等待后端拉取）
- `拉取中`（后端 watcher 抢占并下载中）
- `处理中`（OCR/解析中）
- `已处理`（处理完成）
- `处理失败`

### 4. resumes（简历信息表）

| 列名 | 数据类型 | 是否可空 | 默认值 | 说明 |
|------|----------|----------|---------|------|
| id | serial | NOT NULL | - | 主键，自增ID |
| resume_file_id | integer | NULL | - | 关联的简历文件ID |
| name | varchar(255) | NOT NULL | - | 姓名 |
| contact_info | text | NULL | - | 联系信息 |
| education_degree | varchar(50) | NULL | - | 学历 |
| education_school | jsonb | NULL | - | 学校名称数组（JSONB 字符串数组），例如 ["北京邮电大学", "Monash University"] |
| education_major | varchar(255) | NULL | - | 专业 |
| education_graduation_year | integer | NULL | - | 毕业年份 |
| education_tier | varchar(50) | NULL | - | 学校层次（单值汇总，如：985/211/双一流/海外/普通本科/未知） |
| education_tiers | jsonb | NULL | - | 学校层次数组（多值并存），如 ["985", "海外"] |
| skills | text[] | NULL | - | 技能数组（字符串数组） |
| work_experience | text[] | NULL | - | 工作经历数组（字符串数组） |
| internship_experience | text[] | NULL | - | 实习经历数组（字符串数组） |
| project_experience | text[] | NULL | - | 项目经历数组（字符串数组） |
| self_evaluation | text | NULL | - | 自我评价 |
| other | text | NULL | - | 其他信息 |
| created_at | timestamp | NULL | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | timestamp | NULL | CURRENT_TIMESTAMP | 更新时间 |
| category | varchar(20) | NULL | - | 简历类别（技术类/非技术类） |
| tag_names | text[] | NULL | - | 解析出的标签名称数组 |
| work_years | integer | NULL | - | 规则/估算得到的工作年限（0-60） |

**外键约束：** `resumes_resume_file_id_fkey` - resume_file_id 引用 resume_files(id)

**触发器：**
- `update_resumes_timestamp_trigger` - 自动更新 updated_at 字段
- `fix_unicode_on_resumes`（调用 `fix_unicode_arrays()`）- 规范化数组字段中的 Unicode 编码，在 INSERT/UPDATE 前执行

**检查约束：**
- `resumes_category_chk`：`category` 仅允许 `技术类`/`非技术类` 或 NULL
- `resumes_work_years_chk`：`work_years` 必须在 0 到 60 之间或为 NULL

**索引：**
- `idx_resumes_name`（btree，name）
- `idx_resumes_resume_file_id`（btree，resume_file_id）

### 5. tags（标签表）

| 列名 | 数据类型 | 是否可空 | 默认值 | 说明 |
|------|----------|----------|---------|------|
| id | serial | NOT NULL | - | 主键，自增ID |
| tag_name | varchar(255) | NOT NULL | - | 标签名称 |
| category | varchar(50) | NOT NULL | - | 标签类别 |
| created_at | timestamp | NULL | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | timestamp | NULL | CURRENT_TIMESTAMP | 更新时间 |

**触发器：** `update_tags_timestamp_trigger` - 自动更新 updated_at 字段

## 数据关系

1. **resumes** 表通过 `resume_file_id` 外键关联到 **resume_files** 表
2. **positions** 表的 `required_keywords` 和 `tags` 字段使用数组类型存储多个值
3. **resumes** 表的 `skills`、`work_experience`、`internship_experience`、`project_experience` 字段使用数组类型存储多个值

## 触发器说明

所有表都配置了相同模式的触发器，用于自动更新 `updated_at` 字段：
- 触发器在每次 UPDATE 操作前执行
- 调用对应的时间戳更新函数（如 `update_keywords_timestamp()`）
- 确保 `updated_at` 字段始终反映最后修改时间