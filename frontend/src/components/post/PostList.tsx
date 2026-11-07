import { useInfiniteQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import type { FeedOptions } from '@/api/feed'
import PostCard from '@/components/post/PostCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function PostSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 min-[480px]:px-0">
      <div className="flex h-12 items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="h-4 w-40" />
    </div>
  )
}

export default function PostList({ options, empty }: { options: FeedOptions; empty: ReactNode }) {
  const feed = useInfiniteQuery(options)
  const top = useRef<HTMLDivElement>(null)
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? []

  async function loadMore() {
    const countBefore = posts.length
    const result = await feed.fetchNextPage()
    // Move focus to the first new post, so keyboard users carry on from where the new content starts.
    const firstNew = result.data?.pages.flatMap((page) => page.items)[countBefore]
    if (firstNew) requestAnimationFrame(() => document.getElementById(`post-${firstNew.postId}`)?.focus())
  }

  if (feed.isPending) {
    return (
      <div role="status" aria-label="Loading posts" className="flex flex-col gap-6 md:gap-8">
        <PostSkeleton />
        <PostSkeleton />
      </div>
    )
  }

  // isError is also true when only a later page failed. Then the loaded posts stay, with the error beside Load more.
  if (feed.isError && !feed.data) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 min-[480px]:px-0">
        <p role="alert" className="text-sm">
          Couldn't load posts. Check your connection and try again.
        </p>
        <Button variant="outline" className="h-11 px-3" onClick={() => feed.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (posts.length === 0) return <div className="px-4 min-[480px]:px-0">{empty}</div>

  return (
    <div ref={top} tabIndex={-1} className="outline-none">
      {/* Whitespace separates the posts, so the UI doesn't compete with the photos. */}
      <ul className="flex flex-col gap-6 md:gap-8">
        {posts.map((post) => (
          <li key={post.postId} id={`post-${post.postId}`} tabIndex={-1} className="outline-none">
            {/* The deleted post's button took focus with it, so move focus somewhere sensible. */}
            <PostCard post={post} onDeleted={() => top.current?.focus()} />
          </li>
        ))}
      </ul>

      {feed.hasNextPage && (
        <div className="mt-6 flex flex-col items-center gap-2 px-4">
          <Button variant="outline" className="h-11 px-4" aria-disabled={feed.isFetchingNextPage} onClick={() => !feed.isFetchingNextPage && loadMore()}>
            {feed.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden />}
            {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
          {/* Existing posts stay on screen, with the problem shown beside the button. */}
          {feed.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Couldn't load more posts. Try again.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
