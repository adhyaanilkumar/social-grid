import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/client'
import { createComment, deleteComment, getComments, type Comment } from '@/api/comments'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { patchPost } from '@/lib/postCache'

const MAX_COMMENT = 1000

function CommentRow({ comment, isOwn }: { comment: Comment; isOwn: boolean }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  function removeFromCache() {
    queryClient.setQueryData<Comment[]>(['comments', comment.postId], (comments) =>
      comments?.filter((c) => c.commentId !== comment.commentId),
    )
    patchPost(queryClient, comment.postId, (post) => ({ commentCount: post.commentCount - 1 }))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      try {
        await deleteComment(comment.commentId)
      } catch (e) {
        // Already gone, which is what the user wanted.
        if (!(e instanceof ApiError && e.status === 404)) throw e
      }
    },
    onSuccess: removeFromCache,
  })

  return (
    <li className="text-sm">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 py-3 break-words whitespace-pre-wrap">
          <Link to={`/users/${encodeURIComponent(comment.authorUsername)}`} className="font-semibold hover:underline">
            {comment.authorUsername}
          </Link>{' '}
          {comment.message}
        </p>
        {isOwn && !confirming && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            aria-label="Delete comment"
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {confirming && (
        <div role="group" aria-label="Delete this comment?" className="flex flex-wrap items-center gap-2 pb-2">
          <p className="w-full font-medium">Delete this comment?</p>
          <Button autoFocus variant="outline" className="h-11 px-3" onClick={() => setConfirming(false)}>
            Keep comment
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-3"
            aria-disabled={mutation.isPending}
            onClick={() => !mutation.isPending && mutation.mutate()}
          >
            Delete comment
          </Button>
          {mutation.isError && (
            <p role="alert" className="w-full text-destructive">
              Couldn't delete your comment. Try again.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

// Only mounted once the comments are opened, so a feed doesn't load every post's comments.
export default function CommentSection({ postId }: { postId: number }) {
  const inputId = useId()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const submitting = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string>()

  const comments = useQuery({ queryKey: ['comments', postId], queryFn: () => getComments(postId) })

  const mutation = useMutation({
    mutationFn: () => createComment(postId, message.trim()),
    onSuccess: (comment) => {
      setMessage('')
      queryClient.setQueryData<Comment[]>(['comments', postId], (list) => [...(list ?? []), comment])
      patchPost(queryClient, postId, (post) => ({ commentCount: post.commentCount + 1 }))
    },
    onError: (e) =>
      setError(
        e instanceof ApiError && e.status === 404
          ? 'This post has been deleted.'
          : "Couldn't post your comment. Try again.",
      ),
    onSettled: () => {
      submitting.current = false
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setError(undefined)
    if (!message.trim()) {
      setError('Write a comment first')
      return
    }
    if (message.length > MAX_COMMENT) {
      setError('Comments can be up to 1,000 characters')
      return
    }
    submitting.current = true
    mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading comments…
        </p>
      )}
      {comments.isError && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert" className="text-destructive">
            Couldn't load comments.
          </p>
          <Button variant="outline" className="h-11 px-3" onClick={() => comments.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {comments.data?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {comments.data && comments.data.length > 0 && (
        <ul>
          {comments.data.map((comment) => (
            <CommentRow key={comment.commentId} comment={comment} isOwn={comment.authorId === user?.id} />
          ))}
        </ul>
      )}

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Add a comment
        </label>
        <Textarea
          id={inputId}
          rows={2}
          className="min-h-11"
          placeholder="Add a comment"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={!!error}
        />
        {message.length >= 900 && (
          <p className={message.length > MAX_COMMENT ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.length.toLocaleString()} of 1,000 characters
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" variant="outline" className="h-11 self-start px-3" aria-disabled={mutation.isPending}>
          {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {mutation.isPending ? 'Posting…' : 'Post comment'}
        </Button>
      </form>
    </div>
  )
}
