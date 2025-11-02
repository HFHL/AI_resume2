"""
简历翻译模块
将英文简历按段落翻译为中文，保持专业性和准确性
"""
import re
import logging
from typing import List, Optional, Tuple
from .llm import LLMClient

logger = logging.getLogger("translator")


class ResumeTranslator:
    """简历翻译器"""
    
    def __init__(self, model: str = "gpt-4o-mini"):
        """初始化翻译器
        
        Args:
            model: 使用的模型名称
        """
        self.llm = LLMClient.from_env_with_model(model)
        if not self.llm:
            logger.warning("无法初始化 LLM 客户端，翻译功能不可用")
    
    def is_available(self) -> bool:
        """检查翻译器是否可用"""
        return self.llm is not None
    
    def split_by_headings(self, markdown_text: str) -> List[Tuple[str, str]]:
        """按照 # 标题分割 Markdown 文本
        
        Args:
            markdown_text: Markdown 格式的文本
            
        Returns:
            List of (heading_line, content) tuples
            heading_line 包含 # 标题行，content 是该标题下的内容
        """
        sections = []
        lines = markdown_text.split('\n')
        
        current_heading = ""
        current_content = []
        
        for line in lines:
            # 检查是否是标题行（以 # 开头）
            if re.match(r'^#+\s+', line):
                # 保存前一段
                if current_heading or current_content:
                    sections.append((
                        current_heading,
                        '\n'.join(current_content).strip()
                    ))
                
                # 开始新段
                current_heading = line
                current_content = []
            else:
                current_content.append(line)
        
        # 保存最后一段
        if current_heading or current_content:
            sections.append((
                current_heading,
                '\n'.join(current_content).strip()
            ))
        
        return sections
    
    def translate_section(self, heading: str, content: str) -> Tuple[str, str]:
        """翻译单个段落
        
        Args:
            heading: 标题行（可能为空）
            content: 段落内容
            
        Returns:
            (translated_heading, translated_content)
        """
        if not self.llm:
            return heading, content
        
        # 如果内容为空或太短，直接返回
        if not content or len(content.strip()) < 5:
            return heading, content
        
        # 检查是否主要是英文
        if not self._is_mostly_english(content):
            # 如果主要不是英文，可能已经是中文，直接返回
            return heading, content
        
        # 构建翻译提示词
        prompt = self._build_translation_prompt()
        
        # 构建待翻译文本
        text_to_translate = content
        if heading:
            text_to_translate = f"{heading}\n\n{content}"
        
        try:
            # 调用 LLM 翻译
            result = self.llm.extract(
                prompt,
                text_to_translate,
                max_tokens=2000,
                system_prompt=(
                    "You are a professional resume translator. Output ONLY the translated Markdown in Simplified Chinese. "
                    "Do NOT output JSON, do NOT wrap with code fences, do NOT add any extra notes. "
                    "Preserve Markdown structure (# headings, lists, bold), keep proper nouns (company/product/tech/person/school) in original language. "
                    "Translate sentences faithfully without summarization or omission."
                ),
            )
            if result:
                # 如果有标题，需要分离出来
                if heading:
                    lines = result.strip().split('\n', 1)
                    if len(lines) >= 2 and lines[0].startswith('#'):
                        return lines[0], lines[1].strip()
                    else:
                        # 翻译结果没有正确分离标题
                        return heading, result.strip()
                else:
                    return "", result.strip()
        except Exception as e:
            logger.warning(f"翻译失败: {e}")
        
        # 翻译失败，返回原文
        return heading, content
    
    def translate_markdown(self, markdown_text: str, progress_callback=None) -> str:
        """翻译整个 Markdown 文档
        
        Args:
            markdown_text: 原始 Markdown 文本
            progress_callback: 进度回调函数，接收 (current, total, section_name)
            
        Returns:
            翻译后的 Markdown 文本
        """
        if not self.llm:
            logger.error("LLM 客户端未初始化")
            return markdown_text
        
        # 分割为段落
        sections = self.split_by_headings(markdown_text)
        logger.info(f"分割为 {len(sections)} 个段落")
        
        translated_sections = []
        
        for i, (heading, content) in enumerate(sections, 1):
            if progress_callback:
                section_name = heading if heading else f"段落 {i}"
                progress_callback(i, len(sections), section_name)
            
            logger.info(f"翻译段落 {i}/{len(sections)}: {heading[:50] if heading else '(无标题)'}...")
            
            # 翻译段落
            trans_heading, trans_content = self.translate_section(heading, content)
            
            # 组合结果
            if trans_heading:
                translated_sections.append(trans_heading)
                if trans_content:
                    translated_sections.append(trans_content)
            else:
                if trans_content:
                    translated_sections.append(trans_content)
        
        return '\n\n'.join(translated_sections)
    
    def _is_mostly_english(self, text: str) -> bool:
        """判断文本是否主要是英文"""
        if not text:
            return False
        letters = sum(1 for ch in text if ('A' <= ch <= 'Z') or ('a' <= ch <= 'z'))
        total = len([ch for ch in text if ch.strip()])
        return total > 0 and (letters / total) > 0.5
    
    def _build_translation_prompt(self) -> str:
        """构建专业的翻译提示词"""
        return """你是一位专业的英文简历翻译专家。请将以下英文简历内容翻译为简体中文。

翻译要求：
1. 保持专业性：使用专业、正式的中文表达
2. 保留原文格式：Markdown 格式保持不变（标题、列表、加粗等）
3. 保留专有名词：公司名、产品名、技术名词、人名保持英文原文
   - 例如：Google, AWS, React, Python, MapleStory, Nexon 等
4. 保留数字和符号：如 60K+, 35%, $45M 等保持原样
5. 准确翻译职位和技能：
   - Business Development Manager → 商务发展经理
   - Product Manager → 产品经理
   - Senior Engineer → 高级工程师
6. 保持时间格式：如 "Feb. 2024" 可翻译为 "2024年2月" 或保持原样
7. 逐句直译：不要省略或总结，保持原文信息完整
8. 自然流畅：确保中文表达自然、地道

特别注意：
- 成就列表（如 ▪, •, - 开头的条目）需要逐条翻译
- 技术术语如 API, SDK, GTM, KOL, CAC, ROI 等保持英文
- 学校名称保持英文
- 项目名称和品牌名称保持英文

请直接输出翻译后的文本，不要添加任何解释或说明。"""

