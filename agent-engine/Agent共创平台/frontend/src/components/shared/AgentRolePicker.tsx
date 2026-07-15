'use client'

/**
 * AgentRolePicker - Agent 角色 Popover 选择器
 * 基于 Popover 实现，非 absolute 下拉
 */

import { Plus, X, Check } from 'lucide-react'
import { Popover } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AGENT_ROLES, type AgentRole } from '@/features/ai-chat/lib/models'
import { cn } from '@/lib/utils'

interface AgentRolePickerProps {
  selectedIds: string[]
  onToggle: (agentId: string) => void
  maxSelection?: number
}

const colorMap: Record<string, string> = {
  blue: 'var(--accent-blue)',
  green: 'var(--accent-green)',
  purple: 'var(--accent-purple)',
  red: 'var(--error)',
  amber: 'var(--accent-amber)',
}

export function AgentRolePicker({ selectedIds, onToggle, maxSelection = 5 }: AgentRolePickerProps) {
  const canAddMore = selectedIds.length < maxSelection

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selected pills */}
      {selectedIds.map(id => {
        const role = AGENT_ROLES.find(r => r.id === id)
        if (!role) return null
        const color = colorMap[role.color] || 'var(--accent-blue)'

        return (
          <div
            key={id}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
              'border transition-colors'
            )}
            style={{
              backgroundColor: `${color}15`,
              borderColor: `${color}40`,
              color: color,
            }}
          >
            <span>{role.icon}</span>
            <span>{role.name}</span>
            <button
              onClick={() => onToggle(id)}
              className="ml-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )
      })}

      {/* Add button */}
      {canAddMore && (
        <Popover
          content={
            <div className="w-64">
              <div className="text-sm font-medium text-[var(--text-primary)] mb-2">选择 Agent 角色</div>
              <ScrollArea className="max-h-64">
                <div className="space-y-1 pr-2">
                  {AGENT_ROLES.map(role => {
                    const isSelected = selectedIds.includes(role.id)
                    const color = colorMap[role.color] || 'var(--accent-blue)'

                    return (
                      <button
                        key={role.id}
                        onClick={() => onToggle(role.id)}
                        disabled={isSelected}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors',
                          isSelected
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-[var(--bg-elevated)]'
                        )}
                      >
                        <span className="text-base">{role.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--text-primary)]">{role.name}</div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{role.description}</div>
                        </div>
                        {isSelected ? (
                          <Check className="w-4 h-4 shrink-0" style={{ color }} />
                        ) : (
                          <Badge
                            variant="outline"
                            className="shrink-0"
                            style={{ borderColor: `${color}40`, color }}
                          >
                            添加
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          }
        >
          <button
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
              'border border-dashed border-[var(--border-default)] text-[var(--text-muted)]',
              'hover:border-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-colors'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加角色</span>
          </button>
        </Popover>
      )}
    </div>
  )
}
