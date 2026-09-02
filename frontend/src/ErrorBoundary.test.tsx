import { cleanup, render, screen, within } from '@testing-library/react'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

const SENSITIVE_ERROR_TEXT = 'private-study-note-do-not-log'
const SENSITIVE_STACK_MARKER = 'SensitiveComponentStackMarker'

const ROOT_ERROR_MESSAGES = {
  caught: 'StudyPilot caught a rendering error. Error details were suppressed.',
  uncaught: 'StudyPilot encountered an uncaught error. Error details were suppressed.',
  recoverable: 'StudyPilot recovered from a rendering error. Error details were suppressed.',
} as const

function BrokenView(): never {
  throw new Error('controlled test failure')
}

function SensitiveComponentStackMarker(): never {
  throw new Error(SENSITIVE_ERROR_TEXT)
}

function spyOnConsole() {
  return [
    vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'info').mockImplementation(() => undefined),
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
  ]
}

function allLoggedArguments(consoleSpies: ReturnType<typeof spyOnConsole>): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls.flat())
    .map(String)
    .join(' ')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
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

  it('redacts errors caught through a real React root render path', async () => {
    const consoleSpies = spyOnConsole()
    const consoleError = consoleSpies[1]
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container, ErrorBoundary.rootErrorOptions)

    await act(async () => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <SensitiveComponentStackMarker />
          </ErrorBoundary>
        </StrictMode>,
      )
    })

    expect(within(container).getByRole('alert')).toHaveTextContent('页面暂时无法显示')
    expect(consoleError).toHaveBeenCalledWith(ROOT_ERROR_MESSAGES.caught)

    const loggedArguments = allLoggedArguments(consoleSpies)
    expect(loggedArguments).not.toContain(SENSITIVE_ERROR_TEXT)
    expect(loggedArguments).not.toContain(SENSITIVE_STACK_MARKER)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('redacts uncaught and recoverable root error diagnostics', () => {
    const consoleSpies = spyOnConsole()
    const consoleError = consoleSpies[1]
    const sensitiveError = new Error(SENSITIVE_ERROR_TEXT)
    const sensitiveInfo = { componentStack: `\n    at ${SENSITIVE_STACK_MARKER}` }

    ErrorBoundary.rootErrorOptions.onUncaughtError?.(sensitiveError, sensitiveInfo)
    ErrorBoundary.rootErrorOptions.onRecoverableError?.(sensitiveError, sensitiveInfo)

    expect(consoleError).toHaveBeenNthCalledWith(1, ROOT_ERROR_MESSAGES.uncaught)
    expect(consoleError).toHaveBeenNthCalledWith(2, ROOT_ERROR_MESSAGES.recoverable)

    const loggedArguments = allLoggedArguments(consoleSpies)
    expect(loggedArguments).not.toContain(SENSITIVE_ERROR_TEXT)
    expect(loggedArguments).not.toContain(SENSITIVE_STACK_MARKER)
  })
})
