import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export default function InfoModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setOffset({ x: 0, y: 0 })
      setIsDragging(false)
    }
  }, [open])

  useEffect(() => {
    if (!isDragging) return

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      const modalWidth = modalRef.current?.offsetWidth ?? 0
      const modalHeight = modalRef.current?.offsetHeight ?? 0
      const limitX = Math.max(0, (window.innerWidth - modalWidth) / 2 - 12)
      const limitY = Math.max(0, (window.innerHeight - modalHeight) / 2 - 12)
      const nextX = clamp(dragRef.current.baseX + dx, -limitX, limitX)
      const nextY = clamp(dragRef.current.baseY + dy, -limitY, limitY)
      setOffset({ x: nextX, y: nextY })
    }

    const onPointerUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [isDragging])

  function handleHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    }
    setIsDragging(true)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="모달 닫기"
      />
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
          >
            닫기
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto text-sm text-gray-700 space-y-2">
          {children}
        </div>
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
