'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface PopoverProps {
  children: React.ReactNode
  content: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

function Popover({ children, content, open, onOpenChange, className }: PopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const isControlled = open !== undefined
  const visible = isControlled ? open : isOpen

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (isControlled) {
          onOpenChange?.(false)
        } else {
          setIsOpen(false)
        }
      }
    }
    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, isControlled, onOpenChange])

  return (
    <div ref={containerRef} className="relative inline-flex">
      <div onClick={() => {
        if (isControlled) {
          onOpenChange?.(!open)
        } else {
          setIsOpen(!isOpen)
        }
      }}>
        {children}
      </div>
      {visible && (
        <div
          className={cn(
            'absolute z-50 w-72 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-lg mt-2',
            className
          )}
          style={{ top: '100%', left: 0 }}
        >
          {content}
        </div>
      )}
    </div>
  )
}

export { Popover }
