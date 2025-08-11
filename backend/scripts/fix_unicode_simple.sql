-- 简化版：修复Unicode编码问题
-- 使用PostgreSQL的内置JSON函数处理

-- 1. 查看当前受影响的数据
SELECT 
    id,
    name,
    education_school::text as education_school_raw,
    education_school #>> '{}' as education_school_decoded
FROM resumes
WHERE education_school IS NOT NULL
ORDER BY id DESC
LIMIT 10;

-- 2. 修复方法：使用 #>> 操作符获取解码后的文本
-- 这个操作符会自动将Unicode转义序列转换为实际字符

-- 更新education_school字段
UPDATE resumes
SET education_school = (
    SELECT jsonb_agg(elem #>> '{}')
    FROM jsonb_array_elements(education_school) elem
)
WHERE education_school IS NOT NULL 
  AND education_school::text LIKE '%\\u%';

-- 更新skills字段
UPDATE resumes
SET skills = (
    SELECT jsonb_agg(elem #>> '{}')
    FROM jsonb_array_elements(skills) elem
)
WHERE skills IS NOT NULL 
  AND skills::text LIKE '%\\u%';

-- 更新work_experience字段
UPDATE resumes
SET work_experience = (
    SELECT jsonb_agg(elem #>> '{}')
    FROM jsonb_array_elements(work_experience) elem
)
WHERE work_experience IS NOT NULL 
  AND work_experience::text LIKE '%\\u%';

-- 更新internship_experience字段
UPDATE resumes
SET internship_experience = (
    SELECT jsonb_agg(elem #>> '{}')
    FROM jsonb_array_elements(internship_experience) elem
)
WHERE internship_experience IS NOT NULL 
  AND internship_experience::text LIKE '%\\u%';

-- 更新project_experience字段  
UPDATE resumes
SET project_experience = (
    SELECT jsonb_agg(elem #>> '{}')
    FROM jsonb_array_elements(project_experience) elem
)
WHERE project_experience IS NOT NULL 
  AND project_experience::text LIKE '%\\u%';

-- 3. 验证修复结果
SELECT 
    id,
    name,
    education_school
FROM resumes
WHERE id IN (14, 13, 12, 16)
ORDER BY id DESC;

-- 4. 对于未来的数据，最好的解决方案是在应用层处理
-- 但如果必须在数据库层处理，可以创建一个视图来自动解码

CREATE OR REPLACE VIEW resumes_decoded AS
SELECT 
    id,
    resume_file_id,
    name,
    contact_info,
    education_degree,
    -- 解码education_school数组
    CASE 
        WHEN education_school IS NOT NULL THEN
            (SELECT jsonb_agg(elem #>> '{}') FROM jsonb_array_elements(education_school) elem)
        ELSE NULL
    END as education_school,
    education_major,
    education_graduation_year,
    education_tier,
    -- 解码skills数组
    CASE 
        WHEN skills IS NOT NULL THEN
            (SELECT jsonb_agg(elem #>> '{}') FROM jsonb_array_elements(skills) elem)
        ELSE NULL
    END as skills,
    -- 解码work_experience数组
    CASE 
        WHEN work_experience IS NOT NULL THEN
            (SELECT jsonb_agg(elem #>> '{}') FROM jsonb_array_elements(work_experience) elem)
        ELSE NULL
    END as work_experience,
    -- 解码internship_experience数组
    CASE 
        WHEN internship_experience IS NOT NULL THEN
            (SELECT jsonb_agg(elem #>> '{}') FROM jsonb_array_elements(internship_experience) elem)
        ELSE NULL
    END as internship_experience,
    -- 解码project_experience数组
    CASE 
        WHEN project_experience IS NOT NULL THEN
            (SELECT jsonb_agg(elem #>> '{}') FROM jsonb_array_elements(project_experience) elem)
        ELSE NULL
    END as project_experience,
    self_evaluation,
    other,
    created_at,
    updated_at
FROM resumes;