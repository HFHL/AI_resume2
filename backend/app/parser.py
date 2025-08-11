from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, date

from .llm import LLMClient
from .education import analyze_highest_education_level, classify_education_background
from .db import get_supabase_client


logger = logging.getLogger("resume_parser")


@dataclass
class ParsedResume:
    resume_file_id: Optional[int]
    name: Optional[str]
    contact_info: Optional[str]
    education_degree: Optional[str]
    education_school: Optional[List[str]]
    education_major: Optional[str]
    education_graduation_year: Optional[int]
    education_tier: Optional[str]
    education_tiers: Optional[List[str]]
    category: Optional[str]
    tag_names: Optional[List[str]]
    skills: Optional[List[str]]
    work_experience: Optional[List[str]]
    internship_experience: Optional[List[str]]
    project_experience: Optional[List[str]]
    self_evaluation: Optional[str]
    other: Optional[str]
    work_years: Optional[int]

    def to_row(self) -> Dict[str, Any]:
        return {
            "resume_file_id": self.resume_file_id,
            "name": self.name or None,
            "contact_info": self.contact_info or None,
            "education_degree": self.education_degree or None,
            "education_school": self.education_school or None,
            "education_major": self.education_major or None,
            "education_graduation_year": self.education_graduation_year,
            "education_tier": self.education_tier or None,
            "education_tiers": self.education_tiers or None,
            "category": self.category or None,
            "tag_names": self.tag_names or None,
            "skills": self.skills or None,
            "work_experience": self.work_experience or None,
            "internship_experience": self.internship_experience or None,
            "project_experience": self.project_experience or None,
            "self_evaluation": self.self_evaluation or None,
            "other": self.other or None,
            "work_years": self.work_years,
        }


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?86[- ]?)?(1[3-9]\d{9})(?!\d)")


def _first_or_none(lst: List[str]) -> Optional[str]:
    return lst[0] if lst else None


def extract_contact_info(text: str) -> Optional[str]:
    emails = EMAIL_RE.findall(text)
    phones = PHONE_RE.findall(text)
    parts: List[str] = []
    if emails:
        parts.append(f"邮箱: {emails[0]}")
    if phones:
        parts.append(f"电话: {phones[0]}")
    return " | ".join(parts) if parts else None


def extract_degree(text: str) -> Optional[str]:
    degree_keywords = [
        "博士后", "博士", "研究生", "硕士", "本科", "大专", "专科", "PhD", "Master", "Bachelor",
    ]
    for kw in degree_keywords:
        if kw in text:
            return kw
    return None


def extract_schools(text: str) -> Optional[List[str]]:
    # 1) 英文学校模式（以关键后缀结尾），尽量截断到 school 词尾
    eng_pat = re.compile(r"([A-Za-z][A-Za-z .&\-]{1,60}?(?:University|College|Institute|Polytechnic|Academy))(?![A-Za-z])", re.IGNORECASE)
    eng_matches = [m.group(1) for m in eng_pat.finditer(text)]

    # 2) 中文学校模式（以 大学/学院/学校 结束）
    zh_pat = re.compile(r"([\u4e00-\u9fa5A-Za-z·\-（）() ]{1,40}?(?:大学|学院|学校))")
    zh_matches = [m.group(1) for m in zh_pat.finditer(text)]

    candidates = eng_matches + zh_matches

    def clean_school(s: str) -> Optional[str]:
        v = s.strip()
        if not v:
            return None
        # 去括号及其后的注释
        v = re.sub(r"\s*[\(（\[【].*$", "", v).strip()
        # 去掉前置序号/序列（如“03 ”、“1. ”、“一、”等）
        v = re.sub(r"^(?:\d{1,3}|[一二三四五六七八九十]{1,3}|[A-Za-z])(?:[\.)、\-\s]+)", "", v)
        v = re.sub(r"\s+", " ", v).strip("-·、，,；;.:：()（） ")

        # 若为中文学校：必须在“大学/学院/学校”之前含有至少一个中文字符，且长度合理
        if re.search(r"(大学|学院|学校)$", v):
            if not re.search(r"[\u4e00-\u9fa5]+(?=(大学|学院|学校)$)", v):
                return None
            if len(v) < 2 or len(v) > 30:
                return None
            return v

        # 若为英文学校：标准化大小写（Title Case），长度限制
        if re.search(r"(University|College|Institute|Polytechnic|Academy)$", v, re.IGNORECASE):
            vv = v.strip()
            # 去掉多余的点与空白
            vv = re.sub(r"\s+", " ", vv)
            if len(vv) < 3 or len(vv) > 60:
                return None
            # Title Case（保留常见小词）
            small_words = {"of", "the", "and", "in", "for", "at"}
            parts = [w.lower() for w in vv.split(" ") if w]
            tcase = []
            for i, w in enumerate(parts):
                if w in small_words and 0 < i < len(parts) - 1:
                    tcase.append(w)
                else:
                    tcase.append(w.capitalize())
            vv2 = " ".join(tcase)
            return vv2

        return None

    cleaned: List[str] = []
    seen_norm = set()
    for c in candidates:
        val = clean_school(c)
        if not val:
            continue
        norm = re.sub(r"\s+", "", val).lower()
        if norm in seen_norm:
            continue
        cleaned.append(val)
        seen_norm.add(norm)
    return cleaned or None


LLM_JSON_PROMPT = (
    "任务：从输入的中文/英文简历文本中抽取并返回标准 JSON（仅 JSON，不要输出解释或 markdown）。\n"
    "输出 JSON schema（键名与类型必须完全一致）：\n"
    "{\n"
    "  \"name\": string|null,\n"
    "  \"education_school\": string[]|null,\n"
    "  \"education_major\": string|null,\n"
    "  \"skills\": string[]|null,\n"
    "  \"work_experience\": string[]|null,\n"
    "  \"internship_experience\": string[]|null,\n"
    "  \"project_experience\": string[]|null,\n"
    "  \"self_evaluation\": string|null,\n"
    "  \"other\": string|null\n"
    "}\n"
    "严格规则：\n"
    "- 仅输出一个 JSON 对象；不要包含任何多余文字、标签或 markdown 代码块。\n"
    "- 保持键名不变；无法确定的字段填 null。\n"
    "- education_school 返回一个字符串数组，包含文中出现的学校名称（中英文皆可），不要附加括号注释/排名/QS 文案等，只保留学校主名；去重。\n"
    "- skills 为去重后的关键词数组（如 Java、Python、SpringBoot、微服务 等），不包含句号或多余符号。\n"
    "- work_experience / internship_experience / project_experience 均返回字符串数组：\n"
    "  每个元素是一段完整条目（可多行），建议包含：时间范围、公司/项目名、职位/角色、概述、职责要点或技术栈。\n"
    "- 对输入中的 HTML 标签进行内容保留与清洗（忽略标签本身），表格内容按行合并为自然语言。\n"
    "- 合理断句、移除多余空白与无意义分隔符，保持可读性。\n"
    "- 不要杜撰缺失信息。\n"
    "- 中英文皆可，保持原文关键信息与时间格式（如 2024.07 - 2024.10）。\n"
    "- 严禁输出示例标识、解释、markdown、\"```\" 等围栏。\n"
    "\n"
    "Few-shot 示例：\n"
    "示例输入（节选）：\n"
    "求职意向\n期望从事职业： 后端开发工程师\n\n自我评价\n具备 9 年 Java 开发经验，熟悉微服务与区块链技术。\n\n工作经历\n2024.07 - 2024.10  Bitget交易所  区块链  后端开发工程师\n负责交易平台迭代，解决线上问题，优化性能；参与现货交易与资产管理等模块开发。\n\n项目经历\nBitget 交易所 (2024.07 – 2024.10)\n涉及技术：SpringBoot、Dubbo、Mysql、Nacos\n项目描述：加密货币交易平台。\n责任描述：需求分析、方案设计、问题排查。\n\n专业技能\nJava / SpringBoot / Dubbo / MySQL / Redis / 微服务 / 区块链\n"
    "示例输出(JSON)：\n"
    "{\n"
    "  \"name\": null,\n"
    "  \"education_school\": null,\n"
    "  \"education_major\": null,\n"
    "  \"skills\": [\"Java\", \"SpringBoot\", \"Dubbo\", \"MySQL\", \"Redis\", \"微服务\", \"区块链\"],\n"
    "  \"work_experience\": [\n"
    "    \"2024.07 - 2024.10  Bitget交易所  后端开发工程师\\n负责加密货币交易平台迭代与性能优化；参与现货交易、资产管理等核心模块开发。\"\n"
    "  ],\n"
    "  \"internship_experience\": null,\n"
    "  \"project_experience\": [\n"
    "    \"Bitget 交易所 (2024.07 – 2024.10)\\n技术栈：SpringBoot、Dubbo、Mysql、Nacos\\n项目：加密货币交易平台\\n职责：需求分析、方案设计、问题排查。\"\n"
    "  ],\n"
    "  \"self_evaluation\": \"具备 9 年 Java 开发经验，熟悉微服务与区块链技术。\",\n"
    "  \"other\": null\n"
    "}\n"
)


# 学校专用提示词：仅返回 education_school 数组
SCHOOL_JSON_PROMPT = (
    "任务：从下面给出的若干上下文片段中，抽取所有出现的学校名称，并返回 JSON（仅 JSON）。\n"
    "- 只返回学校主名；不要包含括号注释、排名、QS 文案、专业、学位等。\n"
    "- 中英文学校名都要；去重；保持英文正常书写（Title Case 或正文原样）。\n"
    "- 仅输出如下结构：\n"
    "{\n  \"education_school\": string[]\n}\n"
)


def _windows_around_keywords(text: str, keywords: List[str], window: int = 20, max_windows: int = 200) -> List[str]:
    spans: List[tuple[int, int]] = []
    for kw in keywords:
        for m in re.finditer(re.escape(kw), text, flags=re.IGNORECASE):
            a = max(0, m.start() - window)
            b = min(len(text), m.end() + window)
            spans.append((a, b))
    if not spans:
        return []
    # 合并重叠窗口
    spans.sort()
    merged: List[tuple[int, int]] = []
    cur_a, cur_b = spans[0]
    for a, b in spans[1:]:
        if a <= cur_b:
            cur_b = max(cur_b, b)
        else:
            merged.append((cur_a, cur_b))
            cur_a, cur_b = a, b
    merged.append((cur_a, cur_b))

    snippets: List[str] = []
    for a, b in merged[:max_windows]:
        s = text[a:b].strip()
        if s:
            snippets.append(s)
    # 去重（按去空白、lower 归一化）
    uniq: List[str] = []
    seen = set()
    for s in snippets:
        key = re.sub(r"\s+", " ", s).strip().lower()
        if key not in seen:
            uniq.append(s)
            seen.add(key)
    return uniq


def extract_schools_via_llm(text: str) -> Optional[List[str]]:
    llm = LLMClient.from_env()
    if not llm:
        return None

    # 关键词集合（中英）
    keywords = [
        "大学", "学院", "学校",
        "University", "College", "Institute", "Polytechnic", "Academy", "School",
    ]
    snippets = _windows_around_keywords(text, keywords, window=20)
    if not snippets:
        return None

    # 组织成紧凑上下文，避免过长
    context = "\n---\n".join(snippets[:200])
    content = llm.extract(SCHOOL_JSON_PROMPT, context, max_tokens=600)
    if not content:
        return None
    obj = _extract_json_object(content)
    if not isinstance(obj, dict):
        return None
    schools = _normalize_string_list(obj.get("education_school"))
    return schools


def _strip_code_fences(s: str) -> str:
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s.strip()


def _extract_json_object(s: str) -> Optional[Dict[str, Any]]:
    s = _strip_code_fences(s)
    # 尝试直接解析
    try:
        return json.loads(s)
    except Exception:
        pass
    # 回退：取第一个 '{' 到最后一个 '}' 之间
    start = s.find('{')
    end = s.rfind('}')
    if start != -1 and end != -1 and end > start:
        frag = s[start:end+1]
        try:
            return json.loads(frag)
        except Exception:
            return None
    return None


def extract_name_from_text(text: str) -> Optional[str]:
    head = text[:1200]
    # 1) 显式“姓名/Name”
    m = re.search(r"(?:姓名|name)[:：]\s*([\u4e00-\u9fa5·]{2,10})", head, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # 2) 取开头短行中的人名样式（排除常见标题）
    lines = [ln.strip() for ln in head.splitlines() if ln.strip()]
    blacklist = {"个人简历", "简历", "RESUME", "CV", "Curriculum Vitae"}
    for ln in lines[:10]:
        if ln in blacklist:
            continue
        # 中文名 2-10 字
        if re.fullmatch(r"[\u4e00-\u9fa5·]{2,10}", ln):
            return ln
    return None


def extract_name_from_filename(file_name: Optional[str]) -> Optional[str]:
    if not file_name:
        return None
    base = re.sub(r"\.[^.]+$", "", file_name)
    # 常见分隔符拆分
    parts = re.split(r"[\s_\-]+", base)
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # 优先中文名
        if re.fullmatch(r"[\u4e00-\u9fa5·]{2,10}", p):
            return p
    # 其次英文名（首字母大写的 2-3 词）
    m = re.match(r"([A-Z][a-z]+)(?:\s+[A-Z][a-z]+){0,2}$", base)
    if m:
        return m.group(0)
    return None


def _normalize_string_list(values: Any, max_items: int = 50) -> Optional[List[str]]:
    if not values:
        return None
    if isinstance(values, list):
        out: List[str] = []
        for v in values:
            if isinstance(v, str):
                t = v.strip()
                if t:
                    out.append(t)
        # 去重并截断
        uniq: List[str] = []
        seen = set()
        for t in out:
            if t not in seen:
                uniq.append(t)
                seen.add(t)
        return uniq[:max_items] or None
    return None


def parse_resume(text: str, resume_file_id: Optional[int], file_name: Optional[str] = None) -> ParsedResume:
    # 1) 先用正则抓联系方式/学历（学校交由 LLM 为主）
    contact = extract_contact_info(text) or None
    degree = extract_degree(text) or None
    schools: Optional[List[str]] = None

    # 2) 调用 LLM 抽取姓名/专业/技能/经历/自评/其他
    llm = LLMClient.from_env()
    llm_json: Dict[str, Any] = {
        "name": None,
        "education_major": None,
        "skills": None,
        "work_experience": None,
        "internship_experience": None,
        "project_experience": None,
        "self_evaluation": None,
        "other": None,
    }

    if llm:
        content = llm.extract(LLM_JSON_PROMPT, text)
        if content:
            parsed = _extract_json_object(content)
            if isinstance(parsed, dict):
                llm_json.update(parsed)
            else:
                logger.warning("LLM 返回非 JSON，忽略")

    # 3) 姓名兜底：LLM -> 文本 -> 文件名 -> 默认
    name_fallback = (
        (llm_json.get("name") or None)
        or extract_name_from_text(text)
        or extract_name_from_filename(file_name)
        or "未知"
    )

    # 4) 规范化数组字段
    skills = _normalize_string_list(llm_json.get("skills"))
    work_ex = _normalize_string_list(llm_json.get("work_experience"))
    intern_ex = _normalize_string_list(llm_json.get("internship_experience"))
    proj_ex = _normalize_string_list(llm_json.get("project_experience"))

    # 5) 学校：单独 LLM 抽取（基于关键词窗口）；若不可用/为空，再尝试通用 LLM 字段；最后回退正则
    schools_llm_windows = extract_schools_via_llm(text)
    if schools_llm_windows:
        schools = schools_llm_windows
    else:
        schools_llm_general = _normalize_string_list(llm_json.get("education_school"))
        if schools_llm_general:
            schools = schools_llm_general
        else:
            schools = extract_schools(text)

    # 6) 学校层次：基于已抽取的学校集合进行分类，取最高层次
    education_tier: Optional[str] = None
    education_tiers: Optional[List[str]] = None
    if schools:
        cls = classify_education_background([{ "school": s } for s in schools])
        code = (cls or {}).get("highest_education_level")
        code_to_cn = {
            "985": "985",
            "211": "211",
            "double_first_class": "双一流",
            "overseas": "海外",
            "regular": "普通本科",
            "unknown": "未知",
            None: None,
        }
        education_tier = code_to_cn.get(code, "未知")
        # 多值并存
        levels = (cls or {}).get("education_levels") or []
        education_tiers = [code_to_cn.get(lv, lv) for lv in levels]

    # 7) 分类与标签
    category, tag_names = classify_category_and_tags(text)

    # 8) 纯规则提取工作年限（写入 work_years）
    work_years = extract_work_years(text)

    return ParsedResume(
        resume_file_id=resume_file_id,
        name=name_fallback,
        contact_info=contact,
        education_degree=degree,
        education_school=schools,
        education_major=(llm_json.get("education_major") or None),
        education_graduation_year=None,   # 暂不处理
        education_tier=education_tier,
        education_tiers=education_tiers,
        category=category,
        tag_names=tag_names,
        skills=skills,
        work_experience=work_ex,
        internship_experience=intern_ex,
        project_experience=proj_ex,
        self_evaluation=(llm_json.get("self_evaluation") or None),
        other=(llm_json.get("other") or None),
        work_years=work_years,
    )


# ============== 工作年限（纯规则） ==============
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


def _parse_year_month(token: str) -> Tuple[int, int]:
    token = token.strip().lower()
    # YYYY.MM / YYYY-MM / YYYY/MM
    m = re.match(r"(\d{4})[\.\-/](\d{1,2})", token)
    if m:
        y = int(m.group(1)); mth = int(m.group(2)); return y, max(1, min(12, mth))
    # YYYY 年 MM 月
    m = re.match(r"(\d{4})\s*年\s*(\d{1,2})\s*月", token)
    if m:
        y = int(m.group(1)); mth = int(m.group(2)); return y, max(1, min(12, mth))
    # 英文月份 MMM YYYY / MMMM YYYY
    m = re.match(r"([a-zA-Z]{3,9})\s+(\d{4})", token)
    if m:
        mon = _MONTHS_EN.get(m.group(1).lower())
        if mon:
            return int(m.group(2)), mon
    # 仅年份 YYYY -> 默认 06 月
    m = re.match(r"(\d{4})\b", token)
    if m:
        return int(m.group(1)), 6
    raise ValueError("bad token")


def _parse_date(token: str) -> date:
    y, m = _parse_year_month(token)
    return date(y, m, 1)


def _extract_periods(text: str) -> List[Tuple[date, date]]:
    t = text.replace("至 今", "至今")
    now = date.today()
    periods: List[Tuple[date, date]] = []

    # 常见分隔符：- – — ~ to 至 …
    sep = r"\s*(?:-|–|—|~|to|至|–|—)\s*"
    # 起止匹配（支持中文/英文月份/仅年），终点可为至今/Present/Now
    pat = re.compile(
        rf"((?:\d{{4}}(?:[\.\-/]\d{{1,2}})?|\d{{4}}年\d{{1,2}}月|[A-Za-z]{{3,9}}\s+\d{{4}})){sep}((?:\d{{4}}(?:[\.\-/]\d{{1,2}})?|\d{{4}}年\d{{1,2}}月|[A-Za-z]{{3,9}}\s+\d{{4}}|至今|present|now))",
        re.IGNORECASE,
    )
    for m in pat.finditer(t):
        a = m.group(1); b = m.group(2)
        try:
            start = _parse_date(a)
            end = now if re.match(r"^(至今|present|now)$", b, re.IGNORECASE) else _parse_date(b)
            if end < start:
                continue
            periods.append((start, end))
        except Exception:
            continue

    return periods


def _merge_periods(periods: List[Tuple[date, date]]) -> List[Tuple[date, date]]:
    if not periods:
        return []
    periods.sort(key=lambda x: x[0])
    merged = [periods[0]]
    for s, e in periods[1:]:
        ls, le = merged[-1]
        if s <= le:
            if e > le:
                merged[-1] = (ls, e)
        else:
            merged.append((s, e))
    return merged


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month) + 1  # 按月计入，含端点月


def _extract_years_from_text(text: str) -> Optional[float]:
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
    # 取中位或最大，可按需调整；这里取中位数更稳
    vals.sort()
    return vals[len(vals)//2]


def extract_work_years(text: str) -> Optional[int]:
    """纯规则提取工作年限，返回整数年。"""
    periods = _extract_periods(text)
    merged = _merge_periods(periods)
    total_months = sum(_months_between(s, e) for s, e in merged)

    years_from_periods: Optional[float] = None
    if total_months > 0:
        years_from_periods = round(total_months / 12.0, 1)

    years_from_text = _extract_years_from_text(text)

    years_dec: Optional[float]
    if years_from_periods is not None and years_from_text is not None:
        # 两者都存在，取更保守的较小值（避免口号夸大）
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


def classify_category_and_tags(text: str) -> tuple[Optional[str], Optional[list[str]]]:
    """分类与标签：
    1) 使用 gpt-4o-mini 判定 技术类/非技术类；
    2) 在 markdown 文本中大小写不敏感地直接匹配 tags.tag_name，命中即加入标签；
    3) 再用 gpt-4o-mini 从“未命中”的候选集中补充相关标签（仅可从候选集选择）。
    返回：category('技术类'|'非技术类'|None), tag_names(list[str]|None)
    """
    client = get_supabase_client()
    try:
        tags_res = client.table("tags").select("tag_name, category").execute()
        rows = getattr(tags_res, "data", []) or []
        all_tags = [str(t.get("tag_name", "")).strip() for t in rows if t.get("tag_name")]
        all_tags_set = set(all_tags)
        tech_tag_set = {str(t.get("tag_name")).strip() for t in rows if t.get("category") == "技术类"}
        nontech_tag_set = {str(t.get("tag_name")).strip() for t in rows if t.get("category") == "非技术类"}
    except Exception:
        return None, None

    # 1) 分类：gpt-4o-mini
    from .llm import LLMClient as _LLM
    cat_llm = _LLM.from_env_with_model("gpt-4o-mini")
    category: Optional[str] = None
    if cat_llm:
        cat_prompt = (
            "请判断以下简历文本属于 '技术类' 还是 '非技术类'，仅输出 JSON：{\"category\": \"技术类|非技术类\"}。不得输出解释或其他内容。\n"
            "示例1 文本: '5年Java后端开发，微服务，K8s与Docker' -> {\"category\": \"技术类\"}\n"
            "示例2 文本: '内容策划与品牌运营，活动组织' -> {\"category\": \"非技术类\"}\n"
        )
        cat_content = cat_llm.extract(cat_prompt, text[:10000], max_tokens=20)
        if cat_content:
            try:
                cat_obj = json.loads(cat_content.strip().strip('`'))
                cat_val = (cat_obj.get("category") or "").strip()
                if cat_val in ("技术类", "非技术类"):
                    category = cat_val
            except Exception:
                category = None

    # 2) 文本直接匹配（大小写不敏感）
    text_lower = text.lower()
    direct_matched = {t for t in all_tags if t and t.lower() in text_lower}

    # 3) 让 gpt-4o-mini 从“未命中”的候选集中补充
    tag_names: Optional[list[str]] = None
    tag_llm = _LLM.from_env_with_model("gpt-4o-mini")
    tags_set = set(direct_matched)
    remaining = sorted(list(all_tags_set - tags_set))
    if tag_llm and remaining:
        candidate_str = "\n".join(f"- {t}" for t in remaining)
        tag_prompt = (
            "从候选标签中选择与该简历相关但未在文本中直接出现的标签，仅输出 JSON：{\"tags\": string[]}。\n"
            "要求：\n- 只能从候选集中选择，不得新增；\n- 不要重复；\n- 不要输出解释或其他文本。\n"
            f"候选标签（仅可从中选择）：\n{candidate_str}\n"
            "\nFew-shot：\n"
            "输入: '5年Java/Python后端，负责微服务与API'（已直接命中: Java, Python）\n"
            "输出: {\"tags\": [\"后端开发\", \"微服务\", \"API\"]}\n"
            "输入: '内容策划、品牌运营，新媒体运营'（已直接命中: 无）\n"
            "输出: {\"tags\": [\"内容运营\", \"品牌运营\"]}\n"
        )
        tag_content = tag_llm.extract(tag_prompt, text[:20000], max_tokens=400)
        add_data = None
        if tag_content:
            try:
                add_data = json.loads(tag_content.strip().strip('`'))
            except Exception:
                add_data = None
        if isinstance(add_data, dict):
            sel_tags = add_data.get("tags") if isinstance(add_data.get("tags"), list) else []
            for t in sel_tags:
                if isinstance(t, str) and t in all_tags_set:
                    tags_set.add(t)

    if category == "技术类":
        tags_set = {t for t in tags_set if (t in tech_tag_set) or (t not in nontech_tag_set)}
    elif category == "非技术类":
        tags_set = {t for t in tags_set if (t in nontech_tag_set) or (t not in tech_tag_set)}
    # 若无法判定类别，则不做类别过滤

    return category, (sorted(tags_set) if tags_set else None)


