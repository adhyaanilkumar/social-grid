import { infiniteQueryOptions } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { PostPage } from './posts'

function pageQuery(path: string, before: number | undefined): Promise<PostPage> {
  return apiFetch<PostPage>(before === undefined ? path : `${path}?before=${before}`)
}

function feedOptions(queryKey: string[], path: string) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam }) => pageQuery(path, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

export type FeedOptions = ReturnType<typeof feedOptions>

export const homeFeedOptions = () => feedOptions(['feed', 'home'], '/api/feed/home')

export const exploreFeedOptions = () => feedOptions(['feed', 'explore'], '/api/feed/explore')

export const userPostsOptions = (username: string) =>
  feedOptions(['posts', 'user', username], `/api/users/${encodeURIComponent(username)}/posts`)
