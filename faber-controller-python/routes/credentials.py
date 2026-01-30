"""
Credentials API Routes
管理憑證發放和撤銷

對應原 Node.js 版本的 API:
- POST /api/credentials/send -> 發送憑證
- GET /api/credential-exchanges -> 取得憑證交換記錄
- POST /api/credentials/revoke -> 撤銷憑證

使用 aries-cloudcontroller-python 的優勢:
1. 完整的 V20CredExRecord 型別定義
2. 自動處理 credential preview 格式
3. 型別安全的撤銷操作
"""

import asyncio
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# 送出憑證時 ACA-Py 與 Ledger 可能較慢，設定逾時避免請求永久卡住、前端一直顯示 Sending...
SEND_CREDENTIAL_TIMEOUT_SEC = 600

from aries_cloudcontroller import AcaPyClient
from aries_cloudcontroller.models import (
    V20CredOfferRequest,
    V20CredFilter,
    V20CredFilterIndy,
    V20CredAttrSpec,
    V20CredPreview,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


class CredentialAttribute(BaseModel):
    """憑證屬性"""
    name: str
    value: str


class CredentialProposal(BaseModel):
    """憑證提案"""
    type_: str = Field(alias="@type", default="https://didcomm.org/issue-credential/2.0/credential-preview")
    attributes: List[CredentialAttribute]
    
    class Config:
        populate_by_name = True


class IndyFilter(BaseModel):
    """Indy 過濾器"""
    cred_def_id: str


class CredentialFilter(BaseModel):
    """憑證過濾器"""
    indy: IndyFilter


class SendCredentialRequest(BaseModel):
    """發送憑證的請求模型"""
    connection_id: str = Field(..., description="連線 ID")
    cred_def_id: str = Field(..., description="Credential Definition ID")
    credential_proposal: CredentialProposal = Field(..., description="憑證提案 (包含屬性)")
    comment: Optional[str] = Field(default=None, description="註解")
    filter: Optional[CredentialFilter] = Field(default=None, description="過濾器 (AIP 2.0)")


class RevokeCredentialRequest(BaseModel):
    """撤銷憑證的請求模型"""
    cred_ex_id: str = Field(..., description="Credential Exchange ID")
    rev_reg_id: Optional[str] = Field(default=None, description="Revocation Registry ID")
    cred_rev_id: Optional[str] = Field(default=None, description="Credential Revocation ID")
    publish: bool = Field(default=True, description="是否立即發布到 Ledger")


@router.post("/credentials/send")
async def send_credential(request: SendCredentialRequest):
    """
    發送憑證給指定連線
    
    對應原版本: POST /api/credentials/send
    
    差異:
    - 原版本: 手動構建複雜的 payload，手動處理 schema 解析
    - 新版本: 使用 Pydantic 模型自動驗證，型別安全
    
    優勢:
    1. 自動驗證 connection_id, cred_def_id 必填
    2. 自動驗證 attributes 格式
    3. 型別安全的 API 調用
    """
    try:
        client = get_client()
        
        # 轉換為 aries-cloudcontroller 的模型
        logger.info(f"Sending credential to connection: {request.connection_id}")
        logger.info(f"Credential Definition: {request.cred_def_id}")
        
        # 構建 filter
        filter_indy = V20CredFilterIndy(cred_def_id=request.cred_def_id)
        cred_filter = V20CredFilter(indy=filter_indy)
        
        # 構建屬性列表
        attributes = [
            V20CredAttrSpec(name=attr.name, value=attr.value)
            for attr in request.credential_proposal.attributes
        ]
        
        # 構建 credential preview（V20CredPreview 欄位為 type，別名 @type，與 ACA-Py 一致）
        cred_preview = V20CredPreview(
            **{"type": "https://didcomm.org/issue-credential/2.0/credential-preview", "attributes": attributes}
        )
        
        # 發送憑證（逾時避免永久卡住、前端 Sending... 不消失）
        body = V20CredOfferRequest(
            connection_id=request.connection_id,
            filter=cred_filter,
            credential_preview=cred_preview,
            comment=request.comment
        )

        try:
            result = await asyncio.wait_for(
                client.issue_credential_v2_0.send_offer_free(body=body),
                timeout=SEND_CREDENTIAL_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            logger.error("Send credential timed out (ACA-Py/Ledger slow or unresponsive)")
            raise HTTPException(
                status_code=504,
                detail=f"Send credential timed out after {SEND_CREDENTIAL_TIMEOUT_SEC}s. Check ACA-Py and connection state.",
            )

        logger.info(f"✓ Credential sent successfully: {result.cred_ex_id if hasattr(result, 'cred_ex_id') else 'N/A'}")

        return result.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to send credential: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/credential-exchanges")
async def get_credential_exchanges():
    """
    取得所有憑證交換記錄
    
    對應原版本: GET /api/credential-exchanges
    
    差異:
    - 原版本: httpAsync({path: '/issue-credential/records'})
    - 新版本: client.issue_credential_v2_0.get_records()
    
    優勢:
    1. 自動解析 V20CredExRecord 型別
    2. 完整的型別提示
    3. 自動處理分頁 (如果需要)
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


@router.post("/credentials/revoke")
async def revoke_credential(request: RevokeCredentialRequest):
    """
    撤銷已發出的憑證
    
    對應原版本: POST /api/credentials/revoke
    
    注意:
    - 只有當 Credential Definition 創建時啟用 support_revocation 時才能撤銷
    - 需要 rev_reg_id 和 cred_rev_id
    
    差異:
    - 原版本: 手動構建撤銷請求
    - 新版本: 使用 aries-cloudcontroller 的 revoke_credential
    """
    try:
        client = get_client()
        
        logger.info(f"Revoking credential: {request.cred_ex_id}")
        
        # 如果沒有提供 rev_reg_id 或 cred_rev_id，嘗試從交換記錄中取得
        if not request.rev_reg_id or not request.cred_rev_id:
            record = await client.issue_credential_v2_0.get_record(cred_ex_id=request.cred_ex_id)
            
            # 從記錄中提取撤銷資訊
            if hasattr(record, 'indy') and record.indy:
                indy_record = record.indy
                rev_reg_id = request.rev_reg_id or (indy_record.rev_reg_id if hasattr(indy_record, 'rev_reg_id') else None)
                cred_rev_id = request.cred_rev_id or (indy_record.cred_rev_id if hasattr(indy_record, 'cred_rev_id') else None)
                
                if not rev_reg_id or not cred_rev_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Credential does not support revocation or revocation info not available"
                    )
        else:
            rev_reg_id = request.rev_reg_id
            cred_rev_id = request.cred_rev_id
        
        # 執行撤銷
        # 注意: aries-cloudcontroller 可能沒有直接的 revoke 方法
        # 需要使用 revocation API
        result = await client.revocation.revoke_credential(
            body={
                "rev_reg_id": rev_reg_id,
                "cred_rev_id": cred_rev_id,
                "publish": request.publish
            }
        )
        
        logger.info(f"✓ Credential revoked successfully")
        
        return {"success": True, "result": result.to_dict() if hasattr(result, 'to_dict') else {}}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to revoke credential: {e}")
        raise HTTPException(status_code=400, detail=str(e))
