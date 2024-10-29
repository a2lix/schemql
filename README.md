[![npm version](https://img.shields.io/npm/v/@a2lix/schemql.svg)](https://www.npmjs.com/package/@a2lix/schemql)
[![npm downloads](https://img.shields.io/npm/dt/@a2lix/schemql.svg)](https://www.npmjs.com/package/@a2lix/schemql)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![CI](https://github.com/a2lix/schemql/actions/workflows/ci.yml/badge.svg)

# SchemQl

**SchemQl** combines the power of raw SQL with TypeScript's type safety, letting you access any DBMS through JavaScript/TypeScript while preventing runtime errors and enhancing autocompletion.

**Key features:**

- **Database agnostic**: Compatible with any DBMS (e.g. better-sqlite3)
- **SQL-first**: Write SQL with precise type checks on literals like tables, columns (JSON fields & some JSONPath included), and parameters.
- **Lightweight**: Focuses on essentials only.
- **Zod integration**: Optional schema validation (JSON fields include), adds error-proofing and parsing for your SQL params and results.
- **Targeted Type Safety**: Autocomplete and validate only where it matters.


![Screenshot from 2024-10-29 14-41-05(1)](https://github.com/user-attachments/assets/86b1c3cd-2393-4914-b943-b249d6dad59a)



## Installation

To install SchemQl, use:

```bash
npm i @a2lix/schemql
```

## Usage

Here's a basic example of how to use SchemQl:

<details>
<summary>1. Create your database schema and expose it with a DB interface</summary>

```typescript
// Tips: use your favorite AI to generate your Zod schema from your SQL

import { parseJsonPreprocessor } from '@a2lix/schemql'
import { z } from 'zod'

export const zUserDb = z.object({
  id: z.string(),
  email: z.string(),
  metadata: z.preprocess(
    parseJsonPreprocessor,   // Optionally let Zod handle JSON parsing if you use JSON data
    z.object({
      role: z.enum(['user', 'admin']).default('user'),
    })
  ),
  created_at: z.number().int(),
  disabled_at: z.number().int().nullable(),
})

type UserDb = z.infer<typeof zUserDb>

// ...

export interface DB {
  users: UserDb
  // ...other mappings
}
```
</details>

<details>
<summary>2. Initialize your instance of SchemQl with the DB interface typing</summary>

```typescript
// Example with better-sqlite3, but you can use your favorite library
import { SchemQl } from '@a2lix/schemql'
import SQLite from 'better-sqlite3'
import type { DB } from '@/schema'

const db = new SQLite('sqlite.db')

const schemQl = new SchemQl<DB>({
  queryFns: {    // Optional at this level, but eases usage
    first: (sql, params) => {
      const stmt = db.prepare(sql)
      return stmt.get(params)
    },
    firstOrThrow: (sql, params) => {
      const stmt = db.prepare(sql)
      const first = stmt.get(params)
      if (first === undefined) {
        throw new Error('No result found')
      }
      return first
    },
    all: (sql, params) => {
      const stmt = db.prepare(sql)
      return params ? stmt.all(params) : stmt.all()
    }
  },
  shouldStringifyObjectParams: true,   // Optional. Automatically stringify objects (useful for JSON)
})
```
</details>

<details open>
<summary>3. Use your instance of SchemQl to `.first()` / `.firstOrThrow()` / `.all()`</summary>

```typescript
// Simple use with resultSchema only and no SQL literal string
const allUsers = await schemQl.all({
  resultSchema: zUserDb.array(),
})(`
  SELECT *
  FROM users
`)

// More advanced
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
  resultSchema: zUserDb.array(),
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
  resultSchema: zUserDb.array(),
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

// Automatically stringify JSON params 'metadata' (by schemQl if enabled)
// and get parsed JSON metadata, as well (if Zod preprocess set rightly)
const firstSession = await schemQl.firstOrThrow({
  params: {
    id: uuidv4(),
    user_id: 'uuid-1',
    metadata: {
      account: 'credentials',
    },
    expiresAtAdd: 10000,
  },
  paramsSchema: z.object({
    ...zSessionDb.pick({ id: true, user_id: true, metadata: true }).shape,
    expiresAtAdd: z.number().int(),
  }),
  resultSchema: zSessionDb,
})((s) => s.sql`
  INSERT INTO
    ${{ sessions: ['id', 'user_id', 'metadata', 'expires_at'] }}
  VALUES
    (
      ${':id'}
      , ${':user_id'}
      , json(${':metadata'})
      , strftime('%s', 'now') + ${':expiresAtAdd'}
    )
  RETURNING *
`)
```
</details>

## Literal String SQL Helpers

| **Helper Syntax**                  | **Raw SQL Result**           | **Description** |
|:-----------------------------------|:-----------------------------|:----------------|
| `${'@table1'}`                     | `table1`                     | **Table Selection**: Prefix `@` eases table selection/validation |
| `${'@table1.col1'}`                | `table1.col1`                | **Column Selection**: Use `@` for table and column validation |
| `${'@table1.col1-'}`               | `col1`                       | Final `-` excludes table name (useful if table is aliased) |
| `${'@table1.col1 ->jsonpath1'}`    | `table1.col1->'jsonpath1'`   | **JSON Field Selection**: Use `->` for JSON paths |
| `${'@table1.col1 ->>jsonpath1'}`   | `table1.col1->>'jsonpath1'`  | JSON field (raw) with `->>` syntax |
| `${'@table1.col1 $.jsonpath1'}`    | `'$.jsonpath1'`              | JSONPath with `$` prefix |
| `${'$resultCol1'}`                 | `resultCol1`                 | **Result Selection**: `$` prefix targets resultSchema fields |
| `${':param1'}`                     | `:param1`                    | **Parameter Selection**: `:` prefix eases parameter validation |
| `${{ table1: ['col1', 'col2'] }}`  | `table1 (col1, col2)`        | **Batch Column Selection**: Object syntax useful for INSERT |
| `${s.sqlCond(1, 'ASC', 'DESC')}`   | `ASC`                        | **Conditional SQL**: `s.sqlCond` for conditional clauses |
| `${s.sqlRaw(var)}`                 | `var`                        | **Raw SQL**: Use `s.sqlRaw` for unprocessed SQL fragments |


## Contributing

Contributions are welcome! This library aims to remain lightweight and focused, so please keep PRs concise and aligned with this goal.

This library relies solely on [Zod](https://github.com/colinhacks/zod), but it could also include support for other schema libraries, such as [@effect/schema](https://effect.website/docs/guides/schema/getting-started).

## License

This project is licensed under the MIT License.
