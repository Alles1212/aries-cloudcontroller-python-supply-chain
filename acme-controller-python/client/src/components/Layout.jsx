import React, { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { StatusPill } from './StatusPill.jsx'

/**
 * 統一的頁面框架組件
 * 
 * 功能：
 * - 頂部 Header（標題、副標題、Agent 狀態、主題切換）
 * - 左側導覽列（功能選單）
 * - 主內容區域（Dashboard 或功能頁面）
 * - 支援亮/暗主題切換
 * 
 * @param {string} status - Agent 狀態（'up' | 'down' | 'loading'）
 * @param {Array} nav - 導覽選單項目陣列
 * @param {string} title - 頁面標題
 * @param {string} subtitle - 頁面副標題
 * @param {ReactNode} children - 子元件（主內容）
 */
export function Layout({ status, nav = [], title, subtitle, children }) {
  const hasNav = Array.isArray(nav) && nav.length > 0

  // 主題切換功能
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
            title="切換主題"
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

