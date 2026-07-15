'use client';

import type { SceneDefinition } from '@/types';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Power, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface SceneListProps {
  scenes: SceneDefinition[];
  loading: boolean;
  onEdit: (scene: SceneDefinition) => void;
  onDelete: (id: string) => void;
  onToggle: (scene: SceneDefinition) => void;
}

export function SceneList({ scenes, loading, onEdit, onDelete, onToggle }: SceneListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && scenes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>加载中...</p>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">暂无场景</p>
        <p className="text-xs text-muted-foreground mt-1">点击右上角"新建场景"开始</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scenes.map((scene) => {
        const isExpanded = expanded.has(scene.id);
        return (
          <div
            key={scene.id}
            className={cn(
              'border rounded-lg transition-colors',
              scene.enabled ? 'bg-card' : 'bg-muted/30 opacity-75'
            )}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div
                className={cn(
                  'h-2 w-2 rounded-full flex-shrink-0',
                  scene.enabled ? 'bg-green-500' : 'bg-gray-300'
                )}
              />
              <button
                onClick={() => toggle(scene.id)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{scene.name}</span>
                  {scene.priority !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      优先级 {scene.priority}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {scene.description}
                </p>
              </button>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onToggle(scene)}
                  title={scene.enabled ? '禁用' : '启用'}
                >
                  <Power className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(scene)}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(scene.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
                <Button type="button" variant="ghost" size="icon">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-3 pt-1 border-t text-xs space-y-2">
                <div className="flex gap-4 mt-2">
                  <div>
                    <span className="text-muted-foreground">触发词：</span>
                    <span className="font-mono">
                      {scene.triggerWords.join(', ') || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">规则数：</span>
                    <span>{scene.rules.length}</span>
                  </div>
                  {scene.updatedAt && (
                    <div>
                      <span className="text-muted-foreground">更新时间：</span>
                      <span>{formatDate(scene.updatedAt)}</span>
                    </div>
                  )}
                </div>
                {scene.rules.length > 0 && (
                  <div className="bg-muted/50 rounded p-2 font-mono text-muted-foreground">
                    {scene.rules.map((r, i) => (
                      <div key={i}>
                        {r.field} {r.operator} {String(r.value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
