import { useInfiniteQuery } from '@tanstack/react-query'
import { userPostsOptions } from '@/api/feed'
import PostCard from '@/components/post/PostCard'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Reads the post from the grid's cache rather than fetching it, so no new endpoint is needed and the likes and
// comment count stay current while it's open.
export default function PostDialog({
  username,
  postId,
  onClose,
}: {
  username: string
  postId: number | undefined
  onClose: () => void
}) {
  const { data } = useInfiniteQuery(userPostsOptions(username))
  const post = data?.pages.flatMap((page) => page.items).find((p) => p.postId === postId)

  return (
    <Dialog open={!!post} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="md:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Post by {username}</DialogTitle>
        </DialogHeader>
        {post && <PostCard post={post} commentsInitiallyOpen onDeleted={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
