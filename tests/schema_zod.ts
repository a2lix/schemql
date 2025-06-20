import { z } from 'zod/v4'
import { parseJsonPreprocessor } from '@/utils'

export const zUserDb = z.object({
  id: z.string(),
  email: z.string(),
  metadata: z.preprocess(
    parseJsonPreprocessor,
    z.object({
      role: z.enum(['user', 'admin']).default('user'),
      email_variant: z.email().optional(),
      email_verified_at: z.int().optional(),
    })
  ),
  created_at: z.int(),
  disabled_at: z.int().nullable(),
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
  created_at: z.int(),
  expires_at: z.int(),
})
type SessionDb = z.infer<typeof zSessionDb>

export interface DB {
  sessions: SessionDb
  users: UserDb
}
