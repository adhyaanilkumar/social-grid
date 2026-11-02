import { apiFetch } from './client'

// Mirrors com.socialgrid.dto.ProfileResponse and UserSummary.
export interface Profile {
  userId: number
  username: string
  firstName: string | null
  lastName: string | null
  bio: string | null
  profilePicUrl: string | null
  postCount: number
  followerCount: number
  followingCount: number
  followedByMe: boolean
}

export interface UserSummary {
  id: number
  username: string
}

export function getProfile(username: string): Promise<Profile> {
  return apiFetch<Profile>(`/api/users/${encodeURIComponent(username)}/profile`)
}

export function searchUsers(query: string): Promise<UserSummary[]> {
  return apiFetch<UserSummary[]>(`/api/users/search?q=${encodeURIComponent(query)}`)
}

export function follow(userId: number): Promise<unknown> {
  return apiFetch(`/api/users/${userId}/follow`, { method: 'POST' })
}

export function unfollow(userId: number): Promise<void> {
  return apiFetch<void>(`/api/users/${userId}/follow`, { method: 'DELETE' })
}
