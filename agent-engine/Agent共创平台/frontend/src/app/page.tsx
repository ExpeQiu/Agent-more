import Link from 'next/link'

const standaloneEntries = [
  {
    href: '/chat',
    title: '💬 AI 对话',
    description: '单模型对话，无需项目，直接开始聊天',
  },
  {
    href: '/compare',
    title: '⚖️ 模型对比',
    description: '多模型并行回答，对比效果差异',
  },
  {
    href: '/discuss',
    title: '🤖 Agent 讨论',
    description: '多个 Agent 同时思考，协作讨论',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-500">AI 共创平台</p>
          <h1 className="text-4xl font-bold">独立多模型对话工作站</h1>
          <p className="max-w-2xl text-gray-500">
            无需注册，无需项目 — 直接开始与多个 AI 模型对话、对比和协作讨论。
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-400">独立入口（无需项目）</p>
          <div className="grid gap-4 md:grid-cols-3">
            {standaloneEntries.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-5 transition hover:border-sky-500 hover:bg-sky-50"
              >
                <h2 className="text-lg font-semibold text-gray-900">{entry.title}</h2>
                <p className="mt-2 text-sm text-gray-500">{entry.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
