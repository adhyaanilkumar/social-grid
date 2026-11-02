import { apiFetch } from './client'

// Mirrors com.socialgrid.dto.PostView and PostPage.
export interface PostView {
  postId: number
  authorId: number
  authorUsername: string
  mediaUrl: string | null
  caption: string | null
  // Null on posts made before photo upload.
  width: number | null
  height: number | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export interface PostPage {
  items: PostView[]
  // Pass back as "before" to get the next page. Null on the last page.
  nextCursor: number | null
}

export function createPost(image: Blob, caption: string): Promise<unknown> {
  const form = new FormData()
  form.append('image', image, 'photo.jpg')
  if (caption.trim()) form.append('caption', caption)
  return apiFetch('/api/posts', { method: 'POST', body: form })
}

export function deletePost(postId: number): Promise<void> {
  return apiFetch<void>(`/api/posts/${postId}`, { method: 'DELETE' })
}

export function likePost(postId: number): Promise<unknown> {
  return apiFetch(`/api/posts/${postId}/likes`, { method: 'POST' })
}

export function unlikePost(postId: number): Promise<void> {
  return apiFetch<void>(`/api/posts/${postId}/likes`, { method: 'DELETE' })
}
