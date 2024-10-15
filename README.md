[![npm version](https://img.shields.io/npm/v/@a2lix/schemql.svg)](https://www.npmjs.com/package/@a2lix/schemql)
[![npm downloads](https://img.shields.io/npm/dt/@a2lix/schemql.svg)](https://www.npmjs.com/package/@a2lix/schemql)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![CI](https://github.com/a2lix/schemql/actions/workflows/ci.yml/badge.svg)

# SchemQl

SchemQl is a lightweight TypeScript library that enhances your SQL workflow by combining raw SQL with targeted type safety and schema validation. It simplifies SQL usage in TypeScript by offering two main features:

- **Robust Query Validation**: Ensures the integrity of your query parameters and results through powerful schema validation, reducing runtime errors and data inconsistencies.
- **Selective SQL Typing**: Leverages TypeScript to provide real-time autocomplete and validation for specific parts of your SQL queries, targeting literal string parameters for tables, columns, parameters, and selections.

SchemQl is designed to complement your existing SQL practices, not replace them. It allows you to write raw SQL while benefiting from enhanced safety for specific query elements. Key characteristics include:

- **Database Agnostic**: Works with any database management system (DBMS) that has a compatible JavaScript/TypeScript client library, allowing you to fully leverage your database-specific features.
- **SQL-First approach**: Provides the freedom to write complex SQL queries while offering targeted type safety for literal string parameters.
- **Lightweight**: Focused on core features and intends to remain so.
- **Targeted Type Safety**: Offers TypeScript support for enhanced developer experience with literal string parameters, balancing flexibility and safety.

SchemQl is ideal for developers who appreciate the power of raw SQL but want added security and convenience through schema validation and targeted TypeScript integration for specific query elements.

This library relies solely on [Zod](https://github.com/colinhacks/zod), though future development could include support for [@effect/schema](https://effect.website/docs/guides/schema/getting-started) as well.


## Installation

To install SchemQl, use npm:

```bash
npm i @a2lix/schemql
```

## Usage

Here's a basic example of how to use SchemQl:

<details>
<summary>1. Create your database schema and expose it with a DB interface</summary>

```typescript
// Advice: use your favorite AI to generate your Zod schema from your SQL

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
// Example with better-sqlite3, but you use your favorite
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
  shouldStringifyObjectParams: true,    // Optional. If you use JSON data, SchemQl can handle parameter stringification automatically
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
```
</details>

## Literal String SQL Helpers

| Helper Syntax                   | Raw SQL Result         | Description                                      |
|--------------------------------:|-----------------------:|--------------------------------------------------|
| ${'@table1'}                    | table1                 | Prefix `@` eases table selection/validation |
| ${'@table1.col1'}               | table1.col1            | ... and column selection/validation |
| ${'@table1.col1-'}              | col1                   | ... ending `-` excludes the table name (Useful when table renamed) |
| ${"@table1.col1->'json1'"}      | table1.col1->'json1'   | ... similar with JSON field selection |
| ${"@table1.col1->>'json1'"}     | table1.col1->>'json1'  | ... similar with JSON field selection (raw) |
| ${'$resultCol1'}                | resultCol1             | Prefix `$` eases selection/validation of fields expected by the resultSchema |
| ${':param1'}                    | :param1                | Prefix `:` eases selection/validation of expected params |
| ${{ table1: ['col1', 'col2'] }} | table1 (col1, col2)    | `object` eases generation of INSERT/UPDATE queries |
| ${s.sqlCond(1, 'ASC', 'DESC')}  | ASC                    | `s.sqlCond` eases generation of conditional SQL |
| ${s.sqlRaw(var)}                | var                    | `s.sqlRaw` eases generation of raw SQL |

## Contributing

This library intends to stay lightweight and simple but contributions are welcome!
Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
