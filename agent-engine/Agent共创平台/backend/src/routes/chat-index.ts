/**
 * 后端路由注册指南
 * 
 * 将以下路由添加到 Cocreator backend/src/index.ts 中：
 * 
 * import chatRouter from './routes/chat'
 * import chatSessionsRouter from './routes/chat-sessions'
 * 
 * // Express 示例：
 * app.use('/api/v1/chat', chatRouter)
 * app.use('/api/v1/chat', chatSessionsRouter)
 */

/**
 * 示例修改片段：
 * 
 * // 在 backend/src/index.ts 中找到现有的路由注册部分
 * 
 * import chatRouter from './routes/chat'
 * import chatSessionsRouter from './routes/chat-sessions'
 * 
 * // 添加 chat 路由（在现有中间件之后）
 * app.use('/api/v1/chat', chatRouter)
 * app.use('/api/v1/chat', chatSessionsRouter)
 */

// ── 需要添加的环境变量 ─────────────────────────────────────────────────────
//
// # 新增 .env.local 或 .env 中添加：
//
// # 现有 Cocreator
// DATABASE_URL=
// JWT_SECRET=
//
// # Google Gemini
// GOOGLE_API_KEY=
//
// # 阿里 DashScope (Qwen)
// DASHSCOPE_API_KEY=
//
// # 智谱 GLM
// GLM_API_KEY=
//
// # MiniMax
// MINIMAX_API_KEY=
// MINIMAX_GROUP_ID=
//
// # Ollama (本地)
// OLLAMA_BASE_URL=http://localhost:11434
// OLLAMA_API_KEY=

// ── Phase 3: Discussion Routes ─────────────────────────────────────────────────────
// 在 backend/src/index.ts 中添加：
//
// import discussionsRouter from './routes/discussions'
// import discussionParticipantsRouter from './routes/discussion-participants'
//
// app.use('/api/v1/discussions', discussionsRouter)
// app.use('/api/v1/discussions', discussionParticipantsRouter)

export {}
