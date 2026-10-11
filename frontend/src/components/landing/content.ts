import { Heart, ImagePlus, UserPlus } from 'lucide-react'

// All landing-page copy and sample photos live here, so wording changes don't mean digging through layout code.

export const GITHUB_URL = 'https://github.com/adhyaanilkumar/social-grid'

// Sample photos served from 21st.dev's CDN (they came with the hero component). Swap for our own once users post.
const PHOTOS = {
  dogSunset: 'https://cdn.21st.dev/assets/mirror/ed/edd19d13042044af90896aa49454fd94633be73d902f850bd80ff53fe9159fc0.jpg',
  redLight: 'https://cdn.21st.dev/assets/mirror/45/45f4b5aacc49de8658492182ce5cffa21e90cf0b1868442839ecbbf4693674e4.jpg',
  freckles: 'https://cdn.21st.dev/assets/mirror/9c/9c9c1151f81291748bccb80f58590233532232cdc39b898c4aab39f6f251cac5.jpg',
  smile: 'https://cdn.21st.dev/assets/mirror/43/439e3c68fb4bbed585233d79d1dc5486deb32f2327499891fa2304041e507120.jpg',
  posing: 'https://cdn.21st.dev/assets/mirror/dc/dc8074c97db7347ac21eb4779f03d4f4041b6ae9e87e32c3c2fd364781259c9e.jpg',
}

// Fanned-out cards in the hero: outer cards tilt more and animate in last.
export const HERO_CARDS = [
  { src: PHOTOS.dogSunset, rotate: -22, delay: 0.9, z: 10 },
  { src: PHOTOS.redLight, rotate: -11, delay: 0.75, z: 20 },
  { src: PHOTOS.freckles, rotate: 0, delay: 0.6, z: 30 },
  { src: PHOTOS.smile, rotate: 11, delay: 0.75, z: 20 },
  { src: PHOTOS.posing, rotate: 22, delay: 0.9, z: 10 },
]

export const FEATURES = [
  { title: 'Post photos', icon: ImagePlus, description: 'Share a photo with a caption in a few seconds.' },
  { title: 'Follow friends', icon: UserPlus, description: 'See posts from the people you care about.' },
  { title: 'Like & comment', icon: Heart, description: 'React to posts and join the conversation.' },
]

// Example posts that show what the app looks like. Clearly labelled as examples on the page.
export const SAMPLE_POSTS = [
  { src: PHOTOS.dogSunset, alt: 'A woman hugging her dog in a field at sunset', username: 'maya', caption: 'Sunset walk with Biscuit', likes: 24, comments: 5 },
  { src: PHOTOS.freckles, alt: 'Close-up of a woman with painted freckles against a blue background', username: 'arjun.shoots', caption: 'Studio test, blue backdrop', likes: 41, comments: 8 },
  { src: PHOTOS.posing, alt: 'A young woman crouching and smiling, chin resting on her hands', username: 'lee', caption: 'Day out at the fair', likes: 17, comments: 3 },
]
