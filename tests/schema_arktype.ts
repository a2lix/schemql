import { type } from 'arktype'

export const tUserDb = type({
  id: 'string',
  email: 'string',
  metadata: type('string.json.parse').to({
    role: "'user' | 'admin' = 'user'",
    'email_variant?': 'string.email',
    'email_verified_at?': 'number.epoch',
  }),
  created_at: 'number.epoch',
  disabled_at: 'number.epoch | null',
})

export type UserDb = typeof tUserDb.infer

export const tSessionDb = type({
  id: 'string',
  user_id: 'string',
  metadata: type('string.json.parse').to({
    'fingerprint?': 'string',
  }),
  created_at: 'number.epoch',
  expires_at: 'number.epoch',
})

export type SessionDb = typeof tSessionDb.infer

export interface DB {
  sessions: SessionDb
  users: UserDb
}
