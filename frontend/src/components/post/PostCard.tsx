import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, ImageOff, MessageCircle, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/client'
import { deletePost, likePost, unlikePost, type PostView } from '@/api/posts'
import { useAuth } from '@/auth/auth-context'
import Avatar from '@/components/Avatar'
import CommentSection from '@/components/post/CommentSection'
import { Button } from '@/components/ui/button'
import { cancelPostQueries, patchPost, refreshPosts, removePost } from '@/lib/postCache'
import { cn } from '@/lib/utils'

// Tallest (4:5) and widest (1.91:1) frame allowed, so one unusual photo can't take over the feed.
const MIN_RATIO = 4 / 5
const MAX_RATIO = 1.91
const LONG_CAPTION = 180

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`
}

function Photo({ post }: { post: PostView }) {
  const [failed, setFailed] = useState(false)
  // The frame's shape comes from the stored size, so its space is reserved before the photo loads and the page
  // doesn't jump. Older posts without a size get a square.
  const natural = post.width && post.height ? post.width / post.height : 1
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, natural))

  return (
    <div className="w-full overflow-hidden bg-muted min-[480px]:rounded-lg" style={{ aspectRatio: ratio, maxHeight: 'calc(100svh - 112px)' }}>
      {failed || !post.mediaUrl ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <ImageOff className="size-6" aria-hidden />
          Image unavailable
        </div>
      ) : (
        <img
          src={post.mediaUrl}
          alt={`Photo by ${post.authorUsername}`}
          loading="lazy"
          onError={() => setFailed(true)}
          // contain, never cover: the whole photo always shows.
          className="h-full w-full object-contain"
        />
      )}
    </div>
  )
}

function Caption({ post }: { post: PostView }) {
  const [expanded, setExpanded] = useState(false)
  if (!post.caption) return null
  const isLong = post.caption.length > LONG_CAPTION || post.caption.split('\n').length > 3

  return (
    <div className="px-4 text-sm min-[480px]:px-0">
      <p className={cn('break-words whitespace-pre-wrap', isLong && !expanded && 'line-clamp-3')}>
        <Link to={`/users/${encodeURIComponent(post.authorUsername)}`} className="font-semibold hover:underline">
          {post.authorUsername}
        </Link>{' '}
        {post.caption}
      </p>
      {isLong && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-6 text-muted-foreground underline-offset-4 hover:underline"
        >
          more
        </button>
      )}
    </div>
  )
}

export default function PostCard({
  post,
  commentsInitiallyOpen = false,
  onDeleted,
}: {
  post: PostView
  commentsInitiallyOpen?: boolean
  onDeleted?: () => void
}) {
  const commentsId = useId()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const profilePath = `/users/${encodeURIComponent(post.authorUsername)}`
  const isOwn = post.authorId === user?.id

  const [commentsOpen, setCommentsOpen] = useState(commentsInitiallyOpen)
  const [confirming, setConfirming] = useState(false)
  const [likeError, setLikeError] = useState<string>()
  // Ignores a second click while the first is on its way, so a double click doesn't show an error.
  const liking = useRef(false)

  const likeMutation = useMutation({
    mutationFn: async (like: boolean) => {
      try {
        await (like ? likePost(post.postId) : unlikePost(post.postId))
      } catch (e) {
        // 409 on like or 404 on unlike means it's already how the user wanted it, perhaps from another tab.
        // Refetch, since the count shown may be off by one.
        if (e instanceof ApiError && e.status === (like ? 409 : 404)) {
          await refreshPosts(queryClient)
          return
        }
        throw e
      }
    },
    // Update the screen immediately, everywhere this post is showing.
    onMutate: async (like) => {
      setLikeError(undefined)
      await cancelPostQueries(queryClient)
      patchPost(queryClient, post.postId, (p) => ({ likedByMe: like, likeCount: p.likeCount + (like ? 1 : -1) }))
    },
    // Put it back and say so, because a silent flip looks like nothing happened.
    onError: (_error, like) => {
      patchPost(queryClient, post.postId, (p) => ({ likedByMe: !like, likeCount: p.likeCount + (like ? -1 : 1) }))
      setLikeError("Couldn't save your like. Try again.")
    },
    onSettled: () => {
      liking.current = false
    },
  })

  function toggleLike() {
    if (liking.current) return
    liking.current = true
    likeMutation.mutate(!post.likedByMe)
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      try {
        await deletePost(post.postId)
      } catch (e) {
        // Already gone, which is what the user wanted.
        if (!(e instanceof ApiError && e.status === 404)) throw e
      }
    },
    onSuccess: async () => {
      onDeleted?.()
      removePost(queryClient, post.postId)
      await refreshPosts(queryClient)
    },
  })

  return (
    <article className="flex flex-col gap-2">
      <div className="flex min-h-12 items-center gap-2 px-4 min-[480px]:px-0">
        <Link to={profilePath} className="flex min-w-0 items-center gap-2 text-sm font-semibold hover:underline">
          <Avatar username={post.authorUsername} />
          <span className="truncate">{post.authorUsername}</span>
        </Link>
        {isOwn && !confirming && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-11 text-muted-foreground"
            aria-label="Delete post"
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>

      {confirming && (
        <div role="group" aria-label="Delete this post?" className="flex flex-wrap items-center gap-2 px-4 text-sm min-[480px]:px-0">
          <p className="w-full font-medium">Delete this post and its comments?</p>
          {/* Focus starts on the safe choice, and the two buttons don't sit where the first click landed. */}
          <Button autoFocus variant="outline" className="h-11 px-3" onClick={() => setConfirming(false)}>
            Keep post
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-3"
            aria-disabled={deleteMutation.isPending}
            onClick={() => !deleteMutation.isPending && deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete post'}
          </Button>
          {deleteMutation.isError && (
            <p role="alert" className="w-full text-destructive">
              Couldn't delete your post. Try again.
            </p>
          )}
        </div>
      )}

      <Photo post={post} />

      <div className="flex items-center gap-1 px-2 min-[480px]:-mx-2">
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-pressed={post.likedByMe} onClick={toggleLike}>
          {/* The filled shape shows the state as well as the colour. */}
          <Heart className={cn('size-5', post.likedByMe && 'fill-primary text-primary')} aria-hidden />
          {plural(post.likeCount, 'like')}
        </Button>
        <Button
          variant="ghost"
          className="h-11 gap-2 px-2"
          aria-expanded={commentsOpen}
          aria-controls={commentsId}
          onClick={() => setCommentsOpen((open) => !open)}
        >
          <MessageCircle className="size-5" aria-hidden />
          {post.commentCount > 0 ? plural(post.commentCount, 'comment') : 'Comment'}
        </Button>
      </div>
      {likeError && (
        <p role="alert" className="px-4 text-sm text-destructive min-[480px]:px-0">
          {likeError}
        </p>
      )}

      <Caption post={post} />

      <div id={commentsId} className="px-4 min-[480px]:px-0" hidden={!commentsOpen}>
        {commentsOpen && <CommentSection postId={post.postId} />}
      </div>
    </article>
  )
}
