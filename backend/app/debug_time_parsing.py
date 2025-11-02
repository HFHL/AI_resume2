"""调试时间解析问题"""
import re
from datetime import date

def debug_parse():
    """详细调试每一步"""
    
    test_text = "2021年8月 – 2022年11月"
    
    print(f"原始文本: {test_text}")
    print(f"文本编码: {[hex(ord(c)) for c in test_text]}")
    print()
    
    # 检查破折号
    dashes = re.findall(r"[-–—~至]", test_text)
    print(f"找到的分隔符: {dashes}")
    print(f"分隔符编码: {[hex(ord(d)) for d in dashes]}")
    print()
    
    # 尝试不同的正则
    patterns = [
        (r"(\d{4}年\d{1,2}月)\s*[-–—~至]\s*(\d{4}年\d{1,2}月)", "简单模式"),
        (r"(\d{4}\s*年\s*\d{1,2}\s*月)\s*[-–—~至]\s*(\d{4}\s*年\s*\d{1,2}\s*月)", "宽松空白"),
    ]
    
    for pat, desc in patterns:
        m = re.search(pat, test_text)
        if m:
            print(f"✅ {desc} 匹配成功:")
            print(f"   起始: {m.group(1)}")
            print(f"   结束: {m.group(2)}")
        else:
            print(f"❌ {desc} 匹配失败")
        print()
    
    # 检查当前正则
    sep = r"\s*(?:-|–|—|~|to|至|–|—)\s*"
    token_pattern = r"(?:\d{4}(?:[\.\-/]\d{1,2})?|\d{4}\s*年\s*\d{1,2}\s*月|[A-Za-z]{3,9}\s+\d{4})"
    end_pattern = r"(?:\d{4}(?:[\.\-/]\d{1,2})?|\d{4}\s*年\s*\d{1,2}\s*月|[A-Za-z]{3,9}\s+\d{4}|至今|现在|present|now)"
    
    current_pat = re.compile(rf"({token_pattern}){sep}({end_pattern})", re.IGNORECASE)
    
    print("当前使用的完整正则:")
    print(f"  token: {token_pattern}")
    print(f"  sep: {sep}")
    print(f"  end: {end_pattern}")
    print()
    
    matches = list(current_pat.finditer(test_text))
    print(f"finditer结果: 找到 {len(matches)} 个匹配")
    for i, m in enumerate(matches):
        print(f"  匹配 {i+1}:")
        print(f"    完整: {m.group(0)}")
        print(f"    起始: {m.group(1)}")
        print(f"    结束: {m.group(2)}")
    print()
    
    # 测试解析函数
    def test_parse(token: str) -> tuple:
        """测试解析token"""
        token = token.strip().lower()
        
        # 方法1: 贪婪匹配
        m1 = re.match(r"(\d{4})\s*年\s*(\d+)\s*月", token)
        if m1:
            return ("方法1-贪婪", int(m1.group(1)), int(m1.group(2)))
        
        # 方法2: 限制1-2位
        m2 = re.match(r"(\d{4})\s*年\s*(\d{1,2})\s*月", token)
        if m2:
            return ("方法2-限制", int(m2.group(1)), int(m2.group(2)))
        
        # 方法3: 检查是否是仅年份
        m3 = re.match(r"(\d{4})\b", token)
        if m3:
            return ("方法3-仅年", int(m3.group(1)), 6)
        
        return ("失败", None, None)
    
    test_tokens = [
        "2021年8月",
        "2022年11月",
        "2024年2月",
        "2022年11月aaa",  # 带后缀
    ]
    
    print("测试token解析:")
    for tok in test_tokens:
        result = test_parse(tok)
        print(f"  {tok:20s} -> {result}")

if __name__ == "__main__":
    debug_parse()

