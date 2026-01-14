# PetalHop Security Guide

This document outlines the security features implemented in PetalHop and best practices for secure deployment.

## Environment Variables

### Required for Production

```bash
# Encryption key for sensitive data (webhook URLs, etc)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=<64-character-hex-string>

# Initial admin setup token (prevents unauthorized admin registration)
# Generate with: openssl rand -hex 32
INIT_TOKEN=<random-string>

# Your domain for CORS/cookies
ORIGIN=https://your-domain.com

# WireGuard endpoint
SERVER_ENDPOINT=your-domain.com:51820
```

### Optional Security Settings

```bash
NODE_ENV=production          # Enables HSTS, secure cookies
SECURE_COOKIES=true          # Force secure cookies (auto-enabled in production)
```

## Security Features

### Authentication & Sessions
- **Scrypt password hashing** with 16-byte random salts
- **Session tokens** hashed with SHA-256 before storage
- **Secure cookies**: HttpOnly, SameSite=Lax, Secure (in production)
- **30-day session expiry** with automatic extension
- **MFA support** with TOTP and backup codes

### Password Policy
- Minimum 12 characters
- Requires uppercase, lowercase, number, and special character
- Blocks common weak patterns (password, qwerty, admin, etc.)
- Password change requires current password verification

### MFA (Multi-Factor Authentication)
- TOTP-based (Google Authenticator, Authy, etc.)
- 10 one-time backup codes generated during setup
- Backup codes are hashed before storage
- Used backup codes are automatically removed

### Rate Limiting
- **Authentication endpoints**: 10 requests per 15 minutes
- **Agent connections**: 5 requests per minute
- **General API**: 100 requests per minute

### Input Validation
- Request body size limit: 1MB
- Port validation: 1-65535
- IP validation: proper octet range checking
- WireGuard key format validation
- SSRF prevention on webhook URLs

### Security Headers
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` (on non-API routes)
- `Strict-Transport-Security` (in production)

### Data Protection
- Webhook URLs encrypted at rest (AES-256-GCM)
- Audit logging for sensitive operations
- No sensitive data in logs

### CSRF Protection
- SvelteKit's built-in Origin header validation enabled

## Deployment Security

### Docker Hardening

Use `docker-compose.secure.yml` for production:

```bash
docker compose -f docker-compose.secure.yml up -d
```

Features:
- **Minimal capabilities**: Only NET_ADMIN and NET_RAW
- **Read-only filesystem**: With specific writable mounts
- **No privilege escalation**: `no-new-privileges:true`
- **Resource limits**: CPU and memory constraints
- **Health checks**: Automatic container restart on failure

### Egress Firewall

Restrict outbound network access to limit blast radius if compromised.

**Basic setup:**
```bash
chmod +x scripts/egress-firewall.sh
sudo ./scripts/egress-firewall.sh
```

**Strict mode** (blocks all outbound except whitelisted):
```bash
# Edit scripts/egress-firewall-strict.nft to add your webhook server IPs
sudo nft -f scripts/egress-firewall-strict.nft
```

Required outbound access:
- DNS (UDP/TCP 53) - hostname resolution
- NTP (UDP 123) - time synchronization
- HTTPS (TCP 443) - webhook notifications
- HTTP (TCP 80) - Let's Encrypt ACME challenges

### Recommended VPS Hardening

1. **SSH hardening**:
   ```bash
   # /etc/ssh/sshd_config
   PermitRootLogin no
   PasswordAuthentication no
   PubkeyAuthentication yes
   ```

2. **Automatic updates**:
   ```bash
   apt install unattended-upgrades
   dpkg-reconfigure unattended-upgrades
   ```

3. **Fail2ban**:
   ```bash
   apt install fail2ban
   systemctl enable fail2ban
   ```

4. **Dedicated user**:
   ```bash
   useradd -r -s /bin/false petalhop
   chown -R petalhop:petalhop /opt/petalhop/data
   ```

## Audit Logging

Sensitive operations are logged to the `audit_logs` table:

- User login (success/failure)
- User signup
- Agent create/delete
- Settings changes
- Password changes

Query audit logs:
```sql
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100;
```

## Incident Response

### If You Suspect Compromise

1. **Rotate secrets immediately**:
   ```bash
   # Generate new encryption key
   openssl rand -hex 32
   # Generate new init token
   openssl rand -hex 32
   ```

2. **Invalidate all sessions**:
   ```sql
   DELETE FROM sessions;
   ```

3. **Review audit logs**:
   ```sql
   SELECT * FROM audit_logs
   WHERE success = 0
   ORDER BY timestamp DESC;
   ```

4. **Check for unauthorized agents**:
   ```sql
   SELECT * FROM peers ORDER BY id DESC;
   ```

5. **Rotate WireGuard keys** if needed

## Security Checklist

- [ ] `ENCRYPTION_KEY` set to random 64-char hex
- [ ] `INIT_TOKEN` set for first admin registration
- [ ] `NODE_ENV=production` set
- [ ] Using `docker-compose.secure.yml`
- [ ] Egress firewall rules applied
- [ ] SSH key-only authentication
- [ ] Fail2ban installed
- [ ] Automatic security updates enabled
- [ ] Regular backup of `/app/data` directory
- [ ] HTTPS with valid certificate (Let's Encrypt)

## Reporting Security Issues

If you discover a security vulnerability, please report it privately rather than opening a public issue.
