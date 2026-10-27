# CloudMonitor — CI/CD Pipeline Setup & Operations Guide

This guide describes the automated continuous integration (CI) and continuous deployment (CD) pipeline configured for the **CloudMonitor** observability platform.

---

## 1. Pipeline Architecture & Workflow Files

The pipeline consists of two GitHub Actions workflow files located in `.github/workflows/`:

```
.github/
└── workflows/
    ├── ci.yml    # Continuous Integration (Lint, Test, Build, Syntax Validation)
    └── cd.yml    # Continuous Deployment (Automated deployment to AWS EC2)
```

### A. CI Workflow (`ci.yml`)
- **Trigger**: Every `push` and `pull_request` targeting `main`, `master`, or `cloudmonitor-integration`, plus manual execution via `workflow_dispatch`.
- **Jobs**:
  1. `backend-test`:
     - Sets up Python 3.12 with pip caching.
     - Installs dependencies from `backend/requirements.txt` and `agent/requirements.txt`.
     - Executes the Python test suite across both application endpoints and agent collector modules (`pytest tests/ agent/tests/`).
  2. `frontend-build`:
     - Sets up Node.js 20 with npm caching.
     - Runs `npm ci` for reproducible dependency installations.
     - Builds the production React 18 / Vite bundle and validates that `dist/index.html` was generated.
  3. `docker-compose-validate`:
     - Validates the syntax and structure of both `docker-compose.yml` (development) and `docker-compose.prod.yml` (production) via `docker compose config`.

### B. CD Workflow (`cd.yml`)
- **Trigger**: Automatically on `push` to the `main` branch after CI tests pass, or manually via `workflow_dispatch`.
- **Concurrency**: Guarded with `group: production-deployment, cancel-in-progress: false` to prevent overlapping deployments.
- **Safety**:
  - Never drops database volumes or runs `docker compose down -v`.
  - Never touches or prints private keys or sensitive credentials.
  - Deploys idempotently using `docker-compose.prod.yml up -d --remove-orphans`.
  - Performs an automated health check against `/health` and `/prom/api/v1/targets` to verify service availability before completing.

---

## 2. Required GitHub Repository Secrets

To enable automated deployment to your AWS EC2 instance, configure the following secrets in GitHub:

1. Navigate to: **GitHub Repository &rarr; Settings &rarr; Secrets and variables &rarr; Actions &rarr; New repository secret**
2. Add the following secrets:

| Secret Name | Description | Example / Format |
| :--- | :--- | :--- |
| `EC2_HOST` | Public IPv4 address or DNS of your EC2 instance | `3.25.150.231` |
| `EC2_USER` | SSH username for the Ubuntu instance | `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | Entire content of your private SSH key (`cloudmonitor-key.pem`) | `-----BEGIN RSA PRIVATE KEY----- ... -----END RSA PRIVATE KEY-----` |

> [!IMPORTANT]
> The private key should be pasted in full, including the `-----BEGIN ...-----` and `-----END ...-----` lines. GitHub Actions masks secret values in all workflow logs automatically.

---

## 3. How Changes Flow to Production

```mermaid
flowchart LR
    Dev["Local Branch (cloudmonitor-integration)"] -->|git push| GH["GitHub: cloudmonitor-integration"]
    GH -->|Triggers CI| CI["GitHub Actions: ci.yml (Tests & Builds)"]
    CI -->|Create PR| PR["Pull Request: cloudmonitor-integration -> main"]
    PR -->|Merge to main| CD["GitHub Actions: cd.yml (Deploy to EC2)"]
    CD -->|SSH & Compose Up| EC2["AWS EC2 Host: http://3.25.150.231"]
```

1. **Develop and test locally** on the integration branch (`cloudmonitor-integration`).
2. **Push to GitHub**: `git push origin cloudmonitor-integration`.
3. **CI verifies the commit**: Checks that all 24 backend/agent tests pass, the frontend builds cleanly, and Compose specifications are valid.
4. **Open a Pull Request**: Merge `cloudmonitor-integration` into `main`.
5. **CD deploys automatically**: GitHub Actions connects securely to EC2, updates the application services, reloads Nginx, and validates the health check endpoints.

---

## 4. Operational Runbook

### Inspecting Workflow Runs & Logs
1. Go to the **Actions** tab on your GitHub repository: `https://github.com/ayushcmd/cloud_monitor/actions`.
2. Select any workflow run to inspect step-by-step logs and execution times.
3. If a step fails, the log output displays the exact error message.

### Diagnosing Common Pipeline Failures
- **Backend Test Failure**:
  - Run tests locally or inside the backend container: `PYTHONPATH=. pytest tests/ agent/tests/`.
  - Verify that mock objects or required test environment variables are properly defined.
- **Frontend Build Failure**:
  - Run `npm run build` inside `frontend/`.
  - Check for JSX syntax errors, unresolved imports, or missing dependencies in `package.json`.
- **SSH Connectivity Failure (`cd.yml`)**:
  - Ensure the EC2 instance is running and has public IPv4 `3.25.150.231`.
  - Check that the AWS Security Group allows inbound SSH (port 22) from GitHub Actions or the relevant CIDR.
  - Verify that `EC2_SSH_PRIVATE_KEY` matches the authorized public key on the EC2 server (`~/.ssh/authorized_keys`).
- **Health Check Failure**:
  - Inspect running container health on EC2: `ssh -i <key> ubuntu@3.25.150.231 "sudo docker ps"`.
  - Check backend logs: `sudo docker logs --tail 50 cloudmonitor-backend`.

### Safe Rollback Procedure
If a bad commit was deployed and needs to be reverted:
1. **Revert the commit on GitHub**:
   ```bash
   git revert <bad-commit-hash>
   git push origin main
   ```
2. **Manual Emergency Rollback on EC2**:
   If GitHub Actions is unreachable, roll back directly on the host without data loss:
   ```bash
   ssh -i cloudmonitor-key.pem ubuntu@3.25.150.231
   cd /home/ubuntu/cloud_monitor
   git checkout <previous-known-good-commit>
   sudo docker compose -f docker-compose.prod.yml build backend frontend
   sudo docker compose -f docker-compose.prod.yml up -d
   ```
   > [!CAUTION]
   > Never run `docker compose down -v` on EC2. The `-v` flag deletes the named volume `cloudmonitor-prod_postgres_data`, which contains user accounts, enrolled agents, and telemetry records.
