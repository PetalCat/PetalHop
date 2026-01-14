import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';

if (!building && !env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// better-sqlite3 takes a file path, strip 'file:' if present
let dbPath = env.DATABASE_URL || 'local.db';
if (dbPath.startsWith('file:')) {
    dbPath = dbPath.slice(5);
}

let sqlite: Database.Database;
if (!building) {
    sqlite = new Database(dbPath);
    // Enable WAL mode for concurrency
    sqlite.pragma('journal_mode = WAL');
}

export const db = !building ? drizzle(sqlite!, { schema }) : ({} as any);

// Run migrations on startup (skip during build)
if (!building) {
    try {
        await migrate(db, { migrationsFolder: 'drizzle' });
        console.log('Migrations applied successfully');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}
