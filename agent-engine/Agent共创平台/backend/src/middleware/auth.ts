import type { NextFunction, Request, Response } from 'express'

export interface AuthRequest extends Request<Record<string, string>, any, any, any> {
  userId?: string
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const headerUserId = req.header('x-user-id')
  const authHeader = req.header('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

  req.userId = headerUserId || token || 'demo-user'
  next()
}
