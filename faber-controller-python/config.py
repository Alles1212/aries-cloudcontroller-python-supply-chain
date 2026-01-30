"""
配置管理
使用環境變數配置應用程式
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """應用程式設定"""
    
    # Faber Agent 連線設定
    faber_agent_host: str = os.getenv("FABER_AGENT_HOST", "faber-agent")
    faber_agent_port: int = int(os.getenv("FABER_AGENT_PORT", "8021"))
    
    # ACA-Py Admin API 設定
    admin_insecure: bool = True  # 開發環境使用 insecure mode
    
    # Controller 服務設定
    port: int = 3000
    reload: bool = os.getenv("RELOAD", "false").lower() == "true"
    
    # 運行模式
    runmode: str = os.getenv("RUNMODE", "docker")
    
    @property
    def faber_agent_url(self) -> str:
        """構建 Faber Agent 的完整 URL"""
        return f"http://{self.faber_agent_host}:{self.faber_agent_port}"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """取得設定實例 (單例模式)"""
    return Settings()
