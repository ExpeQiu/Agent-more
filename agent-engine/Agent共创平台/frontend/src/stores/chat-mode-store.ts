/**
 * 聊天模式状态管理
 * 管理当前活跃模式、Compare 模式模型列表、投票状态
 */

import { create } from 'zustand'

export type ChatMode = 'single' | 'compare' | 'agent-discuss'

interface ChatModeState {
  mode: ChatMode
  // Compare mode
  compareModels: string[]
  compareVotes: Record<string, 'up' | 'down' | 'question'>
  // Agent mode
  selectedAgentIds: string[]

  // Actions
  setMode: (m: ChatMode) => void
  addCompareModel: (modelId: string) => void
  removeCompareModel: (modelId: string) => void
  vote: (messageId: string, vote: 'up' | 'down' | 'question') => void
  toggleAgent: (agentId: string) => void
  clearVotes: () => void
}

export const useChatModeStore = create<ChatModeState>()((set) => ({
  mode: 'single',
  compareModels: [],
  compareVotes: {},
  selectedAgentIds: [],

  setMode: (m) => set({ mode: m }),

  addCompareModel: (modelId) =>
    set(state => ({
      compareModels: state.compareModels.length < 4
        ? [...state.compareModels, modelId]
        : state.compareModels,
    })),

  removeCompareModel: (modelId) =>
    set(state => ({
      compareModels: state.compareModels.filter(id => id !== modelId),
    })),

  vote: (messageId, vote) =>
    set(state => ({
      compareVotes: { ...state.compareVotes, [messageId]: vote },
    })),

  toggleAgent: (agentId) =>
    set(state => ({
      selectedAgentIds: state.selectedAgentIds.includes(agentId)
        ? state.selectedAgentIds.filter(id => id !== agentId)
        : [...state.selectedAgentIds, agentId],
    })),

  clearVotes: () => set({ compareVotes: {} }),
}))
