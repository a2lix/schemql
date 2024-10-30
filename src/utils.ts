import type { z } from "zod";

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

// SQL Helpers
export const transformToOrderedParams = (sql: string, params: Record<string, any>): { sql: string, values: any[] } => {
    const values: any[] = [];
    let paramIndex = 1;

    const transformedSql = sql.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
        if (!(paramName in params)) {
            throw new Error(`Missing value for parameter: ${paramName}`);
        }

        // Push the parameter value to the `values` array in the order of appearance
        values.push(params[paramName]);

        // Replace `:param` with `?` followed by the current index
        return `?${paramIndex++}`;
    });

    return { sql: transformedSql, values };
}
