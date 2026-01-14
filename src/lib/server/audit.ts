import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';
import type { RequestEvent } from '@sveltejs/kit';

export type AuditAction =
	| 'user.login'
	| 'user.login.failed'
	| 'user.logout'
	| 'user.signup'
	| 'user.mfa.setup'
	| 'user.mfa.verify'
	| 'user.mfa.verify.failed'
	| 'agent.create'
	| 'agent.delete'
	| 'agent.connect'
	| 'forward.create'
	| 'forward.delete'
	| 'settings.update'
	| 'peer.create'
	| 'peer.delete';

export interface AuditLogEntry {
	action: AuditAction;
	userId?: string | null;
	resourceType?: string;
	resourceId?: string;
	details?: Record<string, unknown>;
	success?: boolean;
}

/**
 * Log an audit event
 */
export async function logAudit(
	event: RequestEvent | null,
	entry: AuditLogEntry
): Promise<void> {
	try {
		const ipAddress = event?.getClientAddress() ?? null;
		const userAgent = event?.request.headers.get('user-agent') ?? null;
		const userId = entry.userId ?? event?.locals.user?.id ?? null;

		await db.insert(auditLogs).values({
			userId,
			action: entry.action,
			resourceType: entry.resourceType ?? null,
			resourceId: entry.resourceId ?? null,
			ipAddress,
			userAgent,
			details: entry.details ? JSON.stringify(entry.details) : null,
			success: entry.success ?? true
		});
	} catch (e) {
		// Don't let audit logging failures break the application
		console.error('Failed to write audit log:', e);
	}
}

/**
 * Log a successful action
 */
export async function auditSuccess(
	event: RequestEvent,
	action: AuditAction,
	resourceType?: string,
	resourceId?: string,
	details?: Record<string, unknown>
): Promise<void> {
	await logAudit(event, {
		action,
		resourceType,
		resourceId,
		details,
		success: true
	});
}

/**
 * Log a failed action
 */
export async function auditFailure(
	event: RequestEvent,
	action: AuditAction,
	resourceType?: string,
	resourceId?: string,
	details?: Record<string, unknown>
): Promise<void> {
	await logAudit(event, {
		action,
		resourceType,
		resourceId,
		details,
		success: false
	});
}
