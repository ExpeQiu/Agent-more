/**
 * App UI 状态管理
 * 管理 sidebar 折叠状态、主题等全局 UI 状态
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppUIState {
  sidebarCollapsed: boolean
  activeTheme: 'dark' | 'light'
  // Actions
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setTheme: (t: 'dark' | 'light') => void
}

export const useAppUIStore = create<AppUIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeTheme: 'dark',

      toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (t) => {
        set({ activeTheme: t })
        document.documentElement.setAttribute('data-theme', t)
      },
    }),
    {
      name: 'app-ui-store',
    }
  )
)
