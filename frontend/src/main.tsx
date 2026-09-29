import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'
// KaTeX 的样式与字体（TASK-095）：公式在 `snapshotMarkdown.ts` 里渲染成 KaTeX 标记，样式在这里全局引入。
import 'katex/dist/katex.min.css'

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
