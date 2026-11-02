import { useInfiniteQuery } from '@tanstack/react-query'
import { ImageOff, LoaderCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { userPostsOptions } from '@/api/feed'
import type { PostView } from '@/api/posts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const NAME_LENGTH = 100

function tileName(post: PostView) {
  if (!post.caption) return `Post by ${post.authorUsername}`
  return post.caption.length > NAME_LENGTH ? `${post.caption.slice(0, NAME_LENGTH)}…` : post.caption
}

function Tile({ post, onSelect }: { post: PostView; onSelect: () => void }) {
  const [failed, setFailed] = useState(false)

  return (
    // The tile stays selectable when its photo fails, so the post can still be opened or deleted.
    // The inner ring keeps the focus outline visible against any photo.
    <button
      type="button"
      id={`tile-${post.postId}`}
      onClick={onSelect}
      aria-label={tileName(post)}
      aria-haspopup="dialog"
      className="relative block aspect-square w-full overflow-hidden bg-muted -outline-offset-4 focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-inset"
    >
      {failed || !post.mediaUrl ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center text-xs text-muted-foreground">
          <ImageOff className="size-5" aria-hidden />
          Image unavailable
        </span>
      ) : (
        <img
          src={post.mediaUrl}
          // The button already has a name, so a screen reader doesn't need this described as well.
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-[filter] duration-150 hover:brightness-90"
        />
      )}
    </button>
  )
}

export default function PostGrid({
  username,
  empty,
  onSelect,
}: {
  username: string
  empty: ReactNode
  onSelect: (postId: number) => void
}) {
  const grid = useInfiniteQuery(userPostsOptions(username))
  const posts = grid.data?.pages.flatMap((page) => page.items) ?? []

  async function loadMore() {
    const countBefore = posts.length
    const result = await grid.fetchNextPage()
    const firstNew = result.data?.pages.flatMap((page) => page.items)[countBefore]
    if (firstNew) requestAnimationFrame(() => document.getElementById(`tile-${firstNew.postId}`)?.focus())
  }

  if (grid.isPending) {
    return (
      <div role="status" aria-label="Loading posts" className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-none" />
        ))}
      </div>
    )
  }

  if (grid.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4">
        <p role="alert" className="text-sm">
          Couldn't load posts. Check your connection and try again.
        </p>
        <Button variant="outline" className="h-11 px-3" onClick={() => grid.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (posts.length === 0) return <div className="px-4">{empty}</div>

  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {posts.map((post) => (
          <li key={post.postId}>
            <Tile post={post} onSelect={() => onSelect(post.postId)} />
          </li>
        ))}
      </ul>
      {grid.hasNextPage && (
        <div className="mt-6 flex flex-col items-center gap-2 px-4">
          <Button variant="outline" className="h-11 px-4" aria-disabled={grid.isFetchingNextPage} onClick={() => !grid.isFetchingNextPage && loadMore()}>
            {grid.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden />}
            {grid.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
          {grid.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Couldn't load more posts. Try again.
            </p>
          )}
        </div>
      )}
    </>
  )
}
