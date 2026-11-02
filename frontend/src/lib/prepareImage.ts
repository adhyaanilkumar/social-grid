// Runs in the browser before upload. A 10 MB phone photo becomes a few hundred KB here, well inside the server's
// 5 MB limit. Phones often save photos sideways with a metadata flag saying how to rotate them, and the server
// ignores that flag, so this is also the step that turns them the right way up.

const MAX_INPUT_BYTES = 25 * 1024 * 1024
const MAX_SIDE = 1080
const JPEG_QUALITY = 0.85

// A problem to show the user, as opposed to a bug.
export class PhotoError extends Error {}

export async function prepareImage(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new PhotoError('That photo is too large. Choose one under 25 MB.')
  }

  let bitmap: ImageBitmap
  try {
    // from-image applies the rotation flag.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PhotoError("We couldn't read that photo. Try a JPEG or PNG.")
  }

  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new PhotoError("We couldn't read that photo. Try a JPEG or PNG.")
    // JPEG has no transparency, so a transparent PNG gets a white background.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) throw new PhotoError("We couldn't read that photo. Try a JPEG or PNG.")
    return blob
  } finally {
    bitmap.close()
  }
}
