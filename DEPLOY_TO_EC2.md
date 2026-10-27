# CloudMonitor — EC2 Deployment Guide (1 GB RAM Optimized)

> Targeted deployment manual for **Ubuntu 24.04 LTS** on AWS EC2 (`t3.micro`, Public IP: `3.25.150.231`).
> Designed specifically for a 1 GB RAM constraint with memory tuning, zero extra overhead, and private database isolation.

---

## 1. Production Architecture (Lightweight 3-Container Stack)

On a 1 GB RAM server, running the full local monitoring stack (Prometheus, Grafana, Alertmanager, cAdvisor, Node Exporter) would consume ~900 MB–1.1 GB RAM and cause Linux Out-Of-Memory (OOM) kernel panics.

CloudMonitor production uses a minimal **3-container stack** consuming only **~160 MB RAM total**:

```
Internet (Browser / Agent)
           │
           ▼ Port 80 (HTTP)
┌─────────────────────────────────────────────────────────────┐
│ AWS EC2 (3.25.150.231 — Ubuntu 24.04, 1 GB RAM)             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ cloudmonitor-frontend (Nginx Container — ~15 MB RAM)  │  │
│  │   • Serves compiled React 18 SPA static assets        │  │
│  │   • Reverse-proxies /api/* to backend:8000            │  │
│  │   • Reverse-proxies /health to backend:8000/health    │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ Internal Docker Network      │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │ cloudmonitor-backend (FastAPI Container — ~85 MB RAM) │  │
│  │   • JWT Auth, Agent Management, Metrics Ingestion     │  │
│  │   • Exposes port 8000 to internal network only        │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ Internal Docker Network      │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │ cloudmonitor-postgres (Postgres 16 Alpine — ~60 MB RAM│  │
│  │   • Memory-tuned (shared_buffers=64MB, max_conn=40)   │  │
│  │   • NO HOST PORT EXPOSED (strictly private)           │  │
│  │   • Persists data to volume: postgres_data            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Step 1: Transfer Code to EC2

### Option A: Via SCP / Tarball (Recommended if not pushing to public Git)
Run the following from your local Windows PowerShell terminal:

```powershell
cd C:\Projects\AYUSHCMD-GITHUB\cloud_monitor

# 1. Create a clean deployment archive (excludes node_modules and git cache)
tar -czf cloudmonitor-deploy.tar.gz `
  --exclude="frontend/node_modules" `
  --exclude=".git" `
  --exclude="backend/__pycache__" `
  --exclude="backend/.pytest_cache" `
  --exclude="tests/__pycache__" `
  --exclude="agent/__pycache__" `
  .

# 2. Transfer archive to your EC2 instance
scp -i "path\to\cloudmonitor-key.pem" cloudmonitor-deploy.tar.gz ubuntu@3.25.150.231:/home/ubuntu/

# 3. Clean up local tarball
Remove-Item cloudmonitor-deploy.tar.gz
```

### Option B: Via Git Clone (if repository is hosted on GitHub/GitLab)
SSH into your server and clone directly:
```bash
ssh -i "path/to/cloudmonitor-key.pem" ubuntu@3.25.150.231
git clone <YOUR_GIT_REPO_URL> /home/ubuntu/cloud_monitor
```

---

## 3. Step 2: Configure EC2 Host for 1 GB RAM Stability

Log into your EC2 instance via SSH:
```bash
ssh -i "path/to/cloudmonitor-key.pem" ubuntu@3.25.150.231
```

### 2.1 Enable 2 GB Swap Space
Building the React frontend (`npm run build`) in Docker temporarily consumes ~300 MB of RAM. Adding a 2 GB swapfile prevents Docker builds from triggering the Linux OOM killer:

```bash
# Check if swap exists
sudo swapon --show

# If no swap exists, create a 2 GB swapfile:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.2 Extract Application Code (if using Option A)
```bash
mkdir -p /home/ubuntu/cloud_monitor
tar -xzf /home/ubuntu/cloudmonitor-deploy.tar.gz -C /home/ubuntu/cloud_monitor
cd /home/ubuntu/cloud_monitor
rm /home/ubuntu/cloudmonitor-deploy.tar.gz
```

---

## 4. Step 3: Configure Production Environment Variables

Generate cryptographically secure secrets and create `.env`:

```bash
cd /home/ubuntu/cloud_monitor

# Copy production template
cp .env.production.example .env

# Generate secure random secrets
JWT_SECRET=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')

# Inject into .env
sed -i "s/REPLACE_WITH_STRONG_RANDOM_PASSWORD_MIN_24_CHARS/${DB_PASS}/g" .env
sed -i "s/REPLACE_WITH_SECURE_RANDOM_JWT_SECRET_AT_LEAST_32_CHARS/${JWT_SECRET}/g" .env

# Lock file permissions
chmod 600 .env
```

---

## 5. Step 4: Build & Launch Production Stack

Run the lightweight production compose file:

```bash
cd /home/ubuntu/cloud_monitor

# Build images and start containers in the background
docker compose -f docker-compose.prod.yml up -d --build
```

### 5.1 Run Database Migrations
Initialize the PostgreSQL schema with Alembic:

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

---

## 6. Step 5: Verification & Health Checks

### 6.1 Check Container Status & Memory
```bash
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
```
*Expected output: All 3 containers are `Up` and healthy, consuming ~160 MB RAM combined.*

### 6.2 Test HTTP & API Endpoints from EC2
```bash
curl -f http://localhost/health
# Expected: {"status":"healthy",...}
```

### 6.3 Verify Security Isolation (Postgres & Docker Socket)
Confirm PostgreSQL port 5432 is **NOT** listening publicly on the host:
```bash
sudo ss -tulpn | grep 5432
# Expected: Empty output (port 5432 is strictly internal to Docker bridge network)
```

Confirm unauthenticated Docker TCP 2375 is **NOT** listening:
```bash
sudo ss -tulpn | grep 2375
# Expected: Empty output
```

---

## 7. Step 6: Access Dashboard & Enroll Agent

1. **Open your browser** and navigate to:
   ```
   http://3.25.150.231
   ```
2. **Register a production admin account**:
   - Provide email & password (minimum 8 characters).
   - Log into the personalized dashboard.
3. **Connect a Docker Host**:
   - Click **Connect Docker Environment** &rarr; **Generate New Agent Key**.
   - Copy the one-line command displayed in the modal:
     ```bash
     docker run -d \
       --name cloudmonitor-agent \
       --restart unless-stopped \
       -v /var/run/docker.sock:/var/run/docker.sock:ro \
       -e CLOUDMONITOR_SERVER="http://3.25.150.231" \
       -e CLOUDMONITOR_AGENT_KEY="<YOUR_KEY>" \
       cloudmonitor-agent:latest
     ```
   - Run this command on your local machine or any Docker host to stream live metrics to your AWS dashboard.
