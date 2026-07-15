'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listScenes, createScene, updateScene, deleteScene } from '@/lib/api';
import type { SceneDefinition, CreateSceneInput, UpdateSceneInput } from '@/types';
import { SceneForm } from '@/components/scene-form';
import { SceneList } from '@/components/scene-list';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/use-toast';

export default function ScenesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [scenes, setScenes] = useState<SceneDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneDefinition | null>(null);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const loadScenes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listScenes();
      setScenes(data);
    } catch (err) {
      toast({ title: '加载失败', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load on mount
  useEffect(() => {
    loadScenes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (input: CreateSceneInput) => {
    try {
      await createScene(input);
      toast({ title: '场景创建成功' });
      setShowForm(false);
      loadScenes();
    } catch (err) {
      toast({ title: '创建失败', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleUpdate = async (input: CreateSceneInput | (CreateSceneInput & { id: string })) => {
    try {
      await updateScene(input as UpdateSceneInput);
      toast({ title: '场景更新成功' });
      setEditingScene(null);
      loadScenes();
    } catch (err) {
      toast({ title: '更新失败', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该场景？')) return;
    try {
      await deleteScene(id);
      toast({ title: '删除成功' });
      loadScenes();
    } catch (err) {
      toast({ title: '删除失败', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleToggle = async (scene: SceneDefinition) => {
    try {
      await updateScene({ id: scene.id, enabled: !scene.enabled });
      loadScenes();
    } catch (err) {
      toast({ title: '更新失败', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const filteredScenes = scenes.filter((s) => {
    if (filter === 'enabled') return s.enabled;
    if (filter === 'disabled') return !s.enabled;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">场景管理</h1>
          <p className="text-sm text-muted-foreground">
            {scenes.length} 个场景 · 已启用 {scenes.filter((s) => s.enabled).length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadScenes()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建场景
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(['all', 'enabled', 'disabled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
              filter === f
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? '全部' : f === 'enabled' ? '已启用' : '已禁用'}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="border rounded-lg p-4 bg-card">
          <h2 className="text-sm font-medium mb-3">新建场景</h2>
          <SceneForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <SceneList
        scenes={filteredScenes}
        loading={loading}
        onEdit={setEditingScene}
        onDelete={handleDelete}
        onToggle={handleToggle}
      />

      {editingScene && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg w-full max-w-lg mx-4 p-4">
            <h2 className="text-sm font-medium mb-3">编辑场景 — {editingScene.name}</h2>
            <SceneForm
              initialData={editingScene}
              onSubmit={handleUpdate}
              onCancel={() => setEditingScene(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
