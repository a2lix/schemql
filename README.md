[![npm version](https://img.shields.io/npm/v/@a2lix/schemql.svg)](https://www.npmjs.com/package/@a2lix/schemql)
[![npm downloads](https://img.shields.io/npm/dt/@a2lix/schemql.svg)](https://www.npmjs.com/package/@a2lix/schemql)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![CI](https://github.com/a2lix/schemql/actions/workflows/ci.yml/badge.svg)

# SchemQl

**SchemQl** simplifies database interactions by allowing you to write advanced SQL queries that fully leverage the features of your DBMS, while providing type safety through the use of schemas and offering convenient execution methods.

**Key features:**

- **Database agnostic**: Compatible with any DBMS.
- **SQL-first**: Write SQL with precise type checks on literals like tables, columns (JSON fields & some JSONPath included), and parameters.
- **Flexible parameters** Supports single objects, arrays of objects, and asynchronous generators for parameters.
- **Schema-agnostic**: Use any validation library implementing [Standard Schema](https://github.com/standard-schema/standard-schema) (Zod, ArkType, Effect, etc.) to validate and parse parameters and query results.
- **Iterative Execution** Process large datasets efficiently using asynchronous generators.


![Screenshot](https://github.com/user-attachments/assets/86b1c3cd-2393-4914-b943-b249d6dad59a)

## Installation

To install SchemQl, use:

```bash
npm i @a2lix/schemql
```

## Usage

Here's a basic example of how to use SchemQl:

<details>
<summary>1. Create your database schema and expose it with a DB interface</summary>
<br>
Tip: Use your favorite AI to generate a schema from your SQL.

If using JSON data, leverage the built-in `parseJsonPreprocessor`.

**With Zod:**
```typescript
import { parseJsonPreprocessor } from '@a2lix/schemql'
import { z } from 'zod'

export const zUserDb = z.object({
  id: z.string(),
  email: z.string(),
  metadata: z.preprocess(
    parseJsonPreprocessor,   // ! Zod handles JSON parsing for this JSON columns 'metadata'
    z.object({
      role: z.enum(['user', 'admin']).default('user'),
    })
  ),
  created_at: z.int(),
  disabled_at: z.int().nullable(),
})

type UserDb = z.infer<typeof zUserDb>
```

**With ArkType:**
```typescript
import { type } from 'arktype'

export const userDb = type({
  id: 'string',
  email: 'string',
  metadata: type("string.json.parse").to({
    role: "'user' | 'admin' = 'user'",
  }),
  created_at: 'number.epoch',
  disabled_at: 'number.epoch | null',
})

type UserDb = typeof userDb.infer
```

// ...

```typescript
export interface DB {
  users: UserDb
  // ...other mappings
}
```
</details>

<details>
<summary>2. Initialize your instance of SchemQl with the DB interface typing</summary>
<br>
Example with better-sqlite3 adapter.

```typescript
import { SchemQl } from '@a2lix/schemql'
import { BetterSqlite3Adapter } from '@a2lix/schemql/adapters/better-sqlite3'
import type { DB } from '@/schema'

const schemQl = new SchemQl<DB>({
  adapter: new BetterSqlite3Adapter('sqlite.db'),
  shouldStringifyObjectParams: true,   // Optional. Automatically stringify objects (useful for JSON)
})
```
</details>

<details open>
<summary>3. Use your instance of SchemQl with `.first()` / `.firstOrThrow()` / `.all()` / `.iterate()`</summary>
<br>
Simple use with resultSchema only and no SQL literal string

```typescript
const allUsers = await schemQl.all({
  resultSchema: zUserDb.array(),
})(`
  SELECT *
  FROM users
`)
```

More advanced example

```typescript
const firstUser = await schemQl.first({
  params: { id: 'uuid-1' },
  paramsSchema: zUserDb.pick({ id: true }),
  resultSchema: z.object({ user_id: zUserDb.shape.id, length_id: z.number() }),
})((s) => s.sql`
  SELECT
    ${'@users.id'} AS ${'$user_id'},
    LENGTH(${'@users.id'}) AS ${'$length_id'}
  FROM ${'@users'}
  WHERE
    ${'@users.id'} = ${':id'}
`);

const allUsersLimit = await schemQl.all({
  params: { limit: 10 },
  resultSchema: zUserDb.array(),   // ! Note the array() use for .all() case
})((s) => s.sql`
  SELECT
    ${'@users.*'}
  FROM ${'@users'}
  LIMIT ${':limit'}
`)

const allUsersPaginated = await schemQl.all({
  params: {
    limit: data.query.limit + 1,
    cursor: data.query.cursor,
    dir: data.query.dir,
  },
  paramsSchema: zRequestQuery,
  resultSchema: zUserDb.array(),   // ! Note the array() use for .all() case
})((s) => s.sql`
  SELECT
    ${'@users.*'}
  FROM ${'@users'}
  ${s.sqlCond(
    !!data.query.cursor,
    s.sql`WHERE ${'@users.id'} ${s.sqlRaw(data.query.dir === 'next' ? '>' : '<')} ${':cursor'}`
  )}
  ORDER BY ${'@users.id'} ${s.sqlCond(data.query.dir === 'prev', 'DESC', 'ASC')}
  LIMIT ${':limit'}
`)
```

Automatically stringify JSON params 'metadata' (by schemQl if enabled)
and get parsed JSON metadata, as well (if your schema preprocess is set rightly)

```typescript
const firstSession = await schemQl.firstOrThrow({
  params: {
    id: uuidv4(),
    user_id: 'uuid-1',
    metadata: {
      account: 'credentials',
    },
    expiresAtAdd: 10000,
  },
  paramsSchema: zSessionDb.pick({ id: true, user_id: true, metadata: true }).and(z.object({
    expiresAtAdd: z.number().int(),
  })),
  resultSchema: zSessionDb,
})((s) => s.sql`
  INSERT INTO
    ${{ sessions: ['id', 'user_id', 'metadata', 'expires_at'] }}
  VALUES
    (
      ${':id'}
      , ${':user_id'}
      , JSON(${':metadata'})
      , STRFTIME('%s', 'now') + ${':expiresAtAdd'}
    )
  RETURNING *
`)
```

Handle iteration when required

```typescript
const iterResults = await schemQl.first({
  params: [
    { id: 'uuid-1' },
    { id: 'uuid-2' }
  ],
  paramsSchema: zUserDb.pick({ id: true }).array(),  // ! Note the array() use when array of params
  resultSchema: zUserDb,
})((s) => s.sql`
  SELECT *
  FROM ${'@users'}
  WHERE
    ${'@users.id'} = ${':id'}
`)

const iterResults = await schemQl.first({
  params: function* () {
    yield { id: 'uuid-1' }
    yield { id: 'uuid-2' }
  },
  paramsSchema: zUserDb.pick({ id: true }),
  resultSchema: zUserDb,
})((s) => s.sql`
  SELECT *
  FROM ${'@users'}
  WHERE
    ${'@users.id'} = ${':id'}
`)

const iterResults = await schemQl.iterate({
  resultSchema: zUserDb,
})((s) => s.sql`
  SELECT *
  FROM ${'@users'}
  LIMIT 10
`)
```
</details>

## Literal String SQL Helpers

| **Helper Syntax**                  | **Raw SQL Result**           | **Description** |
|:-----------------------------------|:-----------------------------|:----------------|
| `${'@table1'}`                     | `table1`                     | **Table Selection**: Prefix `@` eases table selection/validation |
| `${'@table1.col1'}`                | `table1.col1`                | **Column Selection**: Use `@` for table and column validation |
| `${'@table1.col1-'}`               | `col1`                       | Final `-` excludes table name (useful if table is aliased) |
| `${'@table1.col1 ->jsonpath1'}`    | `table1.col1 ->'jsonpath1'`  | **JSON Field Selection**: Use `->` for JSON paths |
| `${'@table1.col1 ->>jsonpath1'}`   | `table1.col1 ->>'jsonpath1'` | JSON field (raw) with `->>` syntax |
| `${'@table1.col1 $.jsonpath1'}`    | `'$.jsonpath1'`              | JSONPath with `$` prefix |
| `${'$resultCol1'}`                 | `resultCol1`                 | **Result Selection**: `$` prefix targets resultSchema fields |
| `${':param1'}`                     | `:param1`                    | **Parameter Selection**: `:` prefix eases parameter validation |
| `${{ table1: ['col1', 'col2'] }}`  | `table1 (col1, col2)`        | **Batch Column Selection**: Object syntax useful for INSERT |
| `${s.sqlCond(1, 'ASC', 'DESC')}`   | `ASC`                        | **Conditional SQL**: `s.sqlCond` for conditional clauses |
| `${s.sqlRaw(var)}`                 | `var`                        | **Raw SQL**: Use `s.sqlRaw` for unprocessed SQL fragments |


## Contributing

Contributions are welcome! This library aims to remain lightweight and focused, so please keep PRs concise and aligned with this goal.

This library relies on [Standard Schema](https://github.com/standard-schema/standard-schema) for schema validation, so you can use [Zod](https://zod.dev/), [ArkType](https://arktype.io/), [@effect/schema](https://effect.website/docs/schema/introduction/), or any compatible library.

## License

This project is licensed under the MIT License.
