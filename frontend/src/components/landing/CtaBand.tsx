// Adapted from 21st.dev "CTA Section" (shadcndesign/cta-section-1).
// Changes: its custom utility classes and Tagline helper replaced with plain Tailwind, our copy,
// the button is a real link to /register (no aria-label overriding the visible text).
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export default function CtaBand() {
  return (
    <section aria-labelledby="cta-heading" className="bg-primary py-16 md:py-24">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-8 px-4 text-center">
        <div className="space-y-4">
          <h2 id="cta-heading" className="text-3xl font-semibold tracking-tight text-primary-foreground md:text-5xl">
            Ready to join?
          </h2>
          <p className="text-xl text-primary-foreground/90">It's free and takes about a minute.</p>
        </div>
        <Button asChild className="h-11 bg-primary-foreground px-6 text-base text-primary hover:bg-primary-foreground/90">
          <Link to="/register">
            Create account <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  )
}
