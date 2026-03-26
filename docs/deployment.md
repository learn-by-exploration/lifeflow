# Deployment Guide

> How to run LifeFlow in production.

## Option 1: Docker (Recommended)

### Quick Start

```bash
docker compose up -d
```

The app is available at `http://localhost:3456`.

### docker-compose.yml

```yaml
services:
  lifeflow:
    build: .
    ports:
      - "3456:3456"
    volumes:
      - ./data:/app/data    # Database persistence
    restart: unless-stopped
```

### Custom Port

```yaml
    ports:
      - "8080:3456"
    environment:
      - PORT=3456
```

### Health Check

The Dockerfile includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3456/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
```

Check container health: `docker inspect --format='{{.State.Health.Status}}' lifeflow-lifeflow-1`

## Option 2: Bare Metal

### Requirements

- Node.js 22+ (also works on Node 20)
- npm 9+

### Install

```bash
git clone https://github.com/learn-by-exploration/lifeflow.git
cd lifeflow
npm install --omit=dev
```

### Run

```bash
PORT=3456 DB_DIR=/var/lib/lifeflow node src/server.js
```

### Systemd Service

```ini
# /etc/systemd/system/lifeflow.service
[Unit]
Description=LifeFlow Task Manager
After=network.target

[Service]
Type=simple
User=lifeflow
WorkingDirectory=/opt/lifeflow
Environment=PORT=3456
Environment=DB_DIR=/var/lib/lifeflow
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now lifeflow
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | HTTP server port |
| `DB_DIR` | Project root | Directory for `lifeflow.db` |
| `NODE_ENV` | — | Set to `production` for production |

## Reverse Proxy

### Caddy (simplest)

```
lifeflow.example.com {
    reverse_proxy localhost:3456
}
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name lifeflow.example.com;

    ssl_certificate     /etc/letsencrypt/live/lifeflow.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lifeflow.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backups

### Automatic

LifeFlow creates automatic JSON backups:
- On server startup
- Every 24 hours
- Rotates last 7 backups

Backups are stored in `backups/` (relative to project root).

### Manual

```bash
# Trigger backup via API
curl -b cookies.txt -X POST http://localhost:3456/api/backup

# List backups
curl -b cookies.txt http://localhost:3456/api/backups

# Full JSON export
curl -b cookies.txt http://localhost:3456/api/export > backup.json
```

### Database File

The SQLite database is a single file (`lifeflow.db` in `DB_DIR`). You can also back it up directly:

```bash
# Safe copy (handles WAL mode)
sqlite3 /var/lib/lifeflow/lifeflow.db ".backup /backups/lifeflow-$(date +%Y%m%d).db"
```

## Upgrades

```bash
cd /opt/lifeflow
git pull
npm install --omit=dev
sudo systemctl restart lifeflow
```

Database migrations run automatically on startup (additive only — never drops tables).

For Docker:

```bash
docker compose pull
docker compose up -d --build
```
