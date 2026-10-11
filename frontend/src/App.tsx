import { Route, Routes } from 'react-router'
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
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
