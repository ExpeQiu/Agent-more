// API Client — Direct REST/SSE client for Agent编排引擎 backend
// Used alongside tRPC for SSE streaming

import type {
  SceneDefinition,
  CreateSceneInput,
  UpdateSceneInput,
  Execution,
  SSEEvent,
  HealthStatus,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Generic Fetch Wrapper ───────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/api/health');
}

// ─── Scenes ─────────────────────────────────────────────────────────────────

export async function listScenes(): Promise<SceneDefinition[]> {
  return apiFetch<SceneDefinition[]>('/api/scenes');
}

export async function getScene(id: string): Promise<SceneDefinition> {
  return apiFetch<SceneDefinition>(`/api/scenes/${id}`);
}

export async function createScene(input: CreateSceneInput): Promise<SceneDefinition> {
  return apiFetch<SceneDefinition>('/api/scenes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateScene(input: UpdateSceneInput): Promise<SceneDefinition> {
  return apiFetch<SceneDefinition>(`/api/scenes/${input.id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteScene(id: string): Promise<void> {
  await apiFetch(`/api/scenes/${id}`, { method: 'DELETE' });
}

// ─── Executions ──────────────────────────────────────────────────────────────

export async function createExecution(
  task: string,
  sceneId?: string
): Promise<{ executionId: string }> {
  return apiFetch<{ executionId: string }>('/api/executions', {
    method: 'POST',
    body: JSON.stringify({ task, sceneId }),
  });
}

export async function getExecution(id: string): Promise<Execution> {
  return apiFetch<Execution>(`/api/executions/${id}`);
}

export async function listExecutions(
  limit = 20,
  offset = 0
): Promise<{ items: Execution[]; total: number }> {
  return apiFetch<{ items: Execution[]; total: number }>(
    `/api/executions?limit=${limit}&offset=${offset}`
  );
}

/**
 * Connect to SSE stream for real-time execution updates
 * @param executionId - The execution ID to stream
 * @param onMessage - Callback for each SSE event
 * @param onError - Callback on connection error
 * @returns cleanup function
 */
export function streamExecution(
  executionId: string,
  onMessage: (event: SSEEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(
    `${API_BASE}/api/executions/${executionId}/stream`
  );

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SSEEvent;
      onMessage(data);
      if (data.type === 'execution_completed' || data.type === 'execution_failed') {
        eventSource.close();
      }
    } catch (err) {
      onError?.(err as Error);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onError?.(new Error('SSE connection error'));
  };

  return () => eventSource.close();
}
