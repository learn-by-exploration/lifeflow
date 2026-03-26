# API Quickstart

> All examples use `curl`. Replace `localhost:3456` with your host.

## Authentication

### Register

```bash
curl -X POST http://localhost:3456/api/register \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"username": "demo", "password": "SecureP@ss1"}'
```

### Login

```bash
curl -X POST http://localhost:3456/api/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"username": "demo", "password": "SecureP@ss1"}'
```

All subsequent requests use `-b cookies.txt` for session auth.

## Areas

```bash
# Create
curl -b cookies.txt -X POST http://localhost:3456/api/areas \
  -H 'Content-Type: application/json' \
  -d '{"name": "Health", "color": "#4CAF50"}'

# List
curl -b cookies.txt http://localhost:3456/api/areas

# Update
curl -b cookies.txt -X PUT http://localhost:3456/api/areas/1 \
  -H 'Content-Type: application/json' \
  -d '{"name": "Fitness", "color": "#2196F3"}'

# Delete
curl -b cookies.txt -X DELETE http://localhost:3456/api/areas/1
```

## Goals

```bash
# Create (under area 1)
curl -b cookies.txt -X POST http://localhost:3456/api/goals \
  -H 'Content-Type: application/json' \
  -d '{"title": "Run 5K", "area_id": 1}'

# List
curl -b cookies.txt http://localhost:3456/api/goals

# Update
curl -b cookies.txt -X PUT http://localhost:3456/api/goals/1 \
  -H 'Content-Type: application/json' \
  -d '{"title": "Run 10K", "status": "in_progress"}'
```

## Tasks

```bash
# Create (under goal 1)
curl -b cookies.txt -X POST http://localhost:3456/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Morning jog", "goal_id": 1, "priority": "high"}'

# List all
curl -b cookies.txt http://localhost:3456/api/tasks

# List by date range
curl -b cookies.txt 'http://localhost:3456/api/tasks?from=2025-01-01&to=2025-01-31'

# Update
curl -b cookies.txt -X PUT http://localhost:3456/api/tasks/1 \
  -H 'Content-Type: application/json' \
  -d '{"status": "done"}'

# Delete
curl -b cookies.txt -X DELETE http://localhost:3456/api/tasks/1
```

## Search

```bash
curl -b cookies.txt 'http://localhost:3456/api/search?q=morning&type=tasks'
```

## NLP Task Parsing

```bash
curl -b cookies.txt -X POST http://localhost:3456/api/nlp/parse \
  -H 'Content-Type: application/json' \
  -d '{"text": "Buy groceries tomorrow at 5pm #errands !high"}'
```

Returns structured task data with extracted date, time, tags, and priority.

## Focus Sessions

```bash
# Start a focus session
curl -b cookies.txt -X POST http://localhost:3456/api/focus/sessions \
  -H 'Content-Type: application/json' \
  -d '{"task_id": 1, "duration": 25}'

# Complete with reflection
curl -b cookies.txt -X PUT http://localhost:3456/api/focus/sessions/1 \
  -H 'Content-Type: application/json' \
  -d '{"status": "completed", "reflection": "Good session"}'
```

## Data Export & Backup

```bash
# Full JSON export
curl -b cookies.txt http://localhost:3456/api/export > backup.json

# Import
curl -b cookies.txt -X POST http://localhost:3456/api/import \
  -H 'Content-Type: application/json' \
  -d @backup.json

# Trigger backup
curl -b cookies.txt -X POST http://localhost:3456/api/backup

# List backups
curl -b cookies.txt http://localhost:3456/api/backups
```

## Health Check

```bash
curl http://localhost:3456/health
# {"status":"ok"}
```

---

See [docs/openapi.yaml](../openapi.yaml) for the full API specification (157 routes).
