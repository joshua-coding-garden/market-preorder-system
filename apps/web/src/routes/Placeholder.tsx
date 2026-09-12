import { PageHeader } from '@/components/common'

/**
 * 尚未進入實作 Sprint 的畫面佔位（06-迭代計畫.md）。
 * 只標示該畫面屬於哪個 Sprint，不做任何功能。
 */
export default function Placeholder({ screen, sprint }: { screen: string; sprint: number }) {
  return (
    <>
      <PageHeader title={screen} />
      <p className="px-4 text-sm text-neutral-500">此畫面於 Sprint {sprint} 實作。</p>
    </>
  )
}
