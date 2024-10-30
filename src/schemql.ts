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

type JsonPathForObjectArrow<T, P extends string = ''> = T extends Record<string, any>
  ? {
      [K in keyof T & string]:
        | `${P}->${K}`
        | `${P}->${K}-`
        | `${P}->>${K}`
        | `${P}->>${K}-`
        | (NonNullable<T[K]> extends Record<string, any>
            ? `${P}->${K}${JsonPathForObjectArrow<NonNullable<T[K]>, ''>}`
            : never)
    }[keyof T & string]
  : ''

type JsonPathForObjectDot<T, P extends string = ''> = T extends Record<string, any>
  ? {
      [K in keyof T & string]:
        | `${P}.${K}`
        | (NonNullable<T[K]> extends Record<string, any>
            ? `${P}.${K}${JsonPathForObjectDot<NonNullable<T[K]>, ''>}`
            : never)
    }[keyof T & string]
  : ''

type JsonPathCombinations<DB, T extends TableNames<DB>> = {
  [K in ColumnNames<DB, T>]: DB[T][K] extends object
    ?
        | JsonPathForObjectArrow<ArrayElement<DB[T][K]>, `${T}.${K} `>
        | JsonPathForObjectDot<ArrayElement<DB[T][K]>, `${T}.${K} $`>
    : never
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
  | `$${keyof ArrayElement<Exclude<TResultSchema, undefined>> & string}`
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
type QueryFn<TQueryResult, TParams> = (sql: string) => (params?: TParams) => TQueryResult | Promise<TQueryResult>

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

type QueryIterExecutor<_TMethod extends keyof QueryFns, DB> = <
  TQueryResult = unknown,
  TParams extends Record<string, any>[] = Record<string, any>[],
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TResultSchema extends z.ZodTypeAny | undefined = undefined,
>(
  options: SchemQlIterExecOptions<TQueryResult, TParams, TParamsSchema, TResultSchema>
) => (
  sqlOrBuilderFn: SqlOrBuilderFn<TResultSchema, TParams[number], DB>
) => Promise<AsyncGenerator<TResultSchema extends z.ZodTypeAny ? z.infer<TResultSchema> : TQueryResult>>

type IterParams<T> = T[] | AsyncIterable<T>
interface SchemQlIterExecOptions<
  TQueryResult,
  TParams extends Record<string, any>[],
  TParamsSchema extends z.ZodTypeAny | undefined,
  TResultSchema extends z.ZodTypeAny | undefined,
> extends Omit<SchemQlExecOptions<TQueryResult, TParams, TParamsSchema, TResultSchema>, 'queryFn' | 'params'> {
  queryFn?: QueryFn<TQueryResult, TParams[number]>
  params: IterParams<TParamsSchema extends z.ZodTypeAny ? z.infer<TParamsSchema> : TParams[number]>
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

      const result = await queryFn(sql)(parsedParams)

      return options.resultSchema?.parse(result) ?? result
    }
  }

  private createIterativeQueryExecutor<TMethod extends keyof QueryFns>(method: TMethod): QueryIterExecutor<TMethod, DB> {
    return (options) => async (sqlOrBuilderFn) => {
      const sql = typeof sqlOrBuilderFn === 'function' ? sqlOrBuilderFn(this.createSqlHelper()) : sqlOrBuilderFn

      const queryFn = options.queryFn ?? this.options.queryFns?.[method]
      if (!queryFn) {
        throw new Error(`No queryFn provided for method ${method}`)
      }

      const preparedQuery = await queryFn(sql)
      const queryAndParseResult = async (params: any) => {
        const parsedParams = this.parseAndStringifyParams({ ...options, params })
        const result = await preparedQuery(parsedParams)
        return options.resultSchema?.parse(result) ?? result
      }

      return async function* () {
        for await (const params of options.params) {
          yield await queryAndParseResult(params)
        }
      }()
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
          // JsonPath dot? Add quotes
          const jsonPathDotIndex = value.indexOf(' $.')
          if (jsonPathDotIndex !== -1) {
            return `'${value.slice(jsonPathDotIndex + 1)}'`
          }

          let str: string = value
          // JsonPath arrow? Add quotes
          const jsonPathArrowIndex = str.indexOf(' ->')
          if (jsonPathArrowIndex !== -1) {
            const jsonPathArrow = str
              .slice(jsonPathArrowIndex + 1)
              .split(/(?=->)/)
              .reduce((path, segment) => {
                const arrow = segment.startsWith('->>') ? '->>' : '->'
                const value = segment.replace(arrow, '')
                return `${path}${arrow}'${value}'`
              }, '')
            str = `${str.slice(0, jsonPathArrowIndex)}${jsonPathArrow}`
          }

          if (str.endsWith('-')) {
            return str.split('.')[1]?.slice(0, -1) ?? ''
          }

          return str.slice(1)
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

  public firstIter: QueryIterExecutor<'first', DB> = this.createIterativeQueryExecutor('first')
  public firstOrThrowIter: QueryIterExecutor<'firstOrThrow', DB> = this.createIterativeQueryExecutor('firstOrThrow')
  public allIter: QueryIterExecutor<'all', DB> = this.createIterativeQueryExecutor('all')
}
