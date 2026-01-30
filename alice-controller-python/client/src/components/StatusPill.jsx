import React from 'react'

const COLORS = {
  up: 'pill pill--success',
  down: 'pill pill--danger',
  loading: 'pill pill--loading',
}

/**
 * 小型狀態徽章，搭配字樣顯示 agent 是否在線。
 */
export function StatusPill({ status }) {
  const normalized = (status || 'loading').toLowerCase()
  const cls = COLORS[normalized] || COLORS.loading
  const label = normalized === 'up' ? 'Agent Ready' : normalized === 'down' ? 'Agent offline' : 'pending...'

  return <span className={`${cls} fade-in`}>{label}</span>
}

