import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { PostPage, PostView } from '@/api/posts'

// The same post can be cached in several places at once: Home, Explore and a profile's grid.
const POST_LISTS = [['feed'], ['posts', 'user']]

type Pages = InfiniteData<PostPage>

function updateLists(queryClient: QueryClient, update: (items: PostView[]) => PostView[]) {
  for (const queryKey of POST_LISTS) {
    queryClient.setQueriesData<Pages>({ queryKey }, (data) =>
      data && { ...data, pages: data.pages.map((page) => ({ ...page, items: update(page.items) })) },
    )
  }
}

// Updates one post everywhere it's cached, so every screen agrees without refetching.
export function patchPost(queryClient: QueryClient, postId: number, patch: (post: PostView) => Partial<PostView>) {
  updateLists(queryClient, (items) =>
    items.map((post) => (post.postId === postId ? { ...post, ...patch(post) } : post)),
  )
}

export function removePost(queryClient: QueryClient, postId: number) {
  updateLists(queryClient, (items) => items.filter((post) => post.postId !== postId))
}

// Refetches everything showing a list of posts, and profiles, whose post counts change too.
export function refreshPosts(queryClient: QueryClient) {
  return Promise.all([
    ...POST_LISTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    queryClient.invalidateQueries({ queryKey: ['profile'] }),
  ])
}

// Stops a request already in flight from overwriting an update made on this screen.
export function cancelPostQueries(queryClient: QueryClient) {
  return Promise.all(POST_LISTS.map((queryKey) => queryClient.cancelQueries({ queryKey })))
}
