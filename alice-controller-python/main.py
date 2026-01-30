"""
Alice Controller - Python Backend
使用 FastAPI + aries-cloudcontroller-python

Alice 在供應鏈系統中扮演 Holder (持有者) 角色：
- 接收來自 Faber 的憑證
- 向 Acme 提供 Proof

API 端點與原 Angular 版本保持兼容
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

from routes import connections, credentials, proofs
from config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
    
    logger.info(f"Initializing Alice ACA-Py client: {settings.alice_agent_url}")
    acapy_client = AcaPyClient(
        base_url=settings.alice_agent_url,
        admin_insecure=settings.admin_insecure
    )
    
    try:
        status = await acapy_client.server.get_status()
        logger.info(f"✓ Alice ACA-Py agent connected successfully")
        logger.info(f"  Version: {status.version if hasattr(status, 'version') else 'N/A'}")
    except Exception as e:
        logger.warning(f"✗ Unable to connect to Alice ACA-Py agent: {e}")
    
    yield
    
    logger.info("Shutting down Alice ACA-Py client")
    acapy_client = None


app = FastAPI(
    title="Alice Controller",
    description="Supply Chain Holder Platform - Python Backend",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊路由
app.include_router(connections.router, prefix="/api", tags=["connections"])
app.include_router(credentials.router, prefix="/api", tags=["credentials"])
app.include_router(proofs.router, prefix="/api", tags=["proofs"])


@app.get("/api/status")
async def get_status():
    """檢查 ACA-Py Agent 狀態"""
    try:
        client = get_acapy_client()
        await client.server.get_status()
        return {"status": "up"}
    except Exception as e:
        logger.error(f"Agent status check failed: {e}")
        return {"status": "down"}


@app.get("/health")
async def health_check():
    """健康檢查端點"""
    return {"status": "healthy", "service": "alice-controller"}


# 提供 React 前端靜態檔案
# 注意: 在開發環境中，React 前端由 Vite dev server 提供
# 在生產環境中，React build 後的檔案會被複製到 client/dist
static_files_path = os.path.join(os.path.dirname(__file__), "client", "dist")
if os.path.exists(static_files_path):
    logger.info(f"Serving React frontend from: {static_files_path}")
    # 只有在 assets 目錄存在時才掛載
    assets_path = os.path.join(static_files_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
        logger.info(f"Mounted assets directory: {assets_path}")
    else:
        logger.warning(f"Assets directory not found at: {assets_path}, skipping mount")
    
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
