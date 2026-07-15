'use client'

/**
 * Next App Router 集成示例
 *
 * 使用方式：
 * 1. 在主仓的 `app/(main)/projects/[id]/layout.tsx` 中引入此思路
 * 2. 使用 `useParams()` / `usePathname()` / `useRouter()` 注入壳组件
 * 3. 将本文件作为参考，不建议直接作为生产布局文件复制
 */

import { useParams, usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import ProjectLayoutShell from './_project-layout'

interface ProjectLayoutExampleProps {
  children: ReactNode
}

export default function ProjectLayoutExample({ children }: ProjectLayoutExampleProps) {
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const router = useRouter()

  return (
    <ProjectLayoutShell
      projectId={params.id}
      pathname={pathname}
      onNavigate={(path) => router.push(path)}
    >
      {children}
    </ProjectLayoutShell>
  )
}
