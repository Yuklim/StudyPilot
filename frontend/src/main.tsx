import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('StudyPilot root element was not found.')
}

createRoot(rootElement, ErrorBoundary.rootErrorOptions).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
