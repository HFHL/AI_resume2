## Backend 使用说明

### 环境配置
1. 复制 `backend/.env.example` 到以下任一位置并改名为 `.env`：
   - 项目根目录：`.env`（推荐），或
   - `backend/.env`
2. 在 Supabase 控制台的 Database -> Connection info 中填写以下变量：
   - `SUPABASE_DB_HOST`
   - `SUPABASE_DB_PORT`
   - `SUPABASE_DB_NAME`
   - `SUPABASE_DB_USER`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_DB_SSLMODE`（通常为 `require`）

### 安装依赖（Windows PowerShell）
```powershell
python -m pip install -r backend/requirements.txt
```

### 运行测试（连接数据库并打印表结构）
```powershell
python -m pytest -s backend/tests/test_db_schema.py
```

### 启动后端
```powershell
python -m uvicorn backend.app.main:app --reload --port 8000
```

### 直接查看表结构（脚本）
```powershell
python -m backend.scripts.inspect_schema
```
