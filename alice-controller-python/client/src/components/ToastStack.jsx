import React from 'react'

/**
 * 右上角的提醒訊息集合。透過傳入 array 來管理。
 */
export function ToastStack({ items }) {
  if (!items.length) return null
  return (
    <aside className="toast-container">
      {items.map((toast) => (
        <div key={toast.id} className={`toast fade-in toast--${toast.intent || 'info'}`}>
          <strong style={{ display: 'block', marginBottom: 6 }}>{toast.title}</strong>
          {toast.message && <span className="subtle">{toast.message}</span>}
        </div>
      ))}
    </aside>
  )
}

