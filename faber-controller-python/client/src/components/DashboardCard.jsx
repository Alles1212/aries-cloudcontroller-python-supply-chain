import React from 'react'

/**
 * Dashboard Statistics Card Component
 * Displays key metrics for the supply chain platform (connections, credentials, proof status, etc.)
 */
export function DashboardCard({ title, value, subtitle, icon, trend }) {
  return (
    <div className="dashboard-card fade-in">
      <div className="dashboard-card__header">
        {icon && <span className="dashboard-card__icon">{icon}</span>}
        <h3 className="dashboard-card__title">{title}</h3>
      </div>
      <div className="dashboard-card__value">{value}</div>
      {subtitle && <div className="dashboard-card__subtitle">{subtitle}</div>}
      {trend && (
        <div className={`dashboard-card__trend dashboard-card__trend--${trend}`}>
          {trend === 'up' && '↑'} {trend === 'down' && '↓'} {trend === 'neutral' && '→'}
        </div>
      )}
    </div>
  )
}

