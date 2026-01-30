import { useEffect, useState } from 'react'

// 降低輪詢頻率，從 5 秒改為 10 秒，減少 API 調用
export function useAgentStatus(pollInterval = 10000) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true
    let timeoutId

    const poll = async () => {
      try {
        const res = await fetch('/api/status', {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error(res.statusText)
        const body = await res.json()
        if (active) setStatus(body.status || 'unknown')
      } catch (error) {
        if (active) setStatus('down')
      } finally {
        if (active) timeoutId = setTimeout(poll, pollInterval)
      }
    }

    poll()
    return () => {
      active = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [pollInterval])

  return status
}

