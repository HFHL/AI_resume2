#!/usr/bin/env python3
"""
简历结构化字段迁移脚本

该脚本分析有 resume_file_id 但缺少结构化字段的简历记录，
使用 LLM 将文本数组转换为结构化 JSON 格式。

运行模式：
1. 测试模式：只分析和打印建议，不写入数据库
2. 执行模式：实际更新数据库记录
"""

import os
import json
import openai
from typing import List, Dict, Any
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

# 加载环境变量
load_dotenv()

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ResumeStructureMigrator:
    def __init__(self, test_mode: bool = True):
        """
        初始化迁移器
        
        Args:
            test_mode: 是否为测试模式（不写入数据库）
        """
        # 从环境变量获取Supabase配置
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("缺少SUPABASE_URL或SUPABASE_KEY环境变量")
        
        # 创建Supabase客户端
        self.supabase: Client = create_client(supabase_url, supabase_key)
        
        # 配置OpenAI客户端
        openai_api_key = os.getenv("OPENAI_API_KEY")
        openai_base_url = os.getenv("OPENAI_BASE_URL")
        
        if not openai_api_key:
            raise ValueError("缺少OPENAI_API_KEY环境变量")
        
        self.openai_client = openai.OpenAI(
            api_key=openai_api_key,
            base_url=openai_base_url if openai_base_url else None
        )
        self.test_mode = test_mode
        
        logger.info(f"初始化完成 - 测试模式: {test_mode}")
        logger.info(f"Supabase URL: {supabase_url}")
        logger.info(f"OpenAI Base URL: {openai_base_url or 'default'}")
        
    def get_candidates(self) -> List[Dict[str, Any]]:
        """
        获取需要迁移的简历记录
        
        Returns:
            需要处理的简历记录列表
        """
        try:
            # 分两步查询：先查简历，再查文件内容
            # 按ID降序排列来获取较新的记录（这些更可能需要迁移）
            response = self.supabase.table("resumes") \
                .select("id,name,work_experience,internship_experience,project_experience,work_experience_struct,project_experience_struct,resume_file_id") \
                .not_.is_("resume_file_id", "null") \
                .eq("is_deleted", False) \
                .order("id", desc=True) \
                .limit(500) \
                .execute()
            
            results = []
            for item in getattr(response, "data", []) or []:
                # 检查是否需要迁移
                needs_work_migration = (
                    item.get("work_experience") and 
                    len(item["work_experience"]) > 0 and 
                    not item.get("work_experience_struct")
                )
                needs_project_migration = (
                    item.get("project_experience") and 
                    len(item["project_experience"]) > 0 and 
                    not item.get("project_experience_struct")
                )
                
                if needs_work_migration or needs_project_migration:
                    # 获取对应的简历文件内容
                    file_response = self.supabase.table("resume_files") \
                        .select("ocr_md") \
                        .eq("id", item["resume_file_id"]) \
                        .limit(1) \
                        .execute()
                    
                    file_data = getattr(file_response, "data", [])
                    ocr_md = file_data[0]["ocr_md"] if file_data else None
                    
                    flat_item = {
                        "id": item["id"],
                        "name": item["name"],
                        "work_experience": item.get("work_experience"),
                        "internship_experience": item.get("internship_experience"),
                        "project_experience": item.get("project_experience"),
                        "work_experience_struct": item.get("work_experience_struct"),
                        "project_experience_struct": item.get("project_experience_struct"),
                        "ocr_md": ocr_md
                    }
                    results.append(flat_item)
            
            logger.info(f"找到 {len(results)} 条需要迁移的记录")
            return results
            
        except Exception as e:
            logger.error(f"查询数据库失败: {e}")
            return []
    
    def parse_experience_with_llm(self, experience_array: List[str], experience_type: str, resume_md: str) -> List[Dict[str, Any]]:
        """
        使用 LLM 解析经验数组为结构化数据
        
        Args:
            experience_array: 经验文本数组
            experience_type: 经验类型 (work/project)
            resume_md: 简历原始 markdown 文本
            
        Returns:
            结构化的经验数据列表
        """
        if not experience_array:
            return []
            
        prompt = f"""
请将以下{experience_type}经验文本转换为结构化JSON格式。

经验文本数组: {json.dumps(experience_array, ensure_ascii=False, indent=2)}

简历原文参考: 
{resume_md[:2000] if resume_md else "无原文"}

请输出JSON格式，每个经验条目包含以下字段：
{{
    "start": "开始时间 (YYYY-MM格式，如2023-01)",
    "end": "结束时间 (YYYY-MM格式，如2024-06，如果是至今则为null)",
    "company": "公司名称",
    "title": "职位/项目名称",
    "title_en": "职位/项目英文名称（如果有）",
    "description": "简要描述",
    "description_en": "英文描述（如果有）",
    "details": ["详细工作内容数组"],
    "details_en": ["英文详细内容数组（如果有）"]
}}

注意：
1. 如果原文没有明确的时间信息，start和end可以为null
2. 如果没有英文信息，*_en 字段可以为null
3. 尽量从简历原文中提取更详细的信息
4. 输出必须是有效的JSON数组格式
5. 如果无法解析某条经验，该条目的必填字段至少要有company和title

只返回JSON数组，不要其他文字说明：
"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "你是一个专业的简历解析助手，擅长将非结构化文本转换为结构化数据。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            content = response.choices[0].message.content.strip()
            
            # 清理LLM返回的内容，移除markdown代码块标记
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # 尝试解析JSON
            try:
                structured_data = json.loads(content)
                if isinstance(structured_data, list):
                    return structured_data
                else:
                    logger.warning(f"LLM返回的不是数组格式: {content}")
                    return []
            except json.JSONDecodeError as e:
                logger.error(f"JSON解析失败: {e}, 内容: {content}")
                return []
                
        except Exception as e:
            logger.error(f"LLM调用失败: {e}")
            return []
    
    def process_resume(self, resume: Dict[str, Any]) -> Dict[str, Any]:
        """
        处理单个简历记录
        
        Args:
            resume: 简历记录
            
        Returns:
            处理结果，包含建议的更新数据
        """
        result = {
            "id": resume["id"],
            "name": resume["name"],
            "work_experience_struct": None,
            "project_experience_struct": None,
            "updates_needed": []
        }
        
        # 处理工作经验
        if resume.get("work_experience") and not resume.get("work_experience_struct"):
            logger.info(f"处理简历 {resume['id']} 的工作经验...")
            work_struct = self.parse_experience_with_llm(
                resume["work_experience"], 
                "工作", 
                resume.get("ocr_md", "")
            )
            if work_struct:
                result["work_experience_struct"] = work_struct
                result["updates_needed"].append("work_experience_struct")
        
        # 处理项目经验
        if resume.get("project_experience") and not resume.get("project_experience_struct"):
            logger.info(f"处理简历 {resume['id']} 的项目经验...")
            project_struct = self.parse_experience_with_llm(
                resume["project_experience"], 
                "项目", 
                resume.get("ocr_md", "")
            )
            if project_struct:
                result["project_experience_struct"] = project_struct
                result["updates_needed"].append("project_experience_struct")
        
        return result
    
    def update_database(self, resume_id: int, updates: Dict[str, Any]) -> bool:
        """
        更新数据库记录
        
        Args:
            resume_id: 简历ID
            updates: 要更新的字段
            
        Returns:
            是否更新成功
        """
        if self.test_mode:
            logger.info(f"测试模式：跳过数据库更新 resume_id={resume_id}")
            return True
            
        try:
            update_data = {}
            
            if "work_experience_struct" in updates:
                update_data["work_experience_struct"] = updates["work_experience_struct"]
            
            if "project_experience_struct" in updates:
                update_data["project_experience_struct"] = updates["project_experience_struct"]
            
            if not update_data:
                return True
            
            # 使用Supabase客户端更新，参考parse_worker.py的模式
            response = self.supabase.table("resumes") \
                .update(update_data) \
                .eq("id", resume_id) \
                .execute()
            
            if getattr(response, "data", None):
                logger.info(f"成功更新简历 {resume_id}")
                return True
            else:
                logger.error(f"更新简历 {resume_id} 失败：无数据返回")
                return False
                    
        except Exception as e:
            logger.error(f"更新数据库失败 resume_id={resume_id}: {e}")
            return False
    
    def run_migration(self):
        """
        执行迁移过程
        """
        logger.info(f"开始迁移过程 - 模式: {'测试' if self.test_mode else '执行'}")
        
        candidates = self.get_candidates()
        
        if not candidates:
            logger.info("没有需要迁移的记录")
            return
        
        results = []
        
        for resume in candidates:
            logger.info(f"处理简历: {resume['id']} - {resume['name']}")
            
            try:
                result = self.process_resume(resume)
                results.append(result)
                
                # 打印处理结果
                print(f"\n{'='*60}")
                print(f"简历ID: {result['id']}")
                print(f"姓名: {result['name']}")
                print(f"需要更新的字段: {', '.join(result['updates_needed']) if result['updates_needed'] else '无'}")
                
                if result.get("work_experience_struct"):
                    print(f"\n工作经验结构化建议:")
                    print(json.dumps(result["work_experience_struct"], ensure_ascii=False, indent=2))
                
                if result.get("project_experience_struct"):
                    print(f"\n项目经验结构化建议:")
                    print(json.dumps(result["project_experience_struct"], ensure_ascii=False, indent=2))
                
                # 如果不是测试模式，执行数据库更新
                if not self.test_mode and result["updates_needed"]:
                    update_data = {}
                    if result.get("work_experience_struct"):
                        update_data["work_experience_struct"] = result["work_experience_struct"]
                    if result.get("project_experience_struct"):
                        update_data["project_experience_struct"] = result["project_experience_struct"]
                    
                    success = self.update_database(result["id"], update_data)
                    print(f"数据库更新: {'成功' if success else '失败'}")
                
            except Exception as e:
                logger.error(f"处理简历 {resume['id']} 时出错: {e}")
                continue
        
        # 打印汇总
        print(f"\n{'='*60}")
        print(f"迁移完成汇总:")
        print(f"总处理数量: {len(results)}")
        print(f"需要更新数量: {len([r for r in results if r['updates_needed']])}")
        print(f"工作经验更新: {len([r for r in results if 'work_experience_struct' in r['updates_needed']])}")
        print(f"项目经验更新: {len([r for r in results if 'project_experience_struct' in r['updates_needed']])}")


def main():
    """
    主函数 - 配置和运行迁移
    """
    # 运行测试模式
    migrator = ResumeStructureMigrator(
        test_mode=False  # 设置为 False 来实际执行数据库更新
    )
    
    try:
        migrator.run_migration()
    except KeyboardInterrupt:
        logger.info("用户中断执行")
    except Exception as e:
        logger.error(f"迁移过程出错: {e}")
        raise


if __name__ == "__main__":
    main()