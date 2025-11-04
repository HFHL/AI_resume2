/**
 * 测试姓名去重逻辑
 */

// 模拟简历数据
const mockResumes = [
  { id: 1, name: "李炳琪", email: "li1@example.com", phone: "1234567890" },
  { id: 2, name: "张三", email: "zhang@example.com", phone: "1111111111" },
  { id: 3, name: "李炳琪", email: "li2@example.com", phone: "0987654321" },
  { id: 4, name: "雷文杨", email: "lei1@example.com", phone: "2222222222" },
  { id: 5, name: "王五", email: "wang@example.com", phone: "3333333333" },
  { id: 6, name: "雷文杨", email: "lei2@example.com", phone: "2222222222" },
  { id: 7, name: "李炳琪", email: "li3@example.com", phone: "4444444444" },
];

// 复制去重逻辑
function deduplicateByName(items) {
  if (items.length === 0) return items;
  
  const originalCount = items.length;
  const nameMap = new Map();
  const nameCountMap = new Map();
  
  // 统计重名情况
  for (const item of items) {
    const name = (item.name || '').trim();
    if (name) {
      nameCountMap.set(name, (nameCountMap.get(name) || 0) + 1);
    }
  }
  
  // 按ID降序排列确保最新记录优先
  const sortedItems = [...items].sort((a, b) => (b.id || 0) - (a.id || 0));
  
  for (const item of sortedItems) {
    const name = (item.name || '').trim();
    if (name && !nameMap.has(name)) {
      nameMap.set(name, item);
    }
  }
  
  // 保持原始顺序，但去除重名记录
  const result = items.filter(item => {
    const name = (item.name || '').trim();
    if (!name) return true; // 保留无名字的记录
    return nameMap.get(name) === item;
  });
  
  // 记录去重效果
  const finalCount = result.length;
  const duplicatesRemoved = originalCount - finalCount;
  if (duplicatesRemoved > 0) {
    console.log(`Name deduplication: removed ${duplicatesRemoved} duplicates, ${finalCount} unique names remaining`);
    
    // 记录重名统计
    const duplicateNames = Array.from(nameCountMap.entries()).filter(([name, count]) => count > 1);
    if (duplicateNames.length > 0) {
      console.log('Duplicate names found:', duplicateNames.map(([name, count]) => `${name}(${count})`).join(', '));
    }
  }
  
  return result;
}

console.log("=== 原始数据 ===");
console.log(mockResumes.map(r => `ID:${r.id}, 姓名:${r.name}, 邮箱:${r.email}`));

console.log("\n=== 去重后 ===");
const deduplicated = deduplicateByName(mockResumes);
console.log(deduplicated.map(r => `ID:${r.id}, 姓名:${r.name}, 邮箱:${r.email}`));

console.log("\n=== 验证结果 ===");
const nameSet = new Set();
let hasDuplicates = false;
for (const item of deduplicated) {
  if (nameSet.has(item.name)) {
    console.log(`❌ 发现重复姓名: ${item.name}`);
    hasDuplicates = true;
  } else {
    nameSet.add(item.name);
  }
}

if (!hasDuplicates) {
  console.log("✅ 去重成功，没有重复姓名");
} else {
  console.log("❌ 去重失败，仍有重复姓名");
}

// 验证保留了最新记录
console.log("\n=== 验证保留最新记录 ===");
const duplicateNamesList = ["李炳琪", "雷文杨"];
for (const name of duplicateNamesList) {
  const originalRecords = mockResumes.filter(r => r.name === name);
  const finalRecord = deduplicated.find(r => r.name === name);
  const latestOriginal = originalRecords.sort((a, b) => b.id - a.id)[0];
  
  if (finalRecord && finalRecord.id === latestOriginal.id) {
    console.log(`✅ ${name}: 保留了最新记录 ID:${finalRecord.id}`);
  } else {
    console.log(`❌ ${name}: 没有保留最新记录`);
  }
}