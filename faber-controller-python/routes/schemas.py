"""
Schemas API Routes
管理 Indy Ledger Schemas

對應原 Node.js 版本的 API:
- GET /api/schemas -> 取得 schema 列表
- GET /api/schemas/:id -> 取得 schema 詳情
- POST /api/admin/schema -> 創建 schema 和 credential definition

使用 aries-cloudcontroller-python 的優勢:
1. Schema 模型自動驗證
2. 型別安全的 schema 操作
3. 自動處理 schema_id 編碼
"""

import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from aries_cloudcontroller import AcaPyClient
from aries_cloudcontroller.models import (
    SchemaSendRequest,
    CredentialDefinitionSendRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Schema 快取：Ledger 查詢慢，Schema 不可變，可安全快取以大幅縮短「Loading schema」時間
_schema_cache: Dict[str, Any] = {}


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


class CreateSchemaRequest(BaseModel):
    """創建 Schema 的請求模型"""
    schema_name: str = Field(..., description="Schema 名稱")
    schema_version: str = Field(default="1.0", description="Schema 版本")
    attributes: List[str] = Field(..., min_length=1, description="Schema 屬性列表")
    tag: Optional[str] = Field(default=None, description="Credential Definition 標籤")
    support_revocation: bool = Field(default=False, description="是否支援撤銷")


@router.get("/schemas")
async def get_schemas():
    """
    取得所有已創建的 Schema ID 列表
    
    對應原版本: GET /api/schemas
    
    差異:
    - 原版本: httpAsync({path: '/schemas/created'})
    - 新版本: client.schema.get_created_schemas()
    """
    try:
        client = get_client()
        result = await client.schema.get_created_schemas()
        
        return {
            "schema_ids": result.schema_ids if result.schema_ids else []
        }
    except Exception as e:
        logger.error(f"Failed to get schemas: {e}")
        return {"schema_ids": []}


@router.get("/schemas/{schema_id:path}")
async def get_schema(schema_id: str):
    """
    取得指定 Schema 的詳細資訊（含快取，避免重複 Ledger 查詢造成長時間 Loading）
    
    對應原版本: GET /api/schemas/:id
    
    差異:
    - 原版本: 手動 URL 編碼，手動解析回應
    - 新版本: aries-cloudcontroller 自動處理編碼和型別轉換，並快取結果
    
    注意: 確保返回的資料結構包含 attrNames，供前端讀取 schema.attrNames
    """
    cache_key = schema_id.strip()
    if cache_key in _schema_cache:
        logger.info(f"Schema cache hit: {cache_key}")
        cached = _schema_cache[cache_key]
        return cached

    try:
        client = get_client()
        logger.info(f"Fetching schema from ledger: {schema_id}")
        result = await client.schema.get_schema(schema_id=schema_id)
        
        # 使用 by_alias=True 確保返回 JSON 格式的欄位名稱（attrNames 而非 attr_names）
        data = result.to_dict()
        
        # 調試日誌：檢查返回的資料結構
        logger.info(f"Schema data keys: {data.keys()}")
        if "schema" in data:
            logger.info(f"Schema.schema keys: {data['schema'].keys()}")
            logger.info(f"Schema attrNames: {data['schema'].get('attrNames', 'NOT FOUND')}")
        
        _schema_cache[cache_key] = data
        return data
    except Exception as e:
        logger.error(f"Failed to get schema {schema_id}: {e}", exc_info=True)
        raise HTTPException(status_code=404, detail=f"Schema not found: {schema_id}. Error: {str(e)}")


@router.post("/admin/schema")
async def create_schema_and_cred_def(request: CreateSchemaRequest):
    """
    創建 Schema 和 Credential Definition
    
    對應原版本: POST /api/admin/schema
    
    這是一個便利端點，一次性完成:
    1. 創建並發布 Schema 到 Ledger
    2. 創建 Credential Definition
    
    差異:
    - 原版本: 手動構建請求，手動處理錯誤
    - 新版本: 使用 Pydantic 模型自動驗證，型別安全
    
    優勢:
    1. 自動驗證 attributes 非空
    2. 自動驗證 schema_name 必填
    3. 型別安全的 API 調用
    """
    try:
        client = get_client()
        
        # Step 1: 創建並發布 Schema
        logger.info(f"Creating schema: {request.schema_name} v{request.schema_version}")
        
        schema_request = SchemaSendRequest(
            schema_name=request.schema_name,
            schema_version=request.schema_version,
            attributes=request.attributes
        )
        
        schema_result = await client.schema.publish_schema(body=schema_request)
        
        if not schema_result.sent or not schema_result.sent.schema_id:
            raise HTTPException(
                status_code=500,
                detail="Failed to create schema: no schema_id returned"
            )
        
        schema_id = schema_result.sent.schema_id
        logger.info(f"✓ Schema created: {schema_id}")
        
        # Step 2: 創建 Credential Definition
        logger.info(f"Creating credential definition for schema: {schema_id}")
        
        cred_def_tag = request.tag or request.schema_name
        
        cred_def_request = CredentialDefinitionSendRequest(
            schema_id=schema_id,
            tag=cred_def_tag,
            support_revocation=request.support_revocation
        )
        
        cred_def_result = await client.credential_definition.publish_cred_def(
            body=cred_def_request
        )
        
        if not cred_def_result.sent or not cred_def_result.sent.credential_definition_id:
            raise HTTPException(
                status_code=500,
                detail="Failed to create credential definition"
            )
        
        cred_def_id = cred_def_result.sent.credential_definition_id
        logger.info(f"✓ Credential Definition created: {cred_def_id}")
        
        return {
            "schema_id": schema_id,
            "credential_definition_id": cred_def_id,
            "support_revocation": request.support_revocation
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create schema and cred def: {e}")
        raise HTTPException(status_code=500, detail=str(e))
