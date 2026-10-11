import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getTheme, setTheme } from '@/lib/theme'

export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        setTheme(next)
        setThemeState(next)
      }}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
