#!/usr/bin/env python3
"""
查找真正需要迁移的候选记录
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

# 加载环境变量
load_dotenv()

def main():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    supabase: Client = create_client(supabase_url, supabase_key)
    
    print("=== 查找需要迁移的记录 ===")
    
    # 查询有resume_file_id且未删除的记录
    response = supabase.table("resumes") \
        .select("id,name,work_experience,project_experience,work_experience_struct,project_experience_struct") \
        .not_.is_("resume_file_id", "null") \
        .eq("is_deleted", False) \
        .limit(500) \
        .execute()
    
    print(f"查询到的记录数量: {len(getattr(response, 'data', []))}")
    
    work_candidates = []
    project_candidates = []
    
    for item in getattr(response, "data", []):
        # 检查工作经验迁移需求
        has_work_text = item.get("work_experience") and len(item["work_experience"]) > 0
        has_work_struct = item.get("work_experience_struct") is not None
        
        # 检查项目经验迁移需求
        has_project_text = item.get("project_experience") and len(item["project_experience"]) > 0
        has_project_struct = item.get("project_experience_struct") is not None
        
        if has_work_text and not has_work_struct:
            work_candidates.append(item)
            print(f"\n工作经验候选: {item['id']} - {item['name']}")
            print(f"  work_experience: {item['work_experience'][:2] if item['work_experience'] else 'None'}")
            print(f"  work_experience_struct: {has_work_struct}")
        
        if has_project_text and not has_project_struct:
            project_candidates.append(item)
            print(f"\n项目经验候选: {item['id']} - {item['name']}")
            print(f"  project_experience: {item['project_experience'][:2] if item['project_experience'] else 'None'}")
            print(f"  project_experience_struct: {has_project_struct}")
    
    print(f"\n=== 汇总 ===")
    print(f"需要工作经验迁移的记录: {len(work_candidates)}")
    print(f"需要项目经验迁移的记录: {len(project_candidates)}")
    
    # 找出真正需要处理的记录（两种经验至少有一种需要迁移）
    all_candidates = set()
    for item in work_candidates:
        all_candidates.add(item['id'])
    for item in project_candidates:
        all_candidates.add(item['id'])
    
    print(f"总计需要迁移的记录: {len(all_candidates)}")
    
    if all_candidates:
        print(f"\n候选记录IDs: {sorted(list(all_candidates))}")

if __name__ == "__main__":
    main()