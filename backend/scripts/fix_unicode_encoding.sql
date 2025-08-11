-- 修复现有数据中的Unicode编码问题
-- 该脚本将所有Unicode转义序列转换回正常的UTF-8字符

-- 1. 先查看受影响的数据
SELECT 
    id,
    name,
    education_school,
    jsonb_pretty(education_school) as education_school_pretty
FROM resumes
WHERE education_school::text LIKE '%\\u%'
ORDER BY id DESC;

-- 2. 创建一个函数来解码Unicode转义序列
CREATE OR REPLACE FUNCTION decode_unicode_escapes(input_text text)
RETURNS text AS $$
DECLARE
    result text;
BEGIN
    -- PostgreSQL内置函数可以处理Unicode转义
    -- 使用E''语法来解释转义序列
    EXECUTE format('SELECT E''%s''', replace(input_text, '\u', '\\u')) INTO result;
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- 如果解码失败，返回原始文本
        RETURN input_text;
END;
$$ LANGUAGE plpgsql;

-- 3. 创建一个函数来处理JSONB数组中的Unicode转义
CREATE OR REPLACE FUNCTION decode_jsonb_array_unicode(input_jsonb jsonb)
RETURNS jsonb AS $$
DECLARE
    result jsonb = '[]'::jsonb;
    elem text;
    decoded_elem text;
BEGIN
    -- 如果不是数组，直接返回
    IF jsonb_typeof(input_jsonb) != 'array' THEN
        RETURN input_jsonb;
    END IF;
    
    -- 遍历数组中的每个元素
    FOR elem IN SELECT jsonb_array_elements_text(input_jsonb)
    LOOP
        -- 尝试解码Unicode转义
        IF elem LIKE '%\u%' THEN
            decoded_elem := decode_unicode_escapes(elem);
        ELSE
            decoded_elem := elem;
        END IF;
        
        -- 添加到结果数组
        result := result || to_jsonb(decoded_elem);
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. 更新受影响的记录
UPDATE resumes
SET 
    education_school = decode_jsonb_array_unicode(education_school),
    skills = decode_jsonb_array_unicode(skills),
    work_experience = decode_jsonb_array_unicode(work_experience),
    internship_experience = decode_jsonb_array_unicode(internship_experience),
    project_experience = decode_jsonb_array_unicode(project_experience)
WHERE 
    education_school::text LIKE '%\\u%'
    OR skills::text LIKE '%\\u%'
    OR work_experience::text LIKE '%\\u%'
    OR internship_experience::text LIKE '%\\u%'
    OR project_experience::text LIKE '%\\u%';

-- 5. 验证修复结果
SELECT 
    id,
    name,
    education_school,
    skills
FROM resumes
WHERE id IN (14, 13, 12, 16)
ORDER BY id DESC;

-- 6. 为了防止未来的数据再次出现这个问题，创建一个触发器
CREATE OR REPLACE FUNCTION fix_unicode_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- 检查并修复各个JSONB数组字段
    IF NEW.education_school IS NOT NULL AND NEW.education_school::text LIKE '%\\u%' THEN
        NEW.education_school := decode_jsonb_array_unicode(NEW.education_school);
    END IF;
    
    IF NEW.skills IS NOT NULL AND NEW.skills::text LIKE '%\\u%' THEN
        NEW.skills := decode_jsonb_array_unicode(NEW.skills);
    END IF;
    
    IF NEW.work_experience IS NOT NULL AND NEW.work_experience::text LIKE '%\\u%' THEN
        NEW.work_experience := decode_jsonb_array_unicode(NEW.work_experience);
    END IF;
    
    IF NEW.internship_experience IS NOT NULL AND NEW.internship_experience::text LIKE '%\\u%' THEN
        NEW.internship_experience := decode_jsonb_array_unicode(NEW.internship_experience);
    END IF;
    
    IF NEW.project_experience IS NOT NULL AND NEW.project_experience::text LIKE '%\\u%' THEN
        NEW.project_experience := decode_jsonb_array_unicode(NEW.project_experience);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. 创建触发器，在插入或更新时自动修复Unicode编码
DROP TRIGGER IF EXISTS fix_unicode_before_insert_update ON resumes;
CREATE TRIGGER fix_unicode_before_insert_update
    BEFORE INSERT OR UPDATE ON resumes
    FOR EACH ROW
    EXECUTE FUNCTION fix_unicode_on_insert();

-- 8. 清理函数（可选，如果不想保留这些函数）
-- DROP FUNCTION IF EXISTS decode_unicode_escapes(text);
-- DROP FUNCTION IF EXISTS decode_jsonb_array_unicode(jsonb);
-- DROP FUNCTION IF EXISTS fix_unicode_on_insert();