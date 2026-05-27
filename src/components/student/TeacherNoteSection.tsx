/**
 * TeacherNoteSection.tsx
 * 교사가 최종 검수한 세특 기록을 작성·자동저장하는 컴포넌트
 */

import type { TeacherNoteState } from '../../hooks/useTeacherNote'

interface Props {
  state: TeacherNoteState
}

function formatSavedAt(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 5)  return '방금 저장됨'
  if (diff < 60) return `${diff}초 전 저장`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전 저장`
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 저장'
}

export default function TeacherNoteSection({ state }: Props) {
  const { note, setNote, savedAt, isDirty, clearNote } = state
  const charCount = note.replace(/\s/g, '').length

  return (
    <div className="border border-teal-100 rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-2.5 bg-teal-50 flex items-center justify-between">
        <span className="text-sm font-semibold text-teal-700">교사 검수 기록</span>
        <div className="flex items-center gap-2 text-xs">
          {isDirty && <span className="text-amber-500">저장 중...</span>}
          {!isDirty && savedAt && (
            <span className="text-teal-500">{formatSavedAt(savedAt)}</span>
          )}
          {!isDirty && !savedAt && (
            <span className="text-gray-400">자동 저장됩니다</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="AI 초안 또는 자동 생성 초안을 참고하여 최종 세특 내용을 작성하세요.&#10;입력 후 1.5초 뒤 자동으로 저장됩니다."
          rows={6}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-teal-300"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{charCount}자 (공백 제외)</span>
          <div className="flex gap-2">
            {note && (
              <button
                onClick={() => navigator.clipboard.writeText(note)}
                className="text-xs px-3 py-1 rounded border border-teal-200 hover:bg-teal-50 text-teal-600"
              >
                복사
              </button>
            )}
            {note && (
              <button
                onClick={() => {
                  if (window.confirm('검수 기록을 삭제하시겠습니까?')) clearNote()
                }}
                className="text-xs px-3 py-1 rounded border border-red-200 hover:bg-red-50 text-red-500"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
