import { AdapterErrorCode, BaseAdapterError } from '@/adapters/baseAdapterError'
import type { SchemQlAdapter } from '@/schemql'
// @ts-ignore
import type SQLite from 'better-sqlite3'

export class BetterSqlite3Adapter<T = unknown> implements SchemQlAdapter<T> {
  public constructor(private db: SQLite.Database) {}

  public queryAll = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    let stmt: SQLite.Statement
    try {
      stmt = this.db.prepare(sql)
    } catch (e) {
      throw SchemQlAdapterError.createFromBetterSqlite3(e)
    }

    return (params?: TParams): TResult[] => {
      try {
        return params ? stmt.all(params) : stmt.all()
      } catch (e) {
        if (e instanceof TypeError && e.message === 'This statement does not return data. Use run() instead') {
          this.handleTypeErrorRun(stmt, params)
          return []
        }
        throw SchemQlAdapterError.createFromBetterSqlite3(e)
      }
    }
  }

  public queryFirst = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    let stmt: SQLite.Statement
    try {
      stmt = this.db.prepare(sql)
    } catch (e) {
      throw SchemQlAdapterError.createFromBetterSqlite3(e)
    }

    return (params?: TParams): TResult | undefined => {
      try {
        return params ? stmt.get(params) : stmt.get()
      } catch (e) {
        if (e instanceof TypeError && e.message === 'This statement does not return data. Use run() instead') {
          this.handleTypeErrorRun(stmt, params)
          return undefined
        }
        throw SchemQlAdapterError.createFromBetterSqlite3(e)
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

  public queryIterate = <TResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined>(
    sql: string
  ) => {
    const stmt = this.db.prepare(sql)

    return (params?: TParams) => {
      return params ? stmt.iterate(params) : stmt.iterate()
    }
  }

  private handleTypeErrorRun = (stmt: SQLite.Statement, params: Record<string, any> | undefined) => {
    try {
      params ? stmt.run(params) : stmt.run()
    } catch (e) {
      throw SchemQlAdapterError.createFromBetterSqlite3(e)
    }
  }
}

export class SchemQlAdapterError extends BaseAdapterError {
  public static createFromBetterSqlite3 = (error: SQLite.SqliteError | TypeError) => {
    const mapCodes = new Map([
      ['SQLITE_CONSTRAINT_UNIQUE', AdapterErrorCode.UniqueConstraint],
      ['SQLITE_CONSTRAINT_FOREIGNKEY', AdapterErrorCode.ForeignkeyConstraint],
      ['SQLITE_CONSTRAINT_NOTNULL', AdapterErrorCode.NotnullConstraint],
      ['SQLITE_CONSTRAINT_CHECK', AdapterErrorCode.CheckConstraint],
      ['SQLITE_CONSTRAINT_PRIMARYKEY', AdapterErrorCode.PrimarykeyConstraint],
    ])

    return new SchemQlAdapterError(error.message, mapCodes.get(error.code) ?? AdapterErrorCode.Generic, error)
  }
}
export { AdapterErrorCode as SchemQlAdapterErrorCode }
