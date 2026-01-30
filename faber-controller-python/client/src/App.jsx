/**
 * Faber Controller - Main Application Component
 * 
 * Features:
 * - Dashboard: Display key metrics for the supply chain platform
 * - Connections: Manage DIDComm connections
 * - Schemas: View Ledger Schemas
 * - Credential Definitions: Issue credentials to holders
 * 
 * Role:
 * - Primary role as Issuer (credential issuer)
 * - In the distributed supply chain platform, acts as the upstream issuer
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout.jsx'
import { SectionCard } from './components/SectionCard.jsx'
import { DashboardCard } from './components/DashboardCard.jsx'
import { Modal } from './components/Modal.jsx'
import { ToastStack } from './components/ToastStack.jsx'
import { useAgentStatus } from './hooks/useAgentStatus.js'
import { useApi } from './hooks/useApi.js'

/**
 * API 調用對應（對應後端 /api → ACA-Py Admin）：
 * - Connections: POST /api/connections/invitation → /out-of-band/create-invitation
 *                POST /api/connections/accept → /out-of-band/receive-invitation
 *                DELETE /api/connections/:id → /connections/{id}
 * - Credentials: POST /api/credentials/send → /issue-credential-2.0/send-offer
 * - Schemas:     GET /api/schemas → /schemas/created
 * - CredDefs:    GET /api/credential-definitions → /credential-definitions/created
 * UI 重點：只在元件掛載時載入，提供手動 Refresh，避免高頻輪詢。
 */

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

// 將長 ID 截斷以避免表格撐開版面；保留前後段方便辨識
const truncateMiddle = (value, front = 10, back = 6) => {
  if (!value) return '—'
  const str = String(value)
  if (str.length <= front + back + 3) return str
  return `${str.slice(0, front)}...${str.slice(-back)}`
}

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
    schemas: 0,
    credentialDefinitions: 0,
    credentialsIssued: 0,
  })
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const [connectionsRes, schemasRes, credDefsRes] = await Promise.all([
        api.request('/api/connections').catch(() => ({ results: [] })),
        api.request('/api/schemas').catch(() => ({ schema_ids: [] })),
        api.request('/api/credential-definitions').catch(() => ({ credential_definition_ids: [] })),
      ])

      const connections = connectionsRes?.results || []
      const activeConnections = connections.filter((c) => c.state === 'active')
      const schemas = schemasRes?.schema_ids || []
      const credentialDefinitions = credDefsRes?.credential_definition_ids || []

      setStats({
        connections: connections.length,
        activeConnections: activeConnections.length,
        schemas: schemas.length,
        credentialDefinitions: credentialDefinitions.length,
        credentialsIssued: 0, // This would require tracking issued credentials
      })
    } catch (error) {
      pushToast({ title: 'Failed to load statistics', message: error.message, intent: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api, pushToast])

  useEffect(() => {
    // 初始化載入一次；後續由手動 Refresh 按鈕觸發
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
          title="Schemas"
          value={stats.schemas}
          subtitle="Registered schemas on ledger"
          icon="📋"
          trend={stats.schemas > 0 ? 'up' : 'neutral'}
        />
        <DashboardCard
          title="Credential Definitions"
          value={stats.credentialDefinitions}
          subtitle="Available credential definitions"
          icon="📜"
          trend={stats.credentialDefinitions > 0 ? 'up' : 'neutral'}
        />
      </div>

      <SectionCard
        title="Platform Overview"
        subtitle="Distributed Supply Chain Issuer Platform - Faber"
        actions={[<button key="reload" className="secondary" onClick={loadStats} disabled={loading}>Refresh</button>]}
      >
        <p className="subtle">
          Faber Controller serves as a credential issuer in the supply chain platform. Key features include:
        </p>
        <ul style={{ marginTop: 16, paddingLeft: 24, color: 'var(--text-muted)' }}>
          <li>Establish and manage DIDComm connections with supply chain partners</li>
          <li>Create and register schemas on the ledger</li>
          <li>Create credential definitions for credential issuance</li>
          <li>Issue credentials to holders (Alice, Acme, etc.)</li>
        </ul>
      </SectionCard>
    </>
  )
}

function ConnectionsCard({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [connections, setConnections] = useState([])
  const [invitationJson, setInvitationJson] = useState('')
  const [inviteModal, setInviteModal] = useState(false)
  const [acceptModal, setAcceptModal] = useState(false)
  const [invitationInput, setInvitationInput] = useState('')
  const [initialInvitation, setInitialInvitation] = useState(null) // 初始邀請
  const [creating, setCreating] = useState(false) // 建立邀請的 loading 狀態
  const [accepting, setAccepting] = useState(false) // 接受邀請的 loading 狀態
  const [removing, setRemoving] = useState({}) // 移除連線的 loading 狀態
  
  // 使用 localStorage 追蹤是否已經創建過初始邀請（跨組件重新掛載保持狀態）
  const INITIAL_INVITATION_KEY = 'faber_initial_invitation_created'
  const hasCreatedInitialInvitation = useRef(
    localStorage.getItem(INITIAL_INVITATION_KEY) === 'true'
  )

  /**
   * 載入連線列表
   * 
   * 注意：此函數只負責載入數據，不觸發任何副作用
   */
  const load = useCallback(async () => {
    try {
      const res = await api.request('/api/connections')
      setConnections(res?.results ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load connections', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  /**
   * 自動建立初始邀請（如果還沒有連線）
   * 
   * 設計原則：
   * 1. 只在組件首次掛載時執行一次（使用單獨的 useEffect，空依賴項）
   * 2. 使用 localStorage 持久化狀態，避免組件重新掛載時重複創建
   * 3. 檢查是否有活躍連線，如果有則不創建
   * 4. 如果已經創建過（localStorage 標記），直接從 localStorage 讀取邀請內容
   * 
   * 這可以防止：
   * 1. 多次創建邀請導致多個 connection 記錄
   * 2. 重複顯示通知
   * 3. 路由切換時重複創建
   * 4. useEffect 依賴項變化導致重複執行
   */
  useEffect(() => {
    // 如果已經創建過，嘗試從 localStorage 讀取邀請內容
    if (hasCreatedInitialInvitation.current) {
      const savedInvitation = localStorage.getItem('faber_initial_invitation')
      if (savedInvitation) {
        setInitialInvitation(savedInvitation)
      }
      return // 已經創建過，不再重複創建
    }

    // 異步檢查並創建初始邀請
    const checkAndCreate = async () => {
      try {
        // 檢查連線狀態
        // 注意：創建邀請會在 ACA-Py 中創建一個 connection 記錄（狀態為 "invitation"）
        // 但我們希望初始邀請可以顯示，即使有 invitation 狀態的連線
        const res = await api.request('/api/connections')
        const allConnections = res?.results || []
        const hasActiveConnections = allConnections.some((c) => c.state === 'active')
        const hasOnlyInvitationConnections = allConnections.length > 0 && 
          allConnections.every((c) => c.state === 'invitation' || c.state === 'invitation-sent' || c.state === 'request')
        
        // 只有在沒有任何連線時才創建初始邀請
        // 這確保了：
        // 1. 不會重複創建邀請（如果已經有連線記錄）
        // 2. 初始邀請只在首次載入時創建一次
        if (allConnections.length === 0) {
          // 完全沒有任何連線時，創建初始邀請
          const invitationRes = await api.request('/api/connections/invitation', { method: 'POST' })
          const pretty = JSON.stringify(invitationRes, null, 2)
          
          // 保存邀請內容和標記
          setInitialInvitation(pretty)
          hasCreatedInitialInvitation.current = true
          localStorage.setItem(INITIAL_INVITATION_KEY, 'true')
          localStorage.setItem('faber_initial_invitation', pretty)
          
          pushToast({ 
            title: 'Initial invitation created', 
            message: 'Copy this invitation to share with Alice.', 
            intent: 'success' 
          })
        } else if (hasOnlyInvitationConnections && !hasActiveConnections) {
          // 如果只有 invitation 狀態的連線（沒有活躍連線），嘗試從 localStorage 恢復初始邀請
          // 這確保了即使有 invitation 狀態的連線，初始邀請仍然可以顯示
          // 注意：如果已經有 invitation 狀態的連線，說明 Agent 已經創建了邀請
          // 我們不應該再創建新的邀請，只從 localStorage 恢復顯示
          const savedInvitation = localStorage.getItem('faber_initial_invitation')
          if (savedInvitation) {
            setInitialInvitation(savedInvitation)
            hasCreatedInitialInvitation.current = true
          } else {
            // 如果沒有保存的邀請，不創建新邀請
            // 因為已經有 invitation 狀態的連線，說明 Agent 已經創建了邀請
            // 用戶可以使用 Agent logs 中的邀請，或者手動點擊 "Create Invitation" 按鈕
            hasCreatedInitialInvitation.current = true
            localStorage.setItem(INITIAL_INVITATION_KEY, 'true')
            console.log('Found existing invitation connections, skipping initial invitation creation. Use Agent logs or Create Invitation button.')
          }
        } else {
          // 如果有活躍連線或其他狀態的連線，標記為已處理（不需要創建邀請）
          hasCreatedInitialInvitation.current = true
          localStorage.setItem(INITIAL_INVITATION_KEY, 'true')
        }
      } catch (error) {
        // 靜默失敗，不顯示錯誤
        console.warn('Failed to create initial invitation:', error)
      }
    }

    checkAndCreate()
    // 空依賴項數組，確保只在組件首次掛載時執行一次
    // 注意：這裡故意使用空依賴項，因為我們希望只在組件首次掛載時執行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    // 同時也支援首次掛載時的載入
    if (location.pathname === '/connections') {
      load()
    }
  }, [location.pathname, load])

  /**
   * 監聽連線狀態變化，當有活躍連線時清除初始邀請
   * 
   * 這確保了：
   * 1. 當有活躍連線時，初始邀請不再顯示（因為連線已經建立）
   * 2. 如果有 invitation 狀態的連線，初始邀請仍然可以顯示（因為連線尚未建立）
   * 3. 防止初始邀請和 Agent logs 中的邀請不一致
   * 4. 防止重複創建邀請（使用 hasCreatedInitialInvitation 標記）
   */
  useEffect(() => {
    const hasActiveConnections = connections.some((c) => c.state === 'active')
    const hasOnlyInvitationConnections = connections.length > 0 && 
      connections.every((c) => c.state === 'invitation' || c.state === 'invitation-sent' || c.state === 'request')
    
    // 只有在有活躍連線時才清除初始邀請
    // 如果有 invitation 狀態的連線，初始邀請仍然可以顯示
    if (hasActiveConnections && initialInvitation) {
      // 有活躍連線時，清除初始邀請（因為連線已經建立）
      setInitialInvitation(null)
      hasCreatedInitialInvitation.current = false
      localStorage.removeItem(INITIAL_INVITATION_KEY)
      localStorage.removeItem('faber_initial_invitation')
    } else if (hasOnlyInvitationConnections && !initialInvitation && !hasCreatedInitialInvitation.current) {
      // 如果只有 invitation 狀態的連線且沒有初始邀請，且還沒有創建過，嘗試從 localStorage 恢復
      // 注意：這裡不創建新邀請，因為：
      // 1. 初始邀請創建邏輯已經處理了創建邏輯
      // 2. 如果已經有 invitation 狀態的連線，說明 Agent 已經創建了邀請
      // 3. 我們只需要從 localStorage 恢復顯示，不應該創建新的邀請
      const savedInvitation = localStorage.getItem('faber_initial_invitation')
      if (savedInvitation) {
        setInitialInvitation(savedInvitation)
        hasCreatedInitialInvitation.current = true
      }
      // 如果 localStorage 中沒有保存的邀請，不創建新邀請
      // 因為已經有 invitation 狀態的連線，說明 Agent 已經創建了邀請
    }
  }, [connections, initialInvitation]) // 監聽 connections 和 initialInvitation 的變化

  const createInvitation = async () => {
    if (creating) return // 防止重複點擊
    try {
      setCreating(true)
      const res = await api.request('/api/connections/invitation', { method: 'POST' })
      const pretty = JSON.stringify(res, null, 2)
      setInvitationJson(pretty)
      setInviteModal(true)
      pushToast({ title: 'Invitation created', message: 'Share this JSON with Alice.', intent: 'success' })
    } catch (error) {
      pushToast({ title: 'Failed to create invitation', message: error.message, intent: 'error' })
    } finally {
      setCreating(false)
    }
  }

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
      // 原本版本（Blazor）：接受邀請後直接導航，不進行輪詢
      // 目前版本：接受邀請後立即關閉 modal 並刷新連線列表
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
    if (!confirm('Are you sure you want to remove this connection?')) {
      return
    }
    try {
      setRemoving(prev => ({ ...prev, [id]: true }))
      await api.request(`/api/connections/${id}`, { method: 'DELETE' })
      pushToast({ title: 'Connection removed', intent: 'success', message: 'Connection has been removed from ACA-Py' })
      await load()
    } catch (error) {
      pushToast({ title: 'Failed to remove connection', message: error.message || 'Unable to remove connection, please try again later', intent: 'error' })
      console.error('Error removing connection:', error)
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
      {/* 顯示初始邀請（如果存在且沒有活躍連線） */}
      {/* 
        注意：
        1. 如果有初始邀請且沒有活躍連線，就顯示初始邀請
        2. 即使有 invitation 狀態的連線，初始邀請仍然可以顯示（因為連線尚未建立）
        3. 當有活躍連線時，不顯示初始邀請（因為連線已經建立）
        4. 這確保了初始邀請和 Agent logs 中的邀請一致（都是同一個邀請）
      */}
      {initialInvitation && !connections.some((c) => c.state === 'active') && (
        <SectionCard
          title="Quick Start - Initial Invitation"
          subtitle="Copy this invitation to share with Alice"
          actions={[
            <button 
              key="copy" 
              className="primary" 
              onClick={() => {
                navigator.clipboard.writeText(initialInvitation)
                pushToast({ title: 'Copied!', message: 'Invitation JSON copied to clipboard', intent: 'success' })
              }}
            >
              Copy Invitation
            </button>,
            <button 
              key="regenerate" 
              className="secondary" 
              onClick={async () => {
                try {
                  const res = await api.request('/api/connections/invitation', { method: 'POST' })
                  const pretty = JSON.stringify(res, null, 2)
                  setInitialInvitation(pretty)
                  // 更新 localStorage 中的邀請內容
                  localStorage.setItem('faber_initial_invitation', pretty)
                  pushToast({ title: 'New invitation created', intent: 'success' })
                } catch (error) {
                  pushToast({ title: 'Failed to create invitation', message: error.message, intent: 'error' })
                }
              }}
            >
              Regenerate
            </button>,
          ]}
        >
          <textarea
            readOnly
            value={initialInvitation}
            style={{
              width: '100%',
              minHeight: '200px',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-card)',
              resize: 'vertical',
            }}
          />
          {initialInvitation && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>QR Code (for wallet scan)</div>
              <img
                alt="Invitation QR"
                style={{ width: 240, height: 240, borderRadius: 12, border: '1px solid var(--border)', background: 'white' }}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(initialInvitation)}`}
              />
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="Create Connection"
        subtitle="Establish DIDComm links through invitations"
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
          <div className="empty-state">No connections yet. Create an invitation and share the JSON with Alice!</div>
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
          subtitle="Copy the JSON below to Alice, or share via other means"
          onClose={() => setInviteModal(false)}
          actions={<button className="primary" onClick={() => navigator.clipboard.writeText(invitationJson)}>Copy JSON</button>}
        >
          <textarea rows={12} readOnly value={invitationJson} style={{ fontFamily: 'Menlo, monospace' }} />
          {invitationJson && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>QR Code (share with wallet)</div>
              <img
                alt="Invitation QR"
                style={{ width: 200, height: 200, borderRadius: 12, border: '1px solid var(--border)', background: 'white' }}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(invitationJson)}`}
              />
            </div>
          )}
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

function SchemasCard({ pushToast }) {
  const api = useApi()
  const location = useLocation()
  const [schemas, setSchemas] = useState([])
  const [detail, setDetail] = useState(null)
  const [createModal, setCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [schemaForm, setSchemaForm] = useState({
    schema_name: '',
    schema_version: '1.0',
    attributes: [''],
    tag: '',
    // 預設為 false：大部分測試／示範情境不需要撤銷，可降低 Ledger 與 revocation registry 的負擔
    // 如需支援撤銷，在建立 Schema/CredDef 時再主動勾選即可
    support_revocation: false
  })

  const load = useCallback(async () => {
    try {
      const res = await api.request('/api/schemas')
      setSchemas(res?.schema_ids ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load schemas', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  const createCustomSchema = async () => {
    if (creating) return
    
    // 驗證表單
    if (!schemaForm.schema_name.trim()) {
      pushToast({ title: 'Validation Error', message: 'Schema name is required', intent: 'error' })
      return
    }
    
    const validAttributes = schemaForm.attributes.filter(attr => attr.trim())
    if (validAttributes.length === 0) {
      pushToast({ title: 'Validation Error', message: 'At least one attribute is required', intent: 'error' })
      return
    }

    try {
      setCreating(true)
      const payload = {
        schema_name: schemaForm.schema_name.trim(),
        schema_version: schemaForm.schema_version.trim() || '1.0',
        attributes: validAttributes.map(attr => attr.trim()),
        tag: schemaForm.tag.trim() || schemaForm.schema_name.trim(),
        support_revocation: schemaForm.support_revocation
      }
      
      const res = await api.request('/api/admin/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      pushToast({
        title: 'Schema/CredDef created',
        intent: 'success',
        message: `Schema: ${res?.schema_id || 'n/a'}, CredDef: ${res?.credential_definition_id || 'n/a'}`
      })
      
      setCreateModal(false)
      setSchemaForm({
        schema_name: '',
        schema_version: '1.0',
        attributes: [''],
        tag: '',
        support_revocation: false
      })
      load()
    } catch (error) {
      pushToast({ title: 'Failed to create schema', message: error.message, intent: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const addAttribute = () => {
    setSchemaForm(prev => ({
      ...prev,
      attributes: [...prev.attributes, '']
    }))
  }

  const removeAttribute = (index) => {
    setSchemaForm(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, i) => i !== index)
    }))
  }

  const updateAttribute = (index, value) => {
    setSchemaForm(prev => ({
      ...prev,
      attributes: prev.attributes.map((attr, i) => i === index ? value : attr)
    }))
  }

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    // 同時也支援首次掛載時的載入
    if (location.pathname === '/schemas') {
      load()
    }
  }, [location.pathname, load])

  const [loadingDetail, setLoadingDetail] = useState({}) // 載入詳情的 loading 狀態

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
        actions={[
          <button key="create" className="primary" onClick={() => setCreateModal(true)}>
            Create Schema
          </button>,
          <button key="reload" className="secondary" onClick={load}>Refresh</button>
        ]}
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

      {createModal && (
        <Modal
          title="Create Schema"
          subtitle="Create a new Schema and Credential Definition"
          onClose={() => {
            if (!creating) setCreateModal(false)
          }}
          // Modal 已內建 Cancel，這裡只放主要的 Create 按鈕，避免雙 Cancel
          actions={
            <button className="primary" onClick={createCustomSchema} disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          }
        >
          <div className="form-grid">
            <label>Schema Name</label>
            <input
              type="text"
              value={schemaForm.schema_name}
              onChange={(e) => setSchemaForm(prev => ({ ...prev, schema_name: e.target.value }))}
              placeholder="e.g., degree_schema"
              disabled={creating}
            />

            <label>Schema Version</label>
            <input
              type="text"
              value={schemaForm.schema_version}
              onChange={(e) => setSchemaForm(prev => ({ ...prev, schema_version: e.target.value }))}
              placeholder="e.g., 1.0"
              disabled={creating}
            />

            <label style={{ gridColumn: '1 / -1' }}>Attributes</label>
            {schemaForm.attributes.map((attr, index) => (
              <React.Fragment key={index}>
                <input
                  type="text"
                  value={attr}
                  onChange={(e) => updateAttribute(index, e.target.value)}
                  placeholder={`Attribute ${index + 1}`}
                  disabled={creating}
                  style={{ gridColumn: '1 / -2' }}
                />
                <button
                  type="button"
                  className="danger"
                  onClick={() => removeAttribute(index)}
                  disabled={creating || schemaForm.attributes.length === 1}
                  style={{ gridColumn: '-1' }}
                >
                  Remove
                </button>
              </React.Fragment>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={addAttribute}
              disabled={creating}
              style={{ gridColumn: '1 / -1' }}
            >
              Add Attribute
            </button>

            <label>Tag (Optional)</label>
            <input
              type="text"
              value={schemaForm.tag}
              onChange={(e) => setSchemaForm(prev => ({ ...prev, tag: e.target.value }))}
              placeholder="Leave empty to use schema name"
              disabled={creating}
            />

            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={schemaForm.support_revocation}
                onChange={(e) => setSchemaForm(prev => ({ ...prev, support_revocation: e.target.checked }))}
                disabled={creating}
                style={{ width: 'auto', cursor: 'pointer' }}
              />
              <span>Support Revocation (Enable credential revocation for this Credential Definition)</span>
            </label>
          </div>
        </Modal>
      )}

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

function CredentialDefinitionsCard({ pushToast, setPendingCredentials }) {
  const api = useApi()
  const location = useLocation()
  const [definitions, setDefinitions] = useState([])
  const [detail, setDetail] = useState(null)
  const [issueModal, setIssueModal] = useState(false)
  const [issueForm, setIssueForm] = useState({ connectionId: '', credDefId: '', comment: 'Credential issued via Faber Controller' })
  const [connections, setConnections] = useState([])
  const [schemaMeta, setSchemaMeta] = useState(null)
  const [attributeValues, setAttributeValues] = useState([])
  const [loadingSchema, setLoadingSchema] = useState(false)
  const [sending, setSending] = useState(false) // 避免重複送出
  const [schemaLoadElapsed, setSchemaLoadElapsed] = useState(0) // Schema 載入耗時顯示
  const [allConnections, setAllConnections] = useState([]) // 預先載入連線列表

  const load = useCallback(async () => {
    try {
      const res = await api.request('/api/credential-definitions')
      setDefinitions(res?.credential_definition_ids ?? [])
    } catch (error) {
      pushToast({ title: 'Failed to load credential definitions', message: error.message, intent: 'error' })
    }
  }, [api, pushToast])

  /**
   * 預先載入連線列表，避免在打開 modal 時才載入造成卡頓
   * 
   * 注意：只載入狀態為 'active' 的連線，因為只有這些連線可以用於發送憑證
   * 連線狀態說明：
   * - 'invitation': 邀請已發送，但連線尚未建立
   * - 'request': 連線請求已發送，但連線尚未建立
   * - 'response': 連線回應已收到，但連線尚未建立
   * - 'active': 連線已完全建立，可以用於發送憑證
   */
  const loadConnections = useCallback(async () => {
    try {
      const res = await api.request('/api/connections')
      // 只載入狀態為 'active' 的連線，確保連線已完全建立
      const activeConnections = (res?.results || []).filter((c) => {
        // 嚴格檢查：只有 state === 'active' 的連線才可以使用
        return c.state === 'active'
      })
      setAllConnections(activeConnections)
    } catch (error) {
      console.warn('Failed to preload connections:', error)
    }
  }, [api])

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    // 同時也支援首次掛載時的載入
    if (location.pathname === '/credential-definitions') {
      load()
      loadConnections() // 預先載入連線列表
    }
  }, [location.pathname, load, loadConnections])

  const [loadingDetail, setLoadingDetail] = useState({}) // 載入詳情的 loading 狀態

  const openDetail = async (id) => {
    if (loadingDetail[id]) return // 防止重複點擊
    try {
      setLoadingDetail(prev => ({ ...prev, [id]: true }))
      const res = await api.request(`/api/credential-definitions/${encodeURIComponent(id)}`)
      setDetail({ id, data: res?.credential_definition })
    } catch (error) {
      pushToast({ title: 'Failed to load details', message: error.message, intent: 'error' })
    } finally {
      setLoadingDetail(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const openIssueModal = async (credDefId) => {
    // 重置狀態並立刻開啟 modal，讓使用者立刻看到「Loading...」狀態
    setIssueModal(true)
    setLoadingSchema(true)
    setAttributeValues([])
    setSchemaMeta(null)
    setConnections([])
    setSchemaLoadElapsed(0)
    const start = Date.now()
    const timerId = setInterval(() => {
      setSchemaLoadElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    
    try {
      // 1) 並行抓取「連線列表」與「Credential Definition 詳細資訊」，縮短等待時間
      const connectionsPromise = allConnections.length > 0
        ? Promise.resolve(allConnections)
        : api.request('/api/connections').then((res) =>
            (res?.results || []).filter((c) => c.state === 'active')
          )

      const credDefPromise = api.request(`/api/credential-definitions/${credDefId}`)

      const [list, credDefDetail] = await Promise.all([connectionsPromise, credDefPromise])

      if (!list.length) {
        pushToast({ 
          title: 'No available connections', 
          message: 'Please ensure Alice has accepted the invitation and the connection is fully established (state: active).', 
          intent: 'error' 
        })
        setLoadingSchema(false)
        return
      }

      const credDef = credDefDetail?.credential_definition
      if (!credDef) {
        console.error('credDefDetail:', credDefDetail)
        throw new Error('Unable to get Credential Definition details')
      }

      let schemaId = credDef.schema_id || credDef.schemaId
      if (!schemaId) {
        console.error('credDef:', credDef)
        throw new Error('Credential Definition missing schema_id. Available fields: ' + Object.keys(credDef).join(', '))
      }
      console.log('Schema ID extracted:', schemaId)
  
      let schemaDetail
      if (!schemaId.includes(':')) {
        console.log('Schema ID is sequence number, fetching from ledger:', schemaId)
        schemaDetail = await api.request(`/api/schemas/${encodeURIComponent(schemaId)}`)
        const resolvedId = schemaDetail?.schema?.id || schemaDetail?.id || schemaDetail?.schema_id
        if (!resolvedId) {
          console.error('schemaDetail:', schemaDetail)
          throw new Error(`Unable to resolve full schema_id from ledger seq ${schemaId}`)
        }
        schemaId = resolvedId
        console.log('Resolved schema ID:', schemaId)
      } else {
        console.log('Fetching schema details:', schemaId)
        schemaDetail = await api.request(`/api/schemas/${encodeURIComponent(schemaId)}`)
      }
      console.log('schemaDetail:', schemaDetail)
  
      const schemaAttrNames = schemaDetail?.schema?.attrNames || schemaDetail?.attrNames || []
      if (!schemaAttrNames.length) {
        console.error('Schema structure:', {
          hasSchema: !!schemaDetail?.schema,
          schemaKeys: schemaDetail?.schema ? Object.keys(schemaDetail.schema) : 'N/A',
          topLevelKeys: Object.keys(schemaDetail || {}),
          fullDetail: schemaDetail
        })
        throw new Error('Schema did not return attrNames. Available fields: ' + 
          (schemaDetail?.schema ? Object.keys(schemaDetail.schema).join(', ') : 'schema object not found'))
      }
      console.log('Schema attributes loaded:', schemaAttrNames)
  
      const schemaParts = schemaId.split(':')
      if (schemaParts.length < 4) {
        throw new Error(`Invalid schema_id format: ${schemaId}`)
      }
      const schemaIssuerDid = schemaParts[0]
      const schemaName = schemaParts[2]
      const schemaVersion = schemaParts[3]
      const credDefParts = credDefId.split(':')
      if (credDefParts.length < 2) {
        throw new Error(`Invalid cred_def_id format: ${credDefId}`)
      }
      const issuerDid = credDefParts[0]
  
      const defaultValues = {
        name: 'Alice Smith',
        degree: 'Maths',
        date: '2018-05-28',
        timestamp: `${Date.now()}`,
        birthdate_dateint: '20010401'
      }
  
      setAttributeValues(
        schemaAttrNames.map((name) => ({
          name,
          value: defaultValues[name] ?? ''
        }))
      )
  
      setSchemaMeta({
        schemaId,
        schemaIssuerDid,
        schemaVersion,
        schemaName,
        issuerDid
      })
  
      setConnections(list)
      setIssueForm((prev) => ({
        ...prev,
        credDefId,
        connectionId: list[0].connection_id,
        comment: prev.comment || `Credential from ${issuerDid}`
      }))

      setLoadingSchema(false)
    } catch (error) {
      pushToast({ title: 'Unable to load connections or schema', message: error.message, intent: 'error' })
      console.error('Error opening issue modal:', error)
      // 在錯誤時保留 modal，顯示錯誤訊息區塊
      setLoadingSchema(false)
      setAttributeValues([])
      setSchemaMeta(null)
      setConnections([])
    } finally {
      clearInterval(timerId)
      setSchemaLoadElapsed(0)
    }
  }

  const sendCredential = async () => {
    if (sending) return // 防止重複點擊
    const { connectionId, credDefId, comment } = issueForm
    if (!connectionId) {
      pushToast({ title: 'No connection selected', intent: 'error' })
      return
    }
    if (!credDefId) {
      pushToast({ title: 'No Credential Definition selected', intent: 'error' })
      return
    }
    if (!schemaMeta) {
      pushToast({ title: 'Schema info not loaded', intent: 'error' })
      return
    }
    if (!attributeValues.length) {
      pushToast({ title: 'Schema attribute fields not loaded', intent: 'error' })
      return
    }
    const startTime = Date.now()
    
    // 生成唯一 ID 用於追蹤此 pending credential
    const pendingId = `cred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    try {
      setSending(true)
      const attributes = attributeValues.map((attr) => ({
        name: attr.name,
        value: attr.value ?? ''
      }))

      const payload = {
        connection_id: connectionId,
        cred_def_id: credDefId,
        comment: comment || `Credential from ${schemaMeta.issuerDid}`,
        credential_proposal: {
          '@type': 'https://didcomm.org/issue-credential/2.0/credential-preview',
          attributes
        },
        // AIP 2.0 端點要求的 indy filter（避免 422 缺少 filter）
        filter: {
          indy: {
            cred_def_id: credDefId
          }
        }
      }
      
      // 立即加入 pending 列表，讓 Credentials Issued 頁面可以追蹤
      const pendingItem = {
        id: pendingId,
        credDefId,
        connectionId,
        comment: comment || `Credential from ${schemaMeta.issuerDid}`,
        attributes,
        startTime,
        status: 'sending'
      }
      setPendingCredentials(prev => [...prev, pendingItem])
      
      // 快速回應：立即關閉 modal，背景送出請求並於完成時提示耗時
      setIssueModal(false)
      setSchemaMeta(null)
      setAttributeValues([])
      setConnections([])
      setLoadingSchema(false)

      // 逾時避免永久卡在 Sending...（後端 600s 逾時，前端略長以優先收到 504）
      const SEND_TIMEOUT_MS = 610 * 1000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)

      api.request('/api/credentials/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).then((result) => {
        clearTimeout(timeoutId)
        const durationSec = Math.round((Date.now() - startTime) / 1000)
        
        // 成功：更新 pending 狀態為 completed，保留記錄讓使用者手動移除
        setPendingCredentials(prev => prev.map(item => 
          item.id === pendingId 
            ? { ...item, status: 'completed', credExId: result?.cred_ex_id || result?.credential_exchange_id, durationSec }
            : item
        ))
        
        pushToast({
          title: 'Credential sent',
          intent: 'success',
          message: `Credential has been sent to Alice. Total time: ${durationSec} second(s).`
        })
        pushToast({
          title: 'Track in Credentials Issued',
          intent: 'info',
          message: 'Open Credentials Issued and Refresh to see status.'
        })
      }).catch((error) => {
        clearTimeout(timeoutId)
        const durationSec = Math.round((Date.now() - startTime) / 1000)
        const isTimeout = error.name === 'AbortError'
        
        // 失敗：更新 pending 狀態為 failed，保留記錄讓使用者手動移除
        setPendingCredentials(prev => prev.map(item => 
          item.id === pendingId 
            ? { 
                ...item, 
                status: 'failed', 
                error: error.message || 'Unknown error',
                isTimeout,
                durationSec
              }
            : item
        ))
        
        pushToast({
          title: isTimeout ? 'Request timed out' : 'Failed to send credential',
          message: (isTimeout
            ? `Send credential did not complete within ${SEND_TIMEOUT_MS / 1000}s. Check ACA-Py and connection.`
            : (error.message || 'Unable to send credential, please check connection status and Credential Definition')
          ) + ` (elapsed: ${durationSec} second(s))`,
          intent: 'error'
        })
        console.error('Error sending credential:', error)
      }).finally(() => {
        setSending(false)
      })
    } catch (error) {
      // 理論上不會進入這裡，錯誤已在 promise 鏈中處理
      setSending(false)
      // 移除 pending（如果有的話）
      setPendingCredentials(prev => prev.filter(item => item.id !== pendingId))
      pushToast({ title: 'Failed to send credential', message: error.message, intent: 'error' })
    }
  }

  return (
    <>
      <SectionCard
        title="Credential Definitions"
        subtitle="View/Send credentials using Credential Definitions"
        actions={[<button key="reload" className="secondary" onClick={load}>Refresh</button>]}
      >
        {definitions.length === 0 ? (
          <div className="empty-state">No Credential Definitions created yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Credential Definition ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((id) => (
                  <tr key={id}>
                    <td><code>{id}</code></td>
                    <td className="inline-actions">
                      <button 
                        className="secondary" 
                        onClick={() => openDetail(id)} 
                        disabled={loadingDetail[id]}
                      >
                        {loadingDetail[id] ? 'Loading...' : 'View'}
                      </button>
                      <button className="primary" onClick={() => openIssueModal(id)} disabled={loadingSchema || sending}>
                        {sending ? 'Sending...' : 'Send Credential'}
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
          title="Credential Definition Details"
          subtitle={detail.id}
          onClose={() => setDetail(null)}
          actions={<button className="primary" onClick={() => navigator.clipboard.writeText(JSON.stringify(detail.data, null, 2))}>Copy JSON</button>}
        >
          <pre style={{ maxHeight: 320, overflow: 'auto', background: 'rgba(17, 24, 39, 0.08)', padding: 18, borderRadius: 16 }}>
            {JSON.stringify(detail.data, null, 2)}
          </pre>
        </Modal>
      )}

      {issueModal && (
        <Modal
          title="Send Credential"
          subtitle={loadingSchema ? 'Loading schema...' : (schemaMeta ? `Schema: ${schemaMeta.schemaName} v${schemaMeta.schemaVersion}` : 'Fill in data according to Schema attributes')}
          onClose={() => {
            if (sending) return
            setIssueModal(false)
            setSchemaMeta(null)
            setAttributeValues([])
            setConnections([])
            setLoadingSchema(false)
            setSchemaLoadElapsed(0)
            setSending(false)
          }}
          // 這裡只提供「Send」按鈕，Cancel 由 Modal 預設提供，避免出現兩個 Cancel
          actions={
            <button
              className="primary"
              onClick={sendCredential}
              disabled={loadingSchema || !schemaMeta || attributeValues.length === 0 || sending}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          }
        >
          {loadingSchema ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 12 }}>Loading Schema attributes...</div>
              <div style={{ marginBottom: 6, fontSize: '0.9rem' }}>Elapsed: {schemaLoadElapsed}s</div>
              <div style={{ width: '100%', maxWidth: 360, margin: '0 auto', height: 6, borderRadius: 999, background: 'var(--border)' }}>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, rgba(99,102,241,0.8) 0%, rgba(168,85,247,0.8) 100%)',
                    animation: 'progress-stripes 1.2s linear infinite',
                    backgroundSize: '200% 100%'
                  }}
                />
              </div>
            </div>
          ) : !schemaMeta || attributeValues.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--danger)' }}>
              Failed to load schema attributes. Please try again.
            </div>
          ) : (
            <div className="form-grid">
              <label>Credential Definition</label>
              <input value={issueForm.credDefId} readOnly />

              <label>Select Connection</label>
              {connections.length === 0 ? (
                <div style={{ color: 'var(--danger)', padding: '8px' }}>No active connections available</div>
              ) : (
                <select value={issueForm.connectionId} onChange={(e) => setIssueForm((prev) => ({ ...prev, connectionId: e.target.value }))}>
                  {connections.map((c) => (
                    <option key={c.connection_id} value={c.connection_id}>{c.connection_id} ({c.their_label || c.their_did || 'Partner'})</option>
                  ))}
                </select>
              )}

              <label>Comment</label>
              <input value={issueForm.comment} onChange={(e) => setIssueForm((prev) => ({ ...prev, comment: e.target.value }))} />

              {attributeValues.map((attr, index) => (
                <React.Fragment key={attr.name || index}>
                  <label>{attr.name}</label>
                  <input
                    value={attr.value || ''}
                    onChange={(e) => {
                      const next = [...attributeValues]
                      next[index] = { ...attr, value: e.target.value }
                      setAttributeValues(next)
                    }}
                    placeholder={`Enter ${attr.name}`}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

/**
 * Credentials Issued Page
 * - 手動刷新，不自動輪詢，避免高頻呼叫
 * - 保留最後一次成功資料，載入失敗不清空，避免白屏
 * - 分區顯示 In Progress / Completed，長 ID 截斷，必要時可檢視/複製 JSON
 */
function CredentialsIssuedCard({ pushToast, pendingCredentials, setPendingCredentials }) {
  const api = useApi()
  const location = useLocation()
  const [exchanges, setExchanges] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [fetchedOnce, setFetchedOnce] = useState(false)
  const [detail, setDetail] = useState(null)
  const [revoking, setRevoking] = useState({})
  const [revokeModal, setRevokeModal] = useState(null)

  const load = useCallback(async () => {
    if (loading) return // 避免重複請求造成 ACA-Py 壓力
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.request('/api/credential-exchanges')
      let list = Array.isArray(res?.results) ? res.results : []
      
      // ACA-Py v2.0 返回的資料結構可能是嵌套的 {cred_ex_record: {...}}
      // 扁平化資料結構，提取 cred_ex_record 到最外層
      list = list.map(item => {
        if (item.cred_ex_record && typeof item.cred_ex_record === 'object') {
          // 將 cred_ex_record 的欄位提取到最外層，方便前端讀取
          return {
            cred_ex_id: item.cred_ex_record.cred_ex_id,
            connection_id: item.cred_ex_record.connection_id,
            state: item.cred_ex_record.state,
            role: item.cred_ex_record.role,
            thread_id: item.cred_ex_record.thread_id,
            created_at: item.cred_ex_record.created_at,
            updated_at: item.cred_ex_record.updated_at,
            rev_reg_id: item.cred_ex_record.by_format?.cred_issue?.indy?.rev_reg_id || null,
            cred_rev_id: item.cred_ex_record.by_format?.cred_issue?.indy?.cred_rev_id || null,
            // 保留完整的原始資料供 View 使用
            _raw: item
          }
        }
        return item
      })
      
      setExchanges(list)
      setFetchedOnce(true)
    } catch (error) {
      setLoadError(error.message || 'Failed to load credential exchanges')
      // 若已經載入過，保留舊資料避免白屏
      if (!fetchedOnce) setExchanges([])
    } finally {
      setLoading(false)
    }
  }, [api, fetchedOnce, loading])

  useEffect(() => {
    // 當路由切換到此頁面時重新載入（解決切換頁面後列表不顯示的問題）
    // 同時也支援首次掛載時的載入
    if (location.pathname === '/credentials-issued') {
      load()
    }
  }, [location.pathname, load])

  const handleRevoke = (ex) => {
    const credExId = ex.cred_ex_id || ex.credential_exchange_id
    if (!ex.rev_reg_id) {
      pushToast({
        title: 'Cannot revoke',
        message: 'This credential definition does not support revocation.',
        intent: 'error'
      })
      return
    }
    setRevokeModal({
      cred_ex_id: credExId,
      rev_reg_id: ex.rev_reg_id,
      cred_rev_id: ex.cred_rev_id
    })
  }

  const confirmRevoke = async () => {
    if (!revokeModal) return
    const { cred_ex_id, rev_reg_id, cred_rev_id } = revokeModal
    try {
      setRevoking((prev) => ({ ...prev, [cred_ex_id]: true }))
      await api.request('/api/credentials/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cred_ex_id,
          rev_reg_id,
          cred_rev_id,
          publish: true
        })
      })
      pushToast({ title: 'Credential revoked', intent: 'success', message: 'Revocation has been published.' })
      setRevokeModal(null)
      load().catch(() => {}) // 靜默刷新
    } catch (error) {
      pushToast({ title: 'Failed to revoke', message: error.message, intent: 'error' })
    } finally {
      setRevoking((prev) => {
        const next = { ...prev }
        delete next[cred_ex_id]
        return next
      })
    }
  }

  // 實時計算 pending credentials 的耗時
  const [elapsedTimes, setElapsedTimes] = useState({})
  
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      const times = {}
      pendingCredentials.forEach(item => {
        if (item.status === 'sending') {
          times[item.id] = Math.floor((now - item.startTime) / 1000)
        }
      })
      setElapsedTimes(times)
    }, 1000) // 每秒更新一次
    
    return () => clearInterval(timer)
  }, [pendingCredentials])

  // 分區資料
  const inProgress = exchanges.filter((ex) => {
    const s = ex.state || ''
    return !(s === 'done' || s === 'credential-issued' || s === 'credential_issued')
  })
  const completed = exchanges.filter((ex) => {
    const s = ex.state || ''
    // Faber 作為 Issuer，當 state 為 'done' 或 'credential-issued' 時表示憑證已成功發出
    return s === 'done' || s === 'credential-issued' || s === 'credential_issued'
  })
  
  // 調試：記錄 exchanges 資料
  useEffect(() => {
    if (exchanges.length > 0) {
      console.log('[Faber] Credential exchanges loaded:', exchanges.length)
      console.log('[Faber] Completed credentials:', completed.length)
      console.log('[Faber] Sample exchange states:', exchanges.slice(0, 3).map(ex => ex.state))
    }
  }, [exchanges, completed.length])

  // 過濾出不同狀態的 pending credentials
  const activePending = pendingCredentials.filter(item => item.status === 'sending')
  const completedPending = pendingCredentials.filter(item => item.status === 'completed')
  const failedPending = pendingCredentials.filter(item => item.status === 'failed')

  const renderElapsed = (ex) => {
    const createdAt = ex.created_at ? new Date(ex.created_at) : null
    const updatedAt = ex.updated_at ? new Date(ex.updated_at) : null
    if (!createdAt || !updatedAt) return '—'
    return Math.max(0, Math.round((updatedAt.getTime() - createdAt.getTime()) / 1000))
  }

  const renderRow = (ex, idx, showActions = false) => {
    const credExId = ex.cred_ex_id || ex.credential_exchange_id || `ex-${idx}`
    const connId = ex.connection_id || '—'
    const state = ex.state || 'unknown'
    const supportsRevocation = !!ex.rev_reg_id
    const isRevoked = ex.rev_reg_id && ex.cred_rev_id && state === 'done'
    
    // 使用原始資料或當前資料供 View 顯示
    const detailData = ex._raw || ex
    
    return (
      <tr key={credExId}>
        <td><code>{truncateMiddle(credExId)}</code></td>
        <td><code>{truncateMiddle(connId)}</code></td>
        <td><span className="badge">{state}</span></td>
        <td>{renderElapsed(ex)}</td>
        <td>
          {supportsRevocation ? (
            <span className="badge" style={{ background: 'var(--success)', color: 'white' }}>Yes</span>
          ) : (
            <span className="badge" style={{ background: 'var(--text-muted)', color: 'white' }}>No</span>
          )}
        </td>
        <td>{ex.updated_at ? new Date(ex.updated_at).toLocaleString() : '—'}</td>
        <td>
          <button className="secondary" onClick={() => setDetail(detailData)}>View</button>
          {showActions && supportsRevocation && !isRevoked && (
            <button
              className="danger"
              style={{ marginLeft: 8 }}
              onClick={() => handleRevoke(ex)}
              disabled={revoking[credExId]}
            >
              {revoking[credExId] ? 'Revoking...' : 'Revoke'}
            </button>
          )}
          {showActions && isRevoked && (
            <span className="badge" style={{ marginLeft: 8, background: 'var(--danger)', color: 'white' }}>Revoked</span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <>
      {/* Sending Now 區塊 - 顯示正在背景發送的憑證 */}
      {(activePending.length > 0 || completedPending.length > 0 || failedPending.length > 0) && (
        <SectionCard
          title="Background Credential Sends"
          subtitle={`${activePending.length} sending, ${completedPending.length} completed, ${failedPending.length} failed`}
          actions={[
            <button 
              key="clear-all" 
              className="secondary" 
              onClick={() => {
                // 清除所有 completed 和 failed 的項目，保留 sending 的
                setPendingCredentials(prev => prev.filter(item => item.status === 'sending'))
              }}
              disabled={completedPending.length === 0 && failedPending.length === 0}
            >
              Clear Completed/Failed
            </button>
          ]}
        >
          <div className="table-wrapper" style={{ maxHeight: 400, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Credential Definition</th>
                  <th>Status</th>
                  <th>Elapsed (s)</th>
                  <th>Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* 正在發送中的項目 */}
                {activePending.map(item => (
                  <tr key={item.id}>
                    <td><code>{truncateMiddle(item.connectionId)}</code></td>
                    <td><code>{truncateMiddle(item.credDefId)}</code></td>
                    <td>
                      <span className="badge" style={{ background: 'var(--info)', color: 'white' }}>
                        Sending...
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--info)' }}>
                        {elapsedTimes[item.id] || 0}s
                      </strong>
                    </td>
                    <td>—</td>
                    <td>
                      <button 
                        className="secondary" 
                        onClick={() => {
                          setPendingCredentials(prev => prev.filter(p => p.id !== item.id))
                        }}
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
                {/* 已完成的項目 */}
                {completedPending.map(item => (
                  <tr key={item.id}>
                    <td><code>{truncateMiddle(item.connectionId)}</code></td>
                    <td><code>{truncateMiddle(item.credDefId)}</code></td>
                    <td>
                      <span className="badge" style={{ background: 'var(--success)', color: 'white' }}>
                        Completed
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--success)' }}>
                        {item.durationSec || 0}s
                      </strong>
                    </td>
                    <td>
                      {item.credExId ? (
                        <code style={{ fontSize: '0.85rem' }}>{truncateMiddle(item.credExId, 12, 8)}</code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button 
                        className="secondary" 
                        onClick={() => {
                          setPendingCredentials(prev => prev.filter(p => p.id !== item.id))
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {/* 失敗的項目 */}
                {failedPending.map(item => (
                  <tr key={item.id}>
                    <td><code>{truncateMiddle(item.connectionId)}</code></td>
                    <td><code>{truncateMiddle(item.credDefId)}</code></td>
                    <td>
                      <span className="badge" style={{ background: 'var(--danger)', color: 'white' }}>
                        {item.isTimeout ? 'Timeout' : 'Failed'}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--danger)' }}>
                        {item.durationSec || 0}s
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', color: 'var(--danger)' }} title={item.error}>
                        {item.error ? truncateMiddle(item.error, 30, 0) : 'Unknown error'}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="secondary" 
                        onClick={() => {
                          setPendingCredentials(prev => prev.filter(p => p.id !== item.id))
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Credentials Issued"
        subtitle="View issued credential exchanges (manual refresh)"
        actions={[
          <button key="reload" className="secondary" onClick={load} disabled={loading}>Refresh</button>,
          loadError && <span key="err" style={{ color: 'var(--danger)', fontSize: '0.9rem', marginLeft: 12 }}>Error: {loadError}</span>
        ]}
      >
        {loading && !fetchedOnce ? (
          <div className="empty-state">Loading credential exchanges...</div>
        ) : (!exchanges || exchanges.length === 0) ? (
          <div className="empty-state">
            No credential exchanges found.<br />
            Issue a credential, then click Refresh to sync ACA-Py records.
          </div>
        ) : (
          <>
            {/* 只顯示 Completed 區塊，In Progress 已在 Background Credential Sends 追蹤 */}
            {completed.length === 0 ? (
              <div className="empty-state">
                <div style={{ marginBottom: '12px' }}>
                  No completed credentials found.
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Issue a credential and wait for Alice to accept it, then click Refresh.<br />
                  {exchanges.length > 0 && (
                    <span style={{ marginTop: '8px', display: 'inline-block' }}>
                      ({exchanges.length} credential exchange(s) found, but none are completed yet)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ margin: '0 0 12px' }}>Completed ({completed.length})</h3>
                <div className="table-wrapper" style={{ maxHeight: 420, overflow: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Exchange ID</th>
                        <th>Connection</th>
                        <th>State</th>
                        <th>Elapsed (s)</th>
                        <th>Revocation</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completed.map((ex, idx) => renderRow(ex, idx, true))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {detail && (
        <Modal
          title="Credential Exchange"
          subtitle={truncateMiddle(detail.cred_ex_id || detail.credential_exchange_id || 'detail')}
          onClose={() => setDetail(null)}
          actions={<button className="primary" onClick={() => navigator.clipboard.writeText(JSON.stringify(detail, null, 2))}>Copy JSON</button>}
        >
          <pre style={{ maxHeight: 420, overflow: 'auto', background: 'rgba(17, 24, 39, 0.08)', padding: 16, borderRadius: 12 }}>
            {JSON.stringify(detail, null, 2)}
          </pre>
        </Modal>
      )}

      {revokeModal && (
        <Modal
          title="Revoke Credential"
          subtitle="This will publish revocation to the ledger"
          onClose={() => setRevokeModal(null)}
          actions={
            <>
              <button className="secondary" onClick={() => setRevokeModal(null)} disabled={revoking[revokeModal.cred_ex_id]}>
                Cancel
              </button>
              <button className="danger" onClick={confirmRevoke} disabled={revoking[revokeModal.cred_ex_id]}>
                {revoking[revokeModal.cred_ex_id] ? 'Revoking...' : 'Confirm'}
              </button>
            </>
          }
        >
          <div style={{ lineHeight: 1.5 }}>
            <div><strong>Exchange ID:</strong> <code>{truncateMiddle(revokeModal.cred_ex_id, 16, 10)}</code></div>
            {revokeModal.rev_reg_id && (
              <div style={{ marginTop: 8 }}><strong>Revocation Registry:</strong> <code>{truncateMiddle(revokeModal.rev_reg_id, 16, 10)}</code></div>
            )}
            {revokeModal.cred_rev_id && (
              <div style={{ marginTop: 8 }}><strong>Credential Rev ID:</strong> <code>{revokeModal.cred_rev_id}</code></div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

export default function App() {
  const status = useAgentStatus()
  const toastManager = useToasts()
  
  // 全域狀態：追蹤正在發送的憑證（sending/completed/failed）
  const [pendingCredentials, setPendingCredentials] = useState([])

  const navigation = useMemo(() => ([
    { to: '/dashboard', label: 'Dashboard', subtitle: 'Platform Overview' },
    { to: '/connections', label: 'Connections', subtitle: 'Manage Connections' },
    { to: '/schemas', label: 'Schemas', subtitle: 'View Ledger Schemas' },
    { to: '/credential-definitions', label: 'Credential Definitions', subtitle: 'Issue Credentials' },
    { to: '/credentials-issued', label: 'Credentials Issued', subtitle: 'Manage Issued Credentials' },
  ]), [])

  return (
    <>
      <Layout
        status={status}
        nav={navigation}
        title="Faber Controller"
        subtitle="Supply Chain Issuer Platform"
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage pushToast={toastManager.push} />} />
          <Route path="/connections" element={<ConnectionsCard pushToast={toastManager.push} />} />
          <Route path="/schemas" element={<SchemasCard pushToast={toastManager.push} />} />
          <Route 
            path="/credential-definitions" 
            element={
              <CredentialDefinitionsCard 
                pushToast={toastManager.push} 
                setPendingCredentials={setPendingCredentials}
              />
            } 
          />
          <Route 
            path="/credentials-issued" 
            element={
              <CredentialsIssuedCard 
                pushToast={toastManager.push} 
                pendingCredentials={pendingCredentials}
                setPendingCredentials={setPendingCredentials}
              />
            } 
          />
        </Routes>
      </Layout>
      <ToastStack items={toastManager.items} />
    </>
  )
}
