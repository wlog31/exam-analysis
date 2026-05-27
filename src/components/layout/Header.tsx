import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

const NAV_ITEMS = [
  { to: '/', label: '홈' },
  { to: '/dashboard', label: '대시보드' },
  { to: '/questions', label: '문항분석' },
  { to: '/irt', label: '전문 IRT' },
  { to: '/students', label: '학생목록' },
]

export default function Header() {
  const { pathname } = useLocation()
  const { examData, questionInfoFile, answerFile, subjectiveIrtFile } = useApp()

  return (
    <header className="bg-blue-700 text-white shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-lg tracking-tight">📊 성적분석</Link>
          {examData && (
            <nav className="flex gap-1">
              {NAV_ITEMS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    pathname === to
                      ? 'bg-white text-blue-700'
                      : 'text-blue-100 hover:bg-blue-600'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {examData && (
            <span className="text-xs text-blue-200 hidden sm:block">
              {examData.examInfo.subject} {examData.examInfo.year}년도 {examData.examInfo.semester}학기 {examData.examInfo.examNumber}차
            </span>
          )}
          {(questionInfoFile || answerFile) && !examData && (
            <span className="text-xs text-blue-200 hidden sm:block">
              {questionInfoFile ? '문항정보표 ✓' : '문항정보표 ✗'}&nbsp;&nbsp;{answerFile ? '정오표 ✓' : '정오표 ✗'}&nbsp;&nbsp;{subjectiveIrtFile ? '서답형 IRT ✓' : '서답형 IRT 선택'}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
