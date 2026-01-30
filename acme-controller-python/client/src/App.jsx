/**
 * Acme Controller - Main Application Component
 * 
 * Features:
 * - Dashboard: Display key metrics for the supply chain platform
 * - Connections: Manage DIDComm connections
 * - Credentials: Receive/send credentials (Issuer functionality)
 * - Proofs: Send Proof Requests and verify Presentations (Verifier functionality)
 * - Schemas: View Ledger Schemas
 * - Credential Definitions: View Credential Definitions
 * 
 * Role:
 * - Primary role as Verifier, but also supports Issuer functionality
 * - Acts as downstream verifier in the distributed supply chain platform
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout.jsx'
import { SectionCard } from './components/SectionCard.jsx'
import { DashboardCard } from './components/DashboardCard.jsx'
import { Modal } from './components/Modal.jsx'
import { ToastStack } from './components/ToastStack.jsx'
import { useAgentStatus } from './hooks/useAgentStatus.js'
import { useApi } from './hooks/useApi.js'

/**
 * API 調用對應（後端 /api → ACA-Py Admin）：
 * - Connections: POST /api/connections/invitation → /out-of-band/create-invitation
 *                POST /api/connections/accept → /out-of-band/receive-invitation
 *                DELETE /api/connections/:id → /connections/{id}
 * - Credentials: POST /api/credentials/send → /issue-credential-2.0/send-offer
 *                POST /api/credentials/accept-offer → /issue-credential-2.0/records/{id}/send-request
 *                POST /api/credentials/store → /issue-credential-2.0/records/{id}/store
 * - Proofs:      POST /api/proofs/send-request → /present-proof-2.0/send-request
 *                POST /api/proofs/verify → /present-proof-2.0/records/{id}/verify-presentation
 * - Schemas/CredDefs: GET /api/schemas → /schemas/created；GET /api/credential-definitions → /credential-definitions/created
 * UI 策略：載入一次 + 手動 Refresh，避免高頻輪詢，確保流暢。
 */

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

/**
 * Toast 通知管理 Hook
 */
function useToasts() {
  const [items, setItems] = useState([])
  const push = useCallback((toast) => {
    const id = uuid()
    const entry = { id, ttl: toast.ttl ?? 4500, ...toast }
    setItems((list) => [...list, entry])
    setTimeout(() => {
      setItems((list) => list.filter((i) => i.id !== id))
    }, entry.ttl)
  }, [])
  return { items, push }
}

/**
 * Dashboard Page
 * Displays key metrics and status overview for the supply chain platform
 */
function DashboardPage({ pushToast }) {
  const api = useApi()
  const [stats, setStats] = useState({
    connections: 0,
    activeConnections: 0,
    credentials: 0,
    proofs: 0,
    pendingProofs: 0,
  })
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const [connectionsRes, credentialsRes, proofsRes] = await Promise.all([
        api.request('/api/connections').catch(() => ({ results: [] })),
        api.request('/api/credentials').catch(() => ({ results: [] })),
        api.request('/api/proofs').catch(() => ({ results: [] })),
      ])

      const connections = connectionsRes?.results || []
      const activeConnections = connections.filter((c) => c.state === 'active')
      const credentials = credentialsRes?.results || []
      const proofs = proofsRes?.results || []
      const pendingProofs = proofs.filter((p) => {
        const state = p.state || 'unknown'
        return state === 'request_sent' || state === 'request-sent' || 
               state === 'presentation_received' || state === 'presentation-received'
      })

      setStats({
        connections: connections.length,
        activeConnections: activeConnections.length,
        credentials: credentials.length,
        proofs: proofs.length,
        pendingProofs: pendingProofs.length,
      })
    } catch (error) {
      pushToast({ title: 'Failed to load statistics', message: error.message, intent: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api, pushToast])

  useEffect(() => {
    // 初始化載入一次；後續以手動 Refresh 為主
    loadStats()
  }, [loadStats])

  return (
    <>
      <div className="dashboard-grid">
        <DashboardCard
          title="Total Connections"
          value={stats.connections}
          subtitle="Supply chain partner connections"
          icon="🔗"
          trend={stats.connections > 0 ? 'up' : 'neutral'}
        />
        <DashboardCard
          title="Active Connections"
          value={stats.activeConnections}
          subtitle="Established DIDComm connections"
          icon="✅"
          trend={stats.activeConnections > 0 ? 'up' : 'neutral'}
        />
        <DashboardCard
          title="Stored Credentials"
          value={stats.credentials}
          subtitle="Credentials in wallet"
          icon="📜"
          trend={stats.credentials > 0 ? 'up' : 'neutral'}
        />
        <DashboardCard
          title="Proof Requests"
          value={stats.proofs}
          subtitle="Total proof exchange records"
          icon="🔍"
          trend={stats.proofs > 0 ? 'up' : 'neutral'}
        />
        <DashboardCard
          title="Pending Verification"
          value={stats.pendingProofs}
          subtitle="Presentations awaiting verification"
          icon="⏳"
          trend={stats.pendingProofs > 0 ? 'up' : 'neutral'}
        />
      </div>

      <SectionCard
        title="Platform Overview"
        subtitle="Distributed Supply Chain Verifier Platform - Acme"
        actions={[<button key="reload" className="secondary" onClick={loadStats} disabled={loading}>Refresh</button>]}
      >
        <p className="subtle">
          Acme Controller serves as a verifier in the supply chain platform. Key features include:
        </p>
        <ul style={{ marginTop: 16, paddingLeft: 24, color: 'var(--text-muted)' }}>
          <li>Establish and manage DIDComm connections with supply chain partners</li>
          <li>Receive and store credentials from Issuers</li>
          <li>Send Proof Requests to verify Holder credentials</li>
          <li>Verify Presentations and confirm compliance</li>
        </ul>
      </SectionCard>
    </>
  )
}

/**
 * Connections Page
 * Manage DIDComm connections (create invitation, accept invitation, remove connection)
 */
function ConnectionsPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [connections, setConnections] = useState([])
  const [invitationJson, setInvitationJson] = useState('')
  const [inviteModal, setInviteModal] = useState(false)
  const [acceptModal, setAcceptModal] = useState(false)
  const [invitationInput, setInvitationInput] = useState('')
  const [creating, setCreating] = useState(false) // 建立邀請的 loading 狀態
  const [accepting, setAccepting] = useState(false) // 接受邀請的 loading 狀態
  const [removing, setRemoving] = useState({}) // 移除連線的 loading 狀態（使用物件追蹤多個連線）

  const load = useCallback(async () => {
    try {
      const res = await api.request('/api/connections')
      setConnections(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load connections', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    if (location.pathname === '/connections') {
      load()
    }
  }, [location.pathname, load])

  const createInvitation = async () => {
    if (creating) return // 防止重複點擊
    try {
      setCreating(true)
      const res = await api.request('/api/connections/invitation', { method: 'POST' })
      const pretty = JSON.stringify(res, null, 2)
      setInvitationJson(pretty)
      setInviteModal(true)
      pushToast({ title: 'Invitation created', message: 'Share this JSON with your partner.', intent: 'success' })
    } catch (error) {
      pushToast({ title: 'Failed to create invitation', message: error.message, intent: 'error' })
    } finally {
      setCreating(false)
    }
  }

  /**
   * 接受邀請並建立連線
   * 
   * 原本版本：接受邀請後直接導航，不進行輪詢
   * 目前版本：接受邀請後立即關閉 modal 並刷新連線列表，讓用戶手動刷新查看狀態
   */
  const acceptInvitation = async () => {
    if (accepting) return // 防止重複點擊
    const payload = invitationInput.trim()
    if (!payload) {
      pushToast({ title: 'Please paste invitation content', intent: 'error' })
      return
    }
    try {
      setAccepting(true)
      await api.request('/api/connections/accept', {
        method: 'POST',
        body: JSON.stringify({ invitation: payload }),
      })
      
      // 立即關閉 modal 並清空輸入，不等待連線建立
      setAcceptModal(false)
      setInvitationInput('')
      
      // 刷新連線列表（不等待結果，避免阻塞 UI）
      load().catch(() => {}) // 靜默更新，不顯示錯誤
      
      pushToast({ 
        title: 'Invitation accepted', 
        intent: 'success', 
        message: 'Connection is being established. Please refresh to check status.' 
      })
    } catch (error) {
      pushToast({ title: 'Failed to accept invitation', message: error.message, intent: 'error' })
    } finally {
      setAccepting(false)
    }
  }

  const removeConnection = async (id) => {
    if (removing[id]) return // 防止重複點擊
    if (!confirm('Are you sure you want to remove this connection?')) return
    try {
      setRemoving(prev => ({ ...prev, [id]: true }))
      await api.request(`/api/connections/${id}`, { method: 'DELETE' })
      pushToast({ title: 'Connection removed', intent: 'success', message: 'Connection has been removed from ACA-Py' })
      await load()
    } catch (error) {
      pushToast({ title: 'Failed to remove connection', message: error.message || 'Unable to remove connection, please try again later', intent: 'error' })
    } finally {
      setRemoving(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  return (
    <>
      <SectionCard
        title="Connections"
        subtitle="Create invitation or accept invitation to establish DIDComm connection with supply chain partners"
        actions={[
          <button key="create" className="primary" onClick={createInvitation} disabled={creating}>
            {creating ? 'Creating...' : 'Create Invitation'}
          </button>,
          <button key="accept" className="secondary" onClick={() => setAcceptModal(true)} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Accept Invitation'}
          </button>,
          <button key="reload" className="secondary" onClick={load}>Refresh</button>,
        ]}
      >
        {connections.length === 0 ? (
          <div className="empty-state">No connections yet. Create an invitation and share the JSON with your partner!</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Connection ID</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.connection_id}>
                    <td><code>{c.connection_id}</code></td>
                    <td><span className="badge">{c.state}</span></td>
                    <td>{c.their_role || 'n/a'}</td>
                    <td>
                      <button 
                        className="danger" 
                        onClick={() => removeConnection(c.connection_id)} 
                        disabled={removing[c.connection_id]}
                      >
                        {removing[c.connection_id] ? 'Removing...' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {inviteModal && (
        <Modal
          title="Share Invitation"
          subtitle="Copy the JSON below to your partner, or share via other means"
          onClose={() => setInviteModal(false)}
          actions={<button className="primary" onClick={() => navigator.clipboard.writeText(invitationJson)}>Copy JSON</button>}
        >
          <textarea rows={12} readOnly value={invitationJson} style={{ fontFamily: 'Menlo, monospace' }} />
        </Modal>
      )}

      {acceptModal && (
        <Modal
          title="Accept Partner Invitation"
          subtitle="Paste JSON or invitation URL"
          onClose={() => {
            if (!accepting) setAcceptModal(false)
          }}
          actions={<button className="primary" onClick={acceptInvitation} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Submit'}
          </button>}
        >
          <textarea rows={10} value={invitationInput} onChange={(e) => setInvitationInput(e.target.value)} placeholder="Paste invitation" />
        </Modal>
      )}
    </>
  )
}

/**
 * Credentials Page
 * Manage credentials (receive, send, view stored credentials)
 */
function CredentialsPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [credentialExchanges, setCredentialExchanges] = useState([])
  const [storedCredentials, setStoredCredentials] = useState([])
  const [loading, setLoading] = useState(false)

  const loadExchanges = useCallback(async () => {
    try {
      const res = await api.request('/api/credential-exchanges')
      setCredentialExchanges(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load credential exchanges', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  const loadStored = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.request('/api/credentials')
      setStoredCredentials(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load stored credentials', message: error.message, intent: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api, pushToast])

  /**
   * Credentials 頁面數據載入策略：
   * 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
   */
  useEffect(() => {
    if (location.pathname === '/credentials') {
      loadExchanges()
      loadStored()
    }
  }, [location.pathname, loadExchanges, loadStored])

  // 保留原有的初始化載入邏輯（僅執行一次）
  useEffect(() => {
    // 初始化載入；後續使用手動 Refresh
    loadExchanges()
    loadStored()
  }, [loadExchanges, loadStored])

  const [acceptingOffer, setAcceptingOffer] = useState({}) // 接受 credential offer 的 loading 狀態
  const [storing, setStoring] = useState({}) // 儲存 credential 的 loading 狀態

  const acceptCredentialOffer = async (credExId) => {
    if (acceptingOffer[credExId]) return // 防止重複點擊
    try {
      setAcceptingOffer(prev => ({ ...prev, [credExId]: true }))
      await api.request(`/api/credential-exchanges/${credExId}/request`, { method: 'POST' })
      pushToast({ title: 'Credential request sent', intent: 'success', message: 'Waiting for Issuer to issue credential...' })
      // 原本版本：操作後不自動刷新，讓用戶手動刷新
      // 只在成功時更新一次，避免過度 API 調用
      loadExchanges().catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Failed to accept credential offer', message: error.message, intent: 'error' })
    } finally {
      setAcceptingOffer(prev => {
        const next = { ...prev }
        delete next[credExId]
        return next
      })
    }
  }

  const storeCredential = async (credExId) => {
    if (storing[credExId]) return // 防止重複點擊
    try {
      setStoring(prev => ({ ...prev, [credExId]: true }))
      await api.request(`/api/credential-exchanges/${credExId}/store`, { method: 'POST' })
      pushToast({ title: 'Credential stored', intent: 'success', message: 'Credential has been successfully stored in your wallet.' })
      // 原本版本：操作後不自動刷新，讓用戶手動刷新
      // 只在成功時更新一次，避免過度 API 調用
      Promise.all([loadExchanges(), loadStored()]).catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Failed to store credential', message: error.message, intent: 'error' })
    } finally {
      setStoring(prev => {
        const next = { ...prev }
        delete next[credExId]
        return next
      })
    }
  }

  return (
    <>
      <SectionCard
        title="Credential Exchange Status"
        subtitle="Display current credential exchange records on ACA-Py"
        actions={[<button key="reload" className="secondary" onClick={() => { loadExchanges(); loadStored(); }} disabled={loading}>Refresh</button>]}
      >
        {credentialExchanges.length === 0 ? (
          <div className="empty-state">No credential exchange records yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Exchange ID</th>
                  <th>Status</th>
                  <th>Connection ID</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentialExchanges.map((c) => {
                  const exchangeId = c.cred_ex_id || c.credential_exchange_id
                  const state = c.state || 'unknown'
                  return (
                    <tr key={exchangeId}>
                      <td><code>{exchangeId}</code></td>
                      <td><span className="badge">{state}</span></td>
                      <td><code>{c.connection_id}</code></td>
                      <td>{c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}</td>
                      <td>
                        {state === 'offer_received' && (
                          <button 
                            className="primary" 
                            onClick={() => acceptCredentialOffer(exchangeId)}
                            disabled={acceptingOffer[exchangeId]}
                          >
                            {acceptingOffer[exchangeId] ? 'Accepting...' : 'Accept Credential'}
                          </button>
                        )}
                        {state === 'credential_received' && (
                          <button 
                            className="primary" 
                            onClick={() => storeCredential(exchangeId)}
                            disabled={storing[exchangeId]}
                          >
                            {storing[exchangeId] ? 'Storing...' : 'Store Credential'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Stored Credentials"
        subtitle="Display credentials stored in ACA-Py wallet"
        actions={[<button key="reload" className="secondary" onClick={loadStored} disabled={loading}>Refresh</button>]}
      >
        {storedCredentials.length === 0 ? (
          <div className="empty-state">No credentials stored yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Credential ID</th>
                  <th>Schema ID</th>
                  <th>Credential Definition</th>
                </tr>
              </thead>
              <tbody>
                {storedCredentials.map((c) => (
                  <tr key={c.referent || c.credential_id}>
                    <td><code>{c.referent || c.credential_id}</code></td>
                    <td><code>{c.schema_id || '—'}</code></td>
                    <td><code>{c.cred_def_id || '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  )
}

/**
 * Proofs Page
 * Send Proof Requests and verify Presentations (Verifier functionality)
 */
function ProofsPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [proofs, setProofs] = useState([])
  const [requestModal, setRequestModal] = useState(false)
  const [connections, setConnections] = useState([])
  const [credentialDefinitions, setCredentialDefinitions] = useState([])
  const [proofForm, setProofForm] = useState({
    connectionId: '',
    credDefId: '',
    proofName: 'Proof Request',
    requestedAttributes: [],
    requestedPredicates: [], // 新增：支援 Range Proofs
  })
  const [sending, setSending] = useState(false) // 避免重複送出 Proof Request
  const [loading, setLoading] = useState(false)
  const [loadingSchema, setLoadingSchema] = useState(false) // 載入 schema attributes 的 loading 狀態
  const [openingModal, setOpeningModal] = useState(false) // 打開 modal 的 loading 狀態
  const [verifying, setVerifying] = useState({}) // 驗證 presentation 的 loading 狀態
  const autoVerifiedRef = useRef(new Set()) // 使用 ref 追蹤已自動驗證的 proof exchange IDs，避免重複驗證

  const load = useCallback(async () => {
    try {
      const res = await api.request('/api/proofs')
      setProofs(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load proofs', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  // 自動驗證：當檢測到 presentation-received 狀態時自動驗證
  useEffect(() => {
    const autoVerifyPresentations = async () => {
      console.log(`[Auto-Verify] Checking ${proofs.length} proof(s) for auto-verification...`)
      
      for (const proof of proofs) {
        const exchangeId = proof.presentation_exchange_id || proof.pres_ex_id
        const state = proof.state || 'unknown'
        
        console.log(`[Auto-Verify] Checking proof ${exchangeId}: state = "${state}"`)
        
        // 檢查狀態是否為 presentation-received（支援兩種格式：連字符和底線）
        // AIP 2.0 可能使用連字符（presentation-received）或底線（presentation_received）
        const isPresentationReceived = state === 'presentation_received' || state === 'presentation-received'
        const alreadyVerified = autoVerifiedRef.current.has(exchangeId)
        
        console.log(`[Auto-Verify] Proof ${exchangeId}: isPresentationReceived = ${isPresentationReceived}, alreadyVerified = ${alreadyVerified}`)
        
        // 如果狀態是 presentation-received 且尚未自動驗證過，則自動驗證
        if (isPresentationReceived && exchangeId && !alreadyVerified) {
          console.log(`[Auto-Verify] ✓ Detected presentation-received state (${state}) for exchange ${exchangeId}, starting auto-verification...`)
          
          // 標記為正在驗證，避免重複觸發
          setVerifying(prev => ({ ...prev, [exchangeId]: true }))
          autoVerifiedRef.current.add(exchangeId)
          
          try {
            // 異步執行驗證，不阻塞 UI
            console.log(`[Auto-Verify] Calling /api/proofs/${exchangeId}/verify...`)
            await api.request(`/api/proofs/${exchangeId}/verify`, { method: 'POST' })
            console.log(`[Auto-Verify] ✓ Successfully verified presentation ${exchangeId}`)
            pushToast({ 
              title: 'Presentation auto-verified', 
              intent: 'success', 
              message: `Proof exchange ${exchangeId.substring(0, 8)}... has been automatically verified.` 
            })
            // 驗證完成後刷新列表
            setTimeout(() => {
              load().catch(() => {}) // 靜默失敗
            }, 1000)
          } catch (error) {
            console.error(`[Auto-Verify] ✗ Failed to verify presentation ${exchangeId}:`, error)
            pushToast({ 
              title: 'Auto-verification failed', 
              message: error.message || 'Failed to automatically verify presentation', 
              intent: 'error' 
            })
            // 驗證失敗時，從 autoVerified 中移除，允許重試
            autoVerifiedRef.current.delete(exchangeId)
          } finally {
            // 清除驗證中的狀態
            setVerifying(prev => {
              const next = { ...prev }
              delete next[exchangeId]
              return next
            })
          }
        } else if (isPresentationReceived && alreadyVerified) {
          console.log(`[Auto-Verify] Proof ${exchangeId} already verified, skipping...`)
        }
      }
    }

    // 只在有 proofs 數據時執行自動驗證
    if (proofs.length > 0) {
      autoVerifyPresentations()
    } else {
      console.log('[Auto-Verify] No proofs to check')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofs]) // 只在 proofs 改變時執行，避免無限循環

  useEffect(() => {
    // 初始化載入；後續使用手動 Refresh
    load()
  }, [load])

  const openRequestModal = async () => {
    if (openingModal) return // 防止重複點擊
    try {
      setOpeningModal(true)
      const [connectionsRes, credDefsRes] = await Promise.all([
        api.request('/api/connections'),
        api.request('/api/credential-definitions'),
      ])
      const activeConnections = (connectionsRes?.results || []).filter((c) => c.state === 'active')
      if (!activeConnections.length) {
        pushToast({ title: 'No available connections', message: 'Please establish an active connection first.', intent: 'error' })
        return
      }
      setConnections(activeConnections)
      const credDefIds = credDefsRes?.credential_definition_ids || []
      setCredentialDefinitions(credDefIds)
      
      // 如果沒有找到 Credential Definitions，提示用戶
      if (credDefIds.length === 0) {
        console.log('[Acme] 沒有找到 Credential Definitions，用戶需要手動輸入')
        // 不顯示錯誤，因為這是正常情況（Acme 作為 Verifier 通常不會創建 cred defs）
      }
      
      setProofForm({
        connectionId: activeConnections[0].connection_id,
        credDefId: '',
        proofName: 'Proof Request',
        requestedAttributes: [],
        requestedPredicates: [], // 初始化 predicates
      })
      setRequestModal(true)
    } catch (error) {
      pushToast({ title: 'Unable to load connections or Credential Definitions', message: error.message, intent: 'error' })
    } finally {
      setOpeningModal(false)
    }
  }

  // 使用 useRef 來存儲 debounce timer
  const loadSchemaAttributesTimerRef = useRef(null)

  const loadSchemaAttributes = async (credDefId) => {
    if (!credDefId || loadingSchema) return // 防止重複載入
    
    // 清除之前的 timer
    if (loadSchemaAttributesTimerRef.current) {
      clearTimeout(loadSchemaAttributesTimerRef.current)
    }
    
    // 設置 debounce：等待用戶停止輸入 500ms 後再執行
    loadSchemaAttributesTimerRef.current = setTimeout(async () => {
      try {
        setLoadingSchema(true)
        console.log(`[Acme UI] 開始載入 Credential Definition: ${credDefId.substring(0, 50)}...`)
        
        // 查詢 Credential Definition 詳細資訊
        const credDefDetail = await api.request(`/api/credential-definitions/${encodeURIComponent(credDefId)}`)
        const credDef = credDefDetail?.credential_definition
        
        if (!credDef) {
          throw new Error(`無法取得 Credential Definition 詳細資訊。請確認 ID 是否正確，且該 Credential Definition 存在於 ledger 上。`)
        }

        console.log(`[Acme UI] 成功獲取 Credential Definition，schema_id: ${credDef.schema_id || credDef.schemaId}`)

        let schemaId = credDef.schema_id || credDef.schemaId
        if (!schemaId) {
          throw new Error('Credential Definition 缺少 schema_id，無法獲取 attributes')
        }

        // 如果 schemaId 不完整（不包含冒號），嘗試從 ledger 查詢完整 ID
        if (!schemaId.includes(':')) {
          console.log(`[Acme UI] Schema ID 不完整，嘗試查詢完整 ID: ${schemaId}`)
          try {
            const schemaDetail = await api.request(`/api/schemas/${encodeURIComponent(schemaId)}`)
            schemaId = schemaDetail?.schema?.id || schemaDetail?.id || schemaDetail?.schema_id || schemaId
            console.log(`[Acme UI] 獲取到完整 Schema ID: ${schemaId}`)
          } catch (e) {
            console.warn(`[Acme UI] 無法獲取 Schema 詳細資訊，使用原始 schemaId: ${schemaId}`, e)
          }
        }

        // 獲取 Schema 的詳細資訊以取得 attributes
        console.log(`[Acme UI] 查詢 Schema 詳細資訊: ${schemaId}`)
        const schemaDetail = await api.request(`/api/schemas/${encodeURIComponent(schemaId)}`)
        const attrNames = schemaDetail?.schema?.attrNames || schemaDetail?.attrNames || []
        
        if (attrNames.length === 0) {
          throw new Error(`Schema ${schemaId} 中沒有找到任何 attributes。請確認 Schema 是否正確。`)
        }
        
        console.log(`[Acme UI] 成功獲取 ${attrNames.length} 個 attributes:`, attrNames)
        
        setProofForm((prev) => ({
          ...prev,
          credDefId,
          requestedAttributes: attrNames.map((name) => ({ name, include: true })),
        }))
      } catch (error) {
        console.error(`[Acme UI] 載入 Schema attributes 失敗:`, error)
        pushToast({ 
          title: 'Failed to load schema attributes', 
          message: error.message || '無法載入 Credential Definition 或 Schema 資訊。請確認 Credential Definition ID 是否正確。', 
          intent: 'error' 
        })
        // 如果載入失敗，清空 attributes
        setProofForm((prev) => ({
          ...prev,
          requestedAttributes: [],
        }))
      } finally {
        setLoadingSchema(false)
      }
    }, 500) // 500ms debounce
  }

  const sendProofRequest = async () => {
    if (sending) return
    const { connectionId, credDefId, proofName, requestedAttributes, requestedPredicates } = proofForm
    if (!connectionId || !credDefId) {
      pushToast({ title: 'Please select connection and Credential Definition', intent: 'error' })
      return
    }
    const selectedAttrs = requestedAttributes.filter((attr) => attr.include)
    const selectedPreds = requestedPredicates || []
    
    if (!selectedAttrs.length && !selectedPreds.length) {
      pushToast({ title: 'Please select at least one attribute or predicate', intent: 'error' })
      return
    }

    try {
      setSending(true)
      
      // 構建 requested_attributes
      const requested_attributes = {}
      selectedAttrs.forEach((attr, index) => {
        requested_attributes[`attr_${index}_${attr.name}`] = {
          name: attr.name,
          restrictions: [{ cred_def_id: credDefId }],
        }
      })

      // 構建 requested_predicates（Range Proofs / Zero-Knowledge Proofs）
      const requested_predicates = {}
      selectedPreds.forEach((pred, index) => {
        if (pred.name && pred.p_type && pred.p_value !== undefined && pred.p_value !== '') {
          requested_predicates[`pred_${index}_${pred.name}`] = {
            name: pred.name,
            p_type: pred.p_type,
            p_value: parseInt(pred.p_value),
            restrictions: [{ cred_def_id: credDefId }],
          }
        }
      })

      // AIP 2.0 present-proof-2.0/send-request 格式：presentation_request.indy
      const payload = {
        connection_id: connectionId,
        presentation_request: {
          indy: {
            name: proofName || 'Proof Request',
            version: '1.0',
            requested_attributes,
            requested_predicates
          }
        }
      }

      console.log('[Acme] Sending proof request:', JSON.stringify(payload, null, 2))

      await api.request('/api/proofs/send-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setRequestModal(false)
      pushToast({ title: 'Proof Request sent', intent: 'success', message: 'Waiting for Holder to respond...' })
      // 原本版本：操作後不自動刷新，讓用戶手動刷新
      // 只在成功時更新一次，避免過度 API 調用
      load().catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Failed to send Proof Request', message: error.message, intent: 'error' })
    } finally {
      setSending(false)
    }
  }

  const verifyPresentation = async (presentationExchangeId) => {
    if (verifying[presentationExchangeId]) return // 防止重複點擊
    try {
      setVerifying(prev => ({ ...prev, [presentationExchangeId]: true }))
      await api.request(`/api/proofs/${presentationExchangeId}/verify`, { method: 'POST' })
      pushToast({ title: 'Verification request sent', intent: 'success', message: 'Verifying Presentation...' })
      // 原本版本：操作後不自動刷新，讓用戶手動刷新
      // 只在成功時更新一次，避免過度 API 調用
      load().catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Verification failed', message: error.message, intent: 'error' })
    } finally {
      setVerifying(prev => {
        const next = { ...prev }
        delete next[presentationExchangeId]
        return next
      })
    }
  }

  return (
    <>
      <SectionCard
        title="Proof Requests"
        subtitle="Send Proof Requests and verify Presentations"
        actions={[
          <button key="request" className="primary" onClick={openRequestModal} disabled={sending || loading || openingModal}>
            {openingModal ? 'Loading...' : sending ? 'Sending...' : 'Send Proof Request'}
          </button>,
          <button key="reload" className="secondary" onClick={load}>Refresh</button>,
        ]}
      >
        {proofs.length === 0 ? (
          <div className="empty-state">No proof requests yet. Click the button above to send a Proof Request.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Exchange ID</th>
                  <th>Status</th>
                  <th>Connection ID</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {proofs.map((p) => {
                  const exchangeId = p.presentation_exchange_id || p.pres_ex_id
                  const state = p.state || 'unknown'
                  return (
                    <tr key={exchangeId}>
                      <td><code>{exchangeId}</code></td>
                      <td><span className="badge">{state}</span></td>
                      <td><code>{p.connection_id || '—'}</code></td>
                      <td>{p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}</td>
                      <td>
                        {(state === 'presentation_received' || state === 'presentation-received') && (
                          <button 
                            className="primary" 
                            onClick={() => verifyPresentation(exchangeId)}
                            disabled={verifying[exchangeId]}
                          >
                            {verifying[exchangeId] ? 'Verifying...' : 'Verify'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {requestModal && (
        <Modal
          title="Send Proof Request"
          subtitle="Select connection and Credential Definition, and customize attributes to verify"
          onClose={() => {
            if (!sending && !loadingSchema) setRequestModal(false)
          }}
          actions={<button className="primary" onClick={sendProofRequest} disabled={sending || loadingSchema}>
            {sending ? 'Sending...' : loadingSchema ? 'Loading...' : 'Submit'}
          </button>}
        >
          <div className="form-grid">
            <label>Connection</label>
            <select
              value={proofForm.connectionId}
              onChange={(e) => setProofForm((prev) => ({ ...prev, connectionId: e.target.value }))}
            >
              {connections.map((c) => (
                <option key={c.connection_id} value={c.connection_id}>
                  {c.connection_id} {c.their_label ? `(${c.their_label})` : ''}
                </option>
              ))}
            </select>

            <label>Credential Definition</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={proofForm.credDefId}
                onChange={(e) => loadSchemaAttributes(e.target.value)}
                style={{ flex: 1 }}
                disabled={loadingSchema}
              >
                <option value="">Select Credential Definition</option>
                {credentialDefinitions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              {credentialDefinitions.length === 0 && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  (No Credential Definitions found. Please enter manually below.)
                </span>
              )}
            </div>
            {credentialDefinitions.length === 0 && (
              <>
                <label>Or Enter Credential Definition ID Manually</label>
                <input
                  type="text"
                  placeholder="e.g., VACvvNeHVZBhtTkykcNUC:3:CL:3016767:faber.agent.degree_schema"
                  value={proofForm.credDefId}
                  onChange={(e) => {
                    const id = e.target.value.trim()
                    setProofForm((prev) => ({ ...prev, credDefId: id }))
                    if (id) {
                      loadSchemaAttributes(id)
                    }
                  }}
                  disabled={loadingSchema}
                />
                <p className="subtle" style={{ fontSize: '0.85rem', marginTop: '-8px' }}>
                  You can get the Credential Definition ID from Faber's Credential Definitions page.
                </p>
              </>
            )}

            <label>Proof Request Name</label>
            <input
              value={proofForm.proofName}
              onChange={(e) => setProofForm((prev) => ({ ...prev, proofName: e.target.value }))}
              placeholder="e.g., Proof of Education"
            />

            {proofForm.requestedAttributes.length > 0 && (
              <>
                <label style={{ gridColumn: '1 / -1', marginTop: 16 }}>Select attributes to verify</label>
                {proofForm.requestedAttributes.map((attr, index) => (
                  <React.Fragment key={attr.name}>
                    <label style={{ gridColumn: '1', fontWeight: 'normal' }}>
                      <input
                        type="checkbox"
                        checked={attr.include}
                        onChange={(e) => {
                          const newAttrs = [...proofForm.requestedAttributes]
                          newAttrs[index].include = e.target.checked
                          setProofForm((prev) => ({ ...prev, requestedAttributes: newAttrs }))
                        }}
                      />
                      {attr.name}
                    </label>
                  </React.Fragment>
                ))}
              </>
            )}

            {/* Predicates / Range Proofs Section */}
            <label style={{ gridColumn: '1 / -1', marginTop: 24, fontSize: '1.1rem', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              🔐 Predicates (Zero-Knowledge Proofs / Range Proofs)
            </label>
            <p className="subtle" style={{ gridColumn: '1 / -1', marginTop: '-8px', fontSize: '0.85rem' }}>
              Use predicates to verify claims without revealing actual values. For example, prove "age ≥ 18" without revealing the exact age.
            </p>

            {proofForm.requestedPredicates && proofForm.requestedPredicates.length > 0 ? (
              proofForm.requestedPredicates.map((pred, index) => (
                <React.Fragment key={index}>
                  <label style={{ gridColumn: '1', fontWeight: 'normal', display: 'flex', alignItems: 'center' }}>
                    Predicate {index + 1}
                  </label>
                  <div style={{ gridColumn: '2', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Attribute name"
                      value={pred.name || ''}
                      onChange={(e) => {
                        const newPreds = [...proofForm.requestedPredicates]
                        newPreds[index] = { ...newPreds[index], name: e.target.value }
                        setProofForm((prev) => ({ ...prev, requestedPredicates: newPreds }))
                      }}
                      style={{ flex: '1' }}
                    />
                    <select
                      value={pred.p_type || '>='}
                      onChange={(e) => {
                        const newPreds = [...proofForm.requestedPredicates]
                        newPreds[index] = { ...newPreds[index], p_type: e.target.value }
                        setProofForm((prev) => ({ ...prev, requestedPredicates: newPreds }))
                      }}
                      style={{ width: '80px' }}
                    >
                      <option value=">=">&gt;=</option>
                      <option value=">">&gt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="<">&lt;</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Value"
                      value={pred.p_value || ''}
                      onChange={(e) => {
                        const newPreds = [...proofForm.requestedPredicates]
                        newPreds[index] = { ...newPreds[index], p_value: e.target.value }
                        setProofForm((prev) => ({ ...prev, requestedPredicates: newPreds }))
                      }}
                      style={{ width: '100px' }}
                    />
                    <button
                      className="secondary"
                      onClick={() => {
                        const newPreds = proofForm.requestedPredicates.filter((_, i) => i !== index)
                        setProofForm((prev) => ({ ...prev, requestedPredicates: newPreds }))
                      }}
                      style={{ padding: '6px 12px' }}
                    >
                      ✕
                    </button>
                  </div>
                </React.Fragment>
              ))
            ) : (
              <p className="subtle" style={{ gridColumn: '1 / -1', fontSize: '0.85rem', fontStyle: 'italic' }}>
                No predicates added yet. Click "Add Predicate" to create a zero-knowledge proof.
              </p>
            )}

            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
              <button
                className="secondary"
                onClick={() => {
                  setProofForm((prev) => ({
                    ...prev,
                    requestedPredicates: [
                      ...(prev.requestedPredicates || []),
                      { name: '', p_type: '>=', p_value: '' }
                    ]
                  }))
                }}
                disabled={loadingSchema}
              >
                + Add Predicate
              </button>
            </div>

            {/* Example Section */}
            <div style={{ gridColumn: '1 / -1', marginTop: 16, padding: '12px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>💡 Example Use Cases:</div>
              <ul style={{ fontSize: '0.8rem', paddingLeft: 20, margin: 0, color: 'var(--text-muted)' }}>
                <li>Prove <code>age &gt;= 18</code> without revealing exact age</li>
                <li>Prove <code>salary &gt; 50000</code> for loan approval</li>
                <li>Prove <code>birthdate_dateint &lt;= 20060101</code> for age verification (YYYYMMDD format)</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * Schemas Page
 * View Schemas on the Ledger
 */
function SchemasPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [schemas, setSchemas] = useState([])
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState({}) // 載入詳情的 loading 狀態

  const load = useCallback(async () => {
    try {
      const res = await api.request('/api/schemas')
      setSchemas(res?.schema_ids ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load schemas', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    if (location.pathname === '/schemas') {
      load()
    }
  }, [location.pathname, load])

  const openSchema = async (id) => {
    if (loadingDetail[id]) return // 防止重複點擊
    try {
      setLoadingDetail(prev => ({ ...prev, [id]: true }))
      const res = await api.request(`/api/schemas/${encodeURIComponent(id)}`)
      setDetail({ id, data: res })
    } catch (error) {
      pushToast({ title: 'Failed to load schema details', message: error.message, intent: 'error' })
    } finally {
      setLoadingDetail(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  return (
    <>
      <SectionCard
        title="Schemas"
        subtitle="Review existing Indy Schemas"
        actions={[<button key="reload" className="secondary" onClick={load}>Refresh</button>]}
      >
        {schemas.length === 0 ? (
          <div className="empty-state">No schemas created yet. ACA-Py will automatically create them when the flow starts.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Schema ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schemas.map((id) => (
                  <tr key={id}>
                    <td><code>{id}</code></td>
                    <td>
                      <button 
                        className="secondary" 
                        onClick={() => openSchema(id)} 
                        disabled={loadingDetail[id]}
                      >
                        {loadingDetail[id] ? 'Loading...' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {detail && (
        <Modal
          title="Schema Details"
          subtitle={detail.id}
          onClose={() => setDetail(null)}
          actions={<button className="primary" onClick={() => navigator.clipboard.writeText(JSON.stringify(detail.data, null, 2))}>Copy JSON</button>}
        >
          <pre style={{ maxHeight: 320, overflow: 'auto', background: 'rgba(17, 24, 39, 0.08)', padding: 18, borderRadius: 16 }}>
            {JSON.stringify(detail.data, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  )
}

export default function App() {
  const status = useAgentStatus()
  const toastManager = useToasts()

  const navigation = useMemo(() => ([
    { to: '/dashboard', label: 'Dashboard', subtitle: 'Platform Overview' },
    { to: '/connections', label: 'Connections', subtitle: 'Manage Connections' },
    { to: '/credentials', label: 'Credentials', subtitle: 'Manage Credentials' },
    { to: '/proofs', label: 'Proofs', subtitle: 'Verification Requests' },
    { to: '/schemas', label: 'Schemas', subtitle: 'View Schemas' },
  ]), [])

  return (
    <>
      <Layout
        status={status}
        nav={navigation}
        title="Acme Controller"
        subtitle="Supply Chain Verifier Platform"
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage pushToast={toastManager.push} />} />
          <Route path="/connections" element={<ConnectionsPage pushToast={toastManager.push} />} />
          <Route path="/credentials" element={<CredentialsPage pushToast={toastManager.push} />} />
          <Route path="/proofs" element={<ProofsPage pushToast={toastManager.push} />} />
          <Route path="/schemas" element={<SchemasPage pushToast={toastManager.push} />} />
        </Routes>
      </Layout>
      <ToastStack items={toastManager.items} />
    </>
  )
}
