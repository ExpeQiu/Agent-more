'use client'

import { createContext, useContext } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value?: string
  onValueChange?: (value: string) => void
}

const TabsContext = createContext<TabsContextValue>({})

export function Tabs({ value, onValueChange, children }: PropsWithChildren<TabsContextValue>) {
  return <TabsContext.Provider value={{ value, onValueChange }}>{children}</TabsContext.Provider>
}

export function TabsList({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn('inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800', className)} {...props}>
      {children}
    </div>
  )
}

interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: PropsWithChildren<TabsTriggerProps>) {
  const context = useContext(TabsContext)
  const active = context.value === value

  return (
    <button
      type="button"
      className={cn(
        'rounded-lg px-3 py-2 text-sm transition',
        active
          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
        className,
      )}
      onClick={() => context.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  )
}
