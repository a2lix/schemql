import assert from 'node:assert'
import { describe, it } from 'node:test'
import { SchemQl, type SchemQlAdapter } from '@/index'
import { z } from 'zod'
import { type DB, zSessionDb, zUserDb } from './schema_zod'
import { type DB as DB_AT, tUserDb } from './schema_arktype'

const normalizeString = (str: string) => {
  return str.replace(/\s+/g, ' ').trim()
}

const fixtureUsers = new Map([
  [
    'uuid-1',
    {
      id: 'uuid-1',
      email: 'john@doe.com',
      metadata: '{}',
      created_at: 1500000000,
      disabled_at: null,
    },
  ],
  [
    'uuid-2',
    {
      id: 'uuid-2',
      email: 'jane@doe.com',
      metadata: '{}',
      created_at: 1500000000,
      disabled_at: null,
    },
  ],
])

class SyncAdapter implements SchemQlAdapter {
  queryFirst = (sql: string) => {
    return (params?: any): unknown | undefined => {
      throw new Error('Not implemented')
    }
  }
  queryAll = (sql: string) => {
    return (params?: any): unknown[] => {
      throw new Error('Not implemented')
    }
  }
  queryFirstOrThrow = (sql: string) => {
    return (params?: any): unknown => {
      throw new Error('Not implemented')
    }
  }
  queryIterate = (sql: string) => {
    return (params?: any): (() => Generator<unknown, void, unknown>) => {
      throw new Error('Not implemented')
    }
  }
}
class AsyncAdapter implements SchemQlAdapter {
  queryFirst = (sql: string) => {
    return async (_params?: Record<string, unknown>): Promise<unknown> => {
      await Promise.resolve()
      throw new Error('Not implemented')
    }
  }
  queryAll = (sql: string) => {
    return async (params?: any): Promise<unknown[]> => {
      await Promise.resolve()
      throw new Error('Not implemented')
    }
  }
  queryFirstOrThrow = (sql: string) => {
    return async (params?: any): Promise<unknown> => {
      await Promise.resolve()
      throw new Error('Not implemented')
    }
  }
  queryIterate = (sql: string) => {
    return (params?: any): (() => AsyncGenerator<unknown, void, unknown>) => {
      throw new Error('Not implemented')
    }
  }
}

describe('SchemQl - queryFn related', () => {
  it('should return the expected result with async queryFns', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends AsyncAdapter {
        override queryAll = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users')
          return async (params?: any) => {
            return await Array.from(fixtureUsers.values())
          }
        }
        override queryIterate = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users')
          return (params?: any) =>
            async function* () {
              yield (await fixtureUsers.get('uuid-1'))
              yield (await fixtureUsers.get('uuid-2'))
            }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const results = await schemQl.all({})('SELECT * FROM users')
    assert.deepEqual(results, Array.from(fixtureUsers.values()))

    const iterResults = await schemQl.iterate({})('SELECT * FROM users')
    const res1 = await iterResults?.next()
    const res2 = await iterResults?.next()
    assert.deepEqual(res1.value, fixtureUsers.get('uuid-1'))
    assert.deepEqual(res2.value, fixtureUsers.get('uuid-2'))
  })

  it('should return the expected result with array params', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users WHERE users.id = :id')
          return (params?: any) => {
            return fixtureUsers.get(params?.id)
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const iterResults = await schemQl.first({
      params: [
        {
          id: 'uuid-1',
        },
        {
          id: 'uuid-2',
        },
      ],
      paramsSchema: zUserDb.pick({ id: true }).array(),
      // resultSchema: zUserDb,
    })((s) => s.sql`SELECT * FROM ${'@users'} WHERE ${'@users.id'} = ${':id'}`)

    const res1 = await iterResults?.next()
    const res2 = await iterResults?.next()
    assert.deepEqual(res1.value, fixtureUsers.get('uuid-1'))
    assert.deepEqual(res2.value, fixtureUsers.get('uuid-2'))
  })

  it('should return the expected result with generator params', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users WHERE users.id = :id')
          return (params?: any) => {
            return fixtureUsers.get(params?.id)
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const iterResults = await schemQl.first({
      params: function* () {
        yield { id: 'uuid-1' }
        yield { id: 'uuid-2' }
      },
      paramsSchema: zUserDb.pick({ id: true }),
      // resultSchema: zUserDb,
    })((s) => s.sql`SELECT * FROM ${'@users'} WHERE ${'@users.id'} = ${':id'}`)

    const res1 = await iterResults?.next()
    const res2 = await iterResults?.next()
    assert.deepEqual(res1.value, fixtureUsers.get('uuid-1'))
    assert.deepEqual(res2.value, fixtureUsers.get('uuid-2'))
  })

  it('should return the expected result with async generator params', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users WHERE users.id = :id')
          return (params?: any) => {
            return fixtureUsers.get(params?.id)
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const iterResults = await schemQl.first({
      params: async function* () {
        yield await { id: 'uuid-1' }
        yield await { id: 'uuid-2' }
      },
      paramsSchema: zUserDb.pick({ id: true }),
      // resultSchema: zUserDb,
    })((s) => s.sql`SELECT * FROM ${'@users'} WHERE ${'@users.id'} = ${':id'}`)

    const res1 = await iterResults?.next()
    const res2 = await iterResults?.next()
    assert.deepEqual(res1.value, fixtureUsers.get('uuid-1'))
    assert.deepEqual(res2.value, fixtureUsers.get('uuid-2'))
  })

  it('should return the expected result with iterate method', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryIterate = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users')
          return (params?: any) =>
            function* () {
              yield fixtureUsers.get('uuid-1')
              yield fixtureUsers.get('uuid-2')
            }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const iterResults = await schemQl.iterate({
      // resultSchema: zUserDb,
    })((s) => s.sql`SELECT * FROM ${'@users'}`)

    const res1 = await iterResults?.next()
    const res2 = await iterResults?.next()
    assert.deepEqual(res1.value, fixtureUsers.get('uuid-1'))
    assert.deepEqual(res2.value, fixtureUsers.get('uuid-2'))
  })
})

describe('SchemQl - resultSchema related', () => {
  it('should return the expected result, parsed by resultSchema if provided - Zod', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryAll = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users')
            return (params?: any) => {
              return Array.from(fixtureUsers.values())
            }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const results = await schemQl.all({
      resultSchema: zUserDb.array(),
    })('SELECT * FROM users')

    assert.deepEqual(results, [
      {
        id: 'uuid-1',
        email: 'john@doe.com',
        metadata: { role: 'user' },
        created_at: 1500000000,
        disabled_at: null,
      },
      {
        id: 'uuid-2',
        email: 'jane@doe.com',
        metadata: { role: 'user' },
        created_at: 1500000000,
        disabled_at: null,
      },
    ])
  })

  it('should return the expected result, parsed by resultSchema if provided - ArkType', async () => {
    const schemQl = new SchemQl<DB_AT>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryAll = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users')
            return (params?: any) => {
              return Array.from(fixtureUsers.values())
            }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const results = await schemQl.all({
      resultSchema: tUserDb.array(),
    })('SELECT * FROM users')

    assert.deepEqual(results, [
      {
        id: 'uuid-1',
        email: 'john@doe.com',
        metadata: { role: 'user' },
        created_at: 1500000000,
        disabled_at: null,
      },
      {
        id: 'uuid-2',
        email: 'jane@doe.com',
        metadata: { role: 'user' },
        created_at: 1500000000,
        disabled_at: null,
      },
    ])
  })
})

describe('SchemQl - paramsSchema related', () => {
  it('should return the expected result, params parsed by paramsSchema if provided', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(sql, 'SELECT * FROM users WHERE id = :id')
          return (params?: any) => {
            assert.deepEqual(params, { id: '1' })
            return undefined
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const result = await schemQl.first({
      params: {
        id: 'uuid-1',
      },
      paramsSchema: zUserDb.pick({ id: true }).transform(() => ({ id: '1' })),
    })('SELECT * FROM users WHERE id = :id')

    assert.deepEqual(result, undefined)
  })
})

describe('SchemQl - sql literal', () => {
  it('should return the expected result', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(
            sql,
// biome-ignore format:
`
SELECT
  *,
  LENGTH(users.id) AS length_id
FROM users
WHERE
  users.id = :id
`
          )
          return (params?: any) => {
            assert.deepEqual(params, { id: 'uuid-1' })
            return {
              id: 'uuid-1',
              email: 'john@doe.com',
              metadata: '{}',
              created_at: 1500000000,
              disabled_at: null,
              length_id: 6,
            }
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const result = await schemQl.first({
      resultSchema: zUserDb.and(z.object({ length_id: z.number() })),
      params: {
        id: 'uuid-1',
      },
      paramsSchema: zUserDb.pick({ id: true }),
    })(
      (s) =>
        // biome-ignore format:
        s.sql`
SELECT
  *,
  LENGTH(${'@users.id'}) AS ${'$length_id'}
FROM ${'@users'}
WHERE
  ${'@users.id'} = ${':id'}
`
    )

    assert.deepEqual(result, {
      id: 'uuid-1',
      email: 'john@doe.com',
      metadata: {
        role: 'user',
      },
      created_at: 1500000000,
      disabled_at: null,
      length_id: 6,
    })
  })

  it('should return the expected result, undefined case', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(
            sql,
// biome-ignore format:
`
SELECT
  *,
  LENGTH(users.id) AS length_id
FROM users
WHERE
  users.id = :id
`
          )
          return (params?: any) => {
            assert.deepEqual(params, { id: 'uuid-1' })
            return undefined
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const result = await schemQl.first({
      resultSchema: zUserDb.and(z.object({ length_id: z.number() })).optional(),
      params: {
        id: 'uuid-1',
      },
      paramsSchema: zUserDb.pick({ id: true }),
    })(
      (s) =>
        // biome-ignore format:
        s.sql`
SELECT
  *,
  LENGTH(${'@users.id'}) AS ${'$length_id'}
FROM ${'@users'}
WHERE
  ${'@users.id'} = ${':id'}
`
    )

    assert.deepEqual(result, undefined)
  })
})

describe('SchemQl - sql literal advanced', () => {
  it('should return the expected result - with object helper', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(
            sql,
// biome-ignore format:
`
INSERT INTO
  users (id, email, metadata)
VAlUES
  (
    :id
    , :email
    , json(:metadata)
  )
RETURNING *
`
          )
          return (params?: any) => {
            assert.deepEqual(params, { id: 'uuid-3', email: 'joke@doe.com', metadata: '{"role":"admin"}' })
            return {
              id: 'uuid-3',
              email: 'joke@doe.com',
              metadata: '{"role":"admin"}',
              created_at: 1500000000,
              disabled_at: null,
            }
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const result = await schemQl.first({
      resultSchema: zUserDb,
      params: {
        id: 'uuid-3',
        email: 'joke@doe.com',
        metadata: { role: 'admin' },
      },
      paramsSchema: zUserDb.pick({ id: true, email: true, metadata: true }),
    })(
      (s) =>
        // biome-ignore format:
        s.sql`
INSERT INTO
  ${{ users: ['id', 'email', 'metadata'] }}
VAlUES
  (
    ${':id'}
    , ${':email'}
    , json(${':metadata'})
  )
RETURNING *
`
    )

    assert.deepEqual(result, {
      id: 'uuid-3',
      email: 'joke@doe.com',
      metadata: {
        role: 'admin',
      },
      created_at: 1500000000,
      disabled_at: null,
    })
  })

  it('should return the expected result - with sql helper', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryFirst = (sql: string) => {
          assert.strictEqual(
            sql,
// biome-ignore format:
`
UPDATE users
SET
  metadata = JSON_SET(users.metadata,
    '$.email_variant', :emailVariant,
    '$.email_verified_at', :emailVerifiedAt
  )
WHERE
  users.metadata->'role' = :role
RETURNING *
`
          )
          return (params?: any) => {
            assert.deepEqual(params, {
              role: 'admin',
              emailVariant: 'jane+variant@doe.com',
              emailVerifiedAt: 1500000000,
            })
            return {
              id: 'uuid-2',
              email: 'jane@doe.com',
              metadata: '{"role":"admin","email_variant":"jane+variant@doe.com","email_verified_at":1500000000}',
              created_at: 1500000000,
              disabled_at: null,
            }
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const result = await schemQl.first({
      resultSchema: zUserDb,
      params: {
        role: 'admin',
        emailVariant: 'jane+variant@doe.com',
        emailVerifiedAt: 1500000000,
      },
      paramsSchema: z.object({ role: z.string(), emailVariant: z.string(), emailVerifiedAt: z.number().int() }),
    })(
      (s) =>
        // biome-ignore format:
        s.sql`
UPDATE ${'@users'}
SET
  ${'@users.metadata-'} = JSON_SET(${'@users.metadata'},
    ${'@users.metadata $.email_variant'}, ${':emailVariant'},
    ${'@users.metadata $.email_verified_at'}, ${':emailVerifiedAt'}
  )
WHERE
  ${'@users.metadata ->role'} = ${':role'}
RETURNING *
`
    )

    assert.deepEqual(result, {
      id: 'uuid-2',
      email: 'jane@doe.com',
      metadata: {
        role: 'admin',
        email_variant: 'jane+variant@doe.com',
        email_verified_at: 1500000000,
      },
      created_at: 1500000000,
      disabled_at: null,
    })
  })

  it('should return the expected result - with sqlCond & sqlRaw helpers', async () => {
    const schemQl = new SchemQl<DB>({
      // biome-ignore format:
      adapter: new class extends SyncAdapter {
        override queryAll = (sql: string) => {
          assert.strictEqual(
            normalizeString(sql),
// biome-ignore format:
normalizeString(`
WITH
_user_scope AS (
  SELECT *
  FROM users
  WHERE
    id > :cursor
    AND 0=0
  ORDER BY id ASC
  LIMIT :limit
)

SELECT
  _us.id AS user_id,
  s.id AS session_id
FROM _user_scope _us
LEFT JOIN sessions s ON s.id = _us.id
`)
          )
          return (params?: any) => {
            assert.deepEqual(params, {
              cursor: 'uuid-1',
              limit: 10,
            })
            return []
          }
        }
      },
      shouldStringifyObjectParams: true,
    })
    const result = await schemQl.all({
      resultSchema: z.object({ user_id: zUserDb.shape.id, session_id: zSessionDb.shape.id }).array(),
      params: {
        cursor: 'uuid-1',
        limit: 10,
      },
      paramsSchema: z.object({ cursor: z.string(), limit: z.number() }),
    })(
      (s) =>
        // biome-ignore format:
        s.sql`
WITH
_user_scope AS (
  SELECT *
  FROM ${'@users'}
  ${s.sqlCond(
    true,
    s.sql`
    WHERE
      ${'@users.id-'} ${s.sqlRaw(true ? '>' : '<')} ${':cursor'}
      ${s.sqlCond(true, s.sql`AND ${s.sqlCond(false, '1=1', '0=0')}`)}
    `
  )}
  ORDER BY ${'@users.id-'} ${s.sqlCond(false, 'DESC', 'ASC')}
  LIMIT ${':limit'}
)

SELECT
  _us.${'@users.id-'} AS ${'$user_id'},
  s.${'@sessions.id-'} AS ${'$session_id'}
FROM _user_scope _us
LEFT JOIN ${'@sessions'} s ON s.${'@sessions.id-'} = _us.${'@users.id-'}
`
    )

    assert.deepEqual(result, [])
  })
})
