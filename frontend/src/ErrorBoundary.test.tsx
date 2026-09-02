import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

const SENSITIVE_ERROR_TEXT = 'private-study-note-do-not-log'

function BrokenView(): never {
  throw new Error('controlled test failure')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a controlled recovery message instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('页面暂时无法显示')
    expect(screen.getByText(/请刷新页面重试/)).toBeInTheDocument()
  })

  it('does not pass sensitive error details to the console', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const boundary = new ErrorBoundary({ children: null })

    boundary.componentDidCatch(new Error(SENSITIVE_ERROR_TEXT), {
      componentStack: `\n    at ${SENSITIVE_ERROR_TEXT}`,
    })

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      'StudyPilot page rendering failed. Error details were suppressed.',
    )

    const loggedArguments = consoleError.mock.calls.flat().map(String).join(' ')
    expect(loggedArguments).not.toContain(SENSITIVE_ERROR_TEXT)
  })
})
