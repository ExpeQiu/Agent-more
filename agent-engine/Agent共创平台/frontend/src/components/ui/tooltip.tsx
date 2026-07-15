'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-50 px-2 py-1 text-xs rounded-md bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-md whitespace-nowrap',
            side === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-1',
            side === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-1',
            side === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-1',
            side === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-1',
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}

export { Tooltip }
