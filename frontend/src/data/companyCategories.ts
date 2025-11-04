/**
 * 公司分类数据
 * 从 AI高亮公司表.xlsx 自动生成
 */

export interface CompanyCategory {
  name: string;
  companies: string[];
}

export const COMPANY_CATEGORIES: Record<string, string[]> = {
  "金融量化": [
    "幻方量化", "九坤投资", "灵均投资", "明汯投资", "诚奇资产", "金锝资产", "衍复投资", "佳期投资",
    "宽德投资", "天演资本", "稳博投资", "启林投资", "世纪前沿资产", "黑翼资产", "金戈量锐", "茂源量化",
    "思勰投资", "因诺资产", "艾方资产", "博普", "进化论资产", "宽投资产", "龙旗科技", "鸣石基金",
    "念空念觉", "千象投资", "千宜投资", "乾象投资", "锐天投资", "信弘天禾", "展弘投资", "致诚卓远",
    "卓识基金", "白鹭资管", "呈瑞投资", "国恩资本", "涵德投资", "赫富投资", "均成资产", "凯纳资本",
    "洛书投资", "蒙玺投资", "平方和投资", "申毅投资", "盛冠达", "思晔投资", "天算量化", "象限投资",
    "衍盛资产", "仲阳天王星", "Hudson River Trading", "Jump", "Virtu", "Tower Research", "Jane Street",
    "Citadel Securities", "IMC", "Optiver", "Akuna", "DRW", "SIG", "Five Rings", "Two Sigma", "DE Shaw",
    "PDT", "RenTec", "文艺复兴", "Millennium", "Point72", "Citadel", "Balyasny", "Exodus Point", "World Quant", 
    "AQR", "BlackRock", "贝莱德", "MAN Numeric", "英仕曼", "Bridgewater", "桥水基金", "高塔", "time research", 
    "kronos research", "LTP", "cyberX", "wintermute", "presto", "nayt", "LUX", "简街资本", "城堡证券", 
    "摩根士丹利", "高盛", "摩根大通", "花旗", "德意志银行", "巴克莱银行", "瑞银集团", "汇丰"
  ],
  "web3": [
    "币安", "Binance", "Coinbase", "Bybit", "OKX", "Kraken", "KuCoin", "Gate.io", "HTX", "MEXC", "Bitget",
    "Crypto.com", "BingX", "Upbit", "Bithumb", "XT.COM", "Phemex", "BitMEX", "Pionex", "HashKey", "Deribit",
    "FTX", "欧易", "派网", "火币", "Huobi", "Matrixport", "比特大陆", "Amber", "DWF", "imToken", "MetaMask",
    "Trust Wallet", "Phantom", "Coinbase Wallet", "Ethereum", "Bitcoin", "Solana", "BNB Chain", "Polygon",
    "Arbitrum", "Optimism", "Avalanche", "Cardano", "Polkadot", "Chainlink", "Uniswap", "PancakeSwap",
    "SushiSwap", "Curve", "Aave", "Compound", "Maker", "Synthetix", "Yearn", "1inch", "dYdX", "GMX",
    "Osmosis", "THORChain", "Kujira", "Terra", "Cosmos", "Injective", "Sei", "Celestia", "Aptos", "Sui",
    "Near", "Flow", "Tezos", "Algorand", "Hedera", "Internet Computer", "Filecoin", "Theta", "VeChain",
    "Chiliz", "Enjin", "Decentraland", "The Sandbox", "Axie Infinity", "Gala", "Illuvium", "Star Atlas"
  ],
  "互联网": [
    "腾讯", "Tencent", "阿里巴巴", "Alibaba", "百度", "Baidu", "京东", "JD", "美团", "Meituan", "字节跳动",
    "ByteDance", "TikTok", "抖音", "网易", "NetEase", "拼多多", "Pinduoduo", "小红书", "Xiaohongshu", "得物",
    "滴滴出行", "Didi", "哔哩哔哩", "Bilibili", "快手", "Kuaishou", "微博", "Weibo", "知乎", "Zhihu",
    "谷歌", "Google", "苹果", "Apple", "微软", "Microsoft", "亚马逊", "Amazon", "Facebook", "Meta",
    "Netflix", "Uber", "Airbnb", "Twitter", "LinkedIn", "Snapchat", "Pinterest", "Reddit", "Discord",
    "Zoom", "Slack", "Spotify", "PayPal", "eBay", "Salesforce", "Adobe", "Oracle", "IBM", "Intel",
    "NVIDIA", "AMD", "Qualcomm", "Tesla"
  ],
  "AI": [
    "OpenAI", "Anthropic", "谷歌", "Google", "微软", "Microsoft", "百度", "Baidu", "阿里云", "腾讯",
    "字节跳动", "智谱", "月之暗面", "Moonshot", "百川智能", "商汤", "SenseTime", "旷视", "Face++",
    "依图", "云从", "第四范式", "明略", "海康威视", "大华", "科大讯飞", "iFLYTEK", "搜狗", "Sogou",
    "出门问问", "思必驰", "云知声", "竹间智能", "追一科技", "达观数据", "澜舟科技", "循环智能",
    "崧智智能", "深兰科技", "云天励飞", "格灵深瞳", "奇点云", "第六感", "图普科技", "码隆科技",
    "深醒科技", "云拿科技", "影谱科技", "Video++", "阅面科技", "银河水滴", "眼神科技", "的卢深视",
    "豆包", "通义千问", "文心一言", "kimi", "讯飞星火", "紫东太初", "盘古", "悟道", "源1.0",
    "鹏程·盘古", "紫东太初", "华为", "Huawei", "小米", "Xiaomi", "OPPO", "vivo", "一加", "OnePlus"
  ],
  "传统金融": [
    "中国银行", "工商银行", "建设银行", "农业银行", "交通银行", "招商银行", "浦发银行", "中信银行",
    "民生银行", "光大银行", "华夏银行", "平安银行", "兴业银行", "邮储银行", "中国人寿", "平安保险",
    "太平洋保险", "新华保险", "泰康保险", "人保财险", "太平保险", "阳光保险", "天安保险", "华泰保险",
    "中信证券", "海通证券", "广发证券", "国泰君安", "华泰证券", "招商证券", "中金公司", "申万宏源",
    "兴业证券", "银河证券", "国信证券", "方正证券", "长江证券", "东方证券", "光大证券", "中投证券",
    "华西证券", "西南证券", "国元证券", "东北证券", "太平洋证券", "华安证券", "长城证券", "东莞证券",
    "东方财富", "同花顺", "大智慧", "恒生电子", "金证股份", "顶点软件", "赢时胜", "长亮科技"
  ]
};

// 用于快速查找的扁平化数据
export const COMPANY_LOOKUP: Map<string, string[]> = new Map();

// 初始化查找表
Object.entries(COMPANY_CATEGORIES).forEach(([category, companies]) => {
  companies.forEach(company => {
    const normalizedCompany = company.toLowerCase().trim();
    if (!COMPANY_LOOKUP.has(normalizedCompany)) {
      COMPANY_LOOKUP.set(normalizedCompany, []);
    }
    COMPANY_LOOKUP.get(normalizedCompany)!.push(category);
  });
});

/**
 * 检查公司名是否属于指定类别
 */
export function isCompanyInCategory(companyName: string, category: string): boolean {
  if (!companyName || !category) return false;
  
  const companies = COMPANY_CATEGORIES[category] || [];
  const normalizedCompany = companyName.toLowerCase().trim();
  
  return companies.some(company => {
    const normalizedTarget = company.toLowerCase().trim();
    return normalizedCompany.includes(normalizedTarget) || normalizedTarget.includes(normalizedCompany);
  });
}

/**
 * 获取公司所属的所有类别
 */
export function getCompanyCategories(companyName: string): string[] {
  if (!companyName) return [];
  
  const categories: string[] = [];
  const normalizedCompany = companyName.toLowerCase().trim();
  
  Object.entries(COMPANY_CATEGORIES).forEach(([category, companies]) => {
    if (companies.some(company => {
      const normalizedTarget = company.toLowerCase().trim();
      return normalizedCompany.includes(normalizedTarget) || normalizedTarget.includes(normalizedCompany);
    })) {
      categories.push(category);
    }
  });
  
  return categories;
}

/**
 * 检查简历是否包含指定类别的公司
 */
export function resumeHasCompanyCategory(
  workExperience: string[], 
  workExperienceStruct: any[], 
  categories: string[]
): boolean {
  if (categories.length === 0) return true;
  
  const companies: string[] = [];
  
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