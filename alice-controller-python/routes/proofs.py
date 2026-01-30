"""
Alice Proofs API - Proof 管理
Alice 作為 Holder/Prover，向 Acme (Verifier) 提供 Proof
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from aries_cloudcontroller import AcaPyClient

logger = logging.getLogger(__name__)
router = APIRouter()


def get_client() -> AcaPyClient:
    """取得 ACA-Py 客戶端"""
    from main import get_acapy_client
    return get_acapy_client()


class SendProofRequest(BaseModel):
    """發送 Proof 的請求模型"""
    pres_ex_id: str


@router.get("/proofs")
async def get_proofs():
    """
    取得所有 Proof 請求和記錄
    顯示 Alice 收到的來自 Acme 的 proof 請求
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


@router.post("/proofs/{pres_ex_id}/send")
async def send_proof(pres_ex_id: str):
    """
    發送 Proof
    當 Alice 收到 Acme 的 proof request 時，構建並發送 proof
    
    注意: 這個端點會自動選擇匹配的憑證並構建 proof
    """
    try:
        client = get_client()
        
        # 發送 proof presentation
        result = await client.present_proof_v2_0.send_presentation(
            pres_ex_id=pres_ex_id
        )
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to send proof {pres_ex_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/proofs/{pres_ex_id}/credentials")
async def get_credentials_for_proof(pres_ex_id: str):
    """
    取得可用於此 Proof Request 的憑證列表
    Alice 可以查看哪些憑證可以用來回應 Acme 的 proof request
    """
    try:
        client = get_client()
        
        result = await client.present_proof_v2_0.get_matching_credentials(
            pres_ex_id=pres_ex_id
        )
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"Failed to get credentials for proof {pres_ex_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
