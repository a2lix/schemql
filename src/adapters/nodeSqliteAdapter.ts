import type SQLite from 'node:sqlite'
import { AdapterErrorCode, BaseAdapterError } from '@/adapters/baseAdapterError'
import type { SchemQlAdapter } from '@/schemql'

export class NodeSqliteAdapter<T = unknown> implements SchemQlAdapter<T> {
  public constructor(private db: SQLite.DatabaseSync) {}

  public queryAll = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    let stmt: SQLite.StatementSync
    try {
      stmt = this.db.prepare(sql)
    } catch (e) {
      throw SchemQlAdapterError.createFromNodeSqlite(e)
    }

    return (params?: TParams): TResult[] => {
      try {
        return (params ? stmt.all(params) : stmt.all()) as TResult[]
      } catch (e) {
        // if (e instanceof TypeError && e.message === 'This statement does not return data. Use run() instead') {
        //   this.handleTypeErrorRun(stmt, params)
        //   return []
        // }
        throw SchemQlAdapterError.createFromNodeSqlite(e)
      }
    }
  }

  public queryFirst = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    let stmt: SQLite.StatementSync
    try {
      stmt = this.db.prepare(sql)
    } catch (e) {
      throw SchemQlAdapterError.createFromNodeSqlite(e)
    }

    return (params?: TParams): TResult | undefined => {
      try {
        return (params ? stmt.get(params) : stmt.get()) as TResult | undefined
      } catch (e) {
        // if (e instanceof TypeError && e.message === 'This statement does not return data. Use run() instead') {
        //   this.handleTypeErrorRun(stmt, params)
        //   return undefined
        // }
        throw SchemQlAdapterError.createFromNodeSqlite(e)
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

    return (params?: TParams): NonNullable<TResult> => {
      const result = prepareFirst(params)
      if (result === undefined) {
        throw new SchemQlAdapterError('No result', AdapterErrorCode.NoResult)
      }
      return result!
    }
  }

  public queryIterate = <_TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    const stmt = this.db.prepare(sql)

    return (params?: TParams) => {
      return (params ? stmt.iterate(params) : stmt.iterate()) as any
    }
  }
}

export class SchemQlAdapterError extends BaseAdapterError {
  public static createFromNodeSqlite = (error: any) => {
    const computeCode = ({ code, message }: { code: string; message: string }) => {
      if (code === 'ERR_SQLITE_ERROR') {
        if (message.startsWith('UNIQUE constraint failed')) {
          return AdapterErrorCode.UniqueConstraint
        }
        if (message.startsWith('FOREIGN KEY constraint failed')) {
          return AdapterErrorCode.ForeignkeyConstraint
        }
        if (message.startsWith('NOT NULL constraint failed')) {
          return AdapterErrorCode.NotnullConstraint
        }
        if (message.startsWith('CHECK constraint failed')) {
          return AdapterErrorCode.CheckConstraint
        }
        // No dedicated PRIMARY KEY constraint violation in SQLite :/
        // if (message.startsWith('PRIMARY KEY constraint failed')) {
        //   return AdapterErrorCode.PrimarykeyConstraint
        // }
      }

      return AdapterErrorCode.Generic
    }

    return new SchemQlAdapterError(error.message, computeCode(error), error)
  }
}
export { AdapterErrorCode as SchemQlAdapterErrorCode }
