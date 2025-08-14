from __future__ import annotations

"""
教育水平与学校层次分析工具

包含：
- EducationAnalyzer: 依据学位关键词/模式，判定最高教育水平（博士后/博士/硕士/本科/专科/高中/未知）
- UniversityClassifier: 依据配置与启发式，判定学校层次（985/211/双一流/overseas/regular/unknown）
"""

import json
import os
import re
from difflib import SequenceMatcher
from .llm import LLMClient
from typing import List, Dict, Any, Optional


class EducationAnalyzer:
    def __init__(self) -> None:
        self.degree_levels: Dict[str, float] = {
            # 博士
            "博士": 1,
            "博士后": 0.5,
            "博士研究生": 1,
            "PhD": 1,
            "Ph.D": 1,
            "Ph.D.": 1,
            "Doctor": 1,
            "Doctorate": 1,
            "DPhil": 1,
            "Doctoral": 1,

            # 硕士
            "硕士": 2,
            "硕士研究生": 2,
            "研究生": 2,
            "Master": 2,
            "Masters": 2,
            "Master's": 2,
            "MS": 2,
            "M.S": 2,
            "M.S.": 2,
            "MA": 2,
            "M.A": 2,
            "M.A.": 2,
            "MBA": 2,
            "M.B.A": 2,
            "MEng": 2,
            "M.Eng": 2,
            "MSc": 2,
            "M.Sc": 2,
            "MFA": 2,
            "M.F.A": 2,
            "MPH": 2,
            "M.P.H": 2,
            "MPA": 2,
            "M.P.A": 2,

            # 本科
            "本科": 3,
            "学士": 3,
            "学士学位": 3,
            "Bachelor": 3,
            "Bachelors": 3,
            "Bachelor's": 3,
            "BS": 3,
            "B.S": 3,
            "B.S.": 3,
            "BA": 3,
            "B.A": 3,
            "B.A.": 3,
            "BEng": 3,
            "B.Eng": 3,
            "BSc": 3,
            "B.Sc": 3,
            "BFA": 3,
            "B.F.A": 3,
            "BBA": 3,
            "B.B.A": 3,

            # 专科
            "专科": 4,
            "大专": 4,
            "高职": 4,
            "大学专科": 4,
            "Associate": 4,
            "Associates": 4,
            "Associate's": 4,
            "AA": 4,
            "A.A": 4,
            "AS": 4,
            "A.S": 4,
            "AAS": 4,
            "A.A.S": 4,

            # 高中
            "高中": 5,
            "中专": 5,
            "技校": 5,
            "职高": 5,
            "高中毕业": 5,
            "High School": 5,
            "高等中学": 5,

            # 其他
            "暂无": 999,
            "无": 999,
            "": 999,
        }

        self.degree_patterns: List[str] = [
            # 中文
            r'(?:博士后|博士研究生|博士学位|博士)',
            r'(?:硕士研究生|硕士学位|研究生|硕士)',
            r'(?:学士学位|本科学历|本科|学士)',
            r'(?:大学专科|专科学历|专科|大专|高职)',
            r'(?:高中毕业|高中学历|高中|中专|技校|职高)',

            # 英文
            r'(?:Ph\.?D\.?|Doctorate?|Doctoral)',
            r'(?:Master\'?s?|M\.?[A-Z]\.?[A-Z]?\.?|MBA|MEng|MSc|MFA|MPH|MPA)',
            r'(?:Bachelor\'?s?|B\.?[A-Z]\.?[A-Z]?\.?|BEng|BSc|BFA|BBA)',
            r'(?:Associate\'?s?|A\.?[A-Z]\.?[A-Z]?\.?)',
            r'(?:High\s+School|Secondary\s+School)'
        ]

    def _normalize_degree(self, degree_text: str) -> str:
        if not degree_text:
            return ""
        normalized = re.sub(r'\s+', ' ', degree_text.strip())
        if normalized in self.degree_levels:
            return normalized

        for pattern in self.degree_patterns:
            matches = re.findall(pattern, normalized, re.IGNORECASE)
            if matches:
                match = matches[0]
                for standard_degree in self.degree_levels:
                    if standard_degree.lower() in match.lower() or match.lower() in standard_degree.lower():
                        return standard_degree

        nl = normalized.lower()
        if any(k in nl for k in ['博士', 'phd', 'ph.d', 'doctor', 'doctoral']):
            return '博士'
        if any(k in nl for k in ['硕士', '研究生', 'master', 'mba', 'msc', 'ma']):
            return '硕士'
        if any(k in nl for k in ['本科', '学士', 'bachelor', 'bs', 'ba', 'bsc']):
            return '本科'
        if any(k in nl for k in ['专科', '大专', 'associate']):
            return '专科'
        if any(k in nl for k in ['高中', 'high school']):
            return '高中'
        return '暂无'

    def _get_degree_level(self, degree: str) -> float:
        normalized = self._normalize_degree(degree)
        return self.degree_levels.get(normalized, 999)

    def analyze_highest_education_level(self, education_list: List[Dict[str, Any]]) -> str:
        if not education_list:
            return '未知'
        highest_level = 999
        highest_degree = '未知'
        for edu in education_list:
            if not isinstance(edu, dict):
                continue
            degree_text = edu.get('degree', '')
            if not degree_text or degree_text == '暂无':
                continue
            level = self._get_degree_level(degree_text)
            if level < highest_level:
                highest_level = level
                highest_degree = self._normalize_degree(degree_text)

        if highest_degree == '博士后':
            return '博士后'
        if highest_degree in ['博士', '博士研究生', 'PhD', 'Ph.D', 'Ph.D.', 'Doctor', 'Doctorate', 'DPhil', 'Doctoral']:
            return '博士'
        if highest_degree in ['硕士', '硕士研究生', '研究生'] or 'Master' in highest_degree or highest_degree in ['MS', 'M.S', 'M.S.', 'MA', 'M.A', 'M.A.', 'MBA', 'M.B.A', 'MEng', 'M.Eng', 'MSc', 'M.Sc', 'MFA', 'M.F.A', 'MPH', 'M.P.H', 'MPA', 'M.P.A']:
            return '硕士'
        if highest_degree in ['本科', '学士', '学士学位'] or 'Bachelor' in highest_degree or highest_degree in ['BS', 'B.S', 'B.S.', 'BA', 'B.A', 'B.A.', 'BEng', 'B.Eng', 'BSc', 'B.Sc', 'BFA', 'B.F.A', 'BBA', 'B.B.A']:
            return '本科'
        if highest_degree in ['专科', '大专', '高职', '大学专科'] or 'Associate' in highest_degree or highest_degree in ['AA', 'A.A', 'AS', 'A.S', 'AAS', 'A.A.S']:
            return '专科'
        if highest_degree in ['高中', '中专', '技校', '职高', '高中毕业', 'High School', '高等中学']:
            return '高中'
        return '未知'

    def get_education_analysis(self, education_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        highest_level = self.analyze_highest_education_level(education_list)
        level_counts = {k: 0 for k in ['博士后', '博士', '硕士', '本科', '专科', '高中', '未知']}
        degree_details: List[Dict[str, Any]] = []
        for edu in education_list:
            if not isinstance(edu, dict):
                continue
            degree_text = edu.get('degree', '')
            school = edu.get('school', '')
            if degree_text and degree_text != '暂无':
                normalized_degree = self._normalize_degree(degree_text)
                level_value = self._get_degree_level(degree_text)
                if normalized_degree == '博士后':
                    category = '博士后'
                elif level_value == 1:
                    category = '博士'
                elif level_value == 2:
                    category = '硕士'
                elif level_value == 3:
                    category = '本科'
                elif level_value == 4:
                    category = '专科'
                elif level_value == 5:
                    category = '高中'
                else:
                    category = '未知'
                level_counts[category] += 1
                degree_details.append({
                    'school': school,
                    'degree': degree_text,
                    'normalized_degree': normalized_degree,
                    'level_category': category,
                })
        return {
            'highest_education_level': highest_level,
            'level_counts': level_counts,
            'degree_details': degree_details,
            'total_degrees': len(degree_details),
        }


class UniversityClassifier:
    def __init__(self, config_dir: Optional[str] = None) -> None:
        if config_dir is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            # 默认配置目录：项目 backend/config
            config_dir = os.path.join(os.path.dirname(os.path.dirname(current_dir)), 'config')
        self.config_dir = config_dir
        self._load_university_data()

    def _load_json_file(self, filename: str) -> List[str]:
        path = os.path.join(self.config_dir, filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            # 如果文件不存在，创建空模板，便于用户填充
            os.makedirs(self.config_dir, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            return []
        except json.JSONDecodeError:
            return []

    def _load_university_data(self) -> None:
        self.universities_985 = self._load_json_file('universities_985.json')
        self.universities_211 = self._load_json_file('universities_211.json')
        self.universities_double_first_class = self._load_json_file('universities_double_first_class.json')
        self.universities_overseas = self._load_json_file('universities_overseas.json')
        self.alias_mapping = self._create_alias_mapping()

    def _create_alias_mapping(self) -> Dict[str, str]:
        return {
            '清华': '清华大学', '北大': '北京大学', '人大': '中国人民大学', '北航': '北京航空航天大学',
            '北师大': '北京师范大学', '北理工': '北京理工大学', '中科大': '中国科学技术大学', '科大': '中国科学技术大学',
            '复旦': '复旦大学', '上交': '上海交通大学', '上海交大': '上海交通大学', '浙大': '浙江大学', '南大': '南京大学',
            '中大': '中山大学', '华科': '华中科技大学', '华中科大': '华中科技大学', '西交': '西安交通大学', '西安交大': '西安交通大学',
            '哈工大': '哈尔滨工业大学', '武大': '武汉大学', '川大': '四川大学', '电子科大': '电子科技大学', '成电': '电子科技大学', 'UESTC': '电子科技大学',
            '北邮': '北京邮电大学', '北科': '北京科技大学', '北交': '北京交通大学', '华理': '华东理工大学', '东华': '东华大学', '上财': '上海财经大学',
            '上外': '上海外国语大学', '华电': '华北电力大学', '石油大学': '中国石油大学', '地质大学': '中国地质大学', '矿业大学': '中国矿业大学', '传媒大学': '中国传媒大学',
            '政法大学': '中国政法大学', '农业大学': '中国农业大学',

            'Harvard': 'Harvard University', '哈佛': 'Harvard University', 'Stanford': 'Stanford University', '斯坦福': 'Stanford University',
            'MIT': 'Massachusetts Institute of Technology', '麻省理工': 'Massachusetts Institute of Technology', 'Cambridge': 'University of Cambridge', '剑桥': 'University of Cambridge',
            'Oxford': 'University of Oxford', '牛津': 'University of Oxford', 'Berkeley': 'University of California, Berkeley', '加州大学伯克利': 'University of California, Berkeley',
            'UCLA': 'University of California, Los Angeles', '加州大学洛杉矶': 'University of California, Los Angeles', 'Yale': 'Yale University', '耶鲁': 'Yale University',
            'Princeton': 'Princeton University', '普林斯顿': 'Princeton University', 'Columbia': 'Columbia University', '哥伦比亚': 'Columbia University',
            'Caltech': 'California Institute of Technology', '加州理工': 'California Institute of Technology', 'Chicago': 'University of Chicago', '芝加哥大学': 'University of Chicago',
            'Penn': 'University of Pennsylvania', '宾夕法尼亚': 'University of Pennsylvania', 'Cornell': 'Cornell University', '康奈尔': 'Cornell University',
            'UCL': 'University College London', '伦敦大学学院': 'University College London', 'Imperial': 'Imperial College London', '帝国理工': 'Imperial College London',
            'LSE': 'London School of Economics', '伦敦政经': 'London School of Economics', 'Edinburgh': 'University of Edinburgh', '爱丁堡': 'University of Edinburgh',
            'Manchester': 'University of Manchester', '曼彻斯特': 'University of Manchester',
            '东京大学': 'University of Tokyo', '京都大学': 'Kyoto University', '早稻田': 'Waseda University', '慶應': 'Keio University',
            '首尔大学': 'Seoul National University', 'KAIST': 'KAIST', '新加坡国立': 'National University of Singapore', 'NUS': 'National University of Singapore',
            '南洋理工': 'Nanyang Technological University', 'NTU': 'Nanyang Technological University', '港大': 'University of Hong Kong', '科大': 'Hong Kong University of Science and Technology',
            '多伦多大学': 'University of Toronto', 'UBC': 'University of British Columbia', 'McGill': 'McGill University', '墨尔本大学': 'University of Melbourne',
            '悉尼大学': 'University of Sydney', 'ANU': 'Australian National University',
        }

    def _normalize_university_name(self, name: str) -> str:
        if not name:
            return ''
        name = re.sub(r'\s+', ' ', name.strip())
        return self.alias_mapping.get(name, name)

    def _fuzzy_match(self, target: str, candidates: List[str], threshold: float = 0.8) -> Optional[str]:
        target_l = target.lower()
        best_ratio = 0.0
        best_match = None
        for c in candidates:
            r = SequenceMatcher(None, target_l, c.lower()).ratio()
            if r > best_ratio and r >= threshold:
                best_ratio = r
                best_match = c
        return best_match

    def classify_university(self, university_name: str) -> str:
        if not university_name:
            return 'unknown'
        n = self._normalize_university_name(university_name)
        if n in self.universities_985:
            return '985'
        if n in self.universities_211:
            return '211'
        if n in self.universities_double_first_class:
            return 'double_first_class'
        # 先尝试国内名单的模糊匹配
        if self._fuzzy_match(n, self.universities_985):
            return '985'
        if self._fuzzy_match(n, self.universities_211):
            return '211'
        if self._fuzzy_match(n, self.universities_double_first_class):
            return 'double_first_class'
        # 未识别为国内院校：调用 LLM 判断是否海外
        llm_overseas = self._is_overseas_via_llm(n)
        if llm_overseas is True:
            return 'overseas'
        if llm_overseas is False:
            # 明确非海外，按国内普通本科处理（也可能是专科/中专等，这里仅用于学校层次）
            return 'regular'
        # LLM 未返回确定结果，则退回启发式
        if self._is_likely_overseas(n):
            return 'overseas'
        if self._is_likely_domestic_regular(n):
            return 'regular'
        return 'unknown'

    def _is_overseas_via_llm(self, university_name: str) -> Optional[bool]:
        """使用 LLM 进行海外/国内判别（简单且强约束，带 few-shot）。

        返回：True=海外，False=非海外（国内/港澳台按需求也算海外请自行调整），None=不确定
        """
        client = LLMClient.from_env()
        if not client:
            return None

        prompt = (
            "判断给定的院校名称是否属于海外大学。仅输出 JSON，不要解释。\\n"
            "输出格式：{\"overseas\": true|false|null}\\n"
            "规则：\\n"
            "- overseas=true 表示海外大学；false 表示非海外（国内）。\\n"
            "- 无法判断时 overseas=null。\\n"
            "- 严格只返回一个 JSON 对象。\\n"
            "\\n"
            "示例：\\n"
            "输入: 'Harvard University'\\n"
            "输出: {\"overseas\": true}\\n"
            "\\n"
            "输入: '清华大学'\\n"
            "输出: {\"overseas\": false}\\n"
            "\\n"
            "输入: '北京邮电大学'\\n"
            "输出: {\"overseas\": false}\\n"
            "\\n"
            "输入: 'University of Cambridge'\\n"
            "输出: {\"overseas\": true}\\n"
        )

        content = client.extract(prompt, university_name, max_tokens=30)
        if not content:
            return None
        try:
            data = json.loads(content.strip().strip('`'))
            val = data.get('overseas', None)
            if isinstance(val, bool):
                return val
            return None
        except Exception:
            return None

    def _is_likely_overseas(self, name: str) -> bool:
        overseas_keywords = [
            'University', 'College', 'Institute', 'School',
            'Universität', 'Université', 'Universidad', 'Università', 'Universidade', 'Universiteit',
        ]
        english_char_ratio = (sum(1 for c in name if ord(c) < 128) / len(name)) if name else 0.0
        has_kw = any(k in name for k in overseas_keywords)
        return has_kw and english_char_ratio > 0.5

    def _is_likely_domestic_regular(self, name: str) -> bool:
        domestic_keywords = ['大学', '学院', '职业技术学院', '高等专科学校']
        return any(k in name for k in domestic_keywords)

    def classify_education_background(self, education_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        education_levels: List[str] = []
        # 单独评估海外与国内层次
        domestic_priority = {'985': 1, '211': 2, 'double_first_class': 3, 'regular': 4}
        top_domestic = None
        top_domestic_pr = 999
        has_overseas = False

        for edu in education_list:
            if not isinstance(edu, dict) or 'school' not in edu:
                continue
            level = self.classify_university(edu.get('school', ''))
            if level == 'unknown':
                continue
            education_levels.append(level)
            if level == 'overseas':
                has_overseas = True
            else:
                pr = domestic_priority.get(level, 999)
                if pr < top_domestic_pr:
                    top_domestic_pr = pr
                    top_domestic = level

        # 去重
        education_levels = list(set(education_levels))

        result: Dict[str, Any] = {
            'education_levels': education_levels,
            'highest_education_level': None,  # 保持兼容字段，但我们不再单一化
            'has_overseas': has_overseas,
            'has_985': '985' in education_levels,
            'has_211': '211' in education_levels,
            'has_double_first_class': 'double_first_class' in education_levels,
            'has_regular': 'regular' in education_levels,
            'top_domestic_level': top_domestic,  # '985'|'211'|'double_first_class'|'regular'|None
        }
        # 保持原有 highest_education_level 语义：若存在 985 则 985；否则若海外则 overseas；再 211；再双一流；再 regular；否则 unknown
        order = ['985', 'overseas', '211', 'double_first_class', 'regular']
        for k in order:
            if k in education_levels or (k == 'overseas' and has_overseas):
                result['highest_education_level'] = k
                break
        if result['highest_education_level'] is None:
            result['highest_education_level'] = 'unknown'

        return result


# 全局实例与便捷函数
education_analyzer = EducationAnalyzer()
university_classifier = UniversityClassifier()


def analyze_highest_education_level(education_list: List[Dict[str, Any]]) -> str:
    return education_analyzer.analyze_highest_education_level(education_list)


def get_education_analysis(education_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    return education_analyzer.get_education_analysis(education_list)


def classify_university(university_name: str) -> str:
    return university_classifier.classify_university(university_name)


def classify_education_background(education_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    return university_classifier.classify_education_background(education_list)


