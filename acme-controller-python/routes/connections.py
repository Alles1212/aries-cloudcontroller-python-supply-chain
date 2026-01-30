"""
Acme Connections API - 連線管理
Acme 作為 Verifier，需要與 Alice (Holder) 建立連線
"""

import logging
from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from aries_cloudcontroller import AcaPyClient
from aries_cloudcontroller.models import (
    InvitationCreateRequest,
    InvitationMessage,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


class InvitationAcceptRequest(BaseModel):
    """接受邀請的請求模型"""
    invitation: str | Dict[str, Any]


@router.get("/connections")
async def get_connections():
    """取得所有連線列表"""
    try:
        client = get_client()
        connections = await client.connection.get_connections()
        
        return {
            "results": [conn.to_dict() for conn in connections.results] if connections.results else []
        }
    except Exception as e:
        logger.error(f"Failed to get connections: {e}")
        return {"results": []}


@router.post("/connections/invitation")
async def create_invitation():
    """創建邀請 (Acme 邀請 Alice 時使用，但通常是 Alice 邀請 Acme)"""
    try:
        client = get_client()
        
        result = await client.out_of_band.create_invitation(
            body=InvitationCreateRequest(
                handshake_protocols=["https://didcomm.org/didexchange/1.1"]
            )
        )
        
        # 返回 invitation 物件
        if hasattr(result, 'invitation') and result.invitation:
            return result.invitation.to_dict()
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to create invitation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connections/accept")
async def accept_invitation(request: InvitationAcceptRequest):
    """接受邀請 (Acme 接受 Alice 的邀請)"""
    try:
        client = get_client()
        
        invitation_data = request.invitation
        
        # 如果是字串，嘗試解析 JSON
        if isinstance(invitation_data, str):
            import json
            import re
            
            # 清理字串：移除多餘的空白和換行
            invitation_data = invitation_data.strip()
            
            # 如果字串不是以 { 開頭，嘗試修復（可能是缺少外層大括號）
            if not invitation_data.startswith('{'):
                # 嘗試添加外層大括號
                if invitation_data.startswith('"@type"') or invitation_data.startswith('"@id"'):
                    invitation_data = '{' + invitation_data + '}'
                    logger.warning("Fixed invitation JSON by adding outer braces")
            
            try:
                invitation_data = json.loads(invitation_data)
            except json.JSONDecodeError as json_err:
                logger.error(f"JSON parse error: {json_err}")
                logger.error(f"Invitation string: {invitation_data[:200]}...")
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to parse invitation JSON: {str(json_err)}. Please ensure the JSON is valid."
                )
        
        # 驗證 invitation_data 是字典
        if not isinstance(invitation_data, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid invitation format: expected dict, got {type(invitation_data).__name__}"
            )
        
        # 轉換為 InvitationMessage
        try:
            invitation_msg = InvitationMessage.from_dict(invitation_data)
        except Exception as model_err:
            logger.error(f"Failed to create InvitationMessage: {model_err}")
            logger.error(f"Invitation data: {invitation_data}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid invitation format: {str(model_err)}"
            )
        
        result = await client.out_of_band.receive_invitation(
            body=invitation_msg
        )
        
        connection_id = None
        if hasattr(result, 'connection_id'):
            connection_id = result.connection_id
        
        logger.info(f"✓ Invitation accepted successfully, connection_id: {connection_id}")
        return {"ok": True, "connection_id": connection_id}
        
    except HTTPException:
        # 重新拋出 HTTPException
        raise
    except Exception as e:
        logger.error(f"Failed to accept invitation: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to accept invitation: {str(e)}")


@router.delete("/connections/{connection_id}")
async def remove_connection(connection_id: str):
    """移除連線"""
    try:
        client = get_client()
        
        await client.connection.delete_connection(conn_id=connection_id)
        
        return {"status": "removed"}
        
    except Exception as e:
        logger.error(f"Failed to remove connection {connection_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
