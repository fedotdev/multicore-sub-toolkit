import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import App from './App'

describe('App smoke', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByText('Sub Toolkit')).toBeDefined()
  })
})
