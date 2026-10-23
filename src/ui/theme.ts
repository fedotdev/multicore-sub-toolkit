/** Тема (dark/light). Сохраняется в localStorage (не секрет). */

export type Theme = 'dark' | 'light'

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem('sub-toolkit:theme') as Theme | null
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function applyTheme(value: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', value)
  try {
    localStorage.setItem('sub-toolkit:theme', value)
  } catch {
    /* ignore */
  }
}

export function toggleTheme(current: Theme): Theme {
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
