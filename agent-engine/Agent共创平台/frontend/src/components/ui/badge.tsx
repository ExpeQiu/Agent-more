'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        variant === 'default' && 'bg-[var(--accent-blue)] text-white',
        variant === 'secondary' && 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
        variant === 'outline' && 'border border-[var(--border-default)] text-[var(--text-secondary)]',
        variant === 'destructive' && 'bg-[var(--error)] text-white',
        className
      )}
      {...props}
    />
  )
}

export { Badge }
