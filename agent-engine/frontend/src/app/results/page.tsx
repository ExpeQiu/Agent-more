'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { listExecutions } from '@/lib/api';
import type { Execution } from '@/types';
import { formatDate, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw, Play, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResultsPage() {
  const router = useRouter();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExecutions(50, 0);
      setExecutions(data.items);
      setTotal(data.total);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">执行记录</h1>
          <p className="text-sm text-muted-foreground">共 {total} 条执行记录</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {executions.length === 0 && !loading ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>暂无执行记录</p>
          <Button className="mt-4" onClick={() => router.push('/execute')}>
            去执行
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  执行ID
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  任务摘要
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  状态
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  场景
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  耗时
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  开始时间
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {executions.map((exec) => (
                <tr key={exec.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs">{exec.id.slice(0, 16)}...</span>
                  </td>
                  <td className="px-4 py-2.5 max-w-xs">
                    <p className="truncate text-xs">{exec.task}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                      exec.status === 'completed' && 'bg-green-100 text-green-700',
                      exec.status === 'running' && 'bg-blue-100 text-blue-700',
                      exec.status === 'failed' && 'bg-red-100 text-red-700',
                      exec.status === 'pending' && 'bg-gray-100 text-gray-600',
                    )}>
                      {exec.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                      {exec.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {exec.status === 'failed' && <XCircle className="h-3 w-3" />}
                      {exec.status === 'pending' && <Clock className="h-3 w-3" />}
                      {exec.status === 'completed' && '已完成'}
                      {exec.status === 'running' && '运行中'}
                      {exec.status === 'failed' && '失败'}
                      {exec.status === 'pending' && '等待'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {exec.sceneName ?? '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {exec.durationMs ? formatDuration(exec.durationMs) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(exec.startedAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/results/${exec.id}`)}
                    >
                      查看
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
