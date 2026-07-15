import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'AI 共创平台',
  description: '独立多模型对话工作站，支持单模型对话、多模型对比与 Agent 讨论。',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light">
      <body>{children}</body>
    </html>
  )
}
