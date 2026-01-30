import React from 'react'

/**
 * 具一致樣式的資訊卡片，常用於 Connections/Credentials 等列表容器。
 */
export function SectionCard({ title, subtitle, actions, children }) {
  return (
    <section className="card fade-in">
      <header className="card__header">
        <div className="card__title">
          <h2>{title}</h2>
          {subtitle && <span className="card__subtitle">{subtitle}</span>}
        </div>
        {actions ? <div className="inline-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}

