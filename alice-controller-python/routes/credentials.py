"""
Alice Credentials API - 憑證管理
Alice 作為 Holder，接收並儲存來自 Faber 的憑證
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
    Alice 接收並儲存來自 Faber 的憑證後，可以在這裡查看
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
    顯示 Alice 與 Faber 之間的憑證交換狀態
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


@router.post("/credential-exchanges/{cred_ex_id}/request")
async def send_credential_request(cred_ex_id: str):
    """
    發送憑證請求
    當 Alice 收到 Faber 的 credential offer 時，發送 request 接受憑證
    """
    try:
        client = get_client()
        
        result = await client.issue_credential_v2_0.send_request(
            cred_ex_id=cred_ex_id
        )
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to send credential request {cred_ex_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/credential-exchanges/{cred_ex_id}/store")
async def store_credential(cred_ex_id: str):
    """
    儲存憑證
    當 Alice 收到 Faber 發送的憑證後，將其儲存到錢包中
    """
    try:
        client = get_client()
        
        result = await client.issue_credential_v2_0.store_credential(
            cred_ex_id=cred_ex_id
        )
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to store credential {cred_ex_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
