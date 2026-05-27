import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Header from './components/layout/Header'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import QuestionAnalysis from './pages/QuestionAnalysis'
import StudentList from './pages/StudentList'
import StudentDetail from './pages/StudentDetail'
import { useApp } from './context/AppContext'

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<RequireData><Dashboard /></RequireData>} />
              <Route path="/questions" element={<RequireData><QuestionAnalysis /></RequireData>} />
              <Route path="/students" element={<RequireData><StudentList /></RequireData>} />
              <Route path="/students/:id" element={<RequireData><StudentDetail /></RequireData>} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AppProvider>
  )
}

function RequireData({ children }: { children: JSX.Element }) {
  const { examData } = useApp()
  if (!examData) return <Navigate to="/" replace />
  return children
}
