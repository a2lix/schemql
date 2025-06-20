import type * as zv3 from 'zod/v3'
import type * as zv4 from 'zod/v4'

type PreprocessCallback = Parameters<typeof zv4.preprocess>[0] & Parameters<typeof zv3.preprocess>[0]

export const parseJsonPreprocessor: PreprocessCallback = (arg, ctx) => {
  if (typeof arg === 'string') {
    try {
      return JSON.parse(arg)
    } catch (e) {
      ctx.addIssue({
        code: 'custom',
        message: (e as Error).message,
      })
    }
  }

  return arg
}
