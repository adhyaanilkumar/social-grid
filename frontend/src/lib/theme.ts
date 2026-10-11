// Light mode by default; the visitor's choice is remembered in localStorage.
// shadcn's dark styles switch on when <html> has the "dark" class (see @custom-variant in index.css).

export type Theme = 'light' | 'dark'

const KEY = 'theme'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Storage can be blocked (private mode); the toggle still works for this visit.
  }
}
