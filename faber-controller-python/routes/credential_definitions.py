"""
Credential Definitions API Routes
管理 Credential Definitions

對應原 Node.js 版本的 API:
- GET /api/credential-definitions -> 取得列表
- GET /api/credential-definitions/:id -> 取得詳情

使用 aries-cloudcontroller-python 的優勢:
1. 自動處理 credential_definition_id 的 URL 編碼
2. 型別安全的 CredentialDefinition 模型
3. 自動驗證回應格式
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
    
    對應原版本: GET /api/credential-definitions
    
    差異:
    - 原版本: httpAsync({path: '/credential-definitions/created'})
    - 新版本: client.credential_definition.get_created_cred_defs()
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
    
    對應原版本: GET /api/credential-definitions/:id
    
    差異:
    - 原版本: 手動 encodeURIComponent(credentialDefinitionId)
    - 新版本: aries-cloudcontroller 自動處理 URL 編碼
    
    注意: 
    - {cred_def_id:path} 允許 ID 包含冒號和斜線
    - aries-cloudcontroller 會自動處理這些特殊字符
    - 確保返回 schema_id 欄位，供前端讀取 credential_definition.schema_id
    """
    try:
        client = get_client()
        logger.info(f"Fetching credential definition: {cred_def_id}")
        result = await client.credential_definition.get_cred_def(cred_def_id=cred_def_id)
        
        # 使用 by_alias=True 確保返回 JSON 格式的欄位名稱
        cred_def_dict = result.credential_definition.to_dict() if result.credential_definition else {}
        
        # 調試日誌：檢查返回的資料結構
        logger.info(f"Credential definition keys: {cred_def_dict.keys()}")
        logger.info(f"Schema ID in cred_def: {cred_def_dict.get('schema_id') or cred_def_dict.get('schemaId', 'NOT FOUND')}")
        
        # 返回與前端兼容的格式
        return {
            "credential_definition": cred_def_dict
        }
    except Exception as e:
        logger.error(f"Failed to get credential definition {cred_def_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=404,
            detail=f"Credential definition not found: {cred_def_id}. Error: {str(e)}"
        )
