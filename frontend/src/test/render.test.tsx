import { screen } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { expect, it, vi } from 'vitest'

import { renderWithRouter } from './render'

function LocationProbe() {
  const location = useLocation()
  return <p>{location.pathname}</p>
}

it('renders at the requested route without changing browser history', () => {
  const originalPath = window.location.pathname
  renderWithRouter(<LocationProbe />, '/test-only-route')
  expect(screen.getByText('/test-only-route')).toBeInTheDocument()
  expect(window.location.pathname).toBe(originalPath)
})

it.each([1, 2])('starts with clean DOM and restored globals: case %i', () => {
  expect(screen.queryByText('synthetic marker')).not.toBeInTheDocument()
  expect(Reflect.has(globalThis, 'studyPilotTestMarker')).toBe(false)
  renderWithRouter(<p>synthetic marker</p>)
  vi.stubGlobal('studyPilotTestMarker', true)
  expect(screen.getByText('synthetic marker')).toBeInTheDocument()
})
