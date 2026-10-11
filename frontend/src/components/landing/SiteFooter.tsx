// Adapted from 21st.dev "Simple Centered Footer" (ln-dev7/footer-16).
// Changes: our logo and links, placeholder social icons removed, backend status shown in dev builds only.
import BackendStatus from '@/components/BackendStatus'
import { GITHUB_URL } from '@/components/landing/content'
import Logo from '@/components/landing/Logo'

const links = [
  { label: 'Features', href: '#features' },
  { label: 'Example posts', href: '#posts' },
  { label: 'GitHub', href: GITHUB_URL },
]

// Read once at load time; calling Date during render is impure.
const year = new Date().getFullYear()

export default function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-16">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {links.map((link) => (
            <a key={link.label} href={link.href} className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="h-px w-full bg-border" />
        <p className="text-center text-sm text-muted-foreground">&copy; {year} social-grid. A learning project.</p>
        {import.meta.env.DEV && <BackendStatus />}
      </div>
    </footer>
  )
}
