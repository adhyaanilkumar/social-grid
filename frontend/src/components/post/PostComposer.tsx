import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, ImagePlus, LoaderCircle } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { createPost } from '@/api/posts'
import { Field } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { refreshPosts } from '@/lib/postCache'
import { PhotoError, prepareImage } from '@/lib/prepareImage'

const MAX_CAPTION = 2200
// The counter only appears once it's useful.
const SHOW_COUNTER_FROM = 2000

function Preview({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string>()

  // The preview URL holds the photo in memory until it's released.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo])

  return url ? <img src={url} alt="Preview of your photo" className="max-h-[50svh] w-full rounded-lg bg-muted object-contain" /> : null
}

function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "Couldn't reach the server. Check your connection and try again."
  // nginx answers an over-limit upload with an HTML page, so there's no message in the body to use.
  if (error.status === 413) return 'That photo is too large'
  return error.body?.message ?? 'Something went wrong on our side. Please try again.'
}

export default function PostComposer({
  open,
  onOpenChange,
  onPosted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPosted: () => void
}) {
  const fileId = useId()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  // isPending only updates after a re-render, so a fast double click could slip past it; a ref can't.
  const submitting = useRef(false)
  const [photo, setPhoto] = useState<Blob>()
  const [preparing, setPreparing] = useState(false)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string>()
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  function reset() {
    setPhoto(undefined)
    setCaption('')
    setError(undefined)
    setConfirmDiscard(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const mutation = useMutation({
    mutationFn: (image: Blob) => createPost(image, caption),
    onSuccess: () => {
      reset()
      onPosted()
      // Not returned: the mutation would stay pending, showing "Posting…" if the dialog reopened during the refresh.
      void refreshPosts(queryClient)
    },
    // The caption and photo stay in place, so the user can try again.
    onError: (e) => setError(errorMessage(e)),
    onSettled: () => {
      submitting.current = false
    },
  })

  const busy = mutation.isPending || preparing
  const hasContent = !!photo || caption.trim() !== ''

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(undefined)
    setPreparing(true)
    try {
      setPhoto(await prepareImage(file))
    } catch (e) {
      setPhoto(undefined)
      event.target.value = ''
      setError(e instanceof PhotoError ? e.message : "We couldn't read that photo. Try a JPEG or PNG.")
    } finally {
      setPreparing(false)
    }
  }

  function removePhoto() {
    setPhoto(undefined)
    setError(undefined)
    if (fileInput.current) fileInput.current.value = ''
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || busy) return
    setError(undefined)
    if (!photo) {
      setError('Choose a photo to post')
      return
    }
    if (caption.length > MAX_CAPTION) {
      setError('Captions can be up to 2,200 characters')
      return
    }
    submitting.current = true
    mutation.mutate(photo)
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true)
    } else if (mutation.isPending) {
      // Closing can't stop an upload already on its way, so stay open until it's finished.
    } else if (hasContent && !confirmDiscard) {
      setConfirmDiscard(true)
    } else {
      reset()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
          <DialogDescription>Choose a JPEG or PNG photo, and add a caption if you like.</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {photo && <Preview photo={photo} />}

          {/* A real file input, so the keyboard and a phone's gallery or camera all work. No capture attribute,
              which would force the camera. image/* lets iPhones offer HEIC, which the browser step converts. */}
          <div className="flex items-center gap-2">
            <label
              htmlFor={fileId}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium transition-colors duration-150 hover:bg-muted has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            >
              {preparing ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              {preparing ? 'Preparing photo…' : photo ? 'Change photo' : 'Choose photo'}
              <input
                ref={fileInput}
                id={fileId}
                type="file"
                accept="image/*"
                onChange={handleFile}
                disabled={busy}
                className="sr-only"
              />
            </label>
            {photo && (
              <Button type="button" variant="ghost" className="h-11 px-3" onClick={removePhoto} disabled={busy}>
                Remove photo
              </Button>
            )}
          </div>

          <Field id="caption" label="Caption (optional)">
            <Textarea
              id="caption"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              aria-describedby={caption.length >= SHOW_COUNTER_FROM ? 'caption-count' : undefined}
            />
          </Field>
          {caption.length >= SHOW_COUNTER_FROM && (
            <p id="caption-count" className={caption.length > MAX_CAPTION ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {caption.length.toLocaleString()} of 2,200 characters
            </p>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {confirmDiscard ? (
            <div role="group" aria-label="Discard this post?" className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm font-medium">Discard this post?</p>
              <Button type="button" autoFocus variant="outline" className="h-11 px-3" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
              <Button type="button" variant="destructive" className="h-11 px-3" onClick={() => handleOpenChange(false)}>
                Discard
              </Button>
            </div>
          ) : (
            <Button type="submit" className="h-11 text-base" aria-disabled={busy}>
              {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              {mutation.isPending ? 'Posting…' : 'Post'}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
