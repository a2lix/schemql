import { parseJsonPreprocessor } from '@/index'
import { z } from 'zod'

export const zUserDb = z.object({
  id: z.string(),
  email: z.string(),
  metadata: z.preprocess(
    parseJsonPreprocessor,
    z.object({
      role: z.enum(['user', 'admin']).default('user'),
    })
  ),
  created_at: z.number().int(),
  disabled_at: z.number().int().nullable(),
})

type UserDb = z.infer<typeof zUserDb>

export const zSessionDb = z.object({
  id: z.string(),
  user_id: z.string(),
  metadata: z.preprocess(
    parseJsonPreprocessor,
    z.object({
      fingerprint: z.string().optional(),
    })
  ),
  created_at: z.number().int(),
  expires_at: z.number().int(),
})
type SessionDb = z.infer<typeof zSessionDb>

export interface DB {
  sessions: SessionDb
  users: UserDb
}
