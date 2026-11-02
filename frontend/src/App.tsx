import { Route, Routes } from 'react-router'
import RequireAuth from '@/auth/RequireAuth'
import AppShell from '@/components/app/AppShell'
import Explore from '@/pages/Explore'
import Home from '@/pages/Home'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import Profile from '@/pages/Profile'
import Register from '@/pages/Register'
import Search from '@/pages/Search'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Members-only pages: RequireAuth sends logged-out visitors to /login first. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/home" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/search" element={<Search />} />
          <Route path="/users/:username" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
