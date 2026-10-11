// Adapted from 21st.dev "Grid Feature Cards" (efferd/grid-feature-cards).
// Changes: 3 tiles instead of 6 with our copy, readable text sizes (no 12px light text),
// the random grid pattern is generated once per card instead of on every render.
import { motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ComponentProps, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { FEATURES } from '@/components/landing/content'

type Feature = {
  title: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  description: string
}

export default function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-16 py-16 md:py-24">
      <div className="mx-auto max-w-6xl space-y-12 px-4 md:px-8">
        <AnimatedContainer className="mx-auto max-w-2xl text-center">
          <h2 id="features-heading" className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Everything you need, nothing you don't
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-xl">Three things to do. That's the whole app.</p>
        </AnimatedContainer>

        <AnimatedContainer
          delay={0.3}
          className="grid grid-cols-1 divide-y divide-dashed border border-dashed md:grid-cols-3 md:divide-x md:divide-y-0"
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </AnimatedContainer>
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const [squares] = useState(() => genRandomPattern())

  return (
    <div className="relative overflow-hidden p-8">
      <div className="pointer-events-none absolute top-0 left-1/2 -mt-2 -ml-20 h-full w-full [mask-image:linear-gradient(white,transparent)]">
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/5 to-foreground/1 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]">
          <GridPattern
            width={20}
            height={20}
            x="-12"
            y="4"
            squares={squares}
            className="absolute inset-0 size-full fill-foreground/5 stroke-foreground/25 mix-blend-overlay"
          />
        </div>
      </div>
      <feature.icon className="size-6 text-primary" strokeWidth={1.5} aria-hidden />
      <h3 className="mt-8 text-xl font-semibold">{feature.title}</h3>
      <p className="relative z-10 mt-2 text-base text-muted-foreground">{feature.description}</p>
    </div>
  )
}

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  ...props
}: ComponentProps<'svg'> & { width: number; height: number; x: string; y: string; squares?: number[][] }) {
  const patternId = useId()

  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern id={patternId} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      {squares && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([sx, sy], index) => (
            <rect strokeWidth="0" key={index} width={width + 1} height={height + 1} x={sx * width} y={sy * height} />
          ))}
        </svg>
      )}
    </svg>
  )
}

function genRandomPattern(length = 5): number[][] {
  return Array.from({ length }, () => [
    Math.floor(Math.random() * 4) + 7, // x between 7 and 10
    Math.floor(Math.random() * 6) + 1, // y between 1 and 6
  ])
}

function AnimatedContainer({ className, delay = 0.1, children }: { className?: string; delay?: number; children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }}
      whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
