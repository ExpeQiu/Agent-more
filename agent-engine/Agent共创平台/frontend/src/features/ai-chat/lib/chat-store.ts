/**
 * 聊天状态管理
 * 基于 muiltchat client/src/store/chat-store.ts，适配 Cocreator
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AVAILABLE_MODELS } from './models'
import { streamMultiModelChat, saveMessage, createSession, listSessions, deleteSession } from './chat-service'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string   // assistant 消息所属的模型
  timestamp: number
  error?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  modelIds: string[]        // 当前选中的模型 ID 列表
  type: 'single' | 'compare' | 'agent-discuss'
  projectId?: string
  createdAt: number
  updatedAt: number
}

interface ChatState {
  sessions: ChatSession[]
  currentSessionId: string | null
  isStreaming: boolean

  // Actions
  createSession: (projectId: string, type: 'single' | 'compare' | 'agent-discuss', modelIds?: string[]) => Promise<string>
  selectSession: (id: string) => void
  deleteSession: (id: string) => Promise<void>
  sendMessage: (content: string, projectId?: string) => Promise<void>
  updateSessionModels: (sessionId: string, modelIds: string[]) => void
  updateAssistantContent: (sessionId: string, messageId: string, content: string) => void
  addAssistantMessage: (sessionId: string, modelId: string, messageId: string) => void
  setAssistantError: (sessionId: string, messageId: string, error: string) => void
  loadSessions: (projectId: string) => Promise<void>
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      isStreaming: false,

      createSession: async (projectId, type, modelIds) => {
        const defaultModels = type === 'single'
          ? [AVAILABLE_MODELS[0].id]
          : type === 'compare'
            ? [AVAILABLE_MODELS[0].id, AVAILABLE_MODELS[1].id]
            : [AVAILABLE_MODELS[0].id]

        const resolvedModels = modelIds || defaultModels
        const title = '新对话'
        const id = crypto.randomUUID()

        const newSession: ChatSession = {
          id,
          title,
          messages: [],
          modelIds: resolvedModels,
          type,
          projectId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        set(state => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: id,
        }))

        // 保存到后端
        try {
          const remote = await createSession(projectId, title, type, resolvedModels)
          // 更新本地 session 的后端 ID（如果有不同的话）
          set(state => ({
            sessions: state.sessions.map(s =>
              s.id === id ? { ...s, id: remote.id } : s
            ),
            currentSessionId: state.currentSessionId === id ? remote.id : state.currentSessionId,
          }))
          return remote.id
        } catch {
          return id
        }
      },

      selectSession: (id) => set({ currentSessionId: id }),

      deleteSession: async (id) => {
        set(state => {
          const newSessions = state.sessions.filter(s => s.id !== id)
          return {
            sessions: newSessions,
            currentSessionId: state.currentSessionId === id
              ? (newSessions.length > 0 ? newSessions[0].id : null)
              : state.currentSessionId,
          }
        })
        try {
          await deleteSession(id)
        } catch {}
      },

      updateSessionModels: (sessionId, modelIds) => set(state => ({
        sessions: state.sessions.map(s =>
          s.id === sessionId ? { ...s, modelIds } : s
        )
      })),

      updateAssistantContent: (sessionId, messageId, content) => set(state => ({
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === messageId ? { ...m, content } : m
            ),
          }
        })
      })),

      addAssistantMessage: (sessionId, modelId, messageId) => set(state => ({
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s
          return {
            ...s,
            messages: [
              ...s.messages,
              {
                id: messageId,
                role: 'assistant' as const,
                content: '',
                modelId,
                timestamp: Date.now(),
              },
            ],
          }
        })
      })),

      setAssistantError: (sessionId, messageId, error) => set(state => ({
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === messageId ? { ...m, content: `\n\n[错误: ${error}]` } : m
            ),
          }
        })
      })),

      sendMessage: async (content, projectId) => {
        const { currentSessionId, sessions } = get()
        if (!currentSessionId) return

        const session = sessions.find(s => s.id === currentSessionId)
        if (!session) return

        const userMessageId = crypto.randomUUID()

        // 添加用户消息
        set(state => ({
          isStreaming: true,
          sessions: state.sessions.map(s => {
            if (s.id !== currentSessionId) return s
            return {
              ...s,
              messages: [
                ...s.messages,
                {
                  id: userMessageId,
                  role: 'user' as const,
                  content,
                  timestamp: Date.now(),
                },
              ],
              updatedAt: Date.now(),
              title: s.messages.length === 0 ? content.slice(0, 30) : s.title,
            }
          })
        }))

        // 保存用户消息到后端
        try {
          await saveMessage(session.id, 'user', content)
        } catch {}

        // 准备 assistant 消息占位符
        const assistantSlots = session.modelIds.map(modelId => ({
          modelId,
          messageId: crypto.randomUUID(),
        }))

        // 添加空的 assistant 消息占位符
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== currentSessionId) return s
            const newMessages = [...s.messages]
            assistantSlots.forEach(({ modelId, messageId }) => {
              newMessages.push({
                id: messageId,
                role: 'assistant' as const,
                content: '',
                modelId,
                timestamp: Date.now(),
              })
            })
            return { ...s, messages: newMessages }
          })
        }))

        // 构建历史消息
        const history = session.messages
          .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
          .map(m => ({ role: m.role, content: m.content }))

        const apiMessages = [...history, { role: 'user' as const, content }]

        // 并行流式调用所有模型
        const streamForModel = async (modelId: string, messageId: string) => {
          try {
            const stream = streamMultiModelChat(
              [modelId],
              apiMessages,
              projectId || session.projectId
            )

            for await (const chunk of stream) {
              if (chunk.error) {
                set(state => ({
                  sessions: state.sessions.map(s => {
                    if (s.id !== currentSessionId) return s
                    return {
                      ...s,
                      messages: s.messages.map(m =>
                        m.id === messageId
                          ? { ...m, content: m.content + `\n\n[错误: ${chunk.error}]` }
                          : m
                      ),
                    }
                  }),
                }))
                return
              }

              if (chunk.content !== undefined) {
                set(state => ({
                  sessions: state.sessions.map(s => {
                    if (s.id !== currentSessionId) return s
                    return {
                      ...s,
                      messages: s.messages.map(m =>
                        m.id === messageId ? { ...m, content: chunk.content || '' } : m
                      ),
                    }
                  }),
                }))
              }
            }

            // 流结束，保存到后端
            const finalSession = get().sessions.find(s => s.id === currentSessionId)
            const finalMessage = finalSession?.messages.find(m => m.id === messageId)
            if (finalMessage?.content) {
              try {
                await saveMessage(session.id, 'assistant', finalMessage.content, modelId)
              } catch {}
            }
          } catch (err: any) {
            const errMsg = err instanceof Error ? err.message : String(err)
            set(state => ({
              sessions: state.sessions.map(s => {
                if (s.id !== currentSessionId) return s
                return {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === messageId
                      ? { ...m, content: m.content + `\n\n[错误: ${errMsg}]` }
                      : m
                  ),
                }
              }),
            }))
          }
        }

        await Promise.allSettled(
          assistantSlots.map(({ modelId, messageId }) => streamForModel(modelId, messageId))
        )

        set({ isStreaming: false })
      },

      loadSessions: async (projectId) => {
        try {
          const remoteSessions = await listSessions(projectId, undefined)
          if (remoteSessions.length === 0) return

          // 合并远程会话到本地
          set(state => {
            const localIds = new Set(state.sessions.map(s => s.id))
            const newRemote = remoteSessions
              .filter((s: any) => !localIds.has(s.id))
              .map((s: any) => ({
                id: s.id,
                title: s.title || '对话',
                messages: (s.messages || []).map((m: any) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  modelId: m.modelId,
                  timestamp: new Date(m.createdAt).getTime(),
                })),
                modelIds: s.modelIds || [AVAILABLE_MODELS[0].id],
                type: s.chatType || s.type || (s.variables ? JSON.parse(s.variables).chatType || 'single' : 'single'),
                projectId,
                createdAt: new Date(s.createdAt).getTime(),
                updatedAt: new Date(s.updatedAt).getTime(),
              }))

            return {
              sessions: [...newRemote, ...state.sessions],
            }
          })
        } catch {}
      },
    }),
    {
      name: 'ai-chat-storage',
    }
  )
)
