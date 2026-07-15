'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createExecution, streamExecution, listScenes } from '@/lib/api';
import type { SSEEvent, ExecutionStatus, SceneDefinition } from '@/types';
import { formatDate, formatDuration } from '@/lib/utils';
import { Play, Square, Loader2, CheckCircle2, XCircle, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentProgress {
  agentId: string;
  agentName: string;
  agentType: string;
  status: ExecutionStatus;
  output?: string;
  qualityScore?: number;
  durationMs?: number;
  error?: string;
}

export default function ExecutePage() {
  const router = useRouter();
  const [task, setTask] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [scenes, setScenes] = useState<SceneDefinition[]>([]);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentProgress>>({});
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  const handleExecute = useCallback(async () => {
    if (!task.trim()) return;
    if (running) return;

    setRunning(true);
    setError(null);
    setAgents({});
    setEvents([]);
    setExecutionId(null);

    try {
      const res = await createExecution(task.trim(), sceneId || undefined);
      const execId = res.executionId;
      setExecutionId(execId);
      setStartedAt(new Date().toISOString());

      cleanupRef.current = streamExecution(
        execId,
        (event: SSEEvent) => {
          setEvents((prev) => [...prev, event]);

          if (event.type === 'execution_completed') {
            setRunning(false);
            cleanupRef.current = null;
          } else if (event.type === 'execution_failed') {
            setRunning(false);
            setError((event.data?.error as string) ?? 'Execution failed');
            cleanupRef.current = null;
          } else if (event.type === 'agent_completed' || event.type === 'agent_progress') {
            const agentData = event.data as unknown as AgentProgress & { output?: string };
            setAgents((prev) => ({
              ...prev,
              [event.agentId!]: {
                agentId: event.agentId!,
                agentName: event.agentName!,
                agentType: event.agentType!,
                status: event.type === 'agent_completed' ? 'completed' : 'running',
                output: agentData.output ?? prev[event.agentId!]?.output,
                qualityScore: agentData.qualityScore,
                durationMs: agentData.durationMs,
                error: agentData.error,
              },
            }));
          }
        },
        (err) => {
          setError(err.message);
          setRunning(false);
          cleanupRef.current = null;
        }
      );
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }, [task, sceneId, running]);

  const handleStop = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setRunning(false);
  };

  const completedCount = Object.values(agents).filter(
    (a) => a.status === 'completed' || a.status === 'failed'
  ).length;
  const totalAgents = Object.keys(agents).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agent 执行测试</h1>
        <p className="text-sm text-muted-foreground">
          输入技术描述 → 执行 → 实时查看 4 个专家Agent的协作输出
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input */}
        <div className="lg:col-span-1 space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">执行任务描述</label>
              <Textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="例如：为某车企设计一套新能源车技术推广方案，需要覆盖产品亮点提炼、竞品对比、技术传播策略..."
                rows={6}
                disabled={running}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium block">
                  场景（可选）
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    setSceneLoading(true);
                    try {
                      const data = await listScenes();
                      setScenes(data.filter((s) => s.enabled));
                    } catch {
                      // ignore
                    } finally {
                      setSceneLoading(false);
                    }
                  }}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                  disabled={sceneLoading || running}
                >
                  {sceneLoading ? '加载中...' : '刷新场景'}
                </button>
              </div>
              <select
                value={sceneId}
                onChange={(e) => setSceneId(e.target.value)}
                disabled={running}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">— 自动路由（留空）—</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（优先级 {s.priority ?? 100}）
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                指定场景可跳过路由决策
              </p>
            </div>

            <div className="flex gap-2">
              {!running ? (
                <Button onClick={handleExecute} disabled={!task.trim()} className="flex-1">
                  <Play className="h-4 w-4 mr-1" />
                  执行
                </Button>
              ) : (
                <Button onClick={handleStop} variant="destructive" className="flex-1">
                  <Square className="h-4 w-4 mr-1" />
                  停止
                </Button>
              )}
              {executionId && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/results/${executionId}`)}
                >
                  查看结果
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>

            {error && (
              <div className="p-3 rounded border border-destructive/50 bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {executionId && (
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">执行ID: {executionId}</span>
                {startedAt && (
                  <span className="ml-2">开始于 {formatDate(startedAt)}</span>
                )}
              </div>
            )}
          </div>

          {/* Progress summary */}
          {running && totalAgents > 0 && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">执行进度</span>
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{totalAgents} 完成
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${(completedCount / totalAgents) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: Agent outputs */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">专家 Agent 输出</h2>
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                执行中
              </span>
            )}
          </div>

          {Object.keys(agents).length === 0 && !running && (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">输入任务描述后点击"执行"</p>
              <p className="text-xs mt-1">系统将路由到匹配场景并启动4个专家Agent协作</p>
            </div>
          )}

          <div className="space-y-3">
            {Object.values(agents).map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))}
          </div>

          {/* Event log */}
          {events.length > 0 && (
            <details className="border rounded-lg">
              <summary className="px-4 py-2 text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                事件日志 ({events.length} 条)
              </summary>
              <div
                ref={eventLogRef}
                className="border-t px-4 py-2 max-h-48 overflow-y-auto text-xs font-mono space-y-1"
              >
                {events.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={cn(
                      'shrink-0',
                      e.type === 'agent_completed' ? 'text-green-600' :
                      e.type === 'execution_failed' ? 'text-red-600' :
                      e.type === 'execution_completed' ? 'text-blue-600' : 'text-muted-foreground'
                    )}>
                      [{e.type}]
                    </span>
                    <span className="text-foreground break-all">
                      {e.agentName && `[${e.agentName}]`} {JSON.stringify(e.data ?? {})}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentProgress }) {
  return (
    <div className={cn(
      'border rounded-lg overflow-hidden transition-all',
      agent.status === 'running' && 'border-primary/50 bg-primary/5',
      agent.status === 'completed' && 'border-green-500/30 bg-green-500/5',
      agent.status === 'failed' && 'border-destructive/30 bg-destructive/5',
    )}>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50">
        <div className="flex items-center gap-2">
          {agent.status === 'running' && (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          )}
          {agent.status === 'completed' && (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
          {agent.status === 'failed' && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          {agent.status === 'pending' && (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{agent.agentName}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {agent.agentType}
          </span>
        </div>
        <div className="flex items-center gap-3 ml-auto text-xs">
          {agent.qualityScore !== undefined && (
            <span className={cn(
              'font-medium',
              agent.qualityScore >= 0.8 ? 'text-green-600' :
              agent.qualityScore >= 0.6 ? 'text-yellow-600' : 'text-red-600'
            )}>
              质量 {(agent.qualityScore * 100).toFixed(0)}%
            </span>
          )}
          {agent.durationMs !== undefined && (
            <span className="text-muted-foreground">
              {formatDuration(agent.durationMs)}
            </span>
          )}
        </div>
      </div>
      {agent.output && (
        <div className="px-4 py-3 text-sm font-mono whitespace-pre-wrap bg-background max-h-48 overflow-y-auto">
          {agent.output}
        </div>
      )}
      {agent.error && (
        <div className="px-4 py-2 text-sm text-destructive bg-destructive/10">
          {agent.error}
        </div>
      )}
    </div>
  );
}
