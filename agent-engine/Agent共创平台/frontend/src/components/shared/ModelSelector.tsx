'use client'

/**
 * ModelSelector - 模型选择 Combobox
 * 支持搜索、模型描述展示
 */

import { useState, useMemo } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { AVAILABLE_MODELS, type Model } from '@/features/ai-chat/lib/models'
import { cn } from '@/lib/utils'

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  placeholder?: string
  disabled?: boolean
}

const providerIcons: Record<string, string> = {
  openai: '🔵',
  anthropic: '🟠',
  google: '🟢',
  deepseek: '🔴',
  dashscope: '🟡',
  glm: '🟣',
  minimax: '🩵',
  ollama: '⚫',
}

function formatContextWindow(window: number): string {
  if (window >= 1000000) return `${(window / 1000000).toFixed(0)}M`
  if (window >= 1000) return `${(window / 1000).toFixed(0)}K`
  return window.toString()
}

export function ModelSelector({ value, onChange, placeholder = '选择模型', disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedModel = AVAILABLE_MODELS.find(m => m.id === value)

  const filteredModels = useMemo(() => {
    if (!search) return AVAILABLE_MODELS
    const q = search.toLowerCase()
    return AVAILABLE_MODELS.filter(
      m => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border transition-colors min-w-[180px]',
          'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)]',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'hover:border-[var(--border-strong)]'
        )}
      >
        {selectedModel ? (
          <>
            <span>{providerIcons[selectedModel.provider]}</span>
            <span className="flex-1 text-left truncate">{selectedModel.name}</span>
            <span className="text-[var(--text-muted)] text-xs">{formatContextWindow(selectedModel.contextWindow)}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-[var(--text-muted)]">{placeholder}</span>
        )}
        <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 mt-1 w-80 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-[var(--border-subtle)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索模型..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Model list */}
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredModels.map(model => {
                const isSelected = model.id === value
                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      onChange(model.id)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors',
                      isSelected
                        ? 'bg-[var(--accent-blue)]/15 text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <span className="text-base">{providerIcons[model.provider]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{model.name}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">{model.description}</div>
                    </div>
                    <div className="shrink-0 text-xs text-[var(--text-muted)]">
                      {formatContextWindow(model.contextWindow)}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />}
                  </button>
                )
              })}
              {filteredModels.length === 0 && (
                <div className="py-6 text-center text-sm text-[var(--text-muted)]">未找到匹配的模型</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
