#!/usr/bin/env python3
"""检查简历数据的编码问题"""

import sys
import json
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.app.db import get_supabase_client


def main():
    client = get_supabase_client()
    
    # 获取最新的几条简历记录
    result = client.table("resumes").select("*").order("id", desc=True).limit(5).execute()
    
    resumes = getattr(result, "data", [])
    
    print("=== 简历数据编码检查 ===\n")
    
    for resume in resumes:
        print(f"ID: {resume.get('id')}")
        print(f"姓名: {resume.get('name')}")
        
        # 重点查看学校字段
        schools = resume.get('education_school')
        print(f"学校 (原始): {schools}")
        
        if schools and isinstance(schools, list):
            print("学校 (解码后):")
            for school in schools:
                print(f"  - {school}")
        
        print("-" * 50)
        print()


if __name__ == "__main__":
    main()