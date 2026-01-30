"""
Schemas API Routes - Acme
管理 Indy Ledger Schemas（唯讀）
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


@router.get("/schemas")
async def get_schemas():
    """
    取得所有已創建的 Schema ID 列表
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
    取得指定 Schema 的詳細資訊
    """
    try:
        client = get_client()
        logger.info(f"Fetching schema: {schema_id}")
        result = await client.schema.get_schema(schema_id=schema_id)
        
        data = result.to_dict()
        logger.info(f"Schema data keys: {data.keys()}")
        return data
    except Exception as e:
        logger.error(f"Failed to get schema {schema_id}: {e}", exc_info=True)
        raise HTTPException(status_code=404, detail=f"Schema not found: {schema_id}. Error: {str(e)}")
