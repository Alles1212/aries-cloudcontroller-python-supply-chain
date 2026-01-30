import React from 'react'

export function Modal({ title, subtitle, onClose, actions, children }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="card__title" style={{ marginBottom: 18 }}>
          <h2>{title}</h2>
          {subtitle && <span className="card__subtitle">{subtitle}</span>}
        </header>
        <div>{children}</div>
        <div className="modal__actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          {actions}
        </div>
      </div>
    </div>
  )
}

