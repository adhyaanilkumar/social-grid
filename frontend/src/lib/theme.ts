// Follows the operating system until the visitor chooses; their choice is then remembered in localStorage.
// shadcn's dark styles switch on when <html> has the "dark" class (see @custom-variant in index.css).
// An inline script in index.html applies this before the first paint, so the page doesn't flash light-then-dark.
// It repeats the same logic, because it has to run before this module loads.

export type Theme = 'light' | 'dark'

const KEY = 'theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // Storage can be blocked (private mode); fall through to the system setting.
  }
  return systemTheme()
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Storage can be blocked (private mode); the toggle still works for this visit.
  }
}
