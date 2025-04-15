import type { StandardSchemaV1 } from '@standard-schema/spec'

// Exported
export interface SchemQlAdapter<T = unknown> {
  queryFirst: QueryFn<T | undefined>
  queryFirstOrThrow: QueryFn<T>
  queryAll: QueryFn<T[]>
  queryIterate: IterativeQueryFn<T>
}

// --- Core Function Types ---
type QueryFn<TQueryResult, TParams extends Record<string, any> | undefined = Record<string, any> | undefined> = (
  sql: string
) => (params?: TParams) => TQueryResult | Promise<TQueryResult>
type IterativeQueryFn<
  TQueryResult,
  TParams extends Record<string, any> | undefined = Record<string, any> | undefined,
> = (sql: string) => (params?: TParams) => GeneratorFn<TQueryResult> | AsyncGeneratorFn<TQueryResult>

// --- Helper Types ---
type ArrayElement<T> = T extends (infer U)[] ? U : T
type GeneratorFn<T> = () => Generator<T, void, unknown>
type AsyncGeneratorFn<T> = () => AsyncGenerator<T, void, unknown>

// --- DB Schema Introspection Types ---
type TableNames<DB> = Extract<keyof DB, string>
type ColumnNames<DB, T extends TableNames<DB>> = Extract<keyof DB[T], string>
type TableColumnSelection<DB> = {
  [T in TableNames<DB>]?: ColumnNames<DB, T>[] // Unable to prevent duplicates :/
}
type ValidTableColumnCombinations<DB> = {
  [T in TableNames<DB>]: `${T}.${ColumnNames<DB, T>}` | `${T}.${ColumnNames<DB, T>}-`
}[TableNames<DB>]

// --- JSON Path Types ---
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
  | `§${string}` // § = Raw SQL
type SqlTemplateValues<TResultSchema, TParams, DB> = SqlTemplateValue<TResultSchema, TParams, DB>[]
type SqlOrBuilderFn<TResultSchema extends StandardSchemaV1 | undefined, TParams extends Record<string, any>, DB> =
  | string
  | ((s: SchemQlSqlHelper<TResultSchema, TParams, DB>) => string)
type SchemQlSqlHelper<TResultSchema extends StandardSchemaV1 | undefined, TParams extends Record<string, any>, DB> = {
  sql: <
    T extends SqlTemplateValues<
      TResultSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TResultSchema> : unknown,
      TParams,
      DB
    >,
  >(
    strings: TemplateStringsArray,
    ...values: T
  ) => string
  sqlCond: (condition: boolean, ifTrue: string | number, ifFalse?: string | number) => `§${string}`
  sqlRaw: (raw: string | number) => `§${string}`
}

// --- Configuration ---
type SchemQlOptions = {
  adapter: SchemQlAdapter
  shouldStringifyObjectParams?: boolean
  quoteSqlIdentifiers?: boolean
}

// --- Executor Parameter and Result Types ---
type IsIterativeExecution<TParams> = TParams extends any[]
  ? true
  : TParams extends AsyncGeneratorFn<any>
    ? true
    : TParams extends GeneratorFn<any>
      ? true
      : false
type ParamsType<T> = T extends AsyncGeneratorFn<infer P>
  ? P
  : T extends GeneratorFn<infer P>
    ? P
    : T extends Array<infer P>
      ? P
      : T
type SimpleQueryExecutorResult<
  TQueryResult,
  TResultSchema extends StandardSchemaV1 | undefined,
> = TResultSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TResultSchema> : TQueryResult

// Base executor type - takes options, returns function that takes sql, returns Promise<Result>
type QueryExecutor<DB> = <
  TQueryResult = unknown,
  TParams extends QueryExecutorParams = QueryExecutorParams,
  TParamsSchema extends StandardSchemaV1 | undefined = undefined,
  TResultSchema extends StandardSchemaV1 | undefined = undefined,
>(options: {
  params?: QueryExecutorOptionsParams<TParams, TParamsSchema>
  paramsSchema?: TParamsSchema
  resultSchema?: TResultSchema
}) => (
  sqlOrBuilderFn: SqlOrBuilderFn<TResultSchema, ParamsType<TParams>, DB>
) => Promise<QueryExecutorResult<TQueryResult, TParams, TResultSchema>>

type QueryExecutorParams =
  | Record<string, any>
  | Record<string, any>[]
  | GeneratorFn<Record<string, any>>
  | AsyncGeneratorFn<Record<string, any>>
type QueryExecutorOptionsParams<
  TParams,
  TParamsSchema extends StandardSchemaV1 | undefined,
> = TParams extends AsyncGeneratorFn<infer P>
  ? AsyncGeneratorFn<P>
  : TParams extends GeneratorFn<infer P>
    ? GeneratorFn<P>
    : TParams extends Array<infer P>
      ? P[]
      : TParamsSchema extends StandardSchemaV1
        ? StandardSchemaV1.InferOutput<TParamsSchema>
        : TParams

// Conditional result type: AsyncGenerator for iterative params, SimpleResult otherwise.
type QueryExecutorResult<
  TQueryResult,
  TParams,
  TResultSchema extends StandardSchemaV1 | undefined,
> = IsIterativeExecution<TParams> extends true
  ? AsyncGenerator<SimpleQueryExecutorResult<TQueryResult, TResultSchema>, void, unknown>
  : SimpleQueryExecutorResult<TQueryResult, TResultSchema>

// Iterative executor type - always returns Promise<AsyncGenerator>
type IterativeQueryExecutor<DB> = <
  TQueryResult = unknown,
  TParams extends Record<string, any> = Record<string, any>,
  TParamsSchema extends StandardSchemaV1 | undefined = undefined,
  TResultSchema extends StandardSchemaV1 | undefined = undefined,
>(options: {
  params?: TParamsSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TParamsSchema> : TParams
  paramsSchema?: TParamsSchema
  resultSchema?: TResultSchema
}) => (
  sqlOrBuilderFn: SqlOrBuilderFn<TResultSchema, TParams, DB>
) => Promise<AsyncGenerator<SimpleQueryExecutorResult<TQueryResult, TResultSchema>, void, unknown>>

// --- Main Class ---
export class SchemQl<DB> {
  public first: QueryExecutor<DB>
  public firstOrThrow: QueryExecutor<DB>
  public all: QueryExecutor<DB>
  public iterate: IterativeQueryExecutor<DB>

  constructor(private readonly options: SchemQlOptions) {
    this.first = this.createQueryExecutor(this.options.adapter.queryFirst)
    this.firstOrThrow = this.createQueryExecutor(this.options.adapter.queryFirstOrThrow)
    this.all = this.createQueryExecutor(this.options.adapter.queryAll)
    this.iterate = this.createIterativeExecutor(this.options.adapter.queryIterate)
  }

  private createQueryExecutor = <TQueryResult>(queryFn: QueryFn<TQueryResult>): QueryExecutor<DB> => {
    return (options) => async (sqlOrBuilderFn) => {
      const sql = typeof sqlOrBuilderFn === 'function' ? sqlOrBuilderFn(this.createSqlHelper()) : sqlOrBuilderFn

      // --- Generator params? ---
      if (typeof options.params === 'function') {
        const preparedQuery = queryFn(sql) // Prepare query once

        const executeAndValidateResult = async (params: Record<string, any>) => {
          // Validate/stringify this specific 'params' object
          const parsedParams = await this.validateAndStringifyParams({ ...options, params })
          const result = await preparedQuery(parsedParams)
          return options.resultSchema ? await standardValidate(options.resultSchema, result) : result
        }

        return (async function* () {
          for await (const params of (options.params as AsyncGeneratorFn<Record<string, any>>)()) {
            yield await executeAndValidateResult(params)
          }
          // Explicitly yield TQueryResult type, after validation
        })()
      }

      // --- Array params? ---
      if (Array.isArray(options.params)) {
        const preparedQuery = queryFn(sql) // Prepare query once

        // Validate/Stringify the entire array
        const parsedParams = await this.validateAndStringifyParams({
          ...options,
          params: options.params as Record<string, any>[],
        })

        const executeAndValidateResult = async (params: Record<string, any>) => {
          const result = await preparedQuery(params)
          return options.resultSchema ? await standardValidate(options.resultSchema, result) : result
        }

        return (async function* () {
          for (const params of parsedParams as Record<string, any>[]) {
            // Iterate parsed array
            yield await executeAndValidateResult(params)
          }
          // Explicitly yield TQueryResult type, after validation
        })()
      }

      // --- Single params ---
      const parsedParams = await this.validateAndStringifyParams({
        ...options,
        params: options.params as Record<string, any>,
      })
      const result = await queryFn(sql)(parsedParams)

      return (options.resultSchema ? await standardValidate(options.resultSchema, result) : result) as any
    }
  }

  private createIterativeExecutor = <TQueryResult>(
    queryFn: IterativeQueryFn<TQueryResult>
  ): IterativeQueryExecutor<DB> => {
    return (options) => async (sqlOrBuilderFn) => {
      const sql = typeof sqlOrBuilderFn === 'function' ? sqlOrBuilderFn(this.createSqlHelper()) : sqlOrBuilderFn
      const parsedParams = await this.validateAndStringifyParams({
        ...options,
        params: options.params as Record<string, any>,
      })

      return (async function* () {
        for await (const result of queryFn(sql)(parsedParams)()) {
          yield options.resultSchema ? await standardValidate(options.resultSchema, result) : result
          // Explicitly yield TQueryResult type, after validation
        }
      })() as any
    }
  }

  private validateAndStringifyParams = async <
    TParams extends Record<string, any> | Record<string, any>[],
    TParamsSchema extends StandardSchemaV1 | undefined = undefined,
  >(options: {
    params?: TParams
    paramsSchema?: TParamsSchema
  }) => {
    if (typeof options.params === 'undefined') {
      return undefined
    }

    const validatedParams = options.paramsSchema
      ? await standardValidate(options.paramsSchema, options.params)
      : options.params

    if (!this.options.shouldStringifyObjectParams) {
      // Cast needed: validation might change type slightly.
      return validatedParams as TParams
    }

    return (
      Array.isArray(validatedParams)
        ? validatedParams.map((params) => stringifyObjectParams(params))
        : stringifyObjectParams(validatedParams as Record<string, any>)
    ) as TParams
  }

  private createSqlHelper = <
    TResultSchema extends StandardSchemaV1 | undefined,
    TParams extends Record<string, any>,
  >(): SchemQlSqlHelper<TResultSchema, TParams, DB> => {
    return {
      sql: (strings, ...values) => this.processLiteralExpressions(strings, values),
      sqlCond: (condition, ifTrue, ifFalse = '') => `§${condition ? ifTrue : ifFalse}`,
      sqlRaw: (raw) => `§${raw}`,
    }
  }

  private processLiteralExpressions = <
    TResultSchema extends StandardSchemaV1 | undefined,
    TParams extends Record<string, any>,
  >(
    strings: TemplateStringsArray,
    values: SqlTemplateValue<
      TResultSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TResultSchema> : unknown,
      TParams,
      DB
    >[]
  ): string => {
    return strings.reduce((acc, str, i) => {
      const value = values[i]
      return `${acc}${str}${value !== undefined ? this.processLiteralExpression(value) : ''}`
    }, '')
  }

  private processLiteralExpression = <
    TResultSchema extends StandardSchemaV1 | undefined,
    TParams extends Record<string, any>,
  >(
    value: SqlTemplateValue<
      TResultSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TResultSchema> : unknown,
      TParams,
      DB
    >
  ): string => {
    if (typeof value === 'object') {
      const entries = Object.entries(value)
      if (entries.length === 1) {
        const [tableName, columns] = entries[0]!
        // Basic quoting, adapt for specific DB dialect if necessary

        return !this.options.quoteSqlIdentifiers
          ? `${tableName} (${Array.isArray(columns) ? columns.join(', ') : String(columns)})`
          : `"${tableName}" (${Array.isArray(columns) ? columns.join(', ') : String(columns)})`
      }
    }

    if (typeof value === 'string') {
      switch (true) {
        case value.startsWith('@'): {
          // Handles identifiers, columns, potentially JSON paths
          const jsonPathDotIndex = value.indexOf(' $.')
          if (jsonPathDotIndex !== -1) {
            return `'${value.slice(jsonPathDotIndex + 1)}'` // Quote JSON path
          }

          let str: string = value
          // JsonPath arrow? Add quotes
          const jsonPathArrowIndex = str.indexOf(' ->')
          if (jsonPathArrowIndex !== -1) {
            const jsonPathArrow = quotifyJsonPath(str.slice(jsonPathArrowIndex + 1))
            str = `${str.slice(0, jsonPathArrowIndex)}${jsonPathArrow}`
          }

          if (str.endsWith('-')) {
            // Alias extraction: @table.col- -> col
            return str.split('.')[1]?.slice(0, -1) ?? ''
          }
          return str.slice(1) // Remove '@' prefix
        }
        case value.startsWith('$'): // Result schema key: $key -> key
        case value.startsWith('§'): // Raw/Cond marker: §RAW -> RAW
          return value.slice(1)
        default: // Includes parameter placeholders like :param
          return value
      }
    }

    return String(value)
  }
}

// --- Utility Functions ---
const stringifyObjectParams = (params: Record<string, any>): Record<string, any> =>
  Object.entries(params).reduce(
    (acc, [key, value]) => {
      acc[key] = value !== null && typeof value === 'object' ? JSON.stringify(value) : value
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

const standardValidate = async <Schema extends StandardSchemaV1>(
  schema: Schema,
  input: StandardSchemaV1.InferInput<Schema>
): Promise<StandardSchemaV1.InferOutput<Schema>> => {
  let result = schema['~standard'].validate(input)
  if (result instanceof Promise) {
    result = await result
  }
  if (result.issues) {
    throw new Error(`Validation failed: ${JSON.stringify(result.issues, null, 2)}`)
  }

  return result.value
}
