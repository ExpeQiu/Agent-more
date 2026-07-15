'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import ProjectLayoutShell from './_project-layout'

/** 路由级客户端壳：hooks 与导航必须在此；勿在 layout.tsx 顶层写 use client，避免 Next 15 clientReferenceManifest 异常 */
export default function ProjectRouteLayout({ children }: { children: ReactNode }) {
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
