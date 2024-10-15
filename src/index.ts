import type { z } from 'zod'

type ArrayElement<T> = T extends (infer U)[] ? U : T

type TableNames<DB> = Extract<keyof DB, string>
type ColumnNames<DB, T extends TableNames<DB>> = Extract<keyof DB[T], string>

type TableColumnSelection<DB> = {
  [T in TableNames<DB>]?: ColumnNames<DB, T>[] // Unable to prevent duplicates :/
}

type ValidTableColumnCombinations<DB> = {
  [T in TableNames<DB>]: `${T}.${ColumnNames<DB, T>}` | `${T}.${ColumnNames<DB, T>}-`
}[TableNames<DB>]

type JsonPathForObject<T, Path extends string = ''> = {
  [K in keyof T & string]:
    | `${Path}->'${K}'`
    | `${Path}->'${K}'-`
    | `${Path}->>'${K}'`
    | `${Path}->>'${K}'-`
    | (T[K] extends object ? JsonPathForObject<T[K], `${Path}->'${K}'`> : never)
}[keyof T & string]

type JsonPathCombinations<DB, T extends TableNames<DB>> = {
  [K in ColumnNames<DB, T>]: DB[T][K] extends object ? JsonPathForObject<DB[T][K], `${T}.${K}`> : never
}[ColumnNames<DB, T>]

type ValidJsonPathCombinations<DB> = {
  [T in TableNames<DB>]: JsonPathCombinations<DB, T>
}[TableNames<DB>]

type SqlTemplateValue<TResultSchema, TParams, DB> =
  | TableColumnSelection<DB>
  | `@${TableNames<DB>}`
  | `@${TableNames<DB>}.*`
  | `@${ValidTableColumnCombinations<DB>}`
  | `@${ValidJsonPathCombinations<DB>}`
  | `$${keyof ArrayElement<TResultSchema> & string}`
  | `:${keyof TParams & string}`
  | `§${string}`

type SqlTemplateValues<TResultSchema, TParams, DB> = SqlTemplateValue<TResultSchema, TParams, DB>[]

type SqlOrBuilderFn<TResultSchema extends z.ZodTypeAny | undefined, TParams extends Record<string, any>, DB> =
  | string
  | ((s: SchemQlSqlHelper<TResultSchema, TParams, DB>) => string)

interface SchemQlSqlHelper<TResultSchema extends z.ZodTypeAny | undefined, TParams extends Record<string, any>, DB> {
  sql: <
    T extends SqlTemplateValues<TResultSchema extends z.ZodTypeAny ? z.infer<TResultSchema> : unknown, TParams, DB>,
  >(
    strings: TemplateStringsArray,
    ...values: T
  ) => string
  sqlCond: (condition: boolean, ifTrue: string | number, ifFalse?: string | number) => `§${string}`
  sqlRaw: (raw: string | number) => `§${string}`
}

type SchemQlOptions = {
  queryFns?: Partial<QueryFns>
  shouldStringifyObjectParams?: boolean
}

type QueryFns = Record<'first' | 'firstOrThrow' | 'all', QueryFn<unknown, Record<string, any>>>
type QueryFn<TQueryResult, TParams> = (sql: string, params?: TParams) => TQueryResult | Promise<TQueryResult>

type QueryExecutor<_TMethod extends keyof QueryFns, DB> = <
  TQueryResult = unknown,
  TParams extends Record<string, any> = Record<string, any>,
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TResultSchema extends z.ZodTypeAny | undefined = undefined,
>(
  options: SchemQlExecOptions<TQueryResult, TParams, TParamsSchema, TResultSchema>
) => (
  sqlOrBuilderFn: SqlOrBuilderFn<TResultSchema, TParams, DB>
) => Promise<TResultSchema extends z.ZodTypeAny ? z.infer<TResultSchema> : TQueryResult>

interface SchemQlExecOptions<
  TQueryResult,
  TParams extends Record<string, any>,
  TParamsSchema extends z.ZodTypeAny | undefined,
  TResultSchema extends z.ZodTypeAny | undefined,
> {
  queryFn?: QueryFn<TQueryResult, TParams>
  params?: TParamsSchema extends z.ZodTypeAny ? z.infer<TParamsSchema> : TParams
  paramsSchema?: TParamsSchema
  resultSchema?: TResultSchema
}

export class SchemQl<DB> {
  constructor(private readonly options: SchemQlOptions = {}) {}

  private createQueryExecutor<TMethod extends keyof QueryFns>(method: TMethod): QueryExecutor<TMethod, DB> {
    return (options) => async (sqlOrBuilderFn) => {
      const sql = typeof sqlOrBuilderFn === 'function' ? sqlOrBuilderFn(this.createSqlHelper()) : sqlOrBuilderFn

      const parsedParams = this.parseAndStringifyParams(options)

      const queryFn = options.queryFn ?? this.options.queryFns?.[method]
      if (!queryFn) {
        throw new Error(`No queryFn provided for method ${method}`)
      }

      const result = await queryFn(sql, parsedParams)

      return options.resultSchema?.parse(result) ?? result
    }
  }

  private parseAndStringifyParams<
    TQueryResult,
    TParams extends Record<string, any>,
    TParamsSchema extends z.ZodTypeAny | undefined,
    TResultSchema extends z.ZodTypeAny | undefined,
  >(options: SchemQlExecOptions<TQueryResult, TParams, TParamsSchema, TResultSchema>): TParams | undefined {
    if (typeof options.params === 'undefined') {
      return undefined
    }

    const parsedParams = options.paramsSchema?.parse(options.params) ?? options.params

    if (this.options.shouldStringifyObjectParams) {
      return Object.entries(parsedParams).reduce(
        (acc, [key, value]) => {
          acc[key] = typeof value === 'object' ? JSON.stringify(value) : value
          return acc
        },
        {} as Record<string, any>
      ) as TParams
    }

    return parsedParams
  }

  private createSqlHelper<
    TResultSchema extends z.ZodTypeAny | undefined,
    TParams extends Record<string, any>,
  >(): SchemQlSqlHelper<TResultSchema, TParams, DB> {
    return {
      sql: (strings, ...values) => {
        return strings.reduce((acc, str, i) => {
          const value = values[i]
          return `${acc}${str}${value !== undefined ? this.processSingleValue(value) : ''}`
        }, '')
      },
      sqlCond: (condition, ifTrue, ifFalse = '') => `§${condition ? ifTrue : ifFalse}`,
      sqlRaw: (raw) => `§${raw}`,
    }
  }

  private processSingleValue = <TResultSchema extends z.ZodTypeAny | undefined, TParams extends Record<string, any>>(
    value: SqlTemplateValue<TResultSchema extends z.ZodTypeAny ? z.infer<TResultSchema> : unknown, TParams, DB>
  ): string => {
    if (typeof value === 'object') {
      const entries = Object.entries(value)
      if (entries.length === 1) {
        const [tableName, columns] = entries[0]!
        return `${tableName} (${Array.isArray(columns) ? columns.join(', ') : columns})`
      }
    }

    if (typeof value === 'string') {
      switch (true) {
        case value.startsWith('@'): {
          return value.endsWith('-') ? (value.split('.')[1]?.slice(0, -1) ?? '') : value.slice(1)
        }
        case value.startsWith('$'):
        case value.startsWith('§'): // Trick for cond/raw
          return value.slice(1)
        default:
          return value // :param unchanged
      }
    }

    return String(value)
  }

  public first: QueryExecutor<'first', DB> = this.createQueryExecutor('first')
  public firstOrThrow: QueryExecutor<'firstOrThrow', DB> = this.createQueryExecutor('firstOrThrow')
  public all: QueryExecutor<'all', DB> = this.createQueryExecutor('all')
}

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
