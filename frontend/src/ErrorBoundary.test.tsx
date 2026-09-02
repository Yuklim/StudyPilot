import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

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
})
