'use client';

import { useEffect, useState } from 'react';
import { getHealth } from '@/lib/api';
import type { HealthStatus } from '@/types';

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-md mx-auto py-12 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">系统健康检查</h1>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">检查中...</div>
      ) : health ? (
        <div className="border rounded-lg divide-y">
          {[
            { label: '整体状态', key: 'ok', value: health.ok },
            { label: 'Redis', key: 'redis', value: health.redis },
            { label: 'PostgreSQL', key: 'database', value: health.database },
          ].map(({ label, key, value }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">{label}</span>
              <span
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  value ? 'text-green-600' : 'text-red-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${value ? 'bg-green-500' : 'bg-red-500'}`}
                />
                {value ? '正常' : '异常'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg p-6 text-center text-destructive">
          无法连接到后端服务
        </div>
      )}
    </div>
  );
}
