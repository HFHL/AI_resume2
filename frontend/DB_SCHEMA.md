# 数据库结构（前端参考版）

本文件为前端开发者准备，概述当前线上数据库的主要表与字段，便于理解接口返回与前端筛选逻辑。以实际线上数据库为准。

## 表概览
- `keywords`：关键词库
- `positions`：职位配置
- `resume_files`：简历原始文件记录（上传/处理状态）
- `resumes`：结构化后的简历信息（供检索/匹配/筛选）
- `tags`：标签库（含“技术类/非技术类”）

---

## keywords
| 列名 | 类型 | 说明 |
|---|---|---|
| id | serial | 主键 |
| keyword | varchar(255) | 关键词内容 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间（有触发器自动更新） |

触发器：`update_keywords_timestamp_trigger`

---

## positions
| 列名 | 类型 | 说明 |
|---|---|---|
| id | serial | 主键 |
| position_name | varchar(255) | 职位名称 |
| position_description | text | 职位描述 |
| position_category | varchar(50) | 职位类别（技术类/非技术类） |
| required_keywords | text[] | 匹配所需关键词数组 |
| match_type | varchar(10) | 匹配方式：`any`/`all`（默认 any） |
| tags | text[] | 关联标签（展示/引导） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间（有触发器自动更新） |

触发器：`update_positions_timestamp_trigger`

---

## resume_files
| 列名 | 类型 | 说明 |
|---|---|---|
| id | serial | 主键 |
| file_name | varchar(255) | 文件名（可能与最终归档名不同） |
| file_path | text | 文件可访问 URL（public）或占位（处理流程写入） |
| uploaded_by | varchar(255) | 上传来源（web/watcher/用户标识） |
| status | varchar(50) | 处理状态：`未处理`/`拉取中`/`处理中`/`已处理`/`处理失败`（约定值） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间（有触发器自动更新） |

索引：`idx_resume_files_file_name`

触发器：`update_resume_files_timestamp_trigger`

---

## resumes
结构化后的简历信息，前端列表、搜索与匹配主要依赖该表。

| 列名 | 类型 | 说明 |
|---|---|---|
| id | serial | 主键 |
| resume_file_id | integer | 关联 `resume_files.id`（可空） |
| name | varchar(255) | 姓名（可能由解析/LLM/文件名兜底） |
| contact_info | text | 联系方式（邮箱/电话拼接） |
| education_degree | varchar(50) | 学历关键字（本科/硕士/博士等） |
| education_school | jsonb | 学校名称数组（示例：["北京邮电大学", "Monash University"]） |
| education_major | varchar(255) | 专业 |
| education_graduation_year | integer | 毕业年份（可空） |
| education_tier | varchar(50) | 最高院校层次（单值）：`985/211/双一流/海外/普通本科/未知` |
| education_tiers | jsonb | 院校层次数组（多值并存）：如 `["985", "海外"]` |
| skills | text[] | 技能数组 |
| work_experience | text[] | 工作经历数组 |
| internship_experience | text[] | 实习经历数组 |
| project_experience | text[] | 项目经历数组 |
| self_evaluation | text | 自我评价 |
| other | text | 其他信息 |
| category | varchar(20) | 简历类别：`技术类/非技术类`（可空） |
| tag_names | text[] | 解析/补充出的标签名数组（用于前端筛选） |
| work_years | integer | 工作年限（0-60，规则或估算） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间（有触发器自动更新） |

外键：`resumes.resume_file_id -> resume_files.id`

索引：`idx_resumes_name`、`idx_resumes_resume_file_id`

触发器：
- `update_resumes_timestamp_trigger`（更新时间）
- `fix_unicode_on_resumes`（调用 `fix_unicode_arrays()`：清洗数组字段 Unicode）

检查约束：
- `resumes_category_chk`：`category` in (`技术类`, `非技术类`) 或 NULL
- `resumes_work_years_chk`：`work_years` 在 0..60 或 NULL

---

## tags
| 列名 | 类型 | 说明 |
|---|---|---|
| id | serial | 主键 |
| tag_name | varchar(255) | 标签名称 |
| category | varchar(50) | 标签类别（技术类/非技术类） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间（有触发器自动更新） |

触发器：`update_tags_timestamp_trigger`

---

## 前端使用要点
- 列表/搜索：`/api/resumes` 返回字段已包含前端卡片展示所需的数组/日期字段；无工作经历时，边缘函数会用实习/项目经历补齐。
- 标签：`/api/resumes/tags` 提供 `id -> tag_names[]` 映射；页面优先使用该接口结果展示与筛选。
- 匹配：职位匹配的逻辑基于职位 `required_keywords` 在简历文本的包含计数（`any`/`all`）。
- 上传：推荐使用 `/api/uploads/test`（Supabase Storage），会写入 `resume_files(status='未处理')`，由后端 watcher 拉取并生成 `resumes` 记录。


