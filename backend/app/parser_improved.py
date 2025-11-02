"""
改进的简历解析器 - 修复工作年限计算问题
主要改进：
1. 修复中文年月格式的解析bug
2. 支持简写月份格式（2024年2-7月）
3. 支持描述性时间文本
4. 更准确的时间段提取
"""

from __future__ import annotations
import re
from datetime import date
from typing import List, Tuple, Optional
import logging

logger = logging.getLogger("parser_improved")

# ============== 改进的时间解析 ==============

_MONTHS_EN = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12,
}

_CN_NUM = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}


def _parse_year_month_improved(token: str) -> Tuple[int, int]:
    """改进的年月解析，修复bug"""
    token = token.strip().lower()
    
    # 1. YYYY.MM / YYYY-MM / YYYY/MM
    m = re.match(r"(\d{4})[\.\-/](\d{1,2})", token)
    if m:
        y = int(m.group(1))
        mth = int(m.group(2))
        return y, max(1, min(12, mth))
    
    # 2. YYYY年MM月 - 修复：确保提取完整的月份数字
    # 原bug：\d{1,2} 可能只匹配到第一个数字
    m = re.match(r"(\d{4})\s*年\s*(\d{1,2})\s*月", token)
    if m:
        y = int(m.group(1))
        mth = int(m.group(2))
        return y, max(1, min(12, mth))
    
    # 3. 英文月份 MMM YYYY / MMMM YYYY
    m = re.match(r"([a-zA-Z]{3,9})\s+(\d{4})", token)
    if m:
        mon = _MONTHS_EN.get(m.group(1).lower())
        if mon:
            return int(m.group(2)), mon
    
    # 4. 仅年份 YYYY -> 默认 06 月
    m = re.match(r"(\d{4})\b", token)
    if m:
        return int(m.group(1)), 6
    
    raise ValueError(f"无法解析时间token: {token}")


def _parse_date_improved(token: str) -> date:
    """改进的日期解析"""
    y, m = _parse_year_month_improved(token)
    return date(y, m, 1)


def _extract_periods_improved(text: str) -> List[Tuple[date, date]]:
    """改进的时间段提取，支持更多格式"""
    t = text.replace("至 今", "至今")
    now = date.today()
    periods: List[Tuple[date, date]] = []
    
    # 常见分隔符：- – — ~ to 至 …
    sep = r"\s*(?:-|–|—|~|to|至|–|—)\s*"
    
    # 1. 标准格式：起止时间明确
    # 支持格式：YYYY.MM, YYYY年MM月, 英文月份
    token_pattern = r"(?:\d{4}(?:[\.\-/]\d{1,2})?|\d{4}\s*年\s*\d{1,2}\s*月|[A-Za-z]{3,9}\s+\d{4})"
    end_pattern = r"(?:\d{4}(?:[\.\-/]\d{1,2})?|\d{4}\s*年\s*\d{1,2}\s*月|[A-Za-z]{3,9}\s+\d{4}|至今|现在|present|now)"
    
    pat = re.compile(
        rf"({token_pattern}){sep}({end_pattern})",
        re.IGNORECASE,
    )
    
    for m in pat.finditer(t):
        a = m.group(1)
        b = m.group(2)
        try:
            start = _parse_date_improved(a)
            if re.match(r"^(至今|现在|present|now)$", b, re.IGNORECASE):
                end = now
            else:
                end = _parse_date_improved(b)
            
            if end < start:
                continue
            periods.append((start, end))
        except Exception as e:
            logger.debug(f"解析时间段失败: {a} - {b}, 错误: {e}")
            continue
    
    # 2. 新增：简写月份格式（2024年2-7月）
    simple_month_pat = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*月")
    for m in simple_month_pat.finditer(t):
        try:
            year = int(m.group(1))
            start_month = int(m.group(2))
            end_month = int(m.group(3))
            
            start = date(year, max(1, min(12, start_month)), 1)
            end = date(year, max(1, min(12, end_month)), 1)
            
            if end >= start:
                periods.append((start, end))
        except Exception as e:
            logger.debug(f"解析简写月份失败: {m.group(0)}, 错误: {e}")
            continue
    
    # 3. 新增：描述性时间（2019年8月获得、2021年5月毕业）
    # 这种通常是教育背景，我们认为是单个时间点，不计入工作年限
    # 如果要计入，可以设置为持续1个月
    descriptive_pat = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月(?:获得|毕业|入学|开始)")
    # 暂时不加入periods，因为这些不是工作经历
    
    return periods


def _merge_periods_improved(periods: List[Tuple[date, date]]) -> List[Tuple[date, date]]:
    """合并重叠时间段"""
    if not periods:
        return []
    
    # 按开始时间排序
    periods.sort(key=lambda x: x[0])
    merged = [periods[0]]
    
    for s, e in periods[1:]:
        ls, le = merged[-1]
        # 如果当前段的开始时间 <= 上一段的结束时间，则合并
        if s <= le:
            # 合并：取更晚的结束时间
            if e > le:
                merged[-1] = (ls, e)
        else:
            # 不重叠，添加新段
            merged.append((s, e))
    
    return merged


def _months_between_improved(a: date, b: date) -> int:
    """计算两个日期之间的月数（含端点）"""
    return (b.year - a.year) * 12 + (b.month - a.month) + 1


def _extract_years_from_text_improved(text: str) -> Optional[float]:
    """从文本中提取年限描述（如"3年经验"、"5年以上"）"""
    # 阿拉伯数字：3年/3.5年/8+年/8 years/3+ yrs
    m = re.findall(r"(\d+(?:\.\d+)?)\s*(?:年|years?|yrs?)\s*(?:以上|\+|多|余)?", text, re.IGNORECASE)
    vals: List[float] = []
    for s in m:
        try:
            vals.append(float(s))
        except Exception:
            pass
    
    # 中文数字：三年/两年半/十年以上
    cn = re.findall(r"([一二三四五六七八九十两]+)(?:年)(半)?(?:以上|多|余|\+)?", text)
    
    def cn_to_num(s: str) -> int:
        total = 0
        if s == '十':
            return 10
        if '十' in s:
            parts = s.split('十')
            left = _CN_NUM.get(parts[0], 1) if parts[0] else 1
            right = _CN_NUM.get(parts[1], 0) if len(parts) > 1 else 0
            return left * 10 + right
        for ch in s:
            total = total * 10 + _CN_NUM.get(ch, 0)
        return total
    
    for num_txt, half in cn:
        base = cn_to_num(num_txt)
        vals.append(base + (0.5 if half else 0.0))
    
    if not vals:
        return None
    
    # 取中位数更稳妥
    vals.sort()
    return vals[len(vals)//2]


def extract_work_years_improved(text: str) -> Optional[int]:
    """改进的工作年限提取"""
    # 1. 从时间段计算
    periods = _extract_periods_improved(text)
    merged = _merge_periods_improved(periods)
    total_months = sum(_months_between_improved(s, e) for s, e in merged)
    
    years_from_periods: Optional[float] = None
    if total_months > 0:
        years_from_periods = round(total_months / 12.0, 1)
    
    # 2. 从文本描述提取
    years_from_text = _extract_years_from_text_improved(text)
    
    # 3. 综合判断
    years_dec: Optional[float]
    if years_from_periods is not None and years_from_text is not None:
        # 两者都存在，取较小值（保守估计）
        years_dec = min(years_from_periods, years_from_text)
    elif years_from_periods is not None:
        years_dec = years_from_periods
    else:
        years_dec = years_from_text
    
    if years_dec is None:
        return None
    
    # 合理边界
    years_dec = max(0.0, min(60.0, years_dec))
    return int(years_dec // 1)


# ============== 测试函数 ==============

def test_improvements():
    """测试改进效果"""
    test_cases = [
        ("2021年8月 – 2022年11月", "中文年月格式"),
        ("2024年2-7月", "简写月份"),
        ("2023年8月–2024年3月", "全角破折号"),
        ("2021.08 - 2022.11", "点号分隔"),
        ("2024.2 - 2024.7", "单数字月份"),
        ("Aug 2021 - Nov 2022", "英文月份"),
    ]
    
    print("=" * 80)
    print("🧪 测试改进后的时间解析")
    print("=" * 80)
    
    for text, desc in test_cases:
        periods = _extract_periods_improved(text)
        if periods:
            start, end = periods[0]
            months = _months_between_improved(start, end)
            print(f"✅ {desc}: {text}")
            print(f"   识别为: {start.strftime('%Y-%m')} 至 {end.strftime('%Y-%m')} ({months}个月)")
        else:
            print(f"❌ {desc}: {text}")
            print(f"   未能识别")
        print()
    
    # 测试完整文本
    full_text = """
    上海燧原科技有限公司，软件工程师
    2022年11月 - 至今
    
    华为技术有限公司，算法工程师
    2021年8月 – 2022年11月
    
    推理性能瓶颈分析及业务优化落地
    2024年2-7月
    
    自有大模型推理框架研发
    2023年8月–2024年3月
    
    算子粒度芯片调优
    2022年2-5月
    """
    
    print("\n" + "=" * 80)
    print("📊 完整文本工作年限计算")
    print("=" * 80)
    
    periods = _extract_periods_improved(full_text)
    print(f"找到 {len(periods)} 个时间段:")
    for start, end in periods:
        months = _months_between_improved(start, end)
        print(f"  - {start.strftime('%Y年%m月')} 至 {end.strftime('%Y年%m月')} ({months}个月)")
    
    merged = _merge_periods_improved(periods)
    total_months = sum(_months_between_improved(s, e) for s, e in merged)
    print(f"\n合并后 {len(merged)} 个时间段:")
    for start, end in merged:
        months = _months_between_improved(start, end)
        print(f"  - {start.strftime('%Y年%m月')} 至 {end.strftime('%Y年%m月')} ({months}个月)")
    
    work_years = extract_work_years_improved(full_text)
    print(f"\n✅ 最终工作年限: {work_years} 年 (总计{total_months}个月)")


if __name__ == "__main__":
    test_improvements()

