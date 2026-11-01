# CloudMonitor — Production Security Audit & Vulnerability Assessment (Issue #12)

**Audit Phase:** Phase 1 — Read-Only Production Security Review\
**Author:** Senior Application Security Engineer & AWS Security Architect\
**Date:** October 31, 2026\
**Repository:** [github.com/ayushcmd/cloud_monitor](https://github.com/ayushcmd/cloud_monitor)\
**Issue Reference:** [GitHub Issue #12: Production Security Audit](https://github.com/ayushcmd/cloud_monitor/issues/12)\
**Related Issue:** [GitHub Issue #9: Migrate Deployment from SSH to AWS Systems Manager (SSM)](https://github.com/ayushcmd/cloud_monitor/issues/9)\
**Target Platform:** AWS EC2 (`t3.micro`, Ubuntu 24.04 LTS, `ap-southeast-2`)\
**Deployment Model:** Docker Compose (`docker-compose.prod.yml`)\
**Classification Standard:** Strict Fact-Classification Matrix (`[SRC]`, `[AWS]`, `[RUN]`, `[CFG]`, `[DOC]`, `[PLN]`, `[UNK]`)\

---

## 1. Executive Summary

This security audit delivers a comprehensive, non-destructive, read-only security assessment of the **CloudMonitor** application, container infrastructure, CI/CD pipelines, and supporting AWS cloud environment. The audit was conducted in compliance with strict read-only parameters: zero code, Dockerfile, Compose, workflow, AWS infrastructure, or runtime configurations were modified.

CloudMonitor is an observability platform designed to monitor Docker hosts and container telemetry via a lightweight Python agent, FastAPI backend, PostgreSQL relational store, and Prometheus/Alertmanager metrics pipeline.

### High-Level Security Posture Assessment

| Security Domain | Evaluated Posture | Summary of Key Findings |
| :--- | :---: | :--- |
| **Authentication & Authorization** | **MODERATE** | Strong bcrypt password hashing and high-entropy agent keys stored only as SHA-256 hashes. Cross-user data isolation is strictly enforced in database queries. However, authentication endpoints lack rate limiting, registration permits user enumeration, and hardcoded fallback JWT secrets exist in `config.py`. |
| **API & Transport Security** | **CRITICAL** | Production site is served over unencrypted HTTP (`http://3.25.150.231`). Passwords, JWTs, and agent keys traverse the public internet in cleartext. Prometheus reverse-proxy route (`/prom/`) is unauthenticated and exposes lifecycle endpoints (`/-/quit`, `/-/reload`). |
| **Secrets & Credential Management** | **GOOD** | `.gitignore` properly excludes `.env`, `*.pem`, `*.key`, and deployment archives. Templates use placeholders. GitHub Actions workflows pass secrets via environment variables. |
| **Container & Runtime Isolation** | **MODERATE** | Backend runs as non-root (`cloudmonitor`). PostgreSQL publishes no host ports. However, the agent container runs as `root` and mounts `/var/run/docker.sock`, which represents full root host escalation potential if compromised. Containers lack explicit CPU/memory limits in Compose. |
| **AWS Perimeter & IAM** | **HIGH RISK** | EC2 instance lacks an IAM instance profile (`IamInstanceProfile: null`), which blocks AWS Systems Manager (SSM) agent registration and necessitates fragile SSH deployments. Port 22 is restricted to specific CIDRs, causing GitHub runner timeouts. Auto-assigned public IP lacks Elastic IP persistence. |
| **CI/CD & Supply Chain** | **MODERATE** | GitHub Actions workflows enforce read-only permissions and strict SSH host-key checks. However, Python dependencies have unpinned upper bounds, and `pytest` is packaged into the production backend image. |
| **Observability & Logging** | **POOR** | Security events (failed logins, rejected agent keys) generate no structured audit logs. Alertmanager webhooks are empty (`webhook_configs: []`), preventing external notification delivery. Health checks do not probe database availability. |

---

## 2. Audit Scope and Method

### 2.1 Scope of Review

The audit covered all assets comprising the CloudMonitor repository and associated AWS infrastructure:
1. **Application Codebase:** FastAPI routers (`auth.py`, `agents.py`, `metrics.py`), core settings (`config.py`), database engine (`database.py`), health checks (`health.py`), and Python agent (`collector.py`, `sender.py`, `config.py`, `main.py`).
2. **Container Specifications:** `docker-compose.yml`, `docker-compose.prod.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `agent/Dockerfile`.
3. **Network & Proxy Rules:** `frontend/nginx.conf`, `Caddyfile`.
4. **CI/CD Workflows:** `.github/workflows/ci.yml`, `.github/workflows/cd.yml`.
5. **AWS Infrastructure (Read-Only):** EC2 instance `i-0c6927e10d2f58d23`, Security Group `sg-0e3f2d84ee3e354ac`, EBS Volume `vol-0b3e5a4240b5e517a`, VPC `vpc-06ac619b3bfac5b92`, Subnet `subnet-06b5dda6e5b3debcd`.

### 2.2 Evidence & Fact Classification Standard

Every statement and finding in this report is qualified by an authoritative evidence classification:
- `[SRC]`: Source-code verified by inspection of the active Git repository.
- `[AWS]`: Directly observed via read-only AWS CLI queries in `ap-southeast-2`.
- `[RUN]`: Verified against the live runtime endpoint (`http://3.25.150.231`).
- `[CFG]`: Configuration-verified in declarative YAML/JSON configuration files.
- `[DOC]`: Referenced from existing project documentation.
- `[PLN]`: Proposed or planned architectural feature not yet active.
- `[UNK]`: Unknown or unverified due to permission or environment constraints.

---

## 3. Environment and AWS Identity Summary

### 3.1 AWS Caller Identity & Regional Context

Read-only inspection of the active AWS deployment environment confirmed the following identity and placement attributes:
- **Inspected Region:** `ap-southeast-2` (Asia Pacific — Sydney)
- **Active IAM User:** `OpenAudex` `[AWS]`
- **AWS Account ID:** `6668********` (Redacted for privacy and security compliance) `[AWS]`
- **Inspection Date:** October 31, 2026 `[AWS]`

### 3.2 Target Infrastructure Inventory

| Resource Type | Resource Identifier | Configuration & Observed Attributes | Status | Source |
| :--- | :--- | :--- | :---: | :---: |
| **EC2 Instance** | `i-0c6927e10d2f58d23` | Name: `cloudmonitor-server`, Type: `t3.micro` (2 vCPU, 1 GiB RAM), Arch: `x86_64`, AMI: Ubuntu 24.04 LTS (`Linux 6.8.0-1018-aws`) | `running` | `[AWS]` |
| **Public IPv4** | `3.25.150.231` | Dynamic auto-assigned public IPv4 (`AllocationId: null`). Not an Elastic IP. | Active | `[AWS]` |
| **Private IPv4** | `172.31.33.31` | Static VPC internal address in subnet CIDR `172.31.32.0/20` | Active | `[AWS]` |
| **VPC** | `vpc-06ac619b3bfac5b92` | Default AWS VPC (`172.31.0.0/16`) | Available | `[AWS]` |
| **Subnet** | `subnet-06b5dda6e5b3debcd` | Public Subnet in Availability Zone `ap-southeast-2b` | Available | `[AWS]` |
| **Security Group** | `sg-0e3f2d84ee3e354ac` | Name: `launch-wizard-2`. Attached to instance `i-0c6927e10d2f58d23` | Active | `[AWS]` |
| **Root EBS Volume** | `vol-0b3e5a4240b5e517a` | 20 GiB `gp3`, 3,000 IOPS, 125 MB/s, `DeleteOnTermination: true` | `in-use` | `[AWS]` |
| **IAM Instance Profile**| `null` | No IAM instance profile or role is attached to the EC2 instance. | **MISSING** | `[AWS]` |
| **SSM Managed Node** | `i-0c6927e10d2f58d23` | Instance does not appear in Systems Manager Managed Nodes inventory. | **INACTIVE** | `[AWS]` |
| **Load Balancers** | None (`[]`) | No AWS Application or Network Load Balancers provisioned. | None | `[AWS]` |
| **RDS Databases** | None (`[]`) | No AWS RDS instances provisioned. Database is containerized PostgreSQL. | None | `[AWS]` |

---

## 4. Application Architecture and Security Boundaries

### 4.1 System Trust Boundaries

CloudMonitor implements four distinct trust boundaries separating untrusted client traffic from internal container storage and IPC:

```mermaid
flowchart TD
    subgraph ZoneUntrusted["Untrusted Public Internet"]
        BrowserClient["Browser Client / Operator<br/>(Cleartext Passwords / User JWTs)"]
        ExternalAgent["Remote Docker Agent<br/>(Cleartext X-Agent-Key / Telemetry)"]
        GHActions["GitHub Actions Runner<br/>(Holds Deploy SSH Private Key)"]
    end

    subgraph BoundaryPerimeter["Perimeter Trust Boundary (AWS Security Group)"]
        SG["AWS Security Group: sg-0e3f2d84ee3e354ac<br/>• Port 80: 0.0.0.0/0 (OPEN)<br/>• Port 443: 0.0.0.0/0 (DORMANT)<br/>• Port 22: Restricted CIDRs"]
    end

    subgraph BoundaryEdge["Edge Reverse Proxy Boundary (Nginx)"]
        Nginx["cloudmonitor-frontend (Nginx 1.31.8)<br/>• Port 80 Published to Host<br/>• Serves Static React Assets<br/>• Proxies /api/* to Backend<br/>• Proxies /prom/* to Prometheus (UNAUTHENTICATED)"]
    end

    subgraph ZoneInternal["Internal Trusted Microsegment (cloudmonitor-network)"]
        FastAPI["cloudmonitor-backend (FastAPI)<br/>• Port 8000 (NO host port)<br/>• Non-root User: cloudmonitor<br/>• JWT & Agent Key Auth"]
        Postgres["cloudmonitor-postgres (Postgres 16)<br/>• Port 5432 (NO host port)<br/>• Isolated to Docker Network"]
        Prometheus["cloudmonitor-prometheus (TSDB v2.54.1)<br/>• Port 9090 (NO host port)<br/>• Scrapes Exporters"]
        NodeExp["cloudmonitor-node-exporter<br/>• Port 9100 (NO host port)"]
        AlertMgr["cloudmonitor-alertmanager<br/>• Port 9093 (NO host port)"]
    end

    subgraph ZoneHost["Host Kernel & Storage Boundary"]
        DockerSock["Docker IPC: unix:///var/run/docker.sock"]
        PGVol["Named Volume: postgres_data"]
    end

    BrowserClient -->|HTTP Cleartext Port 80| SG
    ExternalAgent -->|HTTP Cleartext Port 80| SG
    GHActions -.->|SSH Port 22 (Blocked)| SG

    SG --> Nginx
    Nginx -->|Reverse Proxy :8000| FastAPI
    Nginx -->|Reverse Proxy :9090| Prometheus
    FastAPI -->|SQL TCP :5432| Postgres
    Postgres --- PGVol
    ExternalAgent -.->|Needs Host Socket| DockerSock
```

### 4.2 Network Service Exposure Table

| Port / Protocol | Container / Service | Host Binding | SG Ingress Rule | Publicly Reachable? | Security Risk Assessment |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **TCP 80** | `cloudmonitor-frontend` (Nginx) | `0.0.0.0:80` | `0.0.0.0/0` | **YES** | **CRITICAL:** Cleartext HTTP ingress. All credentials and telemetry traverse unencrypted. |
| **TCP 443** | `cloudmonitor-caddy` (TLS Profile) | Dormant | `0.0.0.0/0` | **NO** | Dormant. Port 443 open in SG, but no container is listening on host port 443. |
| **TCP 22** | Host OpenSSH (`sshd`) | Host OS | `13.239.158.0/29`<br/>`106.202.62.241/32` | **RESTRICTED** | Whitelisted to Instance Connect and operator IP. Correctly blocks global brute-force. |
| **TCP 8000** | `cloudmonitor-backend` (FastAPI) | None (`expose`) | N/A | **NO** | Isolated to `cloudmonitor-network`. Reachable only via Nginx `/api/` proxy. |
| **TCP 5432** | `cloudmonitor-postgres` (Postgres) | None (`expose`) | N/A | **NO** | Isolated to `cloudmonitor-network`. Completely unreachable from the internet. |
| **TCP 9090** | `cloudmonitor-prometheus` | None (`expose`) | N/A | **VIA PROXY** | **CRITICAL:** Exposed publicly via Nginx `/prom/` without authentication. |
| **TCP 9100** | `cloudmonitor-node-exporter` | None (`expose`) | N/A | **NO** | Isolated to `cloudmonitor-network`. Scraped internally by Prometheus. |
| **TCP 9093** | `cloudmonitor-alertmanager` | None (`expose`) | N/A | **NO** | Isolated to `cloudmonitor-network`. Receives alerts internally from Prometheus. |
| **TCP 2375** | Docker Daemon TCP API | Not Bound | N/A | **NO** | Explicitly blocked in `agent/config.py:38-43`. Daemon uses local Unix socket. |

---

## 5. Authentication and Authorization Findings

### 5.1 User Authentication Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Web Browser Client
    participant FE as Nginx / Frontend
    participant API as FastAPI Backend
    participant DB as PostgreSQL 16

    Note over User,API: User Registration Flow
    User->>FE: POST /api/v1/auth/register (email, password)
    FE->>API: Proxy to /api/v1/auth/register
    API->>DB: SELECT id FROM users WHERE email = ?
    alt Email Already Registered
        DB-->>API: User record exists
        API-->>User: HTTP 409 Conflict ("Email address is already registered")
    else Email Unique
        API->>API: bcrypt.hashpw(password, rounds=12)
        API->>DB: INSERT INTO users (email, password_hash, created_at)
        DB-->>API: user_id
        API-->>User: HTTP 201 Created (id, email, created_at)
    end

    Note over User,API: User Login & JWT Token Flow
    User->>FE: POST /api/v1/auth/login (email, password)
    FE->>API: Proxy to /api/v1/auth/login
    API->>DB: SELECT * FROM users WHERE email = ?
    API->>API: bcrypt.checkpw(password, password_hash)
    alt Password Valid
        API->>API: jwt.encode({"sub": email, "user_id": id, "exp": now+60m, "iat": now}, SECRET, HS256)
        API-->>User: HTTP 200 OK (access_token, token_type="bearer")
        User->>User: localStorage.setItem("cloudmonitor_auth_token", access_token)
    else Password Invalid
        API-->>User: HTTP 401 Unauthorized ("Invalid email or password.")
    end
```

### 5.2 Agent Credential Generation and Verification Flow

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Authenticated Operator
    participant API as FastAPI Backend
    participant DB as PostgreSQL 16
    actor Agent as Remote Docker Daemon Host

    Note over Admin,DB: Agent Enrollment (Zero Raw Key Storage)
    Admin->>API: POST /api/v1/agents/enroll {"name": "Host-01", "os_type": "linux"} (Bearer JWT)
    API->>API: secrets.token_urlsafe(32) -> "cma_<random>"
    API->>API: SHA256(raw_key) -> key_hash (64 hex chars)
    API->>DB: INSERT INTO agents (user_id, name, agent_key_hash, agent_key_prefix, status="pending")
    API-->>Admin: HTTP 201 Created (raw_key: "cma_...", key_prefix: "cma_1a2b3c...")
    Note over Admin,API: Raw key is NEVER written to DB; displayed once to operator

    Note over Agent,DB: Telemetry Ingestion via X-Agent-Key
    Agent->>API: POST /api/v1/metrics/ingest (Header: "X-Agent-Key: cma_...")
    API->>API: SHA256(raw_key) -> lookup_hash
    API->>DB: SELECT * FROM agents WHERE agent_key_hash = lookup_hash
    alt Agent Revoked (is_revoked == True)
        API-->>Agent: HTTP 403 Forbidden ("Agent credentials have been revoked.")
    else Agent Active
        API->>DB: UPDATE agents SET last_heartbeat = now(), status = "online"
        API->>DB: UPSERT container_metrics (scoped by current_agent.id and current_agent.user_id)
        API-->>Agent: HTTP 200 OK (status="ok", ingested_count=N)
    end
```

### 5.3 Detailed Authentication Findings

1. **Password Hashing Implementation (`[SRC]` `backend/app/auth/security.py:18-25`):**
   - Uses `bcrypt` with `rounds=12` (`bcrypt.gensalt(rounds=12)`).
   - Verification uses constant-time `bcrypt.checkpw()`.
   - **Assessment:** Exceeds baseline security requirements. Immune to rainbow-table and GPU acceleration attacks.
2. **JWT Signing and Claims (`[SRC]` `backend/app/auth/security.py:27-38`):**
   - Signing algorithm: `HS256` (HMAC with SHA-256).
   - Claims: `sub` (email), `user_id` (integer), `iat` (issued-at timestamp), `exp` (expiration timestamp).
   - Expiration: `ACCESS_TOKEN_EXPIRE_MINUTES` defaults to 60 minutes.
   - Validation: `jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])`. Catches `ExpiredSignatureError` and general `PyJWTError`.
3. **Hardcoded Fallback Secret Key (`[SRC]` `backend/app/config.py:26-29`):**
   - `JWT_SECRET_KEY` falls back to `"cloudmonitor_dev_jwt_secret_key_change_in_prod_at_least_32_chars"`.
   - **Vulnerability:** If `.env` is missing or fails to define `JWT_SECRET_KEY`, the application boots using this static string. Any attacker possessing this open-source code can forge arbitrary valid JWTs for any user account.
4. **Agent Key Cryptographic Lifecycle (`[SRC]` `backend/app/auth/security.py:83-96`):**
   - Key generation uses `secrets.token_urlsafe(32)` providing 256 bits of CSPRNG entropy prefixed with `cma_`.
   - Raw key is returned once during enrollment (`/api/v1/agents/enroll`) and key rotation (`/api/v1/agents/{id}/rotate-key`).
   - Only the SHA-256 digest (`agent_key_hash`, 64 hex characters) is persisted in PostgreSQL.
   - Database theft or SQL injection dumps will NOT expose usable agent keys.
5. **Multi-Tenancy & Cross-User Data Isolation (`[SRC]` `backend/app/routers/`):**
   - `list_user_agents`: `filter(Agent.user_id == current_user.id)` `[SRC]` (`agents.py:85`).
   - `get_connection_status`: `filter(Agent.id == agent_id, Agent.user_id == current_user.id)` `[SRC]` (`agents.py:153`).
   - `rotate_agent_key`: `filter(Agent.id == agent_id, Agent.user_id == current_user.id)` `[SRC]` (`agents.py:223`).
   - `revoke_agent`: `filter(Agent.id == agent_id, Agent.user_id == current_user.id)` `[SRC]` (`agents.py:264`).
   - `get_user_container_metrics`: `filter(ContainerMetric.user_id == current_user.id, Agent.is_revoked == False)` `[SRC]` (`metrics.py:114-115`).
   - **Assessment:** User data isolation is rigorously enforced in database queries. User A cannot view, rotate, revoke, or inspect telemetry belonging to User B.
6. **Development Simulation Guard (`[SRC]` `backend/app/main.py:56-64`):**
   - Fault simulation endpoints (`/api/v1/simulate/error`, `/latency`, `/health-toggle`) are protected by dependency `require_development_mode`.
   - Rejects execution with HTTP 403 Forbidden whenever `APP_ENV=production`.

---

## 6. API and Frontend Security

### 6.1 Rate Limiting and Brute-Force Posture
- **Audit Result:** **ABSENT** `[SRC]`.
- Neither FastAPI (`backend/app/main.py`) nor Nginx (`frontend/nginx.conf`) implements rate limiting or IP-based connection throttling.
- Endpoint `/api/v1/auth/login` can be subjected to unlimited high-speed dictionary attacks and password guessing without lockout, CAPTCHA, or delay.

### 6.2 HTTP Security Headers
- **Audit Result:** **MISSING ON NGINX** `[SRC]` (`frontend/nginx.conf`).
- Nginx does not configure any modern browser defense headers:
  - `Content-Security-Policy`: Missing. Allows execution of unauthorized inline scripts.
  - `X-Frame-Options`: Missing. Renders application vulnerable to clickjacking.
  - `X-Content-Type-Options`: Missing. Allows MIME-type sniffing by browsers.
  - `Referrer-Policy`: Missing. Leaks full URL paths in `Referer` headers.
  - `Strict-Transport-Security`: Missing. Browser does not enforce HTTPS.
- *(Note: Security headers are defined in `Caddyfile:6-12`, but Caddy is dormant in live production).*

### 6.3 Prometheus API Exposure via Nginx
- **Audit Result:** **CRITICAL VULNERABILITY** `[SRC]` (`frontend/nginx.conf:46-58`).
- Nginx routes all requests under `/prom/` directly to `http://prometheus:9090/`.
- No authentication (`auth_basic` or JWT bearer verification) is required to access `/prom/`.
- Anyone browsing `http://3.25.150.231/prom/api/v1/query` can inspect host infrastructure metrics, active targets, container IDs, internal IP addresses, and filesystem layouts.
- **Denial of Service Vector:** In `docker-compose.prod.yml:110`, Prometheus is run with `--web.enable-lifecycle`. Nginx forwards all HTTP methods, including `POST`. An unauthenticated external user can send `POST http://3.25.150.231/prom/-/quit` to terminate the Prometheus process, disabling observability.

### 6.4 Frontend Token Storage
- **Audit Result:** **VULNERABLE TO XSS EXFILTRATION** `[SRC]` (`frontend/src/api.js:9-29`).
- The JWT access token is stored in browser `window.localStorage` under key `cloudmonitor_auth_token`.
- `localStorage` has no protection against client-side script execution. If any XSS flaw is introduced via dependencies or DOM manipulation, an attacker can extract the token.
- Secure alternative: Store tokens in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

---

## 7. Secrets and Credential Management

### 7.1 Secret Storage and Git Tracking
- **Audit Result:** **SECURE** `[SRC]`.
- `.gitignore` explicitly excludes `.env`, `*.env.local`, `*.env.*.local`, `.env.*`, `*.pem`, `*.key`, `*.sql`, and deployment archives (`cloudmonitor-deploy.tar.gz`).
- `git status` confirmed no `.env` files are tracked in the Git repository index.
- Template files (`.env.example` and `.env.production.example`) contain only explicit placeholder values (`replace_with_secure_db_password`). No real secrets were committed.

### 7.2 Hardcoded Fallback Secrets
- **Audit Result:** **HIGH SEVERITY FINDING** `[SRC]` (`backend/app/config.py:20-29`).
- `config.py` contains fallback strings for `DATABASE_URL` (`postgresql://cloudmonitor:cloudmonitor_secret@postgres:5432/cloudmonitor`) and `JWT_SECRET_KEY` (`cloudmonitor_dev_jwt_secret_key_change_in_prod_at_least_32_chars`).
- If an operator misconfigures environment variables or omits keys, the service boots with default secrets rather than failing fast (`fail-closed`).

### 7.3 GitHub Actions Workflow Secret Handling
- **Audit Result:** **SECURE** `[SRC]` (`.github/workflows/cd.yml`).
- Secrets (`EC2_HOST`, `EC2_USER`, `EC2_SSH_PRIVATE_KEY`, `EC2_SSH_KNOWN_HOSTS`) are passed exclusively via step-level `env:` blocks.
- Temporary SSH keys written to `~/.ssh/deploy_key` are assigned strict permissions (`chmod 600`) and deleted in an unconditional `always()` cleanup step (`cd.yml:267-271`).

---

## 8. Docker and Container Security

### 8.1 Production Container Configuration Audit

| Container Name | Base Image | User Context | Privileged Mode | Published Host Ports | Read-Only Root FS | Resource Limits Configured? |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `cloudmonitor-frontend` | `nginx:alpine` | `root` (master) / `nginx` | No | `80:80` | No | None (`[SRC]`) |
| `cloudmonitor-backend` | `python:3.12-slim` | `cloudmonitor` (non-root) | No | None (`expose: 8000`) | No | None (`[SRC]`) |
| `cloudmonitor-postgres` | `postgres:16-alpine` | `postgres` (uid 70) | No | None (`expose: 5432`) | No | None (`[SRC]`) |
| `cloudmonitor-prometheus`| `prom/prometheus:v2.54.1` | `nobody` (uid 65534) | No | None (`expose: 9090`) | No | None (`[SRC]`) |
| `cloudmonitor-node-exporter` | `prom/node-exporter:v1.8.2` | `nobody` (uid 65534) | No | None (`expose: 9100`) | No | None (`[SRC]`) |
| `cloudmonitor-alertmanager` | `prom/alertmanager:v0.27.0` | `nobody` (uid 65534) | No | None (`expose: 9093`) | No | None (`[SRC]`) |

### 8.2 Docker Monitoring Agent Socket Exposure
- **Audit Result:** **SIGNIFICANT CONTAINER ESCAPE RISK** `[SRC]` (`agent/Dockerfile`, `agent/config.py`).
- The standalone Docker agent connects to `unix:///var/run/docker.sock`.
- In `agent/Dockerfile`, the container runs as `root` (no `USER` directive).
- **The `:ro` Socket Bind-Mount Fallacy:** Mounting `/var/run/docker.sock:/var/run/docker.sock:ro` does NOT restrict Docker API capabilities. The Linux filesystem `:ro` flag prevents modifying the socket inode, but `connect()` to the socket succeeds. Any process with write access to the connection stream can invoke the full Docker Engine API, including creating privileged containers that mount host `/` with root execution.
- **Current Mitigating Factor:** The agent is written strictly as a telemetry collector in Python (`docker.from_env()`) with no command execution or container manipulation routes. However, if an attacker achieves Remote Code Execution (RCE) in the agent process, they inherit full root control of the host.

### 8.3 Missing Container Resource Limits
- None of the services in `docker-compose.prod.yml` specify CPU quotas (`cpus:`) or memory boundaries (`mem_limit:`).
- On an EC2 `t3.micro` instance with only 1 GiB physical RAM, a single runaway process or memory leak in `backend` or `prometheus` can trigger the Linux kernel Out-Of-Memory (OOM) killer, crashing critical system processes or the Docker daemon.

---

## 9. AWS Networking and Public Exposure

### 9.1 Security Group Analysis (`sg-0e3f2d84ee3e354ac`)

The AWS Security Group `sg-0e3f2d84ee3e354ac` (`launch-wizard-2`) governs perimeter firewall filtering:

| Rule Type | IP Protocol | Port Range | Source CIDR | Purpose & Traffic Description | Security Status |
| :--- | :---: | :---: | :--- | :--- | :---: |
| **Inbound** | TCP | `80` | `0.0.0.0/0` | Public HTTP ingress for web dashboard and agent telemetry | **UNENCRYPTED** |
| **Inbound** | TCP | `443` | `0.0.0.0/0` | Public HTTPS ingress (intended for TLS profile) | Dormant |
| **Inbound** | TCP | `22` | `13.239.158.0/29` | AWS EC2 Instance Connect CIDR for Sydney region | Authorized |
| **Inbound** | TCP | `22` | `106.202.62.241/32` | Project operator workstation static IP address | Authorized |
| **Outbound**| ALL | ALL | `0.0.0.0/0` | Unrestricted egress for package updates, Docker pulls | Standard |

### 9.2 IPv6 Exposure Analysis
- **Audit Result:** **NO IPV6 INGRESS** `[AWS]`.
- No IPv6 (`::/0`) inbound rules exist in `sg-0e3f2d84ee3e354ac`. All ingress is IPv4-mediated.

### 9.3 Network ACLs & Routing
- Associated Network ACL for subnet `subnet-06b5dda6e5b3debcd` is the default VPC NACL (`acl-0d70511874b486948`), which permits all inbound/outbound traffic (`Rule 100: ALL ALLOW`).
- Routing table directs `0.0.0.0/0` to the AWS Internet Gateway (`igw-0df6e7baec675c962`).

---

## 10. IAM and Instance Profile Review

### 10.1 EC2 Instance Profile Status
- **Audit Result:** **CRITICAL ARCHITECTURAL GAP** `[AWS]` (`ec2:DescribeInstances`).
- Query output: `Instances[0].IamInstanceProfile == null`.
- The production EC2 virtual machine has **NO IAM ROLE OR INSTANCE PROFILE ATTACHED**.
- **Security & Operational Consequences:**
  1. The EC2 instance has zero ambient AWS credentials (positive from a blast-radius perspective if compromised).
  2. **BLOCKER FOR ISSUE #9:** AWS Systems Manager (SSM) Agent cannot register the host as a managed node. SSM requires an attached IAM role containing AWS managed policy `AmazonSSMManagedInstanceCore`.
  3. The instance cannot automatically upload database backups to Amazon S3 using IAM role authentication.

---

## 11. TLS and Transport Security

### 11.1 Current In-Transit Security Reality
- **Audit Result:** **UNENCRYPTED HTTP ONLY** `[RUN]`, `[AWS]`.
- The public application URL is `http://3.25.150.231`.
- All interactions with the application occur over unencrypted cleartext HTTP:
  - User login passwords and registration forms.
  - Signed JWT access tokens in HTTP `Authorization` headers.
  - Cryptographic agent enrollment keys (`cma_...`).
  - Container names, image identifiers, and telemetry snapshots.

### 11.2 Architectural Prerequisites for Activating TLS
Activating HTTPS safely requires fulfilling three prerequisites before enabling Caddy or an Application Load Balancer:
1. **Public Domain Name Resolution:** Let's Encrypt ACME cannot issue standard TLS certificates for raw public IPv4 addresses (`3.25.150.231`). A registered domain (e.g. `monitor.example.com`) must point an `A` record to the EC2 IP.
2. **Elastic IP Allocation:** The current EC2 IP (`3.25.150.231`) is dynamic. An AWS Elastic IP must be allocated and associated to prevent IP changes on reboot.
3. **Port 80/443 Conflict Resolution:** In `docker-compose.prod.yml`, `frontend` currently binds host port `80:80`. Caddy requires port 80 to complete ACME HTTP-01 challenges and issue HTTP-to-HTTPS redirects. Nginx must be unmapped from host port 80, allowing Caddy to bind `80:80` and `443:443`, proxying internally to `frontend:80` and `backend:8000`.

---

## 12. Dependency Vulnerability Assessment

### 12.1 Backend Python Dependencies (`backend/requirements.txt`)

| Package | Declared Version | Production Requirement? | Security & Vulnerability Consideration |
| :--- | :---: | :---: | :--- |
| `fastapi` | `>=0.115.0` | Yes | Modern Starlette/FastAPI release. No unpinned upper bound. |
| `uvicorn[standard]` | `>=0.31.0` | Yes | ASGI web server. Uses Cythonized `httptools` and `uvloop`. |
| `prometheus-client` | `>=0.21.0` | Yes | Metrics instrumentation. |
| `pydantic` | `>=2.9.2` | Yes | Core V2 parsing. Robust validation against type confusion. |
| `email-validator` | `>=2.0.0` | Yes | Validates RFC-compliant email formatting in registration. |
| `httpx` | `>=0.27.2` | Yes | HTTP client library. |
| `pytest` | `>=8.3.0` | **NO (TEST ONLY)** | **Hygiene Issue:** Packaged into production image. Should be moved to dev dependencies. |
| `sqlalchemy` | `>=2.0.0` | Yes | Modern SQLAlchemy 2.0. Parameterized SQL prevents SQL injection. |
| `alembic` | `>=1.13.0` | Yes | Database schema migration engine. |
| `psycopg2-binary` | `>=2.9.9` | Yes | PostgreSQL C-extension database adapter. |
| `bcrypt` | `>=4.0.0` | Yes | C-accelerated password hashing. High security. |
| `pyjwt` | `>=2.8.0` | Yes | JWT encode/decode. Immune to algorithm-confusion (`none`) attacks. |

### 12.2 Frontend Node.js Dependencies (`frontend/package.json`)

| Package | Declared Version | Type | Security & Audit Assessment |
| :--- | :---: | :---: | :--- |
| `react` | `18.3.1` | Production | Stable, pinned exact release. |
| `react-dom` | `18.3.1` | Production | Stable, pinned exact release. |
| `lucide-react` | `0.447.0` | Production | SVG UI icon library. Pinned. |
| `vite` | `5.4.8` | DevDependency | Build tool. Fixed in lockfile. |
| `@vitejs/plugin-react`| `4.3.2` | DevDependency | Babel/Fast-Refresh plugin. |

---

## 13. Logging, Monitoring and Incident Visibility

### 13.1 Security Event Logging Gaps
1. **Unlogged Authentication Failures:** When a user submits an incorrect password in `/api/v1/auth/login`, FastAPI immediately raises `HTTPException(401)`. No log entry is recorded with the client IP, email, or timestamp. Intrusions cannot be correlated from container logs.
2. **Unlogged Agent Authentication Rejections:** In `/api/v1/agents/heartbeat` and `/metrics/ingest`, failed key verifications return HTTP 401 without emitting a structured security event.
3. **Empty Alertmanager Webhooks (`[SRC]` `monitoring/alertmanager/alertmanager.yml`):**
   `webhook_configs: []` means Alertmanager receives alert notifications from Prometheus but drops them silently without notifying operators via Slack, PagerDuty, or email.

---

## 14. Findings Register with Severity

The table below catalogs all 15 security findings identified during the audit, classified by severity according to industry standard CVSS/DREAD principles:

| Finding ID | Title | Severity | Status | Affected Component & Source Reference | Summary of Vulnerability |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`SEC-CRIT-01`** | Cleartext In-Transit HTTP Exposure of Credentials and Telemetry | **CRITICAL** | Confirmed | Ingress / Nginx (`frontend/nginx.conf:2`, AWS SG) | Public site operates over HTTP (`3.25.150.231:80`). Passwords, JWTs, and agent keys traverse public internet unencrypted. |
| **`SEC-CRIT-02`** | Unauthenticated Public Exposure of Prometheus API & Lifecycle Endpoints | **CRITICAL** | Confirmed | Nginx Proxy (`frontend/nginx.conf:46-58`), Prometheus | `/prom/` is unauthenticated. Anyone can read internal metrics or send `POST /prom/-/quit` to terminate Prometheus. |
| **`SEC-HIGH-01`** | Docker Daemon Socket Exposure & Root Execution in Monitoring Agent | **HIGH** | Confirmed | Agent (`agent/Dockerfile:1-13`, `collector.py`) | Agent mounts `/var/run/docker.sock` as root. Read-only socket mount `:ro` does not prevent container escape to host root. |
| **`SEC-HIGH-02`** | Hardcoded Static Fallback Secrets for `JWT_SECRET_KEY` and Database | **HIGH** | Confirmed | Backend Settings (`backend/app/config.py:20-29`) | Application defaults to known static secrets if environment variables are missing, permitting arbitrary JWT forgery. |
| **`SEC-HIGH-03`** | Missing Rate Limiting on Authentication Endpoints | **HIGH** | Confirmed | API / Nginx (`backend/app/routers/auth.py:51-72`) | `/api/v1/auth/login` lacks request throttling, exposing accounts to automated credential stuffing. |
| **`SEC-HIGH-04`** | Missing IAM Instance Profile on Production EC2 Host | **HIGH** | Confirmed | AWS EC2 (`i-0c6927e10d2f58d23`) | No IAM role attached. SSM Agent cannot register host as managed node, completely blocking Issue #9 migration. |
| **`SEC-MED-01`** | JWT Access Tokens Stored in Browser `localStorage` | **MEDIUM** | Confirmed | Frontend (`frontend/src/api.js:9-29`) | Tokens stored in `localStorage` are vulnerable to exfiltration if XSS occurs. |
| **`SEC-MED-02`** | Missing Modern Security HTTP Response Headers on Ingress Proxy | **MEDIUM** | Confirmed | Nginx (`frontend/nginx.conf:1-64`) | Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options exposes site to clickjacking and MIME-sniffing. |
| **`SEC-MED-03`** | User Account Enumeration via Registration Endpoint | **MEDIUM** | Confirmed | Auth Router (`backend/app/routers/auth.py:32-37`) | Registration returns HTTP 409 `Email address is already registered`, allowing attackers to harvest registered emails. |
| **`SEC-MED-04`** | Unpinned Upper Dependency Bounds & Test Framework in Production Image | **MEDIUM** | Confirmed | Packaging (`backend/requirements.txt:7`) | `pytest` baked into production backend image; unpinned upper bounds allow untested package upgrades during builds. |
| **`SEC-MED-05`** | Application Health Probe Does Not Verify Database Connectivity | **MEDIUM** | Confirmed | Health (`backend/app/health.py:29-50`) | `/health` checks only in-memory boolean. Does not query PostgreSQL. Continues returning 200 during DB crashes. |
| **`SEC-MED-06`** | Missing Security Audit Logging for Authentication Failures | **MEDIUM** | Confirmed | Routers (`auth.py:60-66`, `security.py:120-134`) | Failed logins and rejected agent keys raise HTTP exceptions with no audit logging of client IP or timestamp. |
| **`SEC-LOW-01`** | Dynamic Auto-Assigned Public IPv4 Address Lacks Elastic IP Binding | **LOW** | Confirmed | AWS EC2 (`i-0c6927e10d2f58d23`) | `3.25.150.231` will change if instance is stopped and started, breaking DNS, remote agents, and CI/CD secrets. |
| **`SEC-LOW-02`** | Root EBS Volume Configured with `DeleteOnTermination: true` Without DLM | **LOW** | Confirmed | AWS EBS (`vol-0b3e5a4240b5e517a`) | Accidental EC2 instance termination immediately destroys root volume containing Postgres named volume data. |
| **`SEC-INFO-01`** | cAdvisor and Grafana Excluded from Production Compose | **INFORMATIONAL** | Confirmed | Compose Architecture (`docker-compose.prod.yml`) | Intended architectural trade-off to fit within 1 GiB physical RAM server limit. |

---

## 15. Prioritized Remediation Roadmap

The remediation strategy is organized into five sequential priority tiers, designed to remediate critical exposures first without destabilizing working production workloads:

```mermaid
flowchart TD
    subgraph P0["Priority 0: Immediate Exposure Remediation"]
        p0_prom["1. Block /prom/-/quit & Protect /prom/ in Nginx"]
        p0_sec["2. Remove Hardcoded JWT/DB Fallback Secrets (Fail-Closed)"]
        p0_prom --> p0_sec
    end

    subgraph P1["Priority 1: Core Transport & Authentication Security"]
        p1_rate["3. Add Rate Limiting to /auth/login (Nginx limit_req)"]
        p1_eip["4. Allocate AWS Elastic IP & Domain DNS"]
        p1_tls["5. Activate HTTPS via Caddy or AWS ALB"]
        p1_head["6. Add Security HTTP Headers to Ingress Proxy"]
        p1_rate --> p1_eip --> p1_tls --> p1_head
    end

    subgraph P2["Priority 2: AWS IAM & Issue #9 SSM Deployment Migration"]
        p2_iam["7. Attach IAM Role with AmazonSSMManagedInstanceCore"]
        p2_ssm["8. Verify SSM Agent & Migrate CD from SSH to SSM"]
        p2_iam --> p2_ssm
    end

    subgraph P3["Priority 3: Container Runtime & Supply Chain Hardening"]
        p3_agent["9. Non-Root Agent User & Read-Only FS Constraints"]
        p3_res["10. Configure Compose CPU & Memory Limits"]
        p3_deps["11. Separate requirements-dev.txt (Remove pytest from prod)"]
        p3_agent --> p3_res --> p3_deps
    end

    subgraph P4["Priority 4: Observability, Backups & Resilience"]
        p4_s3["12. Automated Daily pg_dump to S3 Bucket"]
        p4_ebs["13. AWS DLM Daily EBS Snapshot Policy"]
        p4_log["14. Structured Security Audit Logging"]
        p4_alert["15. Configure Alertmanager External Notification Webhook"]
        p4_s3 --> p4_ebs --> p4_log --> p4_alert
    end

    P0 --> P1 --> P2 --> P3 --> P4
```

### Remediation Action Plan Table

| Priority | Task Description | Dependencies | Production Risk | Rollback Procedure |
| :---: | :--- | :--- | :--- | :--- |
| **P0** | **Block Prometheus Lifecycle Endpoints in Nginx:** Add `location = /prom/-/quit { return 403; }` and `location = /prom/-/reload { return 403; }` to `frontend/nginx.conf`. | None | Low (Nginx reload) | Revert `nginx.conf` edit and run `nginx -s reload`. |
| **P0** | **Fail-Closed Secret Enforcement:** Update `backend/app/config.py` to raise `RuntimeError` on startup if `JWT_SECRET_KEY` or `DATABASE_URL` is unset or matches known dev placeholders when `APP_ENV=production`. | Working `.env` on host | Low (prevents boot with insecure fallback) | Revert `config.py` check. |
| **P1** | **Nginx Rate Limiting:** Add `limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;` to Nginx and apply to `/api/v1/auth/login`. | None | Very Low | Remove `limit_req` directive and reload Nginx. |
| **P1** | **Elastic IP & Domain Setup:** Allocate AWS Elastic IP and point DNS A-record to the IP. | AWS IAM permissions | Low (brief IP switch) | Re-associate previous dynamic IP or update DNS. |
| **P1** | **Activate TLS:** Enable Caddy (`--profile tls`) or provision an AWS Application Load Balancer with ACM certificate. | Domain name, Elastic IP | Medium (Port 80/443 rebinding) | Revert Compose to port 80 HTTP-only stack. |
| **P1** | **Inject Security Headers:** Add HSTS, CSP, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`) to Nginx. | None | Very Low | Revert Nginx header block and reload. |
| **P2** | **Attach IAM Role to EC2 Instance:** Create IAM role `CloudMonitor-EC2-Role` with `AmazonSSMManagedInstanceCore` and attach instance profile to `i-0c6927e10d2f58d23`. | AWS IAM permissions | Zero (non-destructive) | Detach instance profile via AWS CLI. |
| **P2** | **Migrate CD to AWS SSM (Issue #9):** Update `.github/workflows/cd.yml` to trigger deployment via AWS SSM Run Command instead of SSH over port 22. | IAM Role attached to EC2 | Low (can run in parallel with SSH) | Trigger manual SSH workflow branch. |
| **P3** | **Harden Agent Container:** Run agent under dedicated `agentuser` UID; enforce `read_only: true` and `cap_drop: ALL` in Compose. | Docker socket permissions | Low | Revert `agent/Dockerfile` and Compose directives. |
| **P3** | **Enforce Container Resource Limits:** Add memory caps (`backend: 150m`, `postgres: 128m`, `prometheus: 80m`, `frontend: 30m`) in `docker-compose.prod.yml`. | Compose verification | Low | Remove `mem_limit` clauses from Compose. |
| **P3** | **Dependency Separation:** Move `pytest` to `backend/requirements-dev.txt` and generate pinned `requirements.lock`. | Local testing | Zero | Re-add packages to `requirements.txt`. |
| **P4** | **Automated Backups:** Implement daily `pg_dump` cron uploading to encrypted private S3 bucket. | IAM Role, S3 bucket | Zero | Disable cron entry. |
| **P4** | **EBS Snapshots:** Configure AWS Data Lifecycle Manager (DLM) to snapshot root EBS volume daily with 7-day retention. | AWS DLM permissions | Zero | Delete DLM policy. |
| **P4** | **Security Event Logging:** Add structured Python logger emitting JSON security audit logs on failed login and agent key verification. | None | Zero | Remove logging calls. |
| **P4** | **Alertmanager Webhooks:** Add Slack or Discord incoming webhook URL to `monitoring/alertmanager/alertmanager.yml`. | Webhook URL | Low | Revert `alertmanager.yml` to empty array. |

---

## 16. Dependencies for Issue #9 (SSM Deployment Migration)

GitHub Issue #9 outlines migrating deployment automation from SSH (port 22) to AWS Systems Manager (SSM). This security audit identified specific blockers and prerequisites that MUST be resolved prior to or in conjunction with Issue #9:

```mermaid
flowchart TD
    subgraph Blocker["Current Technical Blocker"]
        b1["EC2 Instance i-0c6927e10d2f58d23<br/>IamInstanceProfile is NULL"]
        b2["SSM Agent cannot authenticate to AWS SSM APIs<br/>Instance NOT listed in Managed Nodes"]
        b1 --> b2
    end

    subgraph PrerequisiteStep["Required Remediation Steps"]
        s1["1. Create IAM Role: CloudMonitor-EC2-SSM-Role<br/>Trust: ec2.amazonaws.com<br/>Policy: AmazonSSMManagedInstanceCore"]
        s2["2. Create Instance Profile & Attach to EC2:<br/>aws ec2 associate-iam-instance-profile<br/>--instance-id i-0c6927e10d2f58d23"]
        s3["3. Verify SSM Registration:<br/>aws ssm describe-instance-information<br/>(Confirm PingStatus: Online)"]
        s4["4. Configure GitHub OIDC / AWS Credentials in cd.yml:<br/>aws-actions/configure-aws-credentials@v4"]
        s1 --> s2 --> s3 --> s4
    end

    subgraph Resolution["Issue #9 Resolution"]
        r1["Deploy via SSM Run Command:<br/>aws ssm send-command<br/>--document-name 'AWS-RunShellScript'"]
        r2["Security Milestone Achieved:<br/>• Inbound Port 22 Completely Closed<br/>• SSH Keys Eliminated from GitHub Secrets"]
        s4 --> r1 --> r2
    end

    b2 -.->|Must Fix First| s1
```

### Detailed Issue #9 Prerequisites
1. **IAM Role Creation:** An IAM role with trust policy for `ec2.amazonaws.com` and managed policy `arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore` must be created.
2. **Instance Profile Association:** Execute `aws ec2 associate-iam-instance-profile --instance-id i-0c6927e10d2f58d23 --iam-instance-profile Name=CloudMonitor-EC2-SSM-Profile`.
3. **SSM Agent Verification:** Ubuntu 24.04 includes the `snap.amazon-ssm-agent`. Once the IAM role is associated, the daemon will automatically register with AWS Systems Manager within 2 minutes. Verify via `aws ssm describe-instance-information`.
4. **Security Benefit:** Once SSM deployment is active, the inbound SSH rules in Security Group `sg-0e3f2d84ee3e354ac` (Port 22) can be **permanently deleted**, achieving a zero-inbound-management attack surface.

---

## 17. Recommended Verification Tests

The following non-destructive verification tests should be executed in staging or local environments prior to deploying remediation patches:

### Test 1: Prometheus Lifecycle Endpoint Lockdown Verification
```bash
# Verify that POST /prom/-/quit returns HTTP 403 Forbidden
curl -i -X POST http://localhost/prom/-/quit
# Expected: HTTP/1.1 403 Forbidden

# Verify that POST /prom/-/reload returns HTTP 403 Forbidden
curl -i -X POST http://localhost/prom/-/reload
# Expected: HTTP/1.1 403 Forbidden
```

### Test 2: Rate Limiting Enforcement on Authentication
```bash
# Execute rapid burst of 10 login requests within 5 seconds
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"invalidpassword"}'
done
# Expected: First 5 requests return 401; subsequent requests return HTTP 429 Too Many Requests
```

### Test 3: Fail-Closed Configuration Boot Test
```bash
# Attempt to run backend with APP_ENV=production and default secret
APP_ENV=production JWT_SECRET_KEY=cloudmonitor_dev_jwt_secret_key_change_in_prod_at_least_32_chars python -m uvicorn app.main:app
# Expected: Process raises RuntimeError and aborts startup with:
# "FATAL: Insecure development JWT secret key detected in production environment."
```

### Test 4: Database Deep Health Probe Verification
```bash
# Query health endpoint when PostgreSQL container is intentionally stopped
curl -s http://localhost/health | jq .
# Expected: HTTP 503 Service Unavailable, {"status":"unhealthy","components":{"database":"unhealthy"}}
```

---

## 18. Limitations and Unverified Areas

The following operational constraints and permission boundaries applied during this audit:
1. **EC2 Host Shell Access:** Direct interactive SSH access into the EC2 instance was not executed during this session to avoid modifying running container states or environment configurations. Host-level inspection was performed strictly via AWS control-plane APIs and HTTP endpoints.
2. **Dynamic Egress IP Scanning:** In accordance with the critical operating restrictions, automated vulnerability scanners (e.g. OWASP ZAP, Nikto, Nessus) were not directed against `3.25.150.231` to avoid triggering AWS abuse filters or disrupting the live academic demonstration.
3. **AWS Systems Manager Node Inspection:** Because the EC2 instance lacks an attached IAM instance profile, `aws ssm describe-instance-information` returned an empty list (`[]`). Verification of SSM agent daemon configuration on the host will occur after IAM role attachment in Phase 2.
4. **Third-Party CloudTrail Logs:** Detailed CloudTrail S3 bucket logs were not inspected due to IAM user `OpenAudex` permission scope in `ap-southeast-2`.
