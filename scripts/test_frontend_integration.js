/**
 * 测试前端集成的公司类别筛选功能
 */

// 模拟从 companyCategories.ts 导入的数据和函数
const COMPANY_CATEGORIES = {
  "金融量化": ["幻方量化", "九坤投资", "Jane Street", "Citadel"],
  "web3": ["币安", "Binance", "Coinbase", "OKX"],
  "互联网": ["腾讯", "阿里巴巴", "字节跳动", "美团"],
  "AI": ["OpenAI", "百度", "智谱", "月之暗面"],
  "传统金融": ["中国银行", "工商银行", "招商银行", "平安银行"]
};

function isCompanyInCategory(companyName, category) {
  if (!companyName || !category) return false;
  
  const companies = COMPANY_CATEGORIES[category] || [];
  const normalizedCompany = companyName.toLowerCase().trim();
  
  return companies.some(company => {
    const normalizedTarget = company.toLowerCase().trim();
    return normalizedCompany.includes(normalizedTarget) || normalizedTarget.includes(normalizedCompany);
  });
}

function resumeHasCompanyCategory(workExperience, workExperienceStruct, categories) {
  if (categories.length === 0) return true;
  
  const companies = [];
  
  // 从结构化数据中提取公司名
  if (Array.isArray(workExperienceStruct)) {
    workExperienceStruct.forEach(item => {
      const company = item?.company;
      if (typeof company === 'string' && company.trim()) {
        companies.push(company.trim());
      }
    });
  }
  
  // 从文本数组中提取公司名（如果结构化数据为空）
  if (companies.length === 0 && Array.isArray(workExperience)) {
    workExperience.forEach(line => {
      if (typeof line === 'string') {
        const head = line.split(/\n/)[0]?.trim() || '';
        // 尝试多种匹配模式
        let company = null;
        
        // 模式1: 时间  公司  职位
        let match = head.match(/^\d{4}.*?[年\-].*?\s+([^\s]{2,20})\s+/);
        if (match) company = match[1];
        
        // 模式2: 公司 | 职位 或 公司 - 职位
        if (!company) {
          match = head.match(/^([^\n]{2,40}?)(?:\s{2,}|[|｜\-·•])/);
          if (match) company = match[1];
        }
        
        // 模式3: 简单的第一个词作为公司名
        if (!company) {
          const words = head.split(/\s+/);
          if (words.length > 1) company = words[1]; // 跳过时间，取第二个词
        }
        
        if (company && company.length >= 2) {
          companies.push(company.trim());
        }
      }
    });
  }
  
  // 检查是否有公司属于指定类别
  return categories.some(category => 
    companies.some(company => isCompanyInCategory(company, category))
  );
}

// 模拟简历数据（真实数据结构）
const mockResumes = [
  {
    id: 1,
    name: "张三",
    work_experience: ["2023年1月-至今  幻方量化  量化研究员"],
    work_experience_struct: []
  },
  {
    id: 2,
    name: "李四", 
    work_experience: [],
    work_experience_struct: [
      { company: "币安", title: "前端工程师" },
      { company: "腾讯", title: "产品经理" }
    ]
  },
  {
    id: 3,
    name: "王五",
    work_experience: ["2022年-2023年  百度  AI工程师"],
    work_experience_struct: []
  },
  {
    id: 4,
    name: "赵六",
    work_experience: ["2021年-2022年  中国银行  客户经理"],
    work_experience_struct: []
  }
];

// 测试筛选功能
console.log("=== 前端集成测试 ===");

console.log("\n1. 测试金融量化筛选:");
const quantResumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, ["金融量化"])
);
console.log("筛选结果:", quantResumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n2. 测试web3筛选:");
const web3Resumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, ["web3"])
);
console.log("筛选结果:", web3Resumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n3. 测试互联网筛选:");
const internetResumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, ["互联网"])
);
console.log("筛选结果:", internetResumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n4. 测试AI筛选:");
const aiResumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, ["AI"])
);
console.log("筛选结果:", aiResumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n5. 测试传统金融筛选:");
const financeResumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, ["传统金融"])
);
console.log("筛选结果:", financeResumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n6. 测试多类别筛选 (金融量化 + web3):");
const multiResumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, ["金融量化", "web3"])
);
console.log("筛选结果:", multiResumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n7. 测试无筛选条件:");
const allResumes = mockResumes.filter(resume => 
  resumeHasCompanyCategory(resume.work_experience, resume.work_experience_struct, [])
);
console.log("筛选结果:", allResumes.map(r => `${r.name} (ID: ${r.id})`));

console.log("\n=== 测试完成 ===");