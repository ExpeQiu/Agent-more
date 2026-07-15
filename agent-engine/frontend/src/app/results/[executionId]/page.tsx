'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getExecution, streamExecution } from '@/lib/api';
import type { Execution, AgentExecutionResult, SSEEvent } from '@/types';
import { formatDate, formatDuration, formatScore, scoreColor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  User,
  Bug,
  ChartBar,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AGENT_ICONS: Record<string, React.ReactNode> = {
  coder: <Cpu className="h-4 w-4" />,
  pm: <User className="h-4 w-4" />,
  qa: <Bug className="h-4 w-4" />,
  pmo: <ChartBar className="h-4 w-4" />,
};

const AGENT_LABELS: Record<string, string> = {
  coder: 'Coder 编码专家',
  pm: 'PM 产品经理',
  qa: 'QA 测试专家',
  pmo: 'PMO 项目管理',
};

export default function ExecutionResultPage() {
  const params = useParams();
  const router = useRouter();
  const executionId = params.executionId as string;

  const [execution, setExecution] = useState<Execution | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentExecutionResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<SSEEvent[]>([]);

  const loadExecution = useCallback(async () => {
    try {
      const data = await getExecution(executionId);
      setExecution(data);
      if (data.result?.agents) {
        const agentMap: Record<string, AgentExecutionResult> = {};
        data.result.agents.forEach((a) => {
          agentMap[a.agentId] = a;
        });
        setAgents(agentMap);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    loadExecution();
  }, [loadExecution]);

  // Subscribe to live updates if execution is still running
  useEffect(() => {
    if (execution?.status === 'running') {
      const cleanup = streamExecution(
        executionId,
        (event: SSEEvent) => {
          setLiveEvents((prev) => [...prev, event]);
          if (event.type === 'agent_completed' || event.type === 'agent_progress') {
            const data = event.data as unknown as AgentExecutionResult & { output?: string };
            setAgents((prev) => ({
              ...prev,
              [event.agentId!]: {
                agentId: event.agentId!,
                agentName: event.agentName!,
                agentType: event.agentType!,
                status: event.type === 'agent_completed' ? 'completed' : 'running',
                output: data.output ?? prev[event.agentId!]?.output,
                qualityScore: data.qualityScore,
                durationMs: data.durationMs,
                error: data.error,
              },
            }));
          } else if (event.type === 'execution_completed') {
            loadExecution();
          }
        },
        () => {}
      );
      return cleanup;
    }
  }, [execution?.status, executionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/execute')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回执行页
        </Button>
        <div className="border rounded-lg p-6 text-center">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <p className="text-destructive font-medium">加载失败</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <Button className="mt-3" onClick={loadExecution}>
            <RefreshCw className="h-4 w-4 mr-1" />
            重试
          </Button>
        </div>
      </div>
    );
  }

  const agentList = Object.values(agents);
  const totalDuration = execution?.durationMs ?? execution?.result?.totalDurationMs;
  const isRunning = execution?.status === 'running';

  // Radar chart data for quality scores
  const radarData = agentList
    .filter((a) => a.qualityScore !== undefined)
    .map((a) => ({
      agent: AGENT_LABELS[a.agentType] ?? a.agentType,
      score: Math.round((a.qualityScore ?? 0) * 100),
      fullMark: 100,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/execute')} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回执行页
          </Button>
          <h1 className="text-2xl font-semibold">执行结果</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{executionId}</span>
            <span>·</span>
            <span>{formatDate(execution?.startedAt ?? new Date().toISOString())}</span>
            {totalDuration && (
              <>
                <span>·</span>
                <span>{formatDuration(totalDuration)}</span>
              </>
            )}
            {isRunning && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  运行中
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
            execution?.status === 'completed' && 'bg-green-100 text-green-700',
            execution?.status === 'running' && 'bg-blue-100 text-blue-700',
            execution?.status === 'failed' && 'bg-red-100 text-red-700',
            execution?.status === 'pending' && 'bg-gray-100 text-gray-600',
          )}>
            {execution?.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}
            {execution?.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
            {execution?.status === 'failed' && <XCircle className="h-4 w-4" />}
            {execution?.status === 'pending' && <Clock className="h-4 w-4" />}
            {execution?.status === 'completed' && '已完成'}
            {execution?.status === 'running' && '运行中'}
            {execution?.status === 'failed' && '失败'}
            {execution?.status === 'pending' && '等待中'}
          </span>
          <Button variant="outline" size="sm" onClick={loadExecution}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Task summary */}
      {execution?.task && (
        <div className="border rounded-lg p-4 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">执行任务</p>
          <p className="text-sm font-mono">{execution.task}</p>
        </div>
      )}

      {/* Execution timeline */}
      <div className="border rounded-lg p-4">
        <h2 className="text-sm font-medium mb-4">执行时间线</h2>
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-3">
            <TimelineItem
              time={execution?.startedAt}
              label="任务开始"
              icon={<Play className="h-3 w-3" />}
              color="text-blue-600"
            />
            {(() => {
              let cumulativeMs = 0;
              return agentList.map((agent, i) => {
                const startMs = cumulativeMs;
                cumulativeMs += agent.durationMs ?? 0;
                const time = agent.durationMs !== undefined
                  ? new Date(
                      new Date(execution?.startedAt ?? Date.now()).getTime() + startMs
                    ).toISOString()
                  : undefined;
                return (
                  <TimelineItem
                    key={agent.agentId}
                    time={i === 0 ? execution?.startedAt : time}
                    label={`${agent.agentName} ${agent.status === 'completed' ? '完成' : agent.status === 'failed' ? '失败' : '进行中'}`}
                    icon={AGENT_ICONS[agent.agentType] ?? <User className="h-3 w-3" />}
                    color={
                      agent.status === 'completed'
                        ? 'text-green-600'
                        : agent.status === 'failed'
                        ? 'text-red-600'
                        : 'text-blue-600'
                    }
                    sub={
                      agent.qualityScore !== undefined
                        ? `质量分 ${formatScore(agent.qualityScore)}`
                        : undefined
                    }
                  />
                );
              });
            })()}
            {execution?.endedAt && (
              <TimelineItem
                time={execution.endedAt}
                label="任务结束"
                icon={
                  execution.status === 'completed' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )
                }
                color={execution.status === 'completed' ? 'text-green-600' : 'text-red-600'}
                sub={totalDuration ? `耗时 ${formatDuration(totalDuration)}` : undefined}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent outputs */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-medium">专家 Agent 输出</h2>
          {agentList.length === 0 && !isRunning && (
            <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
              暂无 Agent 输出
            </div>
          )}
          <div className="space-y-3">
            {agentList.map((agent) => (
              <AgentResultCard key={agent.agentId} agent={agent} />
            ))}
          </div>
        </div>

        {/* Quality scores */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium">质量评分</h2>

          {radarData.length > 0 && (
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-4 text-center">多维度质量雷达图</p>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="agent"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                  />
                  <Radar
                    name="质量分"
                    dataKey="score"
                    stroke="hsl(221.2 83.2% 53.3%)"
                    fill="hsl(221.2 83.2% 53.3%)"
                    fillOpacity={0.2}
                  />
                  <Tooltip formatter={(v: number) => [`${v}%`, '质量分']} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Score breakdown */}
          <div className="border rounded-lg divide-y">
            {agentList.map((agent) => (
              <div key={agent.agentId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  {AGENT_ICONS[agent.agentType]}
                  <span className="text-sm">{agent.agentName}</span>
                </div>
                {agent.qualityScore !== undefined ? (
                  <span className={cn('text-sm font-medium', scoreColor(agent.qualityScore))}>
                    {formatScore(agent.qualityScore)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
            ))}
          </div>

          {/* Overall stats */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium">执行统计</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Agent 数量</p>
                <p className="font-medium">{agentList.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">完成数量</p>
                <p className="font-medium">
                  {agentList.filter((a) => a.status === 'completed').length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">总耗时</p>
                <p className="font-medium">
                  {totalDuration ? formatDuration(totalDuration) : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">平均质量</p>
                <p className="font-medium">
                  {(() => {
                    const scores = agentList
                      .filter((a) => a.qualityScore !== undefined)
                      .map((a) => a.qualityScore!);
                    if (scores.length === 0) return '-';
                    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                    return formatScore(avg);
                  })()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  time,
  label,
  icon,
  color,
  sub,
}: {
  time?: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3 pl-6 relative">
      <div className={cn('absolute left-0 mt-0.5 flex items-center justify-center', color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {time && (
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(time).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      )}
    </div>
  );
}

function AgentResultCard({ agent }: { agent: AgentExecutionResult }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (agent.output?.length ?? 0) > 400;

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        agent.status === 'completed' && 'border-green-500/30',
        agent.status === 'failed' && 'border-destructive/30',
        agent.status === 'running' && 'border-primary/30'
      )}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {agent.status === 'running' && (
            <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
          )}
          {agent.status === 'completed' && (
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
          )}
          {agent.status === 'failed' && (
            <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          )}
          <span className="font-medium text-sm">{agent.agentName}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
            {AGENT_LABELS[agent.agentType] ?? agent.agentType}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {agent.qualityScore !== undefined && (
            <span className={cn('text-sm font-medium', scoreColor(agent.qualityScore))}>
              {formatScore(agent.qualityScore)}
            </span>
          )}
          {agent.durationMs !== undefined && (
            <span className="text-xs text-muted-foreground">
              {formatDuration(agent.durationMs)}
            </span>
          )}
        </div>
      </button>

      {expanded && agent.output && (
        <div className="border-t px-4 py-3">
          <pre className="text-sm font-mono whitespace-pre-wrap break-all text-muted-foreground">
            {isLong && !expanded ? agent.output.slice(0, 400) + '...' : agent.output}
          </pre>
          {isLong && (
            <button
              className="text-xs text-primary mt-2 hover:underline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起' : '展开全部'}
            </button>
          )}
        </div>
      )}

      {agent.error && (
        <div className="border-t px-4 py-2 text-sm text-destructive bg-destructive/5">
          {agent.error}
        </div>
      )}
    </div>
  );
}
