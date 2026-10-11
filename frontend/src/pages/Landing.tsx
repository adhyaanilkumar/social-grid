import CtaBand from '@/components/landing/CtaBand'
import Features from '@/components/landing/Features'
import Hero from '@/components/landing/Hero'
import SamplePosts from '@/components/landing/SamplePosts'
import SiteFooter from '@/components/landing/SiteFooter'
import SiteHeader from '@/components/landing/SiteHeader'

// Public page for logged-out visitors. Section order follows the plan: answer "what is this, what can I do,
// why here" at the top, show it working, then repeat the one call to action.
export default function Landing() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Features />
        <SamplePosts />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  )
}
