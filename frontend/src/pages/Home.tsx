import { Link } from 'react-router'
import { homeFeedOptions } from '@/api/feed'
import { useOpenComposer } from '@/components/app/composer-context'
import PostList from '@/components/post/PostList'
import { Button } from '@/components/ui/button'

function EmptyHome() {
  const openComposer = useOpenComposer()
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm">Nothing here yet. Post a photo, or follow people to see theirs.</p>
      <div className="flex flex-wrap gap-2">
        <Button className="h-11 px-3" onClick={openComposer}>
          New post
        </Button>
        <Button asChild variant="outline" className="h-11 px-3">
          <Link to="/explore">Go to Explore</Link>
        </Button>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 pt-4 md:gap-6 md:pt-8">
      <div className="px-4 min-[480px]:px-0">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">From you and people you follow</p>
      </div>
      <PostList options={homeFeedOptions()} empty={<EmptyHome />} />
    </div>
  )
}
