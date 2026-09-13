import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 共用的彈出面板：手機從底部貼齊、桌機置中。
 *
 * ⚠️ 一定要用 portal 掛到 document.body：三個 View 的標題列都有 `backdrop-blur`，
 * 而 `backdrop-filter` 會為 `position: fixed` 的子元素建立 containing block，
 * 不脫離的話面板會被關在那條標題列裡（只有 1024×94），而不是蓋滿整個視窗。
 */
export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // 手機上背景若還能捲，會讓人以為畫面卡住；開著時鎖住 body
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Esc 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-xl text-neutral-400"
            aria-label="關閉"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
