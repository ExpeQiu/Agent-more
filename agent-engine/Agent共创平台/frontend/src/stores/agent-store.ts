/**
 * Agent 角色状态管理
 * 管理 Agent 讨论线程消息、流式输出状态
 */

import { create } from 'zustand'

export interface AgentThreadMessage {
  id: string
  agentId: string
  agentName: string
  agentIcon?: string
  content: string
  timestamp: number
  isStreaming?: boolean
  error?: string
}

interface AgentState {
  // Agent 讨论线程消息
  agentThread: AgentThreadMessage[]
  streamingAgents: Set<string>

  // Actions
  addUserMessage: (content: string) => void
  addAgentMessage: (agentId: string, agentName: string, content: string, agentIcon?: string) => void
  updateAgentMessage: (id: string, content: string) => void
  updateAgentError: (id: string, error: string) => void
  setStreaming: (agentId: string, streaming: boolean) => void
  clearThread: () => void
}

export const useAgentStore = create<AgentState>()((set) => ({
  agentThread: [],
  streamingAgents: new Set(),

  addUserMessage: (content) =>
    set(state => ({
      agentThread: [
        ...state.agentThread,
        {
          id: crypto.randomUUID(),
          agentId: 'user',
          agentName: 'User',
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  addAgentMessage: (agentId, agentName, content, agentIcon) =>
    set(state => ({
      agentThread: [
        ...state.agentThread,
        {
          id: crypto.randomUUID(),
          agentId,
          agentName,
          agentIcon,
          content,
          timestamp: Date.now(),
          isStreaming: true,
        },
      ],
    })),

  updateAgentMessage: (id, content) =>
    set(state => ({
      agentThread: state.agentThread.map(msg =>
        msg.id === id ? { ...msg, content, isStreaming: false } : msg
      ),
    })),

  updateAgentError: (id, error) =>
    set(state => ({
      agentThread: state.agentThread.map(msg =>
        msg.id === id ? { ...msg, error, isStreaming: false } : msg
      ),
    })),

  setStreaming: (agentId, streaming) =>
    set(state => {
      const newSet = new Set(state.streamingAgents)
      if (streaming) {
        newSet.add(agentId)
      } else {
        newSet.delete(agentId)
      }
      return { streamingAgents: newSet }
    }),

  clearThread: () => set({ agentThread: [], streamingAgents: new Set() }),
}))
