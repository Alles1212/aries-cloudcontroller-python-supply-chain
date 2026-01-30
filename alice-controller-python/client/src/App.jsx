/**
 * Alice Controller - Main Application Component
 * 
 * Features:
 * - Dashboard: Display key metrics for the supply chain platform
 * - Connections: Manage DIDComm connections
 * - Credentials: Receive and store credentials (Holder functionality)
 * - Proofs: Respond to Proof Requests (Holder functionality)
 * 
 * Role:
 * - Primary role as Holder (credential holder and proof presenter)
 * - In the distributed supply chain platform, acts as the middle-tier participant
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
 * - Credentials: POST /api/credentials/accept-offer → /issue-credential-2.0/records/{id}/send-request
 *                POST /api/credentials/store → /issue-credential-2.0/records/{id}/store
 * - Proofs:      POST /api/proofs/send-presentation → /present-proof-2.0/records/{id}/send-presentation
 * UI 策略：元件掛載時載入資料，提供手動 Refresh，避免高頻輪詢。
 */

function useToasts() {
  const [items, setItems] = useState([])

  const push = useCallback((toast) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    const next = { id, ...toast }
    setItems((current) => [...current, next])
    setTimeout(() => {
      setItems((current) => current.filter((t) => t.id !== id))
    }, toast.ttl ?? 4500)
  }, [])

  return { items, push }
}

function useConnections(api, pushToast) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 移除多餘的 /api/status 調用，status 已經有獨立的 hook
      const res = await api.request('/api/connections')
      setConnections(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load connections', message: error.message, intent: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api, pushToast])

  return { connections, loading, load }
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
      const pendingProofs = proofs.filter((p) => p.state === 'request_received')

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
          title="Pending Proofs"
          value={stats.pendingProofs}
          subtitle="Awaiting response"
          icon="⏳"
          trend={stats.pendingProofs > 0 ? 'up' : 'neutral'}
        />
      </div>

      <SectionCard
        title="Platform Overview"
        subtitle="Distributed Supply Chain Holder Platform - Alice"
        actions={[<button key="reload" className="secondary" onClick={loadStats} disabled={loading}>Refresh</button>]}
      >
        <p className="subtle">
          Alice Controller serves as a credential holder in the supply chain platform. Key features include:
        </p>
        <ul style={{ marginTop: 16, paddingLeft: 24, color: 'var(--text-muted)' }}>
          <li>Establish and manage DIDComm connections with supply chain partners</li>
          <li>Receive and store credentials from Issuers</li>
          <li>Respond to Proof Requests from Verifiers</li>
          <li>Present credentials for verification</li>
        </ul>
      </SectionCard>
    </>
  )
}

function ConnectionsPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const { connections, loading, load } = useConnections(api, pushToast)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [acceptModalOpen, setAcceptModalOpen] = useState(false)
  const [currentInvitation, setCurrentInvitation] = useState('')
  const [invitationInput, setInvitationInput] = useState('')

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    if (location.pathname === '/connections') {
      load()
    }
  }, [location.pathname, load])

  const [creating, setCreating] = useState(false) // 建立邀請的 loading 狀態
  const [accepting, setAccepting] = useState(false) // 接受邀請的 loading 狀態
  const [removing, setRemoving] = useState({}) // 移除連線的 loading 狀態

  const createInvitation = async () => {
    if (creating) return // 防止重複點擊
    try {
      setCreating(true)
      const response = await api.request('/api/connections/invitation', { method: 'POST' })
      const invitation = JSON.stringify(response, null, 2)
      setCurrentInvitation(invitation)
      setInviteModalOpen(true)
      pushToast({ title: 'Invitation created', intent: 'success', message: 'Share the JSON below with your connection partner.' })
    } catch (error) {
      pushToast({ title: 'Failed to create invitation', message: error.message, intent: 'error' })
    } finally {
      setCreating(false)
    }
  }

  /**
   * 接受邀請並建立連線
   * 
   * 原本版本（Angular）：接受邀請後直接導航到 /connections，不進行輪詢
   * 目前版本：接受邀請後立即關閉 modal 並刷新連線列表，讓用戶手動刷新查看狀態
   * 
   * 注意：
   * - 邀請必須是有效的 OOB 1.1 格式
   * - 連線建立需要時間，狀態會從 'invitation' -> 'request' -> 'response' -> 'active'
   * - 只有狀態為 'active' 時，連線才完全建立
   */
  const acceptInvitation = async () => {
    try {
      const payload = invitationInput.trim()
      if (!payload) {
        pushToast({ title: 'Please paste invitation content', intent: 'error' })
        return
      }

      // 驗證邀請格式（前端驗證）
      try {
        const parsed = JSON.parse(payload)
        if (!parsed['@type'] || !parsed['@type'].includes('out-of-band/1.1/invitation')) {
          pushToast({ 
            title: 'Invalid invitation format', 
            message: 'Invitation must be a valid OOB 1.1 invitation with @type field', 
            intent: 'error' 
          })
          return
        }
        if (!parsed['@id'] || !parsed.handshake_protocols || !parsed.services) {
          pushToast({ 
            title: 'Invalid invitation format', 
            message: 'Invitation must contain @id, handshake_protocols, and services fields', 
            intent: 'error' 
          })
          return
        }
      } catch (e) {
        pushToast({ 
          title: 'Invalid invitation format', 
          message: `Failed to parse invitation JSON: ${e.message}`, 
          intent: 'error' 
        })
        return
      }

      // 發送接受邀請的請求
      setAccepting(true)
      await api.request('/api/connections/accept', {
        method: 'POST',
        body: JSON.stringify({ invitation: payload }),
      })

      // 立即關閉 modal 並清空輸入，不等待連線建立
      setAcceptModalOpen(false)
      setInvitationInput('')
      
      // 刷新連線列表（不等待結果，避免阻塞 UI）
      load().catch(() => {}) // 靜默更新，不顯示錯誤
      
      pushToast({ 
        title: 'Invitation accepted', 
        intent: 'success', 
        message: 'Connection is being established. The connection status will update automatically. Please wait for the connection to become active.' 
      })
    } catch (error) {
      pushToast({ 
        title: 'Failed to accept invitation', 
        message: error.message || 'Please check the invitation format and try again', 
        intent: 'error' 
      })
    } finally {
      setAccepting(false)
    }
  }

  const removeConnection = async (connectionId) => {
    if (removing[connectionId]) return // 防止重複點擊
    if (!confirm('Are you sure you want to remove this connection?')) {
      return
    }

    try {
      setRemoving(prev => ({ ...prev, [connectionId]: true }))
      await api.request(`/api/connections/${connectionId}`, {
        method: 'DELETE'
      })

      pushToast({
        title: 'Connection removed',
        intent: 'success',
        message: 'Connection has been removed from ACA-Py'
      })

      await load()
    } catch (error) {
      pushToast({
        title: 'Failed to remove connection',
        message: error.message || 'Unable to remove connection, please try again later',
        intent: 'error'
      })
      console.error('Error removing connection:', error)
    } finally {
      setRemoving(prev => {
        const next = { ...prev }
        delete next[connectionId]
        return next
      })
    }
  }

  return (
    <>
      <SectionCard
        title="Create Connection"
        subtitle="Establish DIDComm links through invitations"
        actions={[
          <button key="create" className="primary" onClick={createInvitation} disabled={creating}>
            {creating ? 'Creating...' : 'Create Invitation'}
          </button>,
          <button key="accept" className="secondary" onClick={() => setAcceptModalOpen(true)} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Accept Invitation'}
          </button>,
        ]}
      >
        <p className="subtle">After creating an invitation, share the JSON with your partner; to accept an invitation, paste the content provided by your partner.</p>
      </SectionCard>

      <SectionCard
        title="Existing Connections"
        subtitle="Display current connection data on ACA-Py"
        actions={[
          <button key="reload" className="secondary" onClick={load} disabled={loading}>Refresh</button>,
        ]}
      >
        {connections.length === 0 ? (
          <div className="empty-state">No connections yet. Use the buttons above to create or accept invitations.</div>
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

      {inviteModalOpen && (
        <Modal
          title="Invitation Content"
          subtitle="Share the JSON below or use another Controller to paste and complete the connection"
          onClose={() => setInviteModalOpen(false)}
          actions={(
            <button className="primary" onClick={() => navigator.clipboard.writeText(currentInvitation)}>
              Copy JSON
            </button>
          )}
        >
          <textarea rows={12} value={currentInvitation} readOnly style={{ fontFamily: 'Menlo, monospace' }}></textarea>
        </Modal>
      )}

      {acceptModalOpen && (
        <Modal
          title="Paste Invitation from Partner"
          subtitle="Paste JSON or invitation URL"
          onClose={() => {
            if (!accepting) setAcceptModalOpen(false)
          }}
          actions={<button className="primary" onClick={acceptInvitation} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Submit'}
          </button>}
        >
          <textarea
            rows={10}
            placeholder="Paste invitation JSON or URL"
            value={invitationInput}
            onChange={(e) => setInvitationInput(e.target.value)}
          ></textarea>
        </Modal>
      )}
    </>
  )
}

function CredentialsPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [credentialExchanges, setCredentialExchanges] = useState([])
  const [storedCredentials, setStoredCredentials] = useState([])
  const [loadingExchanges, setLoadingExchanges] = useState(false)
  const [loadingStored, setLoadingStored] = useState(false)
  const [credentialDetailModal, setCredentialDetailModal] = useState(false)
  const [selectedCredential, setSelectedCredential] = useState(null)

  const loadCredentialExchanges = useCallback(async () => {
    setLoadingExchanges(true)
    try {
      const res = await api.request('/api/credential-exchanges')
      let list = res?.results ?? []
      
      // ACA-Py v2.0 返回的資料結構可能是嵌套的 {cred_ex_record: {...}}
      // 扁平化資料結構，提取 cred_ex_record 到最外層
      list = list.map(item => {
        if (item.cred_ex_record && typeof item.cred_ex_record === 'object') {
          return {
            cred_ex_id: item.cred_ex_record.cred_ex_id,
            connection_id: item.cred_ex_record.connection_id,
            state: item.cred_ex_record.state,
            role: item.cred_ex_record.role,
            thread_id: item.cred_ex_record.thread_id,
            created_at: item.cred_ex_record.created_at,
            updated_at: item.cred_ex_record.updated_at,
            _raw: item
          }
        }
        return item
      })
      
      setCredentialExchanges(list)
    } catch (error) {
      pushToast({ title: 'Failed to load credential exchanges', message: error.message, intent: 'error' })
    } finally {
      setLoadingExchanges(false)
    }
  }, [api, pushToast])

  const loadStoredCredentials = useCallback(async () => {
    setLoadingStored(true)
    try {
      const res = await api.request('/api/credentials')
      setStoredCredentials(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load stored credentials', message: error.message, intent: 'error' })
    } finally {
      setLoadingStored(false)
    }
  }, [api, pushToast])

  /**
   * Credentials 頁面數據載入策略：
   * 1. 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
   * 2. 提供手動刷新按鈕
   * 
   * 這樣可以及時反映憑證狀態變化，例如收到新的憑證 Offer 或憑證已儲存
   */
  useEffect(() => {
    if (location.pathname === '/credentials') {
      loadCredentialExchanges()
      loadStoredCredentials()
    }
  }, [location.pathname, loadCredentialExchanges, loadStoredCredentials])

  const [acceptingOffer, setAcceptingOffer] = useState({}) // 接受 credential offer 的 loading 狀態
  const [storing, setStoring] = useState({}) // 儲存 credential 的 loading 狀態
  const [viewingDetail, setViewingDetail] = useState({}) // 查看詳情的 loading 狀態

  const acceptCredentialOffer = async (credExId) => {
    if (acceptingOffer[credExId]) return // 防止重複點擊
    try {
      setAcceptingOffer(prev => ({ ...prev, [credExId]: true }))
      await api.request(`/api/credential-exchanges/${credExId}/request`, { method: 'POST' })
      pushToast({ title: 'Credential request sent', intent: 'success', message: 'Waiting for Faber to issue credential...' })
      // 原本版本：操作後不自動刷新，讓用戶手動刷新
      // 只在成功時更新一次，避免過度 API 調用
      loadCredentialExchanges().catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Failed to accept credential offer', message: error.message, intent: 'error' })
      console.error('Failed to accept credential offer:', error)
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
      Promise.all([loadCredentialExchanges(), loadStoredCredentials()]).catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Failed to store credential', message: error.message, intent: 'error' })
      console.error('Failed to store credential:', error)
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
        actions={[
          <button key="reload-exchanges" className="secondary" onClick={loadCredentialExchanges} disabled={loadingExchanges}>Refresh</button>,
        ]}
      >
        {credentialExchanges.length === 0 ? (
          <div className="empty-state">No credential exchange records yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Exchange ID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Connection</th>
                  <th>Thread</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentialExchanges.map((c) => {
                  // AIP 2.0 使用 cred_ex_id 和 state 欄位
                  const exchangeId = c.cred_ex_id || c.credential_exchange_id || c.cred_ex_record?.cred_ex_id || '—'
                  // AIP 2.0 狀態值：proposal-sent, proposal-received, offer-sent, offer-received, 
                  // request-sent, request-received, credential-issued, credential-received, done, abandoned
                  const state = c.state || c.cred_ex_record?.state || c.credential_offer_state || 'unknown'
                  const role = c.role || c.cred_ex_record?.role || 'holder'
                  const connectionId = c.connection_id || c.cred_ex_record?.connection_id || '—'
                  const threadId = c.thread_id || c.cred_ex_record?.thread_id || '—'
                  const updated = c.updated_at || c.cred_ex_record?.updated_at || c.created_at || c.cred_ex_record?.created_at
                  return (
                    <tr key={exchangeId}>
                      <td><code>{exchangeId}</code></td>
                      <td>{role}</td>
                      <td><span className="badge">{state}</span></td>
                      <td><code>{connectionId}</code></td>
                      <td><code>{threadId}</code></td>
                      <td>{updated ? new Date(updated).toLocaleString() : '—'}</td>
                      <td>
                        {(state === 'offer-received' || state === 'offer_received') && (
                          <button 
                            className="primary" 
                            onClick={() => acceptCredentialOffer(exchangeId)}
                            disabled={acceptingOffer[exchangeId]}
                          >
                            {acceptingOffer[exchangeId] ? 'Accepting...' : 'Accept Credential'}
                          </button>
                        )}
                        {(state === 'credential-received' || state === 'credential_received') && (
                          <button 
                            className="primary" 
                            onClick={() => storeCredential(exchangeId)}
                            disabled={storing[exchangeId]}
                          >
                            {storing[exchangeId] ? 'Storing...' : 'Store Credential'}
                          </button>
                        )}
                        {state === 'done' && (
                          <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span className="badge" style={{ background: 'var(--success)', color: 'white' }}>
                              ✓ Stored in Wallet
                            </span>
                            <button 
                              className="secondary" 
                              onClick={() => {
                                // 刷新 Stored Credentials 以確保顯示最新資料
                                loadStoredCredentials()
                                pushToast({ 
                                  title: 'Refreshed', 
                                  message: 'Stored credentials list has been refreshed', 
                                  intent: 'success' 
                                })
                              }}
                            >
                              Refresh Stored
                            </button>
                          </span>
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
        actions={[
          <button key="reload-stored" className="secondary" onClick={loadStoredCredentials} disabled={loadingStored}>Refresh</button>,
        ]}
      >
        {storedCredentials.length === 0 ? (
          <div className="empty-state">No credentials stored yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Credential ID</th>
                  <th>Status</th>
                  <th>Issuer</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {storedCredentials.map((c) => {
                  // 從 stored credential 正確提取資訊
                  // referent 是 credential_id（wallet 中的唯一識別符）
                  const credentialId = c.referent || c.credential_id || '—'
                  
                  // issuer 可以從 cred_def_id 的第一個部分取得（格式：DID:3:CL:seq:tag）
                  // 或從 schema_id 的第一個部分取得（格式：DID:2:schema_name:version）
                  let issuer = 'unknown'
                  if (c.cred_def_id) {
                    const parts = c.cred_def_id.split(':')
                    if (parts.length > 0) {
                      issuer = parts[0] // 第一個部分是 issuer DID
                    }
                  } else if (c.schema_id) {
                    const parts = c.schema_id.split(':')
                    if (parts.length > 0) {
                      issuer = parts[0] // 如果沒有 cred_def_id，從 schema_id 取得
                    }
                  } else if (c.schema_issuer_did) {
                    issuer = c.schema_issuer_did
                  }
                  
                  return (
                    <tr key={credentialId}>
                      <td><code>{credentialId}</code></td>
                      <td><span className="badge">{c.state || 'issued'}</span></td>
                      <td><code>{issuer}</code></td>
                      <td>{c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}</td>
                      <td>
                        <button 
                          className="secondary" 
                          onClick={() => {
                            setSelectedCredential(c)
                            setCredentialDetailModal(true)
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Credential Detail Modal */}
      {credentialDetailModal && selectedCredential && (
        <Modal
          title="Credential Details"
          subtitle={selectedCredential.referent || selectedCredential.credential_id || 'Credential ID not available'}
          onClose={() => {
            setCredentialDetailModal(false)
            setSelectedCredential(null)
          }}
          actions={
            <button 
              className="primary" 
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(selectedCredential, null, 2))
                pushToast({ title: 'Copied!', message: 'Credential JSON copied to clipboard', intent: 'success' })
              }}
            >
              Copy JSON
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
            <div>
              <label style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>Schema ID</label>
              <code style={{ display: 'block', padding: '8px', background: 'rgba(17, 24, 39, 0.08)', borderRadius: '4px', wordBreak: 'break-all' }}>
                {selectedCredential.schema_id || '—'}
              </code>
            </div>
            <div>
              <label style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>Credential Definition ID</label>
              <code style={{ display: 'block', padding: '8px', background: 'rgba(17, 24, 39, 0.08)', borderRadius: '4px', wordBreak: 'break-all' }}>
                {selectedCredential.cred_def_id || '—'}
              </code>
            </div>
            {selectedCredential.attrs && Object.keys(selectedCredential.attrs).length > 0 && (
              <div>
                <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Attributes</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {Object.entries(selectedCredential.attrs).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(17, 24, 39, 0.08)', borderRadius: '4px', wordBreak: 'break-word' }}>
                      <span style={{ fontWeight: 500, marginRight: '12px' }}>{key}:</span>
                      <span style={{ textAlign: 'right' }}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label style={{ fontWeight: 600, marginBottom: '4px', display: 'block' }}>Full Credential JSON</label>
              <pre style={{ maxHeight: '300px', overflow: 'auto', background: 'rgba(17, 24, 39, 0.08)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', wordBreak: 'break-word' }}>
                {JSON.stringify(selectedCredential, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function ProofsPage({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [proofs, setProofs] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.request('/api/proofs')
      setProofs(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load proofs', message: error.message, intent: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api, pushToast])

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    if (location.pathname === '/proofs') {
      load()
    }
  }, [location.pathname, load])

  const [sendingPresentation, setSendingPresentation] = useState({}) // 發送 presentation 的 loading 狀態

  const sendPresentation = async (presentationExchangeId) => {
    if (sendingPresentation[presentationExchangeId]) return // 防止重複點擊
    try {
      setSendingPresentation(prev => ({ ...prev, [presentationExchangeId]: true }))
      await api.request(`/api/proofs/${presentationExchangeId}/presentation`, { method: 'POST' })
      pushToast({ title: 'Presentation sent', intent: 'success', message: 'Waiting for Verifier to verify...' })
      // 原本版本：操作後不自動刷新，讓用戶手動刷新
      // 只在成功時更新一次，避免過度 API 調用
      load().catch(() => {}) // 不顯示錯誤，靜默更新
    } catch (error) {
      pushToast({ title: 'Failed to send presentation', message: error.message, intent: 'error' })
      console.error('Failed to send presentation:', error)
    } finally {
      setSendingPresentation(prev => {
        const next = { ...prev }
        delete next[presentationExchangeId]
        return next
      })
    }
  }

  return (
    <SectionCard
      title="Proof Requests"
      subtitle="List received Presentation Exchanges"
      actions={[<button key="reload" className="secondary" onClick={load} disabled={loading}>Refresh</button>]}
    >
      {proofs.length === 0 ? (
        <div className="empty-state">No proof requests received yet. Acme can send verification requests.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Exchange ID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Connection</th>
                  <th>Thread</th>
                  <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proofs.map((p) => {
                const exchangeId = p.presentation_exchange_id || p.pres_ex_id
                const state = p.state || 'unknown'
                  const role = p.role || 'holder'
                  const connectionId = p.connection_id || '—'
                  const threadId = p.thread_id || '—'
                  const updated = p.updated_at || p.created_at
                return (
                  <tr key={exchangeId}>
                    <td><code>{exchangeId}</code></td>
                      <td>{role}</td>
                      <td><span className="badge">{state}</span></td>
                      <td><code>{connectionId}</code></td>
                      <td><code>{threadId}</code></td>
                      <td>{updated ? new Date(updated).toLocaleString() : '—'}</td>
                    <td>
                        {state === 'request_received' && (
                        <button 
                          className="primary" 
                          onClick={() => sendPresentation(exchangeId)}
                          disabled={sendingPresentation[exchangeId]}
                        >
                          {sendingPresentation[exchangeId] ? 'Sending...' : 'Respond to Proof'}
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
  )
}

export default function App() {
  const status = useAgentStatus()
  const toastManager = useToasts()

  const navigation = useMemo(() => ([
    { to: '/dashboard', label: 'Dashboard', subtitle: 'Platform Overview' },
    { to: '/connections', label: 'Connections', subtitle: 'Manage Connections' },
    { to: '/credentials', label: 'Credentials', subtitle: 'Manage Credentials' },
    { to: '/proofs', label: 'Proofs', subtitle: 'Manage Proof Requests' },
  ]), [])

  return (
    <>
      <Layout
        status={status}
        nav={navigation}
        title="Alice Controller"
        subtitle="Supply Chain Holder Platform"
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage pushToast={toastManager.push} />} />
          <Route path="/connections" element={<ConnectionsPage pushToast={toastManager.push} />} />
          <Route path="/credentials" element={<CredentialsPage pushToast={toastManager.push} />} />
          <Route path="/proofs" element={<ProofsPage pushToast={toastManager.push} />} />
        </Routes>
      </Layout>
      <ToastStack items={toastManager.items} />
    </>
  )
}

