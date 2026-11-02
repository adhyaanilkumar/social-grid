import { exploreFeedOptions } from '@/api/feed'
import { useOpenComposer } from '@/components/app/composer-context'
import PostList from '@/components/post/PostList'
import { Button } from '@/components/ui/button'

function EmptyExplore() {
  const openComposer = useOpenComposer()
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm">No posts yet. Be the first.</p>
      <Button className="h-11 px-3" onClick={openComposer}>
        New post
      </Button>
    </div>
  )
}

export default function Explore() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 pt-4 md:gap-6 md:pt-8">
      <div className="px-4 min-[480px]:px-0">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <p className="text-sm text-muted-foreground">Everyone's posts</p>
      </div>
      <PostList options={exploreFeedOptions()} empty={<EmptyExplore />} />
    </div>
  )
}
