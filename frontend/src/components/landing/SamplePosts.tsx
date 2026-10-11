// Built for social-grid (no 21st.dev component): example posts that show what using the app looks like.
import { Heart, MessageCircle } from 'lucide-react'
import { SAMPLE_POSTS } from '@/components/landing/content'
import { Card, CardContent } from '@/components/ui/card'

export default function SamplePosts() {
  return (
    <section id="posts" aria-labelledby="posts-heading" className="scroll-mt-16 bg-muted/40 py-16 md:py-24">
      <div className="mx-auto max-w-6xl space-y-12 px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="posts-heading" className="text-3xl font-semibold tracking-tight md:text-5xl">
            What a post looks like
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-xl">Example posts, not real accounts.</p>
        </div>

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_POSTS.map((post) => (
            <li key={post.username}>
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex items-center gap-2 px-4 py-3">
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary uppercase"
                  >
                    {post.username[0]}
                  </span>
                  <span className="text-sm font-semibold">@{post.username}</span>
                </div>
                <img src={post.src} alt={post.alt} width={400} height={400} loading="lazy" className="aspect-square w-full object-cover" />
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-4" aria-hidden /> {post.likes} likes
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-4" aria-hidden /> {post.comments} comments
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">@{post.username}</span> {post.caption}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
