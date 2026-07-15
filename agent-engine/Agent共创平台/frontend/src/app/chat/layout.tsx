import type { ReactNode } from 'react'

/** 全局 CSS 未加载时仍占满视口；内层给 h-full 子树提供可计算高度 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}
