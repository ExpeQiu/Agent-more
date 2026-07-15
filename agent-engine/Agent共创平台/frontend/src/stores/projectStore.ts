import { create } from 'zustand'

export interface ProjectRecord {
  id: string
  name?: string
  description?: string
  status?: string
  createdAt?: string | Date
  updatedAt?: string | Date
  createdById?: string
  memberCount?: number
  [key: string]: unknown
}

interface ProjectState {
  currentProject: ProjectRecord | null
  setCurrentProject: (project: ProjectRecord | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
}))
