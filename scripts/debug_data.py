#!/usr/bin/env python3
"""
调试脚本：查看数据库中的简历数据
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
    
    print("=== 调试简历数据 ===")
    
    # 1. 查看总数据量
    response = supabase.table("resumes").select("id", count="exact").execute()
    print(f"总简历数量: {getattr(response, 'count', 'N/A')}")
    
    # 2. 查看有resume_file_id的数量
    response = supabase.table("resumes").select("id", count="exact").not_.is_("resume_file_id", "null").execute()
    print(f"有resume_file_id的数量: {getattr(response, 'count', 'N/A')}")
    
    # 3. 查看未删除的数量
    response = supabase.table("resumes").select("id", count="exact").eq("is_deleted", False).execute()
    print(f"未删除的数量: {getattr(response, 'count', 'N/A')}")
    
    # 4. 查看前几条记录的详细信息
    response = supabase.table("resumes") \
        .select("id,name,work_experience,project_experience,work_experience_struct,project_experience_struct,resume_file_id,is_deleted") \
        .limit(5) \
        .execute()
    
    print("\n=== 前5条记录详情 ===")
    for i, item in enumerate(getattr(response, "data", []), 1):
        print(f"\n记录 {i}:")
        print(f"  ID: {item['id']}")
        print(f"  姓名: {item['name']}")
        print(f"  resume_file_id: {item['resume_file_id']}")
        print(f"  is_deleted: {item['is_deleted']}")
        print(f"  work_experience: {item['work_experience']}")
        print(f"  project_experience: {item['project_experience']}")
        print(f"  work_experience_struct: {item['work_experience_struct']}")
        print(f"  project_experience_struct: {item['project_experience_struct']}")
    
    # 5. 查看符合条件的记录
    response = supabase.table("resumes") \
        .select("id,name,work_experience,project_experience,work_experience_struct,project_experience_struct") \
        .not_.is_("resume_file_id", "null") \
        .eq("is_deleted", False) \
        .limit(10) \
        .execute()
    
    print(f"\n=== 符合基本条件的记录数量: {len(getattr(response, 'data', []))}")
    
    candidates = []
    for item in getattr(response, "data", []):
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
            candidates.append(item)
            print(f"\n候选记录: {item['id']} - {item['name']}")
            print(f"  需要工作经验迁移: {needs_work_migration}")
            print(f"  需要项目经验迁移: {needs_project_migration}")
            print(f"  work_experience: {item.get('work_experience')}")
            print(f"  project_experience: {item.get('project_experience')}")
    
    print(f"\n最终需要迁移的记录数量: {len(candidates)}")

if __name__ == "__main__":
    main()