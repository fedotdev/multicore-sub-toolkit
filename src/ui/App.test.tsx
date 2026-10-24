import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import App from './App'

describe('App smoke', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByAltText('Sub Toolkit')).toBeDefined()
  })

  it('renders two tabs and export sections', () => {
    render(<App />)
    const tabs = screen.getAllByText('Ввод')
    expect(tabs.length).toBeGreaterThan(0)
    const exportTabs = screen.getAllByText('Экспорт')
    expect(exportTabs.length).toBeGreaterThan(0)
    const exportBtn = exportTabs[0]
    fireEvent.click(exportBtn)
    expect(screen.getByText('Узлы')).toBeDefined()
    expect(screen.getByText('DNS')).toBeDefined()
    expect(screen.getByText('Маршрутизация и Zapret')).toBeDefined()
    expect(screen.getAllByText('Экспорт').length).toBeGreaterThan(0)
  })
})
