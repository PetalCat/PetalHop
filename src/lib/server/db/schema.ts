import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ============ Authentication ============

// Users with optional MFA
export const users = sqliteTable('users', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	mfaSecret: text('mfa_secret'), // TOTP secret, null if MFA not set up
	mfaEnabled: integer('mfa_enabled', { mode: 'boolean' }).notNull().default(false),
	isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

// Sessions for authentication
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	// Track if MFA was verified for this session
	mfaVerified: integer('mfa_verified', { mode: 'boolean' }).notNull().default(false)
});

// App-wide settings
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// ============ WireGuard Management ============

// WireGuard peers (Agents)
export const peers = sqliteTable('peers', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	wgIp: text('wg_ip').notNull().unique(), // e.g. 10.8.0.2
	publicKey: text('public_key'), // Null until agent connects
	setupToken: text('setup_token').unique(), // One-time token for initial connection
	status: text('status', { enum: ['pending', 'active'] }).notNull().default('pending'),
	type: text('type', { enum: ['agent', 'device'] }).notNull().default('agent')
});

// Port forwarding rules: public_port -> peer_ip:private_port
export const forwards = sqliteTable('forwards', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	peerId: integer('peer_id')
		.notNull()
		.references(() => peers.id, { onDelete: 'cascade' }),
	protocol: text('protocol', { enum: ['tcp', 'udp'] }).notNull(),
	publicPort: integer('public_port').notNull(),
	privatePort: integer('private_port').notNull()
});

// ============ Type Exports ============

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Peer = typeof peers.$inferSelect;
export type NewPeer = typeof peers.$inferInsert;
export type Forward = typeof forwards.$inferSelect;
export type NewForward = typeof forwards.$inferInsert;
