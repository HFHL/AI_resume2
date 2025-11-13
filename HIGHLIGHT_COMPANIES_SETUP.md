# 高亮公司管理功能使用说明

## 功能概述

本次更新增加了高亮公司管理功能，允许管理员通过界面管理各类别的高亮公司，并在简历筛选时使用这些公司进行筛选。

## 功能特性

### 1. 高亮公司管理页面（管理员专用）

管理员可以通过导航栏的"高亮公司"链接访问管理页面，该页面提供以下功能：

- **添加公司**：输入公司名称和选择类别后，点击"添加公司"按钮
- **搜索公司**：通过公司名称搜索
- **筛选类别**：按类别筛选显示
- **编辑公司**：修改公司名称或类别
- **删除公司**：删除不需要的公司
- **按类别分组显示**：默认按5个类别分组展示

### 2. 简历筛选增强

在简历列表页面，新增了"高亮公司"筛选区域，包含以下选项：

#### 普通类别筛选
- ✅ **金融量化高亮公司**
- ✅ **web3高亮公司**
- ✅ **互联网高亮公司**
- ✅ **AI高亮公司**
- ✅ **传统金融高亮公司**

#### 特殊筛选选项
- 🔵 **包含任何高亮公司**：筛选至少包含一家高亮公司的简历
- 🔴 **不包含任何高亮公司**：筛选不包含任何高亮公司的简历

## 部署步骤

### 1. 数据库设置

运行数据库迁移脚本创建高亮公司表：

```bash
# 使用 Supabase SQL Editor 或命令行工具执行
psql -h your-db-host -U your-user -d your-database -f backend/scripts/create_highlight_companies_table.sql
```

或者在 Supabase Dashboard 的 SQL Editor 中执行 `backend/scripts/create_highlight_companies_table.sql` 文件的内容。

### 2. 验证数据库

执行后应该创建以下内容：

- ✅ `highlight_companies` 表
- ✅ 相关索引和触发器
- ✅ 初始数据（来自原 companyCategories.ts）

### 3. 前端部署

无需额外操作，前端代码已更新完成。如果使用 Vercel 或其他平台，推送代码后会自动部署。

### 4. 验证功能

1. **验证API**：
   ```bash
   # 测试获取高亮公司列表
   curl -H "x-admin: true" https://your-domain/api/admin/highlight_companies
   ```

2. **验证管理页面**：
   - 以管理员身份登录
   - 点击导航栏"高亮公司"链接
   - 确认可以看到公司列表和添加表单

3. **验证筛选功能**：
   - 访问简历列表页面
   - 确认可以看到"高亮公司"筛选区域
   - 测试各个筛选选项

## 数据库表结构

```sql
CREATE TABLE highlight_companies (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 字段说明

- `id`: 主键，自增
- `company_name`: 公司名称，唯一
- `category`: 类别（金融量化、web3、互联网、AI、传统金融）
- `created_at`: 创建时间
- `updated_at`: 更新时间

## API 端点

### 获取高亮公司列表
```
GET /api/admin/highlight_companies
Headers: x-admin: true
Query Parameters:
  - category: 按类别筛选
  - search: 按公司名搜索
```

### 添加高亮公司
```
POST /api/admin/highlight_companies
Headers: 
  x-admin: true
  Content-Type: application/json
Body:
  {
    "company_name": "公司名称",
    "category": "类别"
  }
```

### 更新高亮公司
```
PUT /api/admin/highlight_companies/:id
Headers:
  x-admin: true
  Content-Type: application/json
Body:
  {
    "company_name": "新公司名称",
    "category": "新类别"
  }
```

### 删除高亮公司
```
DELETE /api/admin/highlight_companies/:id
Headers: x-admin: true
```

## 注意事项

1. **权限控制**：所有高亮公司管理 API 都需要管理员权限（`x-admin: true`）
2. **公司名唯一性**：每个公司名称在数据库中必须唯一
3. **类别限制**：类别只能是预定义的5个之一
4. **数据备份**：`companyCategories.ts` 中保留了静态数据作为备用
5. **筛选逻辑**：特殊筛选选项（包含/不包含任何高亮公司）可以与普通类别筛选同时使用

## 使用场景

### 场景 1：筛选金融量化公司的简历
1. 勾选"金融量化高亮公司"
2. 系统显示所有在金融量化公司工作过的简历

### 场景 2：筛选有任何高亮公司经验的简历
1. 勾选"包含任何高亮公司"
2. 系统显示所有在任意高亮公司工作过的简历

### 场景 3：筛选没有高亮公司经验的简历
1. 勾选"不包含任何高亮公司"
2. 系统显示所有没有在任何高亮公司工作过的简历

### 场景 4：组合筛选
1. 同时勾选"金融量化高亮公司"和"AI高亮公司"
2. 系统显示在金融量化或AI公司工作过的简历

## 故障排查

### 问题：无法看到"高亮公司"导航链接
**解决**：确保以管理员身份登录

### 问题：API 返回 403 错误
**解决**：确保请求包含 `x-admin: true` 头部

### 问题：筛选功能不生效
**解决**：
1. 检查数据库表是否正确创建
2. 检查数据是否已导入
3. 清除浏览器缓存并重新加载

### 问题：添加公司时提示"已存在"
**解决**：该公司名称已在数据库中，请使用不同的名称或编辑现有公司

## 未来扩展

可能的扩展方向：

1. **批量导入**：支持从Excel/CSV批量导入公司数据
2. **公司别名**：支持为公司添加别名（如"腾讯"和"Tencent"）
3. **自定义类别**：允许管理员创建自定义类别
4. **历史记录**：记录公司信息的修改历史
5. **API优化**：添加缓存机制提升性能

## 联系支持

如有问题，请联系开发团队或查看项目文档。

