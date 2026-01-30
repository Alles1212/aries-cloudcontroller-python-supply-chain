"""
Connections API Routes
管理 DIDComm 連線

對應原 Node.js 版本的 API:
- POST /api/connections/invitation -> 創建邀請
- POST /api/connections/accept -> 接受邀請
- GET /api/connections -> 取得連線列表
- DELETE /api/connections/:id -> 移除連線

使用 aries-cloudcontroller-python 的優勢:
1. 型別安全: 所有回應都有完整型別定義
2. 自動驗證: Pydantic 自動驗證請求/回應
3. 更簡潔: 不需要手動處理 HTTP 請求
"""

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from aries_cloudcontroller import AcaPyClient
from aries_cloudcontroller.models import (
    InvitationCreateRequest,
    InvitationMessage,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 全域客戶端將由 main.py 注入
_client: AcaPyClient = None


def set_client(client: AcaPyClient):
    """設定 ACA-Py 客戶端"""
    global _client
    _client = client


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


class InvitationAcceptRequest(BaseModel):
    """接受邀請的請求模型"""
    invitation: str | Dict[str, Any]


@router.get("/connections")
async def get_connections():
    """
    取得所有連線列表
    
    對應原版本: GET /api/connections
    
    差異:
    - 原版本: 使用原生 HTTP 請求，手動解析 JSON
    - 新版本: 使用 aries-cloudcontroller，自動型別轉換
    """
    try:
        client = get_client()
        connections = await client.connection.get_connections()
        
        # 轉換為與前端兼容的格式
        return {
            "results": [conn.to_dict() for conn in connections.results] if connections.results else []
        }
    except Exception as e:
        logger.error(f"Failed to get connections: {e}")
        return {"results": []}


@router.post("/connections/invitation")
async def create_invitation():
    """
    創建 Out-of-Band (OOB) 邀請
    
    對應原版本: POST /api/connections/invitation
    
    差異:
    - 原版本: agentService.createInvitation() 使用原生 HTTP
    - 新版本: client.out_of_band.create_invitation() 型別安全
    
    優勢:
    1. 自動驗證回應格式
    2. 完整的型別提示
    3. 自動處理錯誤
    """
    try:
        client = get_client()
        
        # 使用 Out-of-Band 1.1 協議創建邀請
        result = await client.out_of_band.create_invitation(
            body=InvitationCreateRequest(
                handshake_protocols=["https://didcomm.org/didexchange/1.1"]
            )
        )
        
        # 返回與原 Node.js 版本兼容的格式
        # InvitationRecord 包含 invitation 欄位（InvitationMessage 類型）
        if hasattr(result, 'invitation') and result.invitation:
            return result.invitation.to_dict()
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to create invitation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connections/accept")
async def accept_invitation(request: InvitationAcceptRequest):
    """
    接受邀請
    
    對應原版本: POST /api/connections/accept
    
    差異:
    - 原版本: 手動解析 JSON 字串，手動構建請求
    - 新版本: Pydantic 自動驗證，型別安全
    """
    try:
        client = get_client()
        
        # 處理邀請內容 (可能是字串或字典)
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
        
        # 接受邀請
        result = await client.out_of_band.receive_invitation(
            body=invitation_msg
        )
        
        # OobRecord 包含 connection_id
        connection_id = None
        if hasattr(result, 'connection_id'):
            connection_id = result.connection_id
        elif hasattr(result, 'attachments') and result.attachments:
            # 可能從 attachments 中提取 connection_id
            pass
        
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
    """
    移除連線
    
    對應原版本: DELETE /api/connections/:id
    
    差異:
    - 原版本: 嘗試 POST /connections/{id}/remove，失敗時嘗試 DELETE
    - 新版本: 直接使用 aries-cloudcontroller 的 delete_connection
    """
    try:
        client = get_client()
        
        # 使用 aries-cloudcontroller 移除連線
        # 注意: ACA-Py 不同版本可能使用不同的端點
        try:
            await client.connection.delete_connection(conn_id=connection_id)
        except Exception as e:
            # 如果失敗，嘗試使用 remove 端點
            logger.warning(f"DELETE failed, trying POST remove: {e}")
            # 這裡可能需要根據實際 ACA-Py 版本調整
            raise
        
        return {"status": "removed"}
        
    except Exception as e:
        logger.error(f"Failed to remove connection {connection_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
