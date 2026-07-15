import type { ReactNode } from 'react'
import ProjectRouteLayout from './project-route-layout'

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return <ProjectRouteLayout>{children}</ProjectRouteLayout>
}
