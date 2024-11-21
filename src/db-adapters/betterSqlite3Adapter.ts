import { BaseDbAdapterError, DbAdapterErrorCode } from '@/db-adapters/baseDbAdapterError'
import type { SchemQlAdapter } from '@/schemql'
// @ts-ignore
import SQLite from 'better-sqlite3'

export class BetterSqlite3Adapter implements SchemQlAdapter {
  private db: SQLite.Adapter

  public constructor(filename: string, options?: SQLite.Options) {
    this.db = new SQLite(filename, {
      ...options,
      verbose: console.log,
    })
    this.db.pragma('journal_mode = WAL')
  }

  public queryAll<TResult, TParams extends Record<string, any>>(sql: string) {
    const stmt = this.db.prepare(sql)

    return (params?: TParams): TResult[] => {
      try {
        return params ? stmt.all(params) : stmt.all()
      } catch (e) {
        throw DbAdapterError.createFromBetterSqlite3(e)
      }
    }
  }

  public queryFirst<TResult, TParams extends Record<string, any>>(sql: string) {
    const stmt = this.db.prepare(sql)

    return (params?: TParams): TResult | undefined => {
      try {
        return stmt.get(params)
      } catch (e) {
        throw DbAdapterError.createFromBetterSqlite3(e)
      }
    }
  }

  public queryFirstOrThrow<TResult, TParams extends Record<string, any>>(sql: string) {
    const prepareFirst = this.queryFirst<TResult, TParams>(sql)

    return (params?: TParams): NonNullable<TResult> => {
      const result = prepareFirst(params)
      if (result === undefined) {
        throw new DbAdapterError('No result', DbAdapterErrorCode.NoResult)
      }
      return result!
    }
  }

  public queryIterate<TResult, TParams extends Record<string, any>>(sql: string) {
    const stmt = this.db.prepare(sql)

    return (params?: TParams) => {
      return stmt.iterate(params)
    }
  }

  public close() {
    this.db.close()
  }
}

export class DbAdapterError extends BaseDbAdapterError {
  public static createFromBetterSqlite3 = (error: SQLite.SqliteError | TypeError) => {
    const mapCodes = new Map([
      ['SQLITE_CONSTRAINT_UNIQUE', DbAdapterErrorCode.UniqueConstraint],
      ['SQLITE_CONSTRAINT_FOREIGNKEY', DbAdapterErrorCode.ForeignkeyConstraint],
      ['SQLITE_CONSTRAINT_NOTNULL', DbAdapterErrorCode.NotnullConstraint],
      ['SQLITE_CONSTRAINT_CHECK', DbAdapterErrorCode.CheckConstraint],
      ['SQLITE_CONSTRAINT_PRIMARYKEY', DbAdapterErrorCode.PrimarykeyConstraint],
    ])

    return new DbAdapterError(error.message, mapCodes.get(error.code) ?? DbAdapterErrorCode.Generic, error)
  }
}
export { DbAdapterErrorCode }
