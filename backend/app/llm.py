from __future__ import annotations

import os
import logging
from typing import Optional


logger = logging.getLogger("llm")


class LLMClient:
    """可选的 LLM 客户端，当前支持 OpenAI，如果未配置将返回 None。

    使用方式：
      client = LLMClient.from_env()
      if client:
          text = client.summarize("...")
    """

    def __init__(self, model: str, api_key: str, base_url: Optional[str] = None) -> None:
        from openai import OpenAI  # type: ignore

        self.model = model
        if base_url:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
        else:
            self.client = OpenAI(api_key=api_key)

    @staticmethod
    def from_env() -> Optional["LLMClient"]:
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        if not api_key:
            return None
        try:
            return LLMClient(model=model, api_key=api_key, base_url=base_url)
        except Exception as e:
            logger.warning(f"初始化 LLM 失败：{e}")
            return None

    @staticmethod
    def from_env_with_model(model_name: str) -> Optional["LLMClient"]:
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        if not api_key:
            return None
        try:
            return LLMClient(model=model_name, api_key=api_key, base_url=base_url)
        except Exception as e:
            logger.warning(f"初始化 LLM 指定模型失败：{e}")
            return None

    def extract(self, prompt: str, text: str, max_tokens: int = 1200) -> Optional[str]:
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是简历信息抽取助手，严格按用户要求输出 JSON。"},
                    {"role": "user", "content": prompt + "\n\n```\n" + text[:20000] + "\n```"},
                ],
                temperature=0.2,
                max_tokens=max_tokens,
            )
            return completion.choices[0].message.content or None
        except Exception as e:
            logger.warning(f"LLM 提取失败：{e}")
            return None


