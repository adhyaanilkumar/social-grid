import { apiFetch } from './client'

// Mirrors com.socialgrid.dto.CommentResponse.
export interface Comment {
  commentId: number
  authorId: number
  authorUsername: string
  postId: number
  message: string
}

export function getComments(postId: number): Promise<Comment[]> {
  return apiFetch<Comment[]>(`/api/posts/${postId}/comments`)
}

export function createComment(postId: number, message: string): Promise<Comment> {
  return apiFetch<Comment>(`/api/posts/${postId}/comments`, { method: 'POST', body: { message } })
}

export function deleteComment(commentId: number): Promise<void> {
  return apiFetch<void>(`/api/comments/${commentId}`, { method: 'DELETE' })
}
