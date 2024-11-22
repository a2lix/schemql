import type { z } from 'zod'

// Zod Helpers
export const parseJsonPreprocessor = (value: any, ctx: z.RefinementCtx) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (e) {
      ctx.addIssue({
        code: 'custom',
        message: (e as Error).message,
      })
    }
  }

  return value
}
