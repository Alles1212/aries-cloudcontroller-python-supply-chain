import { useEffect, useState } from 'react'
import { useApi } from './useApi'

/**
 * Agent 狀態監控 Hook
 * 定期檢查 ACA-Py Agent 的連線狀態
 */
export function useAgentStatus() {
  const api = useApi()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.request('/api/status')
        setStatus(res?.status || 'down')
      } catch (error) {
        setStatus('down')
      }
    }

    checkStatus()
    // 降低輪詢頻率，從 5 秒改為 10 秒，減少 API 調用
    const interval = setInterval(checkStatus, 10000) // 每 10 秒檢查一次
    return () => clearInterval(interval)
  }, [api])

  return status
}

