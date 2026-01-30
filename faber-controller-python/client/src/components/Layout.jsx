import React, { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { StatusPill } from './StatusPill.jsx'

/**
 * Unified Page Layout Component
 * 
 * Features:
 * - Top Header (title, subtitle, agent status, theme toggle)
 * - Left Sidebar Navigation (feature menu)
 * - Main Content Area (Dashboard or feature pages)
 * - Supports light/dark theme switching
 */
export function Layout({ status, nav = [], title, subtitle, children }) {
  const hasNav = Array.isArray(nav) && nav.length > 0

  // Theme switching functionality
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light'
    document.body.setAttribute('data-theme', savedTheme)
  }, [])

  const toggleTheme = () => {
    const current = document.body.getAttribute('data-theme') || 'light'
    const next = current === 'light' ? 'dark' : 'light'
    document.body.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  return (
    <div className="layout-container">
      <header className="layout-header">
        <div className="layout-header__left">
          <h1 className="layout-header__title">{title}</h1>
          {subtitle && <p className="layout-header__subtitle">{subtitle}</p>}
        </div>
        <div className="layout-header__right">
          <StatusPill status={status} />
          <button
            className="ghost"
            onClick={toggleTheme}
            style={{ marginLeft: 12, padding: '8px 12px' }}
            title="Toggle Theme"
          >
            🌓
          </button>
        </div>
      </header>

      <div className="layout-body">
        {hasNav && (
          <aside className="layout-sidebar">
            <nav className="sidebar-nav">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sidebar-nav__item ${isActive ? 'sidebar-nav__item--active' : ''}`}
                >
                  <span className="sidebar-nav__subtitle">{item.subtitle}</span>
                  <span className="sidebar-nav__label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </aside>
        )}

        <main className="layout-main">{children}</main>
      </div>
    </div>
  )
}
