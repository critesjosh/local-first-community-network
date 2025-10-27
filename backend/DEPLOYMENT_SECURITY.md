# Deployment Security Checklist

Use this checklist when deploying the backend to the internet for testing or production.

## Pre-Deployment Checklist

### 1. Environment Configuration

- [ ] Copy `.env.production.example` to `.env`
- [ ] Change `DB_PASSWORD` from default to a strong password
- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` with your app's domain(s)
  ```bash
  # Example:
  ALLOWED_ORIGINS=https://myapp.com,https://www.myapp.com
  ```
- [ ] Review and adjust rate limiting if needed

### 2. Database Security

- [ ] Use a strong, unique database password (minimum 16 characters)
- [ ] Ensure PostgreSQL port (5432) is NOT exposed to the internet
  - Docker Compose exposes it to localhost by default
  - If using a cloud database, use private networking
- [ ] Enable SSL/TLS for database connections (for cloud databases)
- [ ] Set up regular automated backups
- [ ] Configure `max_connections` appropriately in PostgreSQL

### 3. Application Security

- [x] Rate limiting enabled (30 posts per 15 min, 100 API requests per 15 min)
- [x] Request validation and sanitization implemented
- [x] Security headers configured (Helmet.js)
- [x] CORS properly configured
- [x] Input size limits enforced (10MB max)
- [x] Database query timeouts configured (30 seconds)
- [ ] Review authentication is enabled (Ed25519 signature verification)

### 4. Infrastructure Security

#### Reverse Proxy (REQUIRED)

**⚠️ CRITICAL: Never expose the backend directly to the internet**

Use a reverse proxy (Nginx, Caddy, or Traefik) to:

- [ ] **Enable HTTPS/TLS** (use Let's Encrypt for free certificates)
- [ ] Add additional rate limiting at the proxy level
- [ ] Hide internal server details
- [ ] Enable request logging
- [ ] Add DDoS protection

**Example Nginx configuration:**

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL certificates (use certbot for Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Proxy to backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Example Caddy configuration (automatic HTTPS):**

```caddyfile
api.yourdomain.com {
    reverse_proxy localhost:3000

    # Automatic HTTPS with Let's Encrypt
    # Caddy handles this automatically!
}
```

#### Firewall Configuration

- [ ] Configure firewall to only allow:
  - Port 443 (HTTPS) from internet
  - Port 80 (HTTP) from internet (for HTTPS redirect)
  - Port 22 (SSH) from your IP only
- [ ] Block all other incoming traffic
- [ ] Backend port (3000) should NOT be accessible from internet

```bash
# Example UFW firewall rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from YOUR_IP_ADDRESS to any port 22
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 5. Monitoring and Logging

- [ ] Set up log aggregation (e.g., Loki, ELK, CloudWatch)
- [ ] Configure alerts for:
  - High error rates
  - Database connection failures
  - High CPU/memory usage
  - Disk space running low
- [ ] Monitor rate limit hits
- [ ] Set up uptime monitoring (e.g., UptimeRobot, Pingdom)
- [ ] Review logs regularly for suspicious activity

### 6. Container Security

- [x] Using non-root user in Docker container
- [x] Resource limits configured (CPU: 1 core, Memory: 512MB)
- [ ] Keep base images updated regularly
- [ ] Scan images for vulnerabilities
  ```bash
  docker scan local-community-backend
  ```
- [ ] Use Docker secrets for sensitive data (advanced)

### 7. Backup and Recovery

- [ ] Set up automated database backups (daily minimum)
- [ ] Test backup restoration process
- [ ] Store backups in a different location (not same server)
- [ ] Document recovery procedures
- [ ] Set retention policy (e.g., keep 30 days)

```bash
# Example backup script
docker-compose exec postgres pg_dump -U postgres local_community > backup_$(date +%Y%m%d).sql
```

### 8. Updates and Maintenance

- [ ] Keep Node.js dependencies updated
  ```bash
  npm audit
  npm update
  ```
- [ ] Subscribe to security advisories for dependencies
- [ ] Update Docker images regularly
- [ ] Apply OS security patches
- [ ] Review and update rate limits based on usage patterns

## Deployment Commands

### Initial Deployment

```bash
cd backend

# 1. Set up environment
cp .env.production.example .env
nano .env  # Edit with secure values

# 2. Build and start services
docker-compose up -d

# 3. Initialize database (if needed)
docker-compose exec backend npm run db:setup

# 4. Check health
curl http://localhost:3000/health

# 5. View logs
docker-compose logs -f
```

### Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Check health
docker-compose logs -f backend
```

## Security Testing

Before going live, test these scenarios:

- [ ] Test rate limiting (send many requests quickly)
- [ ] Test invalid input handling (malformed JSON, missing fields)
- [ ] Test oversized requests (try sending > 10MB)
- [ ] Test SQL injection attempts (should be prevented by parameterized queries)
- [ ] Test CORS from unauthorized domains
- [ ] Test authentication with invalid signatures
- [ ] Test health check works correctly
- [ ] Verify database queries timeout properly

## Incident Response Plan

If you detect suspicious activity:

1. **Check logs**: `docker-compose logs backend | grep -i error`
2. **Monitor rate limits**: Look for IPs hitting rate limits
3. **Review database**: Check for unusual posts or patterns
4. **Block malicious IPs**: Add to firewall or reverse proxy
5. **Scale if needed**: Increase resources if under load
6. **Notify users**: If breach detected, inform users immediately

## Regular Maintenance Schedule

### Daily
- Check health endpoint
- Review error logs

### Weekly
- Review access logs for suspicious patterns
- Check resource usage (CPU, memory, disk)
- Verify backups are running

### Monthly
- Update dependencies (`npm audit`)
- Review and adjust rate limits
- Update Docker images
- Review security advisories
- Test backup restoration

## Additional Security Measures (Optional)

### Advanced Protection

- [ ] Implement IP allowlisting for admin operations
- [ ] Add geographic filtering (block countries if not needed)
- [ ] Set up DDoS protection (Cloudflare, AWS Shield)
- [ ] Implement request signing/HMAC
- [ ] Add Web Application Firewall (WAF)
- [ ] Set up intrusion detection (Fail2ban)

### Compliance

- [ ] Review data retention policies
- [ ] Implement GDPR compliance if serving EU users
- [ ] Add privacy policy and terms of service
- [ ] Document data handling procedures
- [ ] Set up audit logging

## Quick Reference

### Check Status
```bash
docker-compose ps
docker-compose logs -f
curl http://localhost:3000/health
```

### View Resource Usage
```bash
docker stats
```

### Database Connection
```bash
docker-compose exec postgres psql -U postgres -d local_community
```

### Stop Services
```bash
docker-compose down
```

### Emergency Stop
```bash
docker-compose down
docker stop local-community-backend local-community-postgres
```

## Support

For issues or questions:
- Check logs: `docker-compose logs`
- Review this checklist
- Test health endpoint
- Check firewall rules
- Verify environment variables

## Security Contact

If you discover a security vulnerability:
1. Do NOT create a public GitHub issue
2. Email security contact (add your email here)
3. Include details: what, when, how to reproduce
4. Allow reasonable time for fix before disclosure
