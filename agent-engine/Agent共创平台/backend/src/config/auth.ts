import jwt, { type Secret, type SignOptions } from 'jsonwebtoken'

// Require JWT_SECRET from environment — no hardcoded fallback in production
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production')
}
// Use a derived secret only for local dev convenience (never in production)
const SECRET: Secret = JWT_SECRET ?? 'cocreator-v2-dev-only-secret-do-not-use-in-prod'

export const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn']

const signOptions: SignOptions = { expiresIn: JWT_EXPIRES_IN }

export function signToken(payload: { userId: string; email: string }) {
  return jwt.sign(payload, SECRET, signOptions)
}

export function verifyToken(token: string) {
  return jwt.verify(token, SECRET) as { userId: string; email: string }
}
