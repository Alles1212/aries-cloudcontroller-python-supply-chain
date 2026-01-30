"""配置管理 - Acme Controller"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Acme Controller 設定"""
    
    acme_agent_host: str = os.getenv("ACME_AGENT_HOST", "acme-agent")
    acme_agent_port: int = int(os.getenv("ACME_AGENT_PORT", "8041"))
    admin_insecure: bool = True
    
    port: int = 3000
    reload: bool = os.getenv("RELOAD", "false").lower() == "true"
    runmode: str = os.getenv("RUNMODE", "docker")
    
    @property
    def acme_agent_url(self) -> str:
        """構建 Acme Agent 的完整 URL"""
        return f"http://{self.acme_agent_host}:{self.acme_agent_port}"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """取得設定實例 (單例模式)"""
    return Settings()
