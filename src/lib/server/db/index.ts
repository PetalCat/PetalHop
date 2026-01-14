import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';

if (!building && !env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = createClient({ url: env.DATABASE_URL || 'file:local.db' });

// Enable WAL mode for better concurrency
if ((env.DATABASE_URL || 'file:local.db').startsWith('file:')) {
    try {
        await client.execute('PRAGMA journal_mode = WAL');
        await client.execute('PRAGMA synchronous = NORMAL');
    } catch (e) {
        console.warn('Failed to enable WAL mode:', e);
    }
}

export const db = drizzle(client, { schema });

// Run migrations on startup (skip during build)
if (!building) {
    try {
        await migrate(db, { migrationsFolder: 'drizzle' });
        console.log('Migrations applied successfully');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}
