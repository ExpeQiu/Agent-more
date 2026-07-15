/**
 * Discussion Page — Entry Point
 * Route: /projects/[id]/discussion
 */

import { DiscussionPage } from '@/features/discussion/DiscussionPage'

interface DiscussionRoutePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function DiscussionRoutePage({ params }: DiscussionRoutePageProps) {
  const { id } = await params
  return <DiscussionPage projectId={id} />
}
