import { useEffect, useState } from 'react'

export function useResourceQuery<T>(key: string, load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    key: string
    attempt: number
    data?: T
    error?: unknown
  }>()
  useEffect(() => {
    let active = true
    load().then(
      (data) => {
        if (active) setResult({ key, attempt, data })
      },
      (error: unknown) => {
        if (active) setResult({ key, attempt, error })
      },
    )
    return () => {
      active = false
    }
  }, [key, load, attempt])
  return {
    result: result?.key === key && result.attempt === attempt ? result : undefined,
    retry: () => setAttempt((value) => value + 1),
  }
}
