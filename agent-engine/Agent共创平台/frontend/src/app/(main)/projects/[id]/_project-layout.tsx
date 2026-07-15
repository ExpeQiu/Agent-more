'use client'

/**
 * Cocreator 项目布局壳组件（Next App Router 兼容版）
 * 
 * 用法：
 * - 在主仓 layout/page 中传入 projectId、pathname、children
 * - 保留 tabs 配置，移除 react-router-dom 依赖
 * - 推荐结合同目录 `ProjectLayoutShell.example.tsx` 一起使用
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft, FolderKanban, FileText, Sparkles, Settings,
  Users, Shield, Image, Send, BarChart3, GitBranch, Layers,
  MessageSquare,  // ← 新增
  Bot,             // ← Agent Console tab
  MessageSquareText,  // ← 多Agent讨论 tab
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api/client'

// ─── Project type ─────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  description?: string
  status: string
  createdAt: string
  updatedAt: string
  ownerId: string
  createdById?: string
}

// ─── Layout ──────────────────────────────────────────────────────────────────

interface ProjectLayoutShellProps {
  projectId: string
  pathname: string
  children: ReactNode
  onNavigate?: (path: string) => void
}

export default function ProjectLayoutShell({
  projectId,
  pathname,
  children,
  onNavigate,
}: ProjectLayoutShellProps) {
  const { setCurrentProject } = useProjectStore()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.get(`/projects/${projectId}`)
      .then((res: any) => {
        const proj = res.data || res
        setProject(proj)
        setCurrentProject({
          id: proj.id,
          name: proj.name,
          description: proj.description,
          status: proj.status,
          createdAt: proj.createdAt,
          updatedAt: proj.updatedAt,
          createdById: proj.ownerId || proj.createdById || '',
          memberCount: proj.members?.length,
        })
      })
      .catch(() => setError('加载项目失败'))
      .finally(() => setLoading(false))
  }, [projectId, setCurrentProject])

  const basePath = `/projects/${projectId}`
  const navigate = (path: string) => {
    onNavigate?.(path)
  }

  // ── 修改：添加 AI对话 Tab ────────────────────────────────────────────────
  const tabs = [
    { value: '', label: '概览', icon: <FolderKanban className="w-3.5 h-3.5" />, path: '' },
    { value: 'sources', label: '来源管理', icon: <FileText className="w-3.5 h-3.5" />, path: 'sources' },
    { value: 'ai-chat', label: 'AI对话', icon: <MessageSquare className="w-3.5 h-3.5" />, path: 'ai-chat' },  // ← 新增
    { value: 'discussion', label: '多Agent讨论', icon: <MessageSquareText className="w-3.5 h-3.5" />, path: 'discussion' },  // ← Phase 3 新增
    { value: 'agent-console', label: '手动Agent', icon: <Bot className="w-3.5 h-3.5" />, path: 'agent-console' },  // ← Phase 2 新增
    { value: 'co-create', label: '共创中心', icon: <Sparkles className="w-3.5 h-3.5" />, path: 'co-create' },
    { value: 'content-generate', label: '内容生成', icon: <Layers className="w-3.5 h-3.5" />, path: 'content-generate' },
    { value: 'content-batch', label: '批量生成', icon: <Layers className="w-3.5 h-3.5" />, path: 'content-batch' },
    { value: 'content-versions', label: '版本对比', icon: <GitBranch className="w-3.5 h-3.5" />, path: 'content-versions' },
    { value: 'content-output', label: '内容输出', icon: <Layers className="w-3.5 h-3.5" />, path: 'content-output' },
    { value: 'analytics', label: '数据统计', icon: <BarChart3 className="w-3.5 h-3.5" />, path: 'analytics' },
    { value: 'multimodal', label: '图片生成', icon: <Image className="w-3.5 h-3.5" />, path: 'multimodal' },
    { value: 'review', label: '内容审核', icon: <Shield className="w-3.5 h-3.5" />, path: 'review' },
    { value: 'publish', label: '内容发布', icon: <Send className="w-3.5 h-3.5" />, path: 'publish' },
    { value: 'members', label: '成员', icon: <Users className="w-3.5 h-3.5" />, path: 'members' },
    { value: 'settings', label: '设置', icon: <Settings className="w-3.5 h-3.5" />, path: 'settings' },
  ]

  const normalizedPath = pathname || basePath
  const currentTab = normalizedPath === basePath
    ? ''
    : normalizedPath.replace(`${basePath}/`, '')

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-10 w-full mt-4" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <p className="text-red-500">{error || '项目不存在'}</p>
        <Button className="mt-4" onClick={() => navigate('/projects')}>返回项目列表</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Project Header */}
      <div className="px-6 lg:px-8 pt-6 pb-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="w-4 h-4" /> 返回
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-slate-500 mt-1">{project.description}</p>
            )}
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>

        {/* Tab Navigation */}
        <Tabs value={currentTab} onValueChange={(v: string) => navigate(v ? `${basePath}/${v}` : basePath)}>
          <TabsList className="bg-transparent border-b-0 p-0 h-auto gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2 flex-nowrap">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={`gap-1 px-2 py-2 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 dark:data-[state=active]:border-indigo-400 dark:data-[state=active]:text-indigo-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all shrink-0 ${
                  currentTab === tab.value
                    ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline text-xs whitespace-nowrap">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-6 lg:p-8 bg-slate-50 dark:bg-slate-800/50">
        {children}
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function ProjectStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE:   { label: '进行中', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    ARCHIVED: { label: '已归档', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    DRAFT:    { label: '草稿',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  }
  const cfg = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
