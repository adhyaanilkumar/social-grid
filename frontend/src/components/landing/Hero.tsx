// Adapted from 21st.dev "Hero Section with Cards" (scrollxui/hero-with-cards).
// Changes: removed its built-in navbar and custom OrbButton, our copy, one primary button + text link,
// two-level type hierarchy, cards scaled down on small screens. Animation respects "reduce motion" (MotionConfig in main.tsx).
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { HERO_CARDS } from '@/components/landing/content'
import { Button } from '@/components/ui/button'

export default function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="overflow-hidden bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-16 text-center md:px-8 md:pt-24">
        <motion.h1
          id="hero-heading"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="max-w-2xl text-5xl leading-tight font-semibold tracking-tight text-balance md:text-6xl"
        >
          Share photos with <span className="text-primary">friends</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.38, ease: 'easeOut' }}
          className="mt-6 max-w-md text-xl text-muted-foreground text-pretty"
        >
          Post a photo, follow people you know, and like and comment on theirs.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.52 }}
          className="mt-8 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Button asChild className="h-11 px-6 text-base">
            <Link to="/register">Create account</Link>
          </Button>
          <Link to="/login" className="text-sm font-medium underline underline-offset-4 hover:text-primary">
            I already have an account
          </Link>
        </motion.div>

        {/* The photo fan shows what the app is for at a glance; purely illustrative, so screen readers get one label. */}
        <div
          role="img"
          aria-label="A fan of photos shared by friends"
          className="relative mt-4 flex h-48 w-full origin-bottom sm:mt-12 sm:h-64 scale-[0.6] items-end justify-center sm:scale-75 md:h-96 md:scale-100"
        >
          {HERO_CARDS.map((card, i) => (
            <motion.div
              key={card.src}
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: card.delay, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 origin-bottom"
              style={{ rotate: card.rotate, zIndex: card.z, translateX: `${(i - 2) * 120}px` }}
            >
              <div className="h-72 w-48 overflow-hidden rounded-2xl shadow-xl ring-2 ring-background/60 md:h-80 md:w-56">
                <img src={card.src} alt="" width={224} height={320} className="size-full object-cover" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
