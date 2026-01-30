import React from 'react'

export function ToastStack({ items = [] }) {
  return (
    <div className="toast-container">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast--${item.intent || 'info'} fade-in`}
          style={{ animationDelay: '0ms' }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
          {item.message && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{item.message}</div>}
        </div>
      ))}
    </div>
  )
}

