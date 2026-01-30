import { useCallback, useState } from 'react'

/**
 * API 請求 Hook
 * 提供統一的 fetch 封裝，包含錯誤處理和載入狀態
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
        let errorMessage = response.statusText
        try {
          const errorData = await response.text()
          if (errorData) {
            const parsed = JSON.parse(errorData)
            errorMessage = parsed.error || parsed.message || errorData
          }
        } catch (e) {
          errorMessage = errorData || response.statusText
        }
        throw new Error(errorMessage)
      }

      if (response.status === 204) return null
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

