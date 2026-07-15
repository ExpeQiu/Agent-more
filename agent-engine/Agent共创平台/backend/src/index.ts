import 'dotenv/config'
import cors from 'cors'
import express from 'express'

import agentSessionsRouter from './routes/agent-sessions'
import agentsRouter from './routes/agents'
import authRouter from './routes/auth'
import chatRouter from './routes/chat'
import chatSessionsRouter from './routes/chat-sessions'
import compareRouter from './routes/compare'
import discussionParticipantsRouter from './routes/discussion-participants'
import discussionVotesRouter from './routes/discussion-votes'
import discussionsRouter from './routes/discussions'

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'multi-chat-studio-backend' })
})

// Minimal standalone project endpoint for the frontend project shell.
app.get('/api/v1/projects/:id', (req, res) => {
  res.json({
    id: req.params.id,
    name: `Project ${req.params.id}`,
    description: 'Standalone multi-model workspace',
  })
})

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/chat', chatRouter)
app.use('/api/v1/chat', chatSessionsRouter)
app.use('/api/v1/compare', compareRouter)
app.use('/api/v1/agents', agentsRouter)
app.use('/api/v1/agent-sessions', agentSessionsRouter)
app.use('/api/v1/discussions', discussionsRouter)
app.use('/api/v1/discussions', discussionParticipantsRouter)
app.use('/api/v1/discussions', discussionVotesRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  if (res.headersSent) return
  res.status(500).json({ error: err?.message || 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`)
})
