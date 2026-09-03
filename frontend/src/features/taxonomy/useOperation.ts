import { useEffect, useRef, useState } from 'react'

import { classificationError } from './api'

// One explicit operation at a time. Completion cannot update a departed screen.
export function useOperation() {
  const alive = useRef(true)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function run<T>(work: () => Promise<T>, done: (value: T) => void) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const value = await work()
      if (alive.current) done(value)
    } catch (cause) {
      if (alive.current) setError(classificationError(cause))
    } finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }
  return { pending, error, setError, run }
}
