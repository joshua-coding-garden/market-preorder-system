import { useRef, useState } from 'react'
import { ApiError, apiFetch } from '@/api/client'
import { errorMessage } from '@/i18n/zh-TW'

interface Props {
  /** 上傳端點，例：/stalls/{id}/products/{id}/image */
  endpoint: string
  imageUrl: string | null
  thumbUrl: string | null
  onUploaded: (result: { imageUrl: string; thumbUrl: string }) => void
  disabled?: boolean
}

const MAX_BYTES = 8 * 1024 * 1024

/** ImageUploader：選檔 → 預覽 → 上傳（05 §共用元件） */
export default function ImageUploader({
  endpoint,
  imageUrl,
  thumbUrl,
  onUploaded,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSize, setSavedSize] = useState<string | null>(null)

  const current = preview ?? imageUrl ?? thumbUrl

  const pick = async (file: File) => {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError('圖片不能超過 8MB')
      return
    }
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch<{ imageUrl: string; thumbUrl: string }>(endpoint, {
        method: 'POST',
        body: form,
      })
      onUploaded(res)
      setPreview(null)
      setSavedSize(`原始 ${(file.size / 1024 / 1024).toFixed(1)}MB → 已壓成 WebP（最長邊 1200）`)
    } catch (err) {
      setError(err instanceof ApiError ? (err.message ?? errorMessage(err.code)) : '上傳失敗')
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
          {current ? (
            <img src={current} alt="商品圖片" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
              無圖片
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pick(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? '上傳中…' : current ? '更換圖片' : '選擇圖片'}
          </button>
          <p className="mt-1.5 text-xs text-neutral-500">
            JPG／PNG／WebP，8MB 以內。上傳後會自動壓縮。
          </p>
          {savedSize ? <p className="mt-1 text-xs text-green-700">{savedSize}</p> : null}
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
