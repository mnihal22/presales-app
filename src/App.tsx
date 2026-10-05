import { Routes, Route } from 'react-router'
import { AuthProvider } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Customers from './pages/Customers'
import MyTasks from './pages/MyTasks'
import Activity from './pages/Activity'
import Templates from './pages/Templates'
import Masters from './pages/Masters'
import Users from './pages/Users'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/tasks" element={<MyTasks />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/masters" element={<Masters />} />
          <Route path="/users" element={<Users />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
