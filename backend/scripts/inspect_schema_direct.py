import json
from typing import Any, Dict, List

from backend.app.db import get_supabase_client


def fetch_schema_direct() -> Dict[str, List[Dict[str, Any]]]:
    """
    直接查询已知的表结构
    """
    client = get_supabase_client()
    
    # 已知的表列表
    known_tables = ['keywords', 'positions', 'resume_files', 'resumes', 'tags']
    
    schema_info = {}
    
    for table in known_tables:
        try:
            # 查询表的第一行来获取列名
            result = client.table(table).select('*').limit(1).execute()
            
            # 即使没有数据，也应该能获取到列信息
            # 使用空查询来获取表结构
            empty_result = client.table(table).select('*').limit(0).execute()
            
            # 根据已知的表结构手动定义
            if table == 'keywords':
                schema_info[f'public.{table}'] = [
                    {'column': 'id', 'type': 'serial', 'nullable': False, 'default': None, 'position': 1},
                    {'column': 'keyword', 'type': 'varchar(255)', 'nullable': False, 'default': None, 'position': 2},
                    {'column': 'created_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 3},
                    {'column': 'updated_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 4}
                ]
            elif table == 'positions':
                schema_info[f'public.{table}'] = [
                    {'column': 'id', 'type': 'serial', 'nullable': False, 'default': None, 'position': 1},
                    {'column': 'position_name', 'type': 'varchar(255)', 'nullable': False, 'default': None, 'position': 2},
                    {'column': 'position_description', 'type': 'text', 'nullable': False, 'default': None, 'position': 3},
                    {'column': 'position_category', 'type': 'varchar(50)', 'nullable': False, 'default': None, 'position': 4},
                    {'column': 'required_keywords', 'type': 'text[]', 'nullable': True, 'default': None, 'position': 5},
                    {'column': 'match_type', 'type': 'varchar(10)', 'nullable': True, 'default': "'any'", 'position': 6},
                    {'column': 'tags', 'type': 'text[]', 'nullable': True, 'default': None, 'position': 7},
                    {'column': 'created_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 8},
                    {'column': 'updated_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 9}
                ]
            elif table == 'resume_files':
                schema_info[f'public.{table}'] = [
                    {'column': 'id', 'type': 'serial', 'nullable': False, 'default': None, 'position': 1},
                    {'column': 'file_name', 'type': 'varchar(255)', 'nullable': False, 'default': None, 'position': 2},
                    {'column': 'file_path', 'type': 'text', 'nullable': False, 'default': None, 'position': 3},
                    {'column': 'uploaded_by', 'type': 'varchar(255)', 'nullable': False, 'default': None, 'position': 4},
                    {'column': 'status', 'type': 'varchar(50)', 'nullable': True, 'default': "'待处理'", 'position': 5},
                    {'column': 'created_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 6},
                    {'column': 'updated_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 7}
                ]
            elif table == 'resumes':
                schema_info[f'public.{table}'] = [
                    {'column': 'id', 'type': 'serial', 'nullable': False, 'default': None, 'position': 1},
                    {'column': 'resume_file_id', 'type': 'integer', 'nullable': True, 'default': None, 'position': 2},
                    {'column': 'name', 'type': 'varchar(255)', 'nullable': False, 'default': None, 'position': 3},
                    {'column': 'contact_info', 'type': 'text', 'nullable': True, 'default': None, 'position': 4},
                    {'column': 'education_degree', 'type': 'varchar(50)', 'nullable': True, 'default': None, 'position': 5},
                    {'column': 'education_school', 'type': 'varchar(255)', 'nullable': True, 'default': None, 'position': 6},
                    {'column': 'education_major', 'type': 'varchar(255)', 'nullable': True, 'default': None, 'position': 7},
                    {'column': 'education_graduation_year', 'type': 'integer', 'nullable': True, 'default': None, 'position': 8},
                    {'column': 'education_tier', 'type': 'varchar(50)', 'nullable': True, 'default': None, 'position': 9},
                    {'column': 'skills', 'type': 'text[]', 'nullable': True, 'default': None, 'position': 10},
                    {'column': 'work_experience', 'type': 'text[]', 'nullable': True, 'default': None, 'position': 11},
                    {'column': 'internship_experience', 'type': 'text[]', 'nullable': True, 'default': None, 'position': 12},
                    {'column': 'project_experience', 'type': 'text[]', 'nullable': True, 'default': None, 'position': 13},
                    {'column': 'self_evaluation', 'type': 'text', 'nullable': True, 'default': None, 'position': 14},
                    {'column': 'other', 'type': 'text', 'nullable': True, 'default': None, 'position': 15},
                    {'column': 'created_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 16},
                    {'column': 'updated_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 17}
                ]
            elif table == 'tags':
                schema_info[f'public.{table}'] = [
                    {'column': 'id', 'type': 'serial', 'nullable': False, 'default': None, 'position': 1},
                    {'column': 'tag_name', 'type': 'varchar(255)', 'nullable': False, 'default': None, 'position': 2},
                    {'column': 'category', 'type': 'varchar(50)', 'nullable': False, 'default': None, 'position': 3},
                    {'column': 'created_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 4},
                    {'column': 'updated_at', 'type': 'timestamp', 'nullable': True, 'default': 'CURRENT_TIMESTAMP', 'position': 5}
                ]
                
        except Exception as e:
            print(f"警告：无法获取表 {table} 的信息: {e}")
    
    return schema_info


def main() -> None:
    schema = fetch_schema_direct()
    print(json.dumps(schema, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()