import React from 'react'

const CLASS_MAP = {
  up: 'pill pill--success',
  down: 'pill pill--danger',
  loading: 'pill pill--loading',
}

export function StatusPill({ status }) {
  const normalized = (status || 'loading').toLowerCase()
  const cls = CLASS_MAP[normalized] || CLASS_MAP.loading
  const label = normalized === 'up' ? 'Agent Ready' : normalized === 'down' ? 'Agent Down' : 'Checking…'
  return <span className={`${cls} fade-in`}>{label}</span>
}

