import type { D1Database } from '@cloudflare/workers-types'
import { AdapterErrorCode, BaseAdapterError } from '@/adapters/baseAdapterError'
import type { SchemQlAdapter } from '@/schemql'

export class D1Adapter<T = unknown> implements SchemQlAdapter<T> {
  public constructor(
    private db: D1Database,
    private options = { verbosity: 0 }
  ) {}

  public queryAll = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    const { sql: anonymousSql, paramsOrder } = this.transformToAnonymousParams(sql)
    const stmt = this.db.prepare(anonymousSql)

    return async (params?: TParams) => {
      try {
        const arrParams = params ? paramsOrder.map((key) => params[key]) : []
        const { results } = await stmt.bind(...arrParams).all<TResult>()
        if (this.options.verbosity) {
          this.logSql(anonymousSql, arrParams, this.options.verbosity)
        }

        return results
      } catch (e: any) {
        throw SchemQlAdapterError.createFromD1(e)
      }
    }
  }

  public queryFirst = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    const { sql: anonymousSql, paramsOrder } = this.transformToAnonymousParams(sql)
    const stmt = this.db.prepare(anonymousSql)

    return async (params?: TParams) => {
      try {
        const arrParams = params ? paramsOrder.map((key) => params[key]) : []
        const result = (await stmt.bind(...arrParams).first<TResult | undefined>()) ?? undefined
        if (this.options.verbosity) {
          this.logSql(anonymousSql, arrParams, this.options.verbosity)
        }

        return result
      } catch (e: any) {
        throw SchemQlAdapterError.createFromD1(e)
      }
    }
  }

  public queryFirstOrThrow = <
    TResult,
    TParams extends Record<string, any> | undefined = Record<string, any> | undefined,
  >(
    sql: string
  ) => {
    const prepareFirst = this.queryFirst<TResult, TParams>(sql)

    return async (params?: TParams) => {
      const result = await prepareFirst(params)
      if (result === undefined) {
        throw new SchemQlAdapterError('No result', AdapterErrorCode.NoResult)
      }
      return result!
    }
  }

  public queryIterate = <_TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    _sql: string
  ) => {
    return (_params?: TParams) => {
      throw new Error('Not implemented')
    }
  }

  private transformToAnonymousParams = (sql: string) => {
    const paramsOrder: string[] = []

    const anonymousSql = sql.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramsOrder.push(paramName)
      return '?'
    })

    return { sql: anonymousSql, paramsOrder }
  }

  private logSql = (sql: string, arrParams: string[], verbosity: number) => {
    const stringParams = arrParams.map((param) =>
      typeof param === 'string' ? `'${param}'` : param === null ? 'NULL' : param
    )

    let paramIndex = 0
    const interpolatedSql = sql.replace(/\?/g, () => stringParams[paramIndex++] ?? '?')
    console.log(`${verbosity > 1 ? `\n-- PREPARED --\n${sql}` : ''}\n++ EXECUTED ++\n${interpolatedSql}\n`)
  }
}

export class SchemQlAdapterError extends BaseAdapterError {
  public static createFromD1 = (error: Error) => {
    // https://github.com/prisma/prisma/blob/main/packages/adapter-d1/src/utils.ts
    const computeCode = (message: string) => {
      if (message.startsWith('D1_ERROR:')) {
        if (message.startsWith('D1_ERROR: UNIQUE constraint failed')) {
          return AdapterErrorCode.UniqueConstraint
        }
        if (message.startsWith('D1_ERROR: FOREIGN KEY constraint failed')) {
          return AdapterErrorCode.ForeignkeyConstraint
        }
        if (message.startsWith('D1_ERROR: NOT NULL constraint failed')) {
          return AdapterErrorCode.NotnullConstraint
        }
        if (message.startsWith('D1_ERROR: CHECK constraint failed')) {
          return AdapterErrorCode.CheckConstraint
        }
        if (message.startsWith('D1_ERROR: PRIMARY KEY constraint failed')) {
          return AdapterErrorCode.PrimarykeyConstraint
        }
      }

      return AdapterErrorCode.Generic
    }

    return new SchemQlAdapterError(error.message, computeCode(error.message), error)
  }
}
export { AdapterErrorCode as SchemQlAdapterErrorCode }
