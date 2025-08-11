# AI简历匹配系统 - 项目结构

## 项目概述
AI简历匹配系统是一个全栈Web应用，用于管理简历、职位，并通过AI技术进行智能匹配。

## 技术栈
- **前端**: React 18 + TypeScript + Vite + React Router
- **后端**: FastAPI + Uvicorn + Python 3.x
- **数据库**: Supabase (PostgreSQL)
- **其他**: python-dotenv, pytest

## 目录结构

```
AI_resume2/
├── backend/                    # 后端服务
│   ├── app/                   # 应用主目录
│   │   ├── __init__.py       # 包初始化文件
│   │   ├── config.py         # 配置管理
│   │   ├── db.py             # 数据库连接和操作
│   │   └── main.py           # FastAPI主应用入口
│   ├── scripts/              # 工具脚本
│   │   └── inspect_schema_direct.py  # 数据库架构检查脚本
│   ├── tests/                # 测试目录
│   │   └── test_db_schema.py # 数据库架构测试
│   ├── __init__.py           # 后端包初始化
│   ├── README.md             # 后端使用说明
│   ├── database_schema.md    # 数据库架构文档
│   └── requirements.txt      # Python依赖列表
│
├── frontend/                  # 前端应用
│   ├── dist/                 # 构建输出目录
│   ├── node_modules/         # npm依赖包
│   ├── src/                  # 源代码目录
│   │   ├── App.tsx          # 主应用组件
│   │   ├── main.tsx         # 应用入口
│   │   ├── position-detail.tsx  # 职位详情组件
│   │   ├── styles.css       # 全局样式
│   │   └── vite-env.d.ts    # Vite环境类型定义
│   ├── index.html            # HTML入口文件
│   ├── package.json          # npm配置和依赖
│   ├── package-lock.json     # npm依赖锁定文件
│   ├── tsconfig.json         # TypeScript配置
│   └── vite.config.ts        # Vite构建配置
│
├── .env                      # 环境变量配置（需自行创建）
├── .gitignore               # Git忽略文件配置
└── PROJECT_STRUCTURE.md     # 项目结构文档（本文件）
```

## 核心功能模块

### 1. 简历管理
- 上传简历文件（支持PDF、DOC、DOCX、TXT格式）
- 简历列表展示
- 简历内容解析

### 2. 职位管理
- 创建新职位
- 职位列表展示
- 职位详情查看和编辑
- 职位分类（技术类/非技术类）

### 3. 标签与关键词系统
- 标签管理（按类别：技术类/非技术类）
- 关键词创建和管理
- 标签和关键词与职位关联

### 4. 匹配功能
- 匹配规则设置（全部命中/任一命中）
- AI驱动的简历-职位匹配
- 匹配结果展示

## API端点

### 基础端点
- `GET /health` - 健康检查
- `GET /schema` - 获取数据库架构

### 职位管理
- `POST /positions` - 创建职位
- `GET /positions` - 获取职位列表
- `GET /positions/{id}` - 获取职位详情
- `PUT /positions/{id}` - 更新职位信息

### 标签与关键词
- `GET /tags?category={category}` - 按类别获取标签
- `GET /keywords` - 获取所有关键词
- `POST /keywords` - 创建新关键词

## 数据库表结构

主要数据表：
- `positions` - 职位信息表
- `tags` - 标签表
- `keywords` - 关键词表
- `resumes` - 简历表（待实现）
- `matches` - 匹配结果表（待实现）

## 开发指南

### 环境配置
1. 复制 `.env.example` 到 `.env` 并配置Supabase数据库连接信息
2. 安装前后端依赖

### 常用命令

#### 前端开发
```bash
cd frontend
npm install              # 安装依赖
npm run dev             # 启动开发服务器（端口5173）
npm run build           # 构建生产版本
npm run preview         # 预览构建结果
```

#### 后端开发
```bash
# Windows PowerShell
python -m pip install -r backend/requirements.txt          # 安装依赖
python -m uvicorn backend.app.main:app --reload --port 8000   # 启动开发服务器
python -m pytest -s backend/tests/test_db_schema.py        # 运行测试
python -m backend.scripts.inspect_schema                   # 查看数据库架构
```

### 开发流程
1. 前端运行在 http://localhost:5173
2. 后端API运行在 http://localhost:8000
3. 前端已配置CORS，可直接调用后端API

## 部署说明
- 前端：可部署到任何静态网站托管服务
- 后端：支持Docker部署或任何Python环境
- 数据库：使用Supabase云服务

## 注意事项
1. 确保 `.env` 文件不被提交到版本控制
2. 所有敏感信息应通过环境变量配置
3. 开发时前后端分离运行，生产环境可考虑统一部署