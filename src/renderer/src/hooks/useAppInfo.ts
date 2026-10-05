import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'

interface UseAppInfoState {
  appInfo: AppInfo | null
  error: string | null
}

const INITIAL_STATE: UseAppInfoState = { appInfo: null, error: null }

export function useAppInfo(): UseAppInfoState {
  const [state, setState] = useState<UseAppInfoState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false
    void window.api.app.getInfo().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState({ appInfo: result.data, error: null })
      } else {
        setState({ appInfo: null, error: result.error.message })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
