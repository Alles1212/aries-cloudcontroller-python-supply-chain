import React from 'react'

/**
 * Dashboard 統計卡片組件
 * 用於顯示供應鏈平台的關鍵指標（連線數、憑證數、Proof 狀態等）
 * 
 * @param {string} title - 卡片標題
 * @param {string|number} value - 主要數值
 * @param {string} subtitle - 副標題或說明
 * @param {string} icon - 可選的圖示（emoji 或文字）
 * @param {string} trend - 趨勢指示（'up', 'down', 'neutral'）
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

