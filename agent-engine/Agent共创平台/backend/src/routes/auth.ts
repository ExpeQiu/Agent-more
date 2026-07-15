import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../config/database'
import { signToken } from '../config/auth'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const body = registerSchema.parse(req.body)
    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      return res.status(409).json({ error: '邮箱已被注册' })
    }
    const passwordHash = await bcrypt.hash(body.password, 10)
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
      },
      select: { id: true, email: true, name: true, role: true },
    })
    res.status(201).json({ user })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入格式错误', details: err.issues })
    }
    console.error(err)
    res.status(500).json({ error: '服务器错误' })
  }
})

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }
    const token = signToken({ userId: user.id, email: user.email })
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: '输入格式错误', details: err.issues })
    }
    console.error(err)
    res.status(500).json({ error: '服务器错误' })
  }
})

// GET /api/v1/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ error: '用户不存在' })
    res.json({ user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '服务器错误' })
  }
})

export default router
