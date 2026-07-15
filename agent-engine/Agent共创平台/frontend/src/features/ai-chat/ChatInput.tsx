'use client'

/**
 * ChatInput - 优化版输入框
 * - 底部安全区适配
 * - 优化布局（去绝对定位）
 * - 发送按钮 hover 发光
 */

import { useState, type KeyboardEvent, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useChatStore } from './lib/chat-store'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  placeholder?: string
  onMentionAgent?: (agentId: string) => void
}

export function ChatInput({ onSend, disabled, placeholder = '输入问题，按 Enter 发送...', onMentionAgent }: ChatInputProps) {
  const [input, setInput] = useState('')
  const { isStreaming } = useChatStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (!input.trim() || isStreaming || disabled) return
    const message = input
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    onSend(message)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle @ mention for agent mode
    if (e.key === '@' && onMentionAgent) {
      // Let parent handle this
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }

  useEffect(() => {
    adjustHeight()
  }, [input])

  const isDisabled = isStreaming || disabled
  const canSend = input.trim().length > 0 && !isDisabled

  return (
    <div
      className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-4xl mx-auto px-4 pt-3 pb-2">
        {/* Input row */}
        <div className="relative flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); adjustHeight() }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            className={cn(
              'w-full resize-none rounded-xl border bg-[var(--bg-surface)]',
              'px-4 py-3 pr-14 text-sm leading-relaxed',
              'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/50',
              'disabled:opacity-50 max-h-[200px] overflow-y-auto',
              'border-[var(--border-default)]'
            )}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'absolute right-2 bottom-2 p-2 rounded-lg transition-all',
              canSend
                ? 'bg-[var(--accent-blue)] text-white hover:shadow-[var(--shadow-glow-blue)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
            )}
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Hint */}
        <div className="text-center mt-1.5 text-xs text-[var(--text-muted)]">
          AI 模型可能会产生不准确的信息，请核实重要内容。
        </div>
      </div>
    </div>
  )
}
