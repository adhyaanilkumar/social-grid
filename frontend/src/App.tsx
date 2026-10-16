import { Route, Routes } from 'react-router'
import RequireAuth from '@/auth/RequireAuth'
import Home from '@/pages/Home'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import Register from '@/pages/Register'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Members-only pages: RequireAuth sends logged-out visitors to /login first. */}
      <Route element={<RequireAuth />}>
        <Route path="/home" element={<Home />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
