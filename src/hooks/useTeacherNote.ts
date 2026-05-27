/**
 * useTeacherNote.ts
 * 학생별 교사 검수 노트를 localStorage에 자동 저장합니다.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ExamInfo } from '../types'

export function makeTeacherNoteKey(studentId: string, examInfo: ExamInfo): string {
  return [
    'teacher_note',
    examInfo.subject,
    examInfo.year,
    examInfo.semester,
    examInfo.examNumber,
    studentId,
  ].join('_')
}

export interface TeacherNoteState {
  note: string
  setNote: (v: string) => void
  savedAt: Date | null
  isDirty: boolean
  clearNote: () => void
}

export function useTeacherNote(studentId: string, examInfo: ExamInfo): TeacherNoteState {
  const key = makeTeacherNoteKey(studentId, examInfo)

  const [note, setNoteRaw] = useState<string>(() => localStorage.getItem(key) ?? '')
  const [savedAt, setSavedAt] = useState<Date | null>(() => {
    const ts = localStorage.getItem(key + '_ts')
    return ts ? new Date(ts) : null
  })
  const [isDirty, setIsDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setNote = useCallback((v: string) => {
    setNoteRaw(v)
    setIsDirty(true)
  }, [])

  // 1.5초 debounce 자동 저장
  useEffect(() => {
    if (!isDirty) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      localStorage.setItem(key, note)
      const now = new Date()
      localStorage.setItem(key + '_ts', now.toISOString())
      setSavedAt(now)
      setIsDirty(false)
    }, 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [note, key, isDirty])

  const clearNote = useCallback(() => {
    setNoteRaw('')
    setIsDirty(false)
    localStorage.removeItem(key)
    localStorage.removeItem(key + '_ts')
    setSavedAt(null)
  }, [key])

  return { note, setNote, savedAt, isDirty, clearNote }
}
