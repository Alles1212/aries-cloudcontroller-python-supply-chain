import React from 'react'

/**
 * 簡單的 Modal 元件，提供遮罩與 footer action slot。
 */
export function Modal({ title, subtitle, onClose, actions, children }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="card__title" style={{ marginBottom: '18px' }}>
          <h2>{title}</h2>
          {subtitle && <span className="card__subtitle">{subtitle}</span>}
        </header>
        <div>{children}</div>
        <div className="modal__actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          {actions}
        </div>
      </div>
    </div>
  )
}

