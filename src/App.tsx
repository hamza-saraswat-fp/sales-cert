import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import Dashboard from '@/pages/Dashboard'
import RoundDetail from '@/pages/RoundDetail'
import StudentDetail from '@/pages/StudentDetail'
import QuestionManager from '@/pages/QuestionManager'
import AdminSettings from '@/pages/AdminSettings'

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between h-14 px-4 max-w-6xl">
          <Link to="/" className="font-semibold text-lg">
            FieldPulse Sales Cert
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Settings
            </Link>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rounds/:roundId" element={<RoundDetail />} />
          <Route path="/rounds/:roundId/students/:studentId" element={<StudentDetail />} />
          <Route path="/rounds/:roundId/questions" element={<QuestionManager />} />
          <Route path="/admin" element={<AdminSettings />} />
        </Routes>
      </AppLayout>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
