import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'
import { renderWithRouter } from './test/render'

describe('StudyPilot scaffold page', () => {
  it('states clearly that only the engineering scaffold exists', () => {
    renderWithRouter(<App />)

    expect(
      screen.getByRole('heading', {
        name: '工程框架已运行，业务功能尚未实现',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/没有示例资料、进度或统计数据/)).toBeInTheDocument()
  })

  it('does not expose fake business actions', () => {
    renderWithRouter(<App />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
