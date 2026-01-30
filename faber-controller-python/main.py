"""
Faber Controller - Python Backend
使用 FastAPI + aries-cloudcontroller-python

這是 Faber Controller 的 Python 重寫版本，使用:
- FastAPI: 現代化的 Python Web 框架
- aries-cloudcontroller-python: 型別安全的 ACA-Py 客戶端

與原 Node.js 版本的差異:
1. 使用強型別系統 (Pydantic models)
2. 使用 aries-cloudcontroller-python 取代原生 HTTP 請求
3. 更簡潔的程式碼，更好的錯誤處理
4. API 接口保持兼容，前端 React 不需修改
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from aries_cloudcontroller import AcaPyClient

from routes import connections, schemas, credential_definitions, credentials
from config import get_settings

# 配置日誌
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全域 ACA-Py 客戶端
acapy_client: Optional[AcaPyClient] = None


def get_acapy_client() -> AcaPyClient:
    """取得全域 ACA-Py 客戶端實例"""
    if acapy_client is None:
        raise RuntimeError("ACA-Py client not initialized")
    return acapy_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    global acapy_client
    settings = get_settings()
    
    # 啟動時初始化 ACA-Py 客戶端
    logger.info(f"Initializing ACA-Py client: {settings.faber_agent_url}")
    acapy_client = AcaPyClient(
        base_url=settings.faber_agent_url,
        admin_insecure=settings.admin_insecure
    )
    
    # 測試連線
    try:
        status = await acapy_client.server.get_status()
        logger.info(f"✓ ACA-Py agent connected successfully")
        logger.info(f"  Version: {status.version if hasattr(status, 'version') else 'N/A'}")
    except Exception as e:
        logger.warning(f"✗ Unable to connect to ACA-Py agent: {e}")
        logger.warning(f"  Agent may not be ready yet, will retry on first request")
    
    yield
    
    # 關閉時清理資源
    logger.info("Shutting down ACA-Py client")
    acapy_client = None


# 創建 FastAPI 應用程式
app = FastAPI(
    title="Faber Controller",
    description="Supply Chain Issuer Platform - Python Backend with aries-cloudcontroller",
    version="2.0.0",
    lifespan=lifespan
)

# CORS 中間件 (允許 React 前端調用)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開發環境允許所有來源，生產環境應限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊 API 路由
app.include_router(connections.router, prefix="/api", tags=["connections"])
app.include_router(schemas.router, prefix="/api", tags=["schemas"])
app.include_router(credential_definitions.router, prefix="/api", tags=["credential-definitions"])
app.include_router(credentials.router, prefix="/api", tags=["credentials"])


@app.get("/api/status")
async def get_status():
    """
    檢查 ACA-Py Agent 狀態
    
    對應原 Node.js 版本: GET /api/status
    """
    try:
        client = get_acapy_client()
        await client.server.get_status()
        return {"status": "up"}
    except Exception as e:
        logger.error(f"Agent status check failed: {e}")
        return {"status": "down"}


@app.get("/health")
async def health_check():
    """健康檢查端點 (供 Docker/K8s 使用)"""
    return {"status": "healthy", "service": "faber-controller"}


# 提供 React 前端靜態檔案
# 注意: 在開發環境中，React 前端由 Vite dev server 提供
# 在生產環境中，React build 後的檔案會被複製到 client/dist
static_files_path = os.path.join(os.path.dirname(__file__), "client", "dist")
if os.path.exists(static_files_path):
    logger.info(f"Serving React frontend from: {static_files_path}")
    app.mount("/assets", StaticFiles(directory=os.path.join(static_files_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        """提供 React 應用程式 (SPA fallback)"""
        # API 路由已經被上面的 router 處理，這裡只處理前端路由
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        
        index_path = os.path.join(static_files_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        else:
            raise HTTPException(status_code=404, detail="Frontend not built yet")
else:
    logger.warning(f"React frontend not found at: {static_files_path}")
    logger.warning("Run 'npm run build' in client/ directory to build frontend")


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.reload,
        log_level="info"
    )
