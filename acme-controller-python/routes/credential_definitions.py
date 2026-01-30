"""
Credential Definitions API Routes - Acme
管理 Credential Definitions（唯讀）
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


@router.get("/credential-definitions")
async def get_credential_definitions():
    """
    取得所有已創建的 Credential Definition ID 列表
    """
    try:
        client = get_client()
        result = await client.credential_definition.get_created_cred_defs()
        
        return {
            "credential_definition_ids": result.credential_definition_ids if result.credential_definition_ids else []
        }
    except Exception as e:
        logger.error(f"Failed to get credential definitions: {e}")
        return {"credential_definition_ids": []}


@router.get("/credential-definitions/{cred_def_id:path}")
async def get_credential_definition(cred_def_id: str):
    """
    取得指定 Credential Definition 的詳細資訊
    """
    try:
        client = get_client()
        logger.info(f"Fetching credential definition: {cred_def_id}")
        result = await client.credential_definition.get_cred_def(cred_def_id=cred_def_id)
        
        cred_def_dict = result.credential_definition.to_dict() if result.credential_definition else {}
        logger.info(f"Credential definition keys: {cred_def_dict.keys()}")
        
        return {
            "credential_definition": cred_def_dict
        }
    except Exception as e:
        logger.error(f"Failed to get credential definition {cred_def_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=404,
            detail=f"Credential definition not found: {cred_def_id}. Error: {str(e)}"
        )
