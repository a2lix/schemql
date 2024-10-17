import assert from 'node:assert'
import { describe, it } from 'node:test'
import { SchemQl } from '@/index'
import { z } from 'zod'
import { type DB, zSessionDb, zUserDb } from './schema_zod'

const normalizeString = (str: string) => {
  return str.replace(/\s+/g, ' ').trim()
}

const schemQlConfigured = new SchemQl<DB>({
  queryFns: {
    all: (sql, params) => {
      assert.strictEqual(sql, 'SELECT * FROM users WHERE id = :id')
      assert.deepEqual(params, {
        id: 'uuid-1',
      })
      return [
        {
          id: 'uuid-1',
          email: 'john@doe.com',
          metadata: '{}',
          created_at: 1500000000,
          disabled_at: null,
        },
      ]
    },
  },
})

describe('SchemQl - global options', () => {
  it('should return the expected result, using global.queriesFn if no override', async () => {
    const results = await schemQlConfigured.all({
      params: {
        id: 'uuid-1',
      },
    })('SELECT * FROM users WHERE id = :id')

    assert.deepEqual(results, [
      {
        id: 'uuid-1',
        email: 'john@doe.com',
        metadata: '{}',
        created_at: 1500000000,
        disabled_at: null,
      },
    ])
  })

  it('should return the expected result, using override queriesFn if provided', async () => {
    const results = await schemQlConfigured.all({
      queryFn: (sql, params) => {
        assert.strictEqual(sql, 'SELECT * FROM users WHERE id = :id')
        assert.deepEqual(params, {
          id: 'uuid-1',
        })
        return {
          rows: [
            {
              id: 'uuid-1',
              email: 'john@doe.com',
              metadata: '{}',
              created_at: 1500000000,
              disabled_at: null,
            },
          ],
        }
      },
      params: {
        id: 'uuid-1',
      },
    })('SELECT * FROM users WHERE id = :id')

    assert.deepEqual(results, {
      rows: [
        {
          id: 'uuid-1',
          email: 'john@doe.com',
          metadata: '{}',
          created_at: 1500000000,
          disabled_at: null,
        },
      ],
    })
  })
})

const schemQlUnconfigured = new SchemQl<DB>({
  shouldStringifyObjectParams: true,
})

describe('SchemQl - queryFn related', () => {
  it('should throw an error if queryFn is missing', () => {
    assert.rejects(
      async () => {
        await schemQlUnconfigured.all({})('SELECT * FROM users')
      },
      {
        name: 'Error',
        message: 'No queryFn provided for method all',
      }
    )
  })

  it('should return the expected result with queryFn as a Promise', async () => {
    const results = await schemQlUnconfigured.all({
      queryFn: async (sql, _params) => {
        assert.strictEqual(sql, 'SELECT * FROM users')
        return await Promise.resolve([
          {
            id: 'uuid-1',
            email: 'john@doe.com',
            metadata: '{}',
            created_at: 1500000000,
            disabled_at: null,
          },
        ])
      },
    })('SELECT * FROM users')

    assert.deepEqual(results, [
      {
        id: 'uuid-1',
        email: 'john@doe.com',
        metadata: '{}',
        created_at: 1500000000,
        disabled_at: null,
      },
    ])
  })
})

describe('SchemQl - resultSchema related', () => {
  it('should return the expected result, parsed by resultSchema if provided', async () => {
    const results = await schemQlUnconfigured.all({
      queryFn: (sql, _params) => {
        assert.strictEqual(sql, 'SELECT * FROM users')
        return [
          {
            id: 'uuid-1',
            email: 'john@doe.com',
            metadata: '{}',
            created_at: 1500000000,
            disabled_at: null,
          },
        ]
      },
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
    ])
  })
})

describe('SchemQl - paramsSchema related', () => {
  it('should return the expected result, params parsed by paramsSchema if provided', async () => {
    const result = await schemQlUnconfigured.first({
      queryFn: (sql, params) => {
        assert.strictEqual(sql, 'SELECT * FROM users WHERE id = :id')
        assert.deepEqual(params, { id: '1' })
        return {
          id: 'uuid-1',
          email: 'john@doe.com',
          metadata: '{}',
          created_at: 1500000000,
          disabled_at: null,
        }
      },
      params: {
        id: 'uuid-1',
      },
      paramsSchema: zUserDb.pick({ id: true }).transform(() => ({ id: '1' })),
    })('SELECT * FROM users WHERE id = :id')

    assert.deepEqual(result, {
      id: 'uuid-1',
      email: 'john@doe.com',
      metadata: '{}',
      created_at: 1500000000,
      disabled_at: null,
    })
  })
})

describe('SchemQl - sql literal', () => {
  it('should return the expected result', async () => {
    const result = await schemQlUnconfigured.first({
      queryFn: (sql, params) => {
        assert.strictEqual(
          sql,
          normalizeString(`
            SELECT
              *,
              LENGTH(id) AS length_id
            FROM users
            WHERE
              id = :id
          `)
        )
        assert.deepEqual(params, { id: 'uuid-1' })
        return {
          id: 'uuid-1',
          email: 'john@doe.com',
          metadata: '{}',
          created_at: 1500000000,
          disabled_at: null,
          length_id: 6,
        }
      },
      resultSchema: zUserDb.and(z.object({ length_id: z.number() })),
      params: {
        id: 'uuid-1',
      },
      paramsSchema: zUserDb.pick({ id: true }),
    })((s) =>
      normalizeString(s.sql`
          SELECT
            *,
            LENGTH(${'@users.id-'}) AS ${'$length_id'}
          FROM ${'@users'}
          WHERE
            ${'@users.id-'} = ${':id'}
    `)
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
    const result = await schemQlUnconfigured.first({
      queryFn: (sql, params) => {
        assert.strictEqual(
          sql,
          normalizeString(`
            SELECT
              *,
              LENGTH(id) AS length_id
            FROM users
            WHERE
              id = :id
          `)
        )
        assert.deepEqual(params, { id: 'uuid-1' })
        return undefined
      },
      resultSchema: zUserDb.and(z.object({ length_id: z.number() })).optional(),
      params: {
        id: 'uuid-1',
      },
      paramsSchema: zUserDb.pick({ id: true }),
    })((s) =>
      normalizeString(s.sql`
          SELECT
            *,
            LENGTH(${'@users.id-'}) AS ${'$length_id'}
          FROM ${'@users'}
          WHERE
            ${'@users.id-'} = ${':id'}
    `)
    )

    assert.deepEqual(result, undefined)
  })
})

describe('SchemQl - sql literal advanced', () => {
  it('should return the expected result - with object helper', async () => {
    const result = await schemQlUnconfigured.first({
      queryFn: (sql, params) => {
        assert.strictEqual(
          sql,
          normalizeString(`
            INSERT INTO
              users (id, email, metadata)
            VAlUES
              (
                :id
                , :email
                , json(:metadata)
              )
            RETURNING *
          `)
        )
        assert.deepEqual(params, { id: 'uuid-2', email: 'jane@doe.com', metadata: '{"role":"admin"}' })
        return {
          id: 'uuid-2',
          email: 'jane@doe.com',
          metadata: '{"role":"admin"}',
          created_at: 1500000000,
          disabled_at: null,
        }
      },
      resultSchema: zUserDb,
      params: {
        id: 'uuid-2',
        email: 'jane@doe.com',
        metadata: { role: 'admin' },
      },
      paramsSchema: zUserDb.pick({ id: true, email: true, metadata: true }),
    })((s) =>
      normalizeString(s.sql`
        INSERT INTO
          ${{ users: ['id', 'email', 'metadata'] }}
        VAlUES
          (
            ${':id'}
            , ${':email'}
            , json(${':metadata'})
          )
        RETURNING *
      `)
    )

    assert.deepEqual(result, {
      id: 'uuid-2',
      email: 'jane@doe.com',
      metadata: {
        role: 'admin',
      },
      created_at: 1500000000,
      disabled_at: null,
    })
  })
  it('should return the expected result - with sqlCond & sqlRaw helpers', async () => {
    const result = await schemQlUnconfigured.all({
      queryFn: (sql, params) => {
        assert.strictEqual(
          sql,
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
        assert.deepEqual(params, {
          cursor: 'uuid-1',
          limit: 10,
        })
        return []
      },
      resultSchema: z.object({ user_id: zUserDb.shape.id, session_id: zSessionDb.shape.id }).array(),
      params: {
        cursor: 'uuid-1',
        limit: 10,
      },
      paramsSchema: z.object({ cursor: z.string(), limit: z.number() }),
    })((s) =>
      normalizeString(s.sql`
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
      `)
    )

    assert.deepEqual(result, [])
  })
})
