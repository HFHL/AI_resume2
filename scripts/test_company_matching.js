/**
 * 测试公司匹配功能
 */

// 模拟公司匹配逻辑
const COMPANY_CATEGORIES = {
  "金融量化": ["幻方量化", "九坤投资", "Jane Street", "Citadel"],
  "web3": ["币安", "Binance", "Coinbase", "OKX"],
  "互联网": ["腾讯", "阿里巴巴", "字节跳动", "美团"]
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
  
  // 从文本数组中提取公司名
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

// 测试用例
console.log("=== 公司匹配测试 ===");

// 测试1：结构化数据匹配
const resume1 = {
  work_experience: [],
  work_experience_struct: [
    { company: "幻方量化", title: "量化研究员" },
    { company: "腾讯", title: "产品经理" }
  ]
};

console.log("测试1 - 结构化数据:");
console.log("金融量化:", resumeHasCompanyCategory(resume1.work_experience, resume1.work_experience_struct, ["金融量化"])); // 应该为 true
console.log("web3:", resumeHasCompanyCategory(resume1.work_experience, resume1.work_experience_struct, ["web3"])); // 应该为 false
console.log("互联网:", resumeHasCompanyCategory(resume1.work_experience, resume1.work_experience_struct, ["互联网"])); // 应该为 true

// 测试2：文本数据匹配
const resume2 = {
  work_experience: [
    "2023年1月-至今  币安  前端工程师",
    "2021年-2022年  美团  后端工程师"
  ],
  work_experience_struct: []
};

console.log("\n测试2 - 文本数据:");
console.log("web3:", resumeHasCompanyCategory(resume2.work_experience, resume2.work_experience_struct, ["web3"])); // 应该为 true
console.log("互联网:", resumeHasCompanyCategory(resume2.work_experience, resume2.work_experience_struct, ["互联网"])); // 应该为 true
console.log("金融量化:", resumeHasCompanyCategory(resume2.work_experience, resume2.work_experience_struct, ["金融量化"])); // 应该为 false

// 测试3：多类别筛选
console.log("\n测试3 - 多类别筛选:");
console.log("web3 + 互联网:", resumeHasCompanyCategory(resume2.work_experience, resume2.work_experience_struct, ["web3", "互联网"])); // 应该为 true（满足其中一个）
console.log("web3 + 金融量化:", resumeHasCompanyCategory(resume2.work_experience, resume2.work_experience_struct, ["web3", "金融量化"])); // 应该为 true（满足其中一个）

console.log("\n=== 测试完成 ===");