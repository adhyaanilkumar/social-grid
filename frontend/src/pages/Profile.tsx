import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useLocation, useNavigate, useParams, Link } from 'react-router'
import { ApiError } from '@/api/client'
import { follow, getProfile, unfollow, type Profile as ProfileData } from '@/api/users'
import { useAuth } from '@/auth/auth-context'
import { useOpenComposer } from '@/components/app/composer-context'
import Avatar from '@/components/Avatar'
import PostDialog from '@/components/profile/PostDialog'
import PostGrid from '@/components/profile/PostGrid'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function count(value: number, singular: string, pluralWord = `${singular}s`) {
  return (
    <span>
      <strong className="font-semibold">{value.toLocaleString()}</strong> {value === 1 ? singular : pluralWord}
    </span>
  )
}

function FollowButton({ profile }: { profile: ProfileData }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const following = profile.followedByMe
      try {
        await (following ? unfollow(profile.userId) : follow(profile.userId))
      } catch (e) {
        // 404 on unfollow or 409 on follow means it's already how the user wanted it.
        if (!(e instanceof ApiError && e.status === (following ? 404 : 409))) throw e
      }
    },
    // Counts change on both people's profiles, and the follower's Home feed changes too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['feed', 'home'] }),
      ]),
  })

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={profile.followedByMe ? 'outline' : 'default'}
        className="h-11 px-4"
        aria-disabled={mutation.isPending}
        onClick={() => !mutation.isPending && mutation.mutate()}
      >
        {mutation.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        {profile.followedByMe ? 'Unfollow' : 'Follow'}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't update. Try again.
        </p>
      )}
    </div>
  )
}

function EmptyOwnProfile() {
  const openComposer = useOpenComposer()
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm">You haven't posted yet.</p>
      <Button className="h-11 px-3" onClick={openComposer}>
        New post
      </Button>
    </div>
  )
}

function ProfileContent({ username }: { username: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isOwn = user?.username === username

  const profile = useQuery({ queryKey: ['profile', username], queryFn: () => getProfile(username) })

  // The open post lives in the browser's history, so a phone's Back button closes the dialog.
  const openPostId = (location.state as { postId?: number } | null)?.postId

  if (profile.isError) {
    const notFound = profile.error instanceof ApiError && profile.error.status === 404
    return (
      <div className="flex flex-col items-start gap-3 px-4 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">{notFound ? 'User not found' : 'Profile'}</h1>
        <p role="alert" className="text-sm">
          {notFound
            ? `We can't find a user called "${username}".`
            : "Couldn't load this profile. Check your connection and try again."}
        </p>
        {notFound ? (
          <Button asChild variant="outline" className="h-11 px-3">
            <Link to="/search">Search users</Link>
          </Button>
        ) : (
          <Button variant="outline" className="h-11 px-3" onClick={() => profile.refetch()}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  const data = profile.data
  const fullName = [data?.firstName, data?.lastName].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-6 pt-4 md:pt-8">
      {data ? (
        <header className="flex flex-col gap-3 px-4">
          <div className="flex items-center gap-3">
            <Avatar username={data.username} className="size-14 text-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{data.username}</h1>
              {fullName && <p className="truncate text-sm text-muted-foreground">{fullName}</p>}
            </div>
          </div>
          {data.bio && <p className="text-sm break-words whitespace-pre-wrap">{data.bio}</p>}
          {/* Plain text: there are no follower lists, so these don't lead anywhere and shouldn't look clickable. */}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {count(data.postCount, 'post')}
            {count(data.followerCount, 'follower')}
            {count(data.followingCount, 'following', 'following')}
          </p>
          {!isOwn && <FollowButton profile={data} />}
        </header>
      ) : (
        <div role="status" aria-label="Loading profile" className="flex items-center gap-3 px-4">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
      )}

      <PostGrid
        username={username}
        empty={isOwn ? <EmptyOwnProfile /> : <p className="text-sm">{username} hasn't posted yet.</p>}
        onSelect={(postId) => navigate(location, { state: { postId } })}
      />
      <PostDialog username={username} postId={openPostId} onClose={() => navigate(-1)} />
    </div>
  )
}

export default function Profile() {
  const { username = '' } = useParams()
  return (
    <div className="mx-auto max-w-[960px]">
      {/* The key makes moving between profiles start fresh. */}
      <ProfileContent key={username} username={username} />
    </div>
  )
}
