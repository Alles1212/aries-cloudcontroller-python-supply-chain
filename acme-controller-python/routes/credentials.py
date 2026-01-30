"""
Acme Credentials API - 憑證管理
Acme 可以查看儲存的憑證（用於驗證時）
"""

import logging
from fastapi import APIRouter, HTTPException

from aries_cloudcontroller import AcaPyClient

logger = logging.getLogger(__name__)
router = APIRouter()


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


@router.get("/credentials")
async def get_credentials():
    """
    取得已儲存的憑證列表
    Acme 可能會收到並儲存一些憑證
    """
    try:
        client = get_client()
        result = await client.credentials.get_credentials()
        
        return {
            "results": [cred.to_dict() for cred in result.results] if result.results else []
        }
    except Exception as e:
        logger.error(f"Failed to get credentials: {e}")
        return {"results": []}


@router.get("/credential-exchanges")
async def get_credential_exchanges():
    """
    取得憑證交換記錄
    """
    try:
        client = get_client()
        result = await client.issue_credential_v2_0.get_records()
        
        return {
            "results": [record.to_dict() for record in result.results] if result.results else []
        }
    except Exception as e:
        logger.error(f"Failed to get credential exchanges: {e}")
        return {"results": []}
