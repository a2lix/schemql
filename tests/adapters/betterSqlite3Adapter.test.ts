import assert from 'node:assert'
import { before, describe, it } from 'node:test'
import { BetterSqlite3Adapter, SchemQlAdapterErrorCode } from '@/adapters/betterSqlite3Adapter'
// @ts-ignore
import SQLite from 'better-sqlite3'

describe('BetterSqlite3Adapter', () => {
  let adapter: BetterSqlite3Adapter

  before(() => {
    const db = new SQLite(':memory:', {
      // verbose: console.log,
    })

    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE
      );

      INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
    `)

    adapter = new BetterSqlite3Adapter(db)
  })

  describe('queryAll', () => {
    it('should return all rows matching the query', () => {
      const users = adapter.queryAll<{ id: number; name: string; email: string }>('SELECT * FROM users')()
      assert.strictEqual(users.length, 1)
      assert.strictEqual(users[0]!.name, 'Alice')
      assert.strictEqual(users[0]!.email, 'alice@example.com')
    })

    it('should handle parameters correctly', () => {
      adapter.queryAll(`
        INSERT INTO users (name, email) VALUES (:name, :email)
      `)({ name: 'Bob', email: 'bob@example.com' })

      const users = adapter.queryAll<{ id: number; name: string; email: string }>(
        'SELECT * FROM users WHERE name = :name'
      )({ name: 'Bob' })
      assert.strictEqual(users.length, 1)
      assert.strictEqual(users[0]!.name, 'Bob')
      assert.strictEqual(users[0]!.email, 'bob@example.com')
    })
  })

  describe('queryFirst', () => {
    it('should return the first row matching the query', () => {
      const user = adapter.queryFirst<{ id: number; name: string; email: string }>('SELECT * FROM users')()
      assert.strictEqual(user?.name, 'Alice')
      assert.strictEqual(user?.email, 'alice@example.com')
    })

    it('should handle parameters correctly', () => {
      const user = adapter.queryFirst<{ id: number; name: string; email: string }>(
        'SELECT * FROM users WHERE name = :name'
      )({ name: 'Alice' })
      assert.strictEqual(user?.name, 'Alice')
      assert.strictEqual(user?.email, 'alice@example.com')
    })

    it('should return undefined if no rows match the query', () => {
      const user = adapter.queryFirst<{ id: number; name: string; email: string }>(
        'SELECT * FROM users WHERE name = :name'
      )({ name: 'Charlie' })
      assert.strictEqual(user, undefined)
    })
  })

  describe('queryFirstOrThrow', () => {
    it('should return the first row matching the query', () => {
      const user = adapter.queryFirstOrThrow<{ id: number; name: string; email: string }>('SELECT * FROM users')()
      assert.strictEqual(user.name, 'Alice')
      assert.strictEqual(user.email, 'alice@example.com')
    })

    it('should handle parameters correctly', () => {
      const user = adapter.queryFirstOrThrow<{ id: number; name: string; email: string }>(
        'SELECT * FROM users WHERE name = :name'
      )({ name: 'Alice' })
      assert.strictEqual(user.name, 'Alice')
      assert.strictEqual(user.email, 'alice@example.com')
    })

    it('should throw an error if no rows match the query', () => {
      assert.throws(
        () =>
          adapter.queryFirstOrThrow<{ id: number; name: string; email: string }>(
            'SELECT * FROM users WHERE name = :name'
          )({ name: 'Charlie' }),
        {
          code: SchemQlAdapterErrorCode.NoResult,
          message: 'No result',
        }
      )
    })
  })

  describe('queryIterate', () => {
    it('should iterate over all rows matching the query', () => {
      const iterator = adapter.queryIterate<{ id: number; name: string; email: string }>('SELECT * FROM users')()
      let result = iterator.next()
      assert.strictEqual(result.done, false)
      assert.strictEqual(result.value.name, 'Alice')
      assert.strictEqual(result.value.email, 'alice@example.com')

      result = iterator.next()
      assert.strictEqual(result.done, false)
      assert.strictEqual(result.value.name, 'Bob')
      assert.strictEqual(result.value.email, 'bob@example.com')

      result = iterator.next()
      assert.strictEqual(result.done, true)
      assert.strictEqual(result.value, undefined)
    })

    it('should handle parameters correctly', () => {
      const iterator = adapter.queryIterate<{ id: number; name: string; email: string }>(
        'SELECT * FROM users WHERE name = :name'
      )({ name: 'Alice' })
      let result = iterator.next()
      assert.strictEqual(result.done, false)
      assert.strictEqual(result.value.name, 'Alice')
      assert.strictEqual(result.value.email, 'alice@example.com')

      result = iterator.next()
      assert.strictEqual(result.done, true)
      assert.strictEqual(result.value, undefined)
    })
  })

  describe('Error Handling', () => {
    it('should throw a SchemQlAdapterError for a unique constraint violation', () => {
      assert.throws(
        () =>
          adapter.queryAll(`
            INSERT INTO users (name, email) VALUES (:name, :email)
          `)({ name: 'Charlie', email: 'alice@example.com' }),
        {
          code: SchemQlAdapterErrorCode.UniqueConstraint,
          message: 'UNIQUE constraint failed: users.email',
        }
      )
    })

    it('should throw a SchemQlAdapterError for a foreign key constraint violation', () => {
      // Add a table with a foreign key constraint to test
      adapter.queryAll(`
        CREATE TABLE posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `)()

      assert.throws(
        () =>
          adapter.queryAll(`
            INSERT INTO posts (title, user_id) VALUES (:title, :user_id)
          `)({ title: 'Post 1', user_id: 999 }),
        {
          code: SchemQlAdapterErrorCode.ForeignkeyConstraint,
          message: 'FOREIGN KEY constraint failed',
        }
      )
    })

    it('should throw a SchemQlAdapterError for a not null constraint violation', () => {
      assert.throws(
        () =>
          adapter.queryAll(`
            INSERT INTO users (name) VALUES (:name)
          `)({ name: 'Charlie' }),
        {
          code: SchemQlAdapterErrorCode.NotnullConstraint,
          message: 'NOT NULL constraint failed: users.email',
        }
      )
    })

    it('should throw a SchemQlAdapterError for a check constraint violation', () => {
      // SQLite does not support CHECK constraints natively, but we can test with a CHECK constraint
      adapter.queryAll(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price REAL NOT NULL CHECK (price > 0)
        )
      `)()

      assert.throws(
        () =>
          adapter.queryAll(`
            INSERT INTO products (name, price) VALUES (:name, :price)
          `)({ name: 'Product 1', price: -1 }),
        {
          code: SchemQlAdapterErrorCode.CheckConstraint,
          message: 'CHECK constraint failed: price > 0',
        }
      )
    })

    it('should throw a SchemQlAdapterError for a primary key constraint violation', () => {
      assert.throws(
        () =>
          adapter.queryAll(`
            INSERT INTO users (id, name, email) VALUES (:id, :name, :email)
          `)({ id: 1, name: 'Charlie', email: 'charlie@example.com' }),
        {
          code: SchemQlAdapterErrorCode.PrimarykeyConstraint,
          message: 'UNIQUE constraint failed: users.id',
        }
      )
    })

    it('should throw a generic SchemQlAdapterError for an unknown error', () => {
      assert.throws(
        () =>
          adapter.queryAll(`
            SELECT * FROM non_existent_table
          `)(),
        {
          code: SchemQlAdapterErrorCode.Generic,
          message: 'no such table: non_existent_table',
        }
      )
    })
  })
})
