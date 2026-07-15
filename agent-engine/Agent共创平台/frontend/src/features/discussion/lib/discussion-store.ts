/**
 * Discussion Store — Zustand State Management
 * Phase 3: Multi-Agent Discussion Module
 */

import { create } from 'zustand'
import type {
  DiscussionSession,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionStatus,
  SSEEvent,
  VoteResultSummary,
} from './discussion-service'
import { discussionService, createDiscussionEventSource } from './discussion-service'

interface DiscussionStore {
  // ── State ──────────────────────────────────────────────────────────────────
  discussions: DiscussionSession[]
  currentDiscussion: DiscussionSession | null
  messages: DiscussionMessage[]
  status: DiscussionStatus | null
  isRunning: boolean
  isPaused: boolean
  isLoading: boolean
  error: string | null

  // SSE
  eventSource: EventSource | null
  cleanupSSE: (() => void) | null

  // Phase 4: Extended state
  consensusProgress: number
  voteResults: VoteResultSummary | null
  debateStage: string | null
  adjudicationReport: any | null

  // ── Actions ────────────────────────────────────────────────────────────────
  loadDiscussions: (projectId: string) => Promise<void>
  loadDiscussion: (discussionId: string) => Promise<void>
  createDiscussion: (payload: Parameters<typeof discussionService.create>[0]) => Promise<DiscussionSession>
  deleteDiscussion: (discussionId: string) => Promise<void>

  startDiscussion: (discussionId: string) => void
  stopDiscussion: (discussionId: string) => Promise<void>
  pauseDiscussion: (discussionId: string) => Promise<void>

  loadMessages: (discussionId: string) => Promise<void>
  addManualMessage: (discussionId: string, content: string, agentName?: string) => Promise<void>

  loadStatus: (discussionId: string) => Promise<void>

  // SSE handlers
  handleSSEEvent: (event: SSEEvent) => void

  cleanup: () => void
}

export const useDiscussionStore = create<DiscussionStore>((set, get) => ({
  // ── Initial State ─────────────────────────────────────────────────────────
  discussions: [],
  currentDiscussion: null,
  messages: [],
  status: null,
  isRunning: false,
  isPaused: false,
  isLoading: false,
  error: null,
  eventSource: null,
  cleanupSSE: null,
  consensusProgress: 0,
  voteResults: null,
  debateStage: null,
  adjudicationReport: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  loadDiscussions: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await discussionService.list(projectId)
      set({ discussions: data.discussions || [], isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  loadDiscussion: async (discussionId: string) => {
    set({ isLoading: true, error: null })
    try {
      const { discussion } = await discussionService.get(discussionId)
      const status = await discussionService.getStatus(discussionId)
      set({
        currentDiscussion: discussion,
        status,
        isRunning: status.isRunning,
        isPaused: status.isPaused,
        isLoading: false,
      })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  createDiscussion: async (payload) => {
    set({ isLoading: true, error: null })
    try {
      const { discussion } = await discussionService.create(payload)
      set(state => ({
        discussions: [discussion, ...state.discussions],
        currentDiscussion: discussion,
        isLoading: false,
      }))
      return discussion
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
      throw err
    }
  },

  deleteDiscussion: async (discussionId: string) => {
    try {
      await discussionService.delete(discussionId)
      set(state => ({
        discussions: state.discussions.filter(d => d.id !== discussionId),
        currentDiscussion: state.currentDiscussion?.id === discussionId ? null : state.currentDiscussion,
      }))
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  startDiscussion: (discussionId: string) => {
    // Clean up any existing SSE connection
    get().cleanup()

    set({ isRunning: true, isPaused: false, error: null, messages: [] })

    const { eventSource, cleanup } = createDiscussionEventSource(discussionId, {
      onOpen: () => {
        set({ isRunning: true })
      },
      onEvent: (event) => {
        get().handleSSEEvent(event)
      },
      onError: (e) => {
        console.error('[DiscussionStore] SSE error', e)
        set({ isRunning: false, error: 'SSE connection error' })
      },
      onDone: () => {
        set({ isRunning: false })
      },
    })

    set({ eventSource, cleanupSSE: cleanup })
  },

  stopDiscussion: async (discussionId: string) => {
    try {
      await discussionService.stop(discussionId)
      get().cleanup()
      set({ isRunning: false, isPaused: false })
      // Reload status
      await get().loadStatus(discussionId)
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  pauseDiscussion: async (discussionId: string) => {
    try {
      await discussionService.pause(discussionId)
      set({ isPaused: true })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  loadMessages: async (discussionId: string) => {
    try {
      const { messages } = await discussionService.getMessages(discussionId)
      set({ messages })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  addManualMessage: async (discussionId: string, content: string, agentName = '主持人') => {
    try {
      const { message } = await discussionService.addMessage(discussionId, {
        agentId: 'manual',
        agentName,
        content,
        role: 'moderator',
        roundIndex: get().status?.currentRound || 1,
        turnIndex: 0,
      })
      set(state => ({ messages: [...state.messages, message] }))
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  loadStatus: async (discussionId: string) => {
    try {
      const status = await discussionService.getStatus(discussionId)
      set({
        status,
        isRunning: status.isRunning,
        isPaused: status.isPaused,
      })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  handleSSEEvent: (event: SSEEvent) => {
    const { messages, currentDiscussion } = get()

    switch (event.type) {
      case 'discussion_start':
        set({ isRunning: true, isPaused: false, messages: [] })
        break

      case 'message_delta': {
        if (!event.participantId || !event.content) break

        const existingIdx = messages.findIndex(
          m => m.participantId === event.participantId &&
               m.roundIndex === event.roundIndex &&
               m.turnIndex === event.turnIndex &&
               m.isStreaming
        )

        if (existingIdx >= 0) {
          // Append to streaming message
          const updated = [...messages]
          updated[existingIdx] = {
            ...updated[existingIdx],
            content: updated[existingIdx].content + (event.content || ''),
          }
          set({ messages: updated })
        } else {
          // New streaming message
          const newMsg: DiscussionMessage = {
            id: `streaming-${event.participantId}-${event.roundIndex}-${event.turnIndex}`,
            discussionId: event.discussionId,
            participantId: event.participantId,
            agentId: event.agentId || '',
            agentName: event.agentName || '...',
            roundIndex: event.roundIndex || 1,
            turnIndex: event.turnIndex || 1,
            content: event.content || '',
            role: 'participant',
            isStreaming: true,
            createdAt: new Date(event.timestamp).toISOString(),
          }
          set({ messages: [...messages, newMsg] })
        }
        break
      }

      case 'message_done': {
        // Replace streaming message with final one
        const filtered = messages.filter(
          m => !(m.participantId === event.participantId &&
                 m.roundIndex === event.roundIndex &&
                 m.turnIndex === event.turnIndex &&
                 m.isStreaming)
        )

        const finalMsg: DiscussionMessage = {
          id: `msg-${event.participantId}-${event.roundIndex}-${event.turnIndex}`,
          discussionId: event.discussionId,
          participantId: event.participantId || '',
          agentId: event.agentId || '',
          agentName: event.agentName || '',
          roundIndex: event.roundIndex || 1,
          turnIndex: event.turnIndex || 1,
          content: event.content || '',
          role: 'participant',
          isStreaming: false,
          createdAt: new Date(event.timestamp).toISOString(),
        }

        set({ messages: [...filtered, finalMsg] })
        break
      }

      case 'discussion_done':
        set({
          isRunning: false,
          status: get().status ? { ...get().status!, status: 'COMPLETED' } : null,
        })
        break

      case 'discussion_error':
        set({ isRunning: false, error: event.error || 'Discussion error' })
        break

      case 'discussion_paused':
        set({ isPaused: true })
        break

      case 'status_update':
        if (event.status) {
          set(state => ({
            status: state.status ? { ...state.status, status: event.status as any } : null,
          }))
        }
        break

      // Phase 4: New event types
      case 'consensus_progress':
      case 'CONSENSUS_PROGRESS':
        set({ consensusProgress: event.consensusProgress || 0 })
        break

      case 'CONSENSUS_REACHED':
        set({
          consensusProgress: 1,
          status: get().status ? { ...get().status!, status: 'COMPLETED' } : null,
        })
        break

      case 'MODERATOR_MESSAGE':
        // Handle moderator messages - add as system message
        if (event.content) {
          const modMsg: DiscussionMessage = {
            id: `mod-${event.timestamp}`,
            discussionId: event.discussionId,
            participantId: 'moderator',
            agentId: 'moderator',
            agentName: '主持人',
            roundIndex: event.roundIndex || 1,
            turnIndex: event.turnIndex || 0,
            content: event.content,
            role: 'moderator',
            isStreaming: false,
            createdAt: new Date(event.timestamp).toISOString(),
          }
          set(state => ({ messages: [...state.messages, modMsg] }))
        }
        break

      case 'REFLECTION_START':
        // Add reflection start indicator
        if (event.content) {
          const reflMsg: DiscussionMessage = {
            id: `refl-${event.timestamp}`,
            discussionId: event.discussionId,
            participantId: 'system',
            agentId: 'system',
            agentName: '系统',
            roundIndex: event.roundIndex || 1,
            turnIndex: 0,
            content: `【反思】${event.content}`,
            role: 'system',
            isStreaming: false,
            createdAt: new Date(event.timestamp).toISOString(),
          }
          set(state => ({ messages: [...state.messages, reflMsg] }))
        }
        break

      case 'DEBATE_STAGE_CHANGE':
        set({ debateStage: event.debateStage || null })
        break

      case 'ADJUDICATION_COMPLETE':
        set({ adjudicationReport: event.adjudicationReport || null })
        break

      case 'VOTE_STARTED':
        // Voting started - could trigger UI update
        break

      case 'VOTE_RESULTS':
        set({ voteResults: event.voteResults || null })
        break

      default:
        break
    }
  },

  cleanup: () => {
    const { cleanupSSE } = get()
    if (cleanupSSE) {
      cleanupSSE()
      set({ eventSource: null, cleanupSSE: null })
    }
  },
}))
