"""配置管理 - Alice Controller"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Alice Controller 設定"""
    
    alice_agent_host: str = os.getenv("ALICE_AGENT_HOST", "alice-agent")
    alice_agent_port: int = int(os.getenv("ALICE_AGENT_PORT", "8031"))
    admin_insecure: bool = True
    
    port: int = 3000
    reload: bool = os.getenv("RELOAD", "false").lower() == "true"
    runmode: str = os.getenv("RUNMODE", "docker")
    
    @property
    def alice_agent_url(self) -> str:
        """構建 Alice Agent 的完整 URL"""
        return f"http://{self.alice_agent_host}:{self.alice_agent_port}"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """取得設定實例 (單例模式)"""
    return Settings()
