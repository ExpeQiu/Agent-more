'use client';

import { useState } from 'react';
import type { SceneDefinition, CreateSceneInput, SceneRule } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SceneFormProps {
  initialData?: SceneDefinition;
  onSubmit: (data: CreateSceneInput | (CreateSceneInput & { id: string })) => Promise<void>;
  onCancel: () => void;
}

const OPERATOR_OPTIONS = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等于' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: 'regex', label: '正则匹配' },
  { value: 'in', label: '在列表中' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
] as const;

const FIELD_OPTIONS = [
  { value: 'query', label: 'query (查询文本)' },
  { value: 'intent', label: 'intent (意图)' },
  { value: 'userType', label: 'userType (用户类型)' },
  { value: 'sessionId', label: 'sessionId (会话ID)' },
];

export function SceneForm({ initialData, onSubmit, onCancel }: SceneFormProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [triggerWords, setTriggerWords] = useState<string[]>(
    initialData?.triggerWords ?? []
  );
  const [newTrigger, setNewTrigger] = useState('');
  const [rules, setRules] = useState<SceneRule[]>(initialData?.rules ?? []);
  const [priority, setPriority] = useState<number>(initialData?.priority ?? 100);
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '场景名称必填';
    if (!description.trim()) errs.description = '场景描述必填';
    if (triggerWords.length === 0) errs.triggerWords = '至少需要一个触发词';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        triggerWords,
        rules,
        priority,
        enabled,
      };
      if (initialData) {
        await onSubmit({ ...data, id: initialData.id });
      } else {
        await onSubmit(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const addTrigger = () => {
    const t = newTrigger.trim();
    if (t && !triggerWords.includes(t)) {
      setTriggerWords([...triggerWords, t]);
      setNewTrigger('');
    }
  };

  const removeTrigger = (word: string) => {
    setTriggerWords(triggerWords.filter((w) => w !== word));
  };

  const addRule = () => {
    setRules([...rules, { field: 'query', operator: 'contains', value: '' }]);
  };

  const updateRule = (index: number, patch: Partial<SceneRule>) => {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">
            场景名称 <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：技术推广方案生成"
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">优先级</label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
            min={1}
            max={999}
          />
          <p className="text-xs text-muted-foreground mt-1">数字越小优先级越高</p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">
          场景描述 <span className="text-destructive">*</span>
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="详细描述此场景的用途和行为..."
          rows={3}
          className={errors.description ? 'border-destructive' : ''}
        />
        {errors.description && <p className="text-xs text-destructive mt-1">{errors.description}</p>}
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">
          触发词 <span className="text-destructive">*</span>
        </label>
        <div className="flex gap-2 mb-2">
          <Input
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTrigger();
              }
            }}
            placeholder="输入触发词后回车"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTrigger}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {triggerWords.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-xs"
            >
              {word}
              <button
                type="button"
                onClick={() => removeTrigger(word)}
                className="hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {errors.triggerWords && <p className="text-xs text-destructive mt-1">{errors.triggerWords}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">路由规则</label>
          <Button type="button" variant="ghost" size="sm" onClick={addRule}>
            <Plus className="h-3 w-3 mr-1" />
            添加规则
          </Button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">暂无规则（可选）</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(i, { field: e.target.value })}
                  className="text-sm border rounded px-1.5 py-1 bg-background"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <select
                  value={rule.operator}
                  onChange={(e) =>
                    updateRule(i, {
                      operator: e.target.value as SceneRule['operator'],
                    })
                  }
                  className="text-sm border rounded px-1.5 py-1 bg-background"
                >
                  {OPERATOR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Input
                  value={String(rule.value)}
                  onChange={(e) => updateRule(i, { value: e.target.value })}
                  placeholder="匹配值"
                  className="flex-1 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRule(i)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="scene-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="scene-enabled" className="text-sm">启用此场景</label>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? '保存中...' : initialData ? '保存修改' : '创建场景'}
        </Button>
      </div>
    </form>
  );
}
