import { useCallback, useState } from 'react'

/**
 * 共用的 API 請求 helper。負責處理 loading / error 狀態，並在需要時拋出錯誤給呼叫端。
 * 讓畫面邏輯可以專注於資料流程而不是 fetch 細節。
 */
export function useApi() {
  const [pending, setPending] = useState(false)
  const [lastError, setLastError] = useState(null)

  const request = useCallback(async (path, options = {}) => {
    setPending(true)
    setLastError(null)
    try {
      const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options,
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || response.statusText)
      }

      if (response.status === 204) {
        return null
      }

      const body = await response.text()
      return body ? JSON.parse(body) : null
    } catch (error) {
      setLastError(error)
      throw error
    } finally {
      setPending(false)
    }
  }, [])

  return { request, pending, lastError }
}

