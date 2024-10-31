import type { z } from 'zod'

// Helpers
type ArrayElement<T> = T extends (infer U)[] ? U : T
type GeneratorFn<T> = () => Generator<T, void, unknown>
type AsyncGeneratorFn<T> = () => AsyncGenerator<T, void, unknown>

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

type SchemQlSqlHelper<TResultSchema extends z.ZodTypeAny | undefined, TParams extends Record<string, any>, DB> = {
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

type QueryExecutorParams =
  | Record<string, any>
  | Record<string, any>[]
  | GeneratorFn<Record<string, any>>
  | AsyncGeneratorFn<Record<string, any>>

type QueryFns = Record<'first' | 'firstOrThrow' | 'all', QueryFn<unknown>> & {
  iterate: IterativeQueryFn<unknown>
}
type QueryFn<TQueryResult, TParams = Record<string, any> | undefined> = (
  sql: string
) => (params?: TParams) => TQueryResult | Promise<TQueryResult>
type IterativeQueryFn<TQueryResult, TParams = Record<string, any> | undefined> = (
  sql: string
) => (params?: TParams) => AsyncIterable<TQueryResult>

type IsIterativeExecution<TMethod extends keyof QueryFns, TParams> = TMethod extends 'iterate'
  ? true
  : TParams extends any[]
    ? true
    : TParams extends AsyncGeneratorFn<any>
      ? true
      : TParams extends GeneratorFn<any>
        ? true
        : false
type QueryResult<
  TMethod extends keyof QueryFns,
  TQueryResult,
  TResultSchema extends z.ZodTypeAny | undefined,
  TParams,
> = IsIterativeExecution<TMethod, TParams> extends true
  ? AsyncGenerator<TResultSchema extends z.ZodTypeAny ? z.infer<TResultSchema> : TQueryResult, void, unknown>
  : TResultSchema extends z.ZodTypeAny
    ? z.infer<TResultSchema>
    : TQueryResult

type ParamsType<T> = T extends AsyncGeneratorFn<infer P>
  ? P
  : T extends GeneratorFn<infer P>
    ? P
    : T extends Array<infer P>
      ? P
      : T

type ExecutionParams<TParams, TParamsSchema extends z.ZodTypeAny | undefined> = TParams extends AsyncGeneratorFn<
  infer P
>
  ? AsyncGeneratorFn<P>
  : TParams extends GeneratorFn<infer P>
    ? GeneratorFn<P>
    : TParams extends Array<infer P>
      ? P[]
      : TParamsSchema extends z.ZodTypeAny
        ? z.infer<TParamsSchema>
        : TParams

type QueryExecutor<TMethod extends keyof QueryFns, DB> = <
  TQueryResult = unknown,
  TParams extends QueryExecutorParams = QueryExecutorParams,
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TResultSchema extends z.ZodTypeAny | undefined = undefined,
>(
  options: Omit<SchemQlExecOptions<TQueryResult, TParams, TParamsSchema, TResultSchema>, 'params'> & {
    params?: ExecutionParams<TParams, TParamsSchema>
  }
) => (
  sqlOrBuilderFn: SqlOrBuilderFn<TResultSchema, ParamsType<TParams>, DB>
) => Promise<QueryResult<TMethod, TQueryResult, TResultSchema, TParams>>

type SchemQlExecOptions<
  TQueryResult,
  TParams = QueryExecutorParams,
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TResultSchema extends z.ZodTypeAny | undefined = undefined,
> = {
  queryFn?: QueryFn<TQueryResult>
  params?: ExecutionParams<TParams, TParamsSchema>
  paramsSchema?: TParamsSchema
  resultSchema?: TResultSchema
}

export class SchemQl<DB> {
  constructor(private readonly options: SchemQlOptions = {}) {}

  private createQueryExecutor = <TMethod extends keyof QueryFns, TQueryResult>(
    method: TMethod
  ): QueryExecutor<TMethod, DB> => {
    return (options) => async (sqlOrBuilderFn) => {
      const sql = typeof sqlOrBuilderFn === 'function' ? sqlOrBuilderFn(this.createSqlHelper()) : sqlOrBuilderFn

      const queryFn = options.queryFn ?? this.options.queryFns?.[method]
      if (!queryFn) {
        throw new Error(`No queryFn provided for method ${method}`)
      }

      // Generator params?
      if (typeof options.params === 'function') {
        const preparedQuery = await queryFn(sql)

        const executeAndParseResult = async (params: Record<string, any>) => {
          const parsedParams = this.parseAndStringifyParams({ ...options, params } as SchemQlExecOptions<TQueryResult>)
          const result = await preparedQuery(parsedParams)
          return options.resultSchema?.parse(result) ?? result
        }

        return (async function* () {
          for await (const params of (options.params as AsyncGeneratorFn<Record<string, any>>)()) {
            yield await executeAndParseResult(params)
          }
        })()
      }

      // Array params?
      if (Array.isArray(options.params)) {
        const preparedQuery = await queryFn(sql)
        const parsedParams = this.parseAndStringifyParams(options)

        const executeAndParseResult = async (params: Record<string, any>) => {
          const result = await preparedQuery(params)
          return options.resultSchema?.parse(result) ?? result
        }

        return (async function* () {
          for await (const params of parsedParams as Record<string, any>[]) {
            yield await executeAndParseResult(params)
          }
        })()
      }

      const parsedParams = this.parseAndStringifyParams(options)

      // Iterate special fn?
      if (method === 'iterate') {
        return (async function* () {
          for await (const result of queryFn(sql)(parsedParams) as AsyncIterable<TQueryResult>) {
            yield options.resultSchema?.parse(result) ?? result
          }
        })()
      }

      // Simple case
      const result = await queryFn(sql)(parsedParams)

      return options.resultSchema?.parse(result) ?? result
    }
  }

  private parseAndStringifyParams = <
    TQueryResult,
    TParams extends Record<string, any> | Record<string, any>[],
    TParamsSchema extends z.ZodTypeAny | undefined,
    TResultSchema extends z.ZodTypeAny | undefined,
  >(
    options: SchemQlExecOptions<TQueryResult, TParams, TParamsSchema, TResultSchema>
  ): TParams | undefined => {
    if (typeof options.params === 'undefined') {
      return undefined
    }

    const parsedParams = options.paramsSchema?.parse(options.params) ?? options.params

    if (!this.options.shouldStringifyObjectParams) {
      return parsedParams
    }

    return (
      Array.isArray(parsedParams)
        ? parsedParams.map((params) => stringifyObjectParams(params))
        : stringifyObjectParams(parsedParams)
    ) as TParams
  }

  private createSqlHelper = <
    TResultSchema extends z.ZodTypeAny | undefined,
    TParams extends Record<string, any>,
  >(): SchemQlSqlHelper<TResultSchema, TParams, DB> => {
    return {
      sql: (strings, ...values) => this.processLiteralExpressions(strings, values),
      sqlCond: (condition, ifTrue, ifFalse = '') => `§${condition ? ifTrue : ifFalse}`,
      sqlRaw: (raw) => `§${raw}`,
    }
  }

  private processLiteralExpressions = <
    TResultSchema extends z.ZodTypeAny | undefined,
    TParams extends Record<string, any>,
  >(
    strings: TemplateStringsArray,
    values: SqlTemplateValue<TResultSchema extends z.ZodTypeAny ? z.infer<TResultSchema> : unknown, TParams, DB>[]
  ): string => {
    return strings.reduce((acc, str, i) => {
      const value = values[i]
      return `${acc}${str}${value !== undefined ? this.processLiteralExpression(value) : ''}`
    }, '')
  }

  private processLiteralExpression = <
    TResultSchema extends z.ZodTypeAny | undefined,
    TParams extends Record<string, any>,
  >(
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
            const jsonPathArrow = quotifyJsonPath(str.slice(jsonPathArrowIndex + 1))
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
  public iterate: QueryExecutor<'iterate', DB> = this.createQueryExecutor('iterate')
}

const stringifyObjectParams = (params: Record<string, any>) =>
  Object.entries(params).reduce(
    (acc, [key, value]) => {
      acc[key] = typeof value === 'object' ? JSON.stringify(value) : value
      return acc
    },
    {} as Record<string, any>
  )

const quotifyJsonPath = (jsonPath: string) =>
  jsonPath.split(/(?=->)/).reduce((path, segment) => {
    const arrow = segment.startsWith('->>') ? '->>' : '->'
    const value = segment.replace(arrow, '')
    return `${path}${arrow}'${value}'`
  }, '')
