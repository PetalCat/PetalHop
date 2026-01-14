import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '$lib/server/password';
import { validatePasswordStrength } from '$lib/server/passwordPolicy';
import { logAudit } from '$lib/server/audit';

// POST /api/auth/password - Change password (requires current password)
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await event.request.json();

	if (!body.currentPassword || !body.newPassword) {
		return json({ error: 'Current password and new password are required' }, { status: 400 });
	}

	// Get user with password hash
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, event.locals.user.id))
		.limit(1);

	if (!user) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	// Verify current password
	const validCurrentPassword = await verifyPassword(body.currentPassword, user.passwordHash);
	if (!validCurrentPassword) {
		await logAudit(event, {
			action: 'user.login.failed',
			resourceType: 'user',
			resourceId: user.id,
			details: { reason: 'invalid_current_password', action: 'password_change' },
			success: false
		});
		return json({ error: 'Current password is incorrect' }, { status: 401 });
	}

	// Validate new password strength
	const passwordValidation = validatePasswordStrength(body.newPassword);
	if (!passwordValidation.valid) {
		return json({
			error: 'New password does not meet requirements',
			details: passwordValidation.errors
		}, { status: 400 });
	}

	// Ensure new password is different from current
	const samePassword = await verifyPassword(body.newPassword, user.passwordHash);
	if (samePassword) {
		return json({ error: 'New password must be different from current password' }, { status: 400 });
	}

	// Hash and update password
	const newPasswordHash = await hashPassword(body.newPassword);
	await db
		.update(users)
		.set({ passwordHash: newPasswordHash })
		.where(eq(users.id, user.id));

	await logAudit(event, {
		action: 'user.login',
		resourceType: 'user',
		resourceId: user.id,
		details: { action: 'password_changed' }
	});

	return json({ success: true, message: 'Password changed successfully' });
};
