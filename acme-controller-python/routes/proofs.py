"""
Acme Proofs API - Proof 請求與驗證
Acme 作為 Verifier，向 Alice 請求並驗證 Proof
"""

import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from aries_cloudcontroller import AcaPyClient
from aries_cloudcontroller.models import (
    V20PresRequestByFormat,
    V20PresSendRequestRequest,
    IndyProofRequest,
    IndyProofReqAttrSpec,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


class ProofRequestAttribute(BaseModel):
    """Proof 請求屬性"""
    name: str
    restrictions: Optional[List[Dict[str, str]]] = None


class PredicateSpec(BaseModel):
    """Predicate 規格 - 用於 Zero-Knowledge Proofs / Range Proofs"""
    name: str = Field(..., description="屬性名稱，例如 'age'")
    p_type: str = Field(..., description="比較類型: '<', '<=', '>=', '>'")
    p_value: int = Field(..., description="閾值，例如 18")


class SendProofRequestPayload(BaseModel):
    """發送 Proof Request 的請求模型 - 前端直接格式"""
    connection_id: str = Field(..., description="連線 ID")
    presentation_request: Dict[str, Any] = Field(..., description="Presentation request 結構")
    comment: Optional[str] = Field(default=None, description="註解")


class SendProofRequestModel(BaseModel):
    """發送 Proof Request 的請求模型 - 簡化格式（向後兼容）"""
    connection_id: str = Field(..., description="連線 ID")
    cred_def_id: str = Field(..., description="Credential Definition ID")
    requested_attributes: Optional[List[str]] = Field(default=None, description="請求的屬性列表")
    requested_predicates: Optional[List[PredicateSpec]] = Field(default=None, description="請求的 predicates（範圍證明）")
    proof_name: Optional[str] = Field(default="Proof Request", description="Proof 請求名稱")
    comment: Optional[str] = Field(default=None, description="註解")


@router.get("/proofs")
async def get_proofs():
    """
    取得所有 Proof 記錄
    顯示 Acme 發送給 Alice 的 proof 請求和驗證結果
    """
    try:
        client = get_client()
        result = await client.present_proof_v2_0.get_records()
        
        return {
            "results": [record.to_dict() for record in result.results] if result.results else []
        }
    except Exception as e:
        logger.error(f"Failed to get proofs: {e}")
        return {"results": []}


@router.post("/proofs/send-request")
async def send_proof_request(request: SendProofRequestPayload):
    """
    向 Alice 發送 Proof Request（接受前端格式）
    Acme 請求 Alice 提供教育憑證的證明
    
    支援：
    - 屬性驗證 (requested_attributes)
    - 範圍證明 (requested_predicates) - Zero-Knowledge Proofs
    """
    try:
        client = get_client()
        
        logger.info(f"Sending proof request to connection: {request.connection_id}")
        logger.info(f"Presentation request structure: {request.presentation_request}")
        
        # 從前端的 presentation_request 中提取 indy 結構
        indy_request_data = request.presentation_request.get("indy", {})
        
        # 構建 requested_attributes 字典
        requested_attributes = {}
        for attr_key, attr_value in indy_request_data.get("requested_attributes", {}).items():
            requested_attributes[attr_key] = IndyProofReqAttrSpec(
                name=attr_value["name"],
                restrictions=attr_value.get("restrictions")
            )
        
        # 構建 requested_predicates 字典
        requested_predicates = {}
        for pred_key, pred_value in indy_request_data.get("requested_predicates", {}).items():
            from aries_cloudcontroller.models import IndyProofReqPredSpec
            requested_predicates[pred_key] = IndyProofReqPredSpec(
                name=pred_value["name"],
                p_type=pred_value["p_type"],
                p_value=pred_value["p_value"],
                restrictions=pred_value.get("restrictions")
            )
        
        # 構建 IndyProofRequest
        indy_proof_request = IndyProofRequest(
            name=indy_request_data.get("name", "Proof Request"),
            version=indy_request_data.get("version", "1.0"),
            requested_attributes=requested_attributes,
            requested_predicates=requested_predicates
        )
        
        # 使用 V20PresSendRequestRequest 發送 proof request
        body = V20PresSendRequestRequest(
            connection_id=request.connection_id,
            presentation_request=V20PresRequestByFormat(
                indy=indy_proof_request
            ),
            comment=request.comment or "Proof request from Acme"
        )
        
        result = await client.present_proof_v2_0.send_request_free(body=body)
        
        logger.info(f"✓ Proof request sent successfully: {result.pres_ex_id if hasattr(result, 'pres_ex_id') else 'N/A'}")
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to send proof request: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/proofs/{pres_ex_id}/verify")
async def verify_proof(pres_ex_id: str):
    """
    驗證 Proof
    當 Alice 提供 proof 後，Acme 驗證其真實性
    """
    try:
        client = get_client()
        
        result = await client.present_proof_v2_0.verify_presentation(
            pres_ex_id=pres_ex_id
        )
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to verify proof {pres_ex_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/proofs/{pres_ex_id}")
async def get_proof_detail(pres_ex_id: str):
    """取得特定 Proof 的詳細資訊"""
    try:
        client = get_client()
        
        result = await client.present_proof_v2_0.get_record(
            pres_ex_id=pres_ex_id
        )
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to get proof detail {pres_ex_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
