import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

export function renderWithRouter(ui: ReactElement, route = '/'): RenderResult {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}
