import { useCallback, useState } from 'react'

// 與 Alice 共用的 fetch helper，確保錯誤處理一致。
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

