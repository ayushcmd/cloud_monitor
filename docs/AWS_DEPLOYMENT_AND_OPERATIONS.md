# CloudMonitor — AWS Deployment & Operations Guide

**Academic project:** IIT Patna · BSc CSDA · 5th Semester · Cloud Computing  
**Repository:** https://github.com/ayushcmd/cloud_monitor  
**Current demo URL:** http://3.25.150.231  
**AWS region used during deployment work:** Asia Pacific (Sydney), ap-southeast-2  
**EC2 login user:** ubuntu  
**Production directory:** /home/ubuntu/cloud_monitor  
**Production Compose file:** docker-compose.prod.yml

> **Status and accuracy:** This guide was written from the repository configuration and project deployment details previously confirmed. Verify the live AWS state before making changes. Optional resources described here are not assumed to be provisioned.

---

## 1. Purpose and safety principles

This guide documents the AWS deployment model, service networking, environment configuration, diagnostics, deployment status, and recovery considerations for CloudMonitor.

The current design runs Docker Compose on one EC2 host. PostgreSQL runs as a container with a named Docker volume for its data directory. The production Compose file publishes the frontend on TCP port 80 and keeps PostgreSQL, backend, Prometheus, Node Exporter, and Alertmanager off public host ports. A Caddy TLS proxy is defined behind an optional Compose profile.

**Production safety requirements**
- Never run docker compose down -v against the production project.
- Do not delete or recreate the named database volume cloudmonitor-prod_postgres_data.
- Do not overwrite the real production .env with an example file.
- Do not remove the only working administrator access path until its replacement has been tested.
- Inspect configuration, running containers, logs, and backup status before making changes.
- Test restore and rollback steps away from production before relying on them.

## 2. Current deployment snapshot

| Item | Known value |
|---|---|
| Public demo URL | http://3.25.150.231 |
| Region used during troubleshooting | ap-southeast-2 |
| EC2 account | ubuntu |
| Application directory | /home/ubuntu/cloud_monitor |
| Repository | https://github.com/ayushcmd/cloud_monitor |
| Production Compose | docker-compose.prod.yml |
| Public web port in production Compose | TCP 80 |
| Optional TLS proxy | Caddy behind the tls Compose profile |
| Database | PostgreSQL 16 Alpine |
| Named database volume | cloudmonitor-prod_postgres_data |
| Deployment mechanism in workflow | GitHub Actions with SSH |
| Known pipeline issue | Recent GitHub-hosted runner-to-EC2 SSH connectivity checks failed |
| Planned alternative | AWS Systems Manager migration, tracked in [issue #9](https://github.com/ayushcmd/cloud_monitor/issues/9) |

The public IP and region are project details supplied during deployment troubleshooting. Before acting, confirm the EC2 instance ID, current state, attached storage, security groups, DNS and active containers. Do not assume the current IP is an Elastic IP or that optional AWS components are active without checking the account.

## 3. Architecture and production services

~~~mermaid
flowchart TB
    User[Browser] -->|HTTP TCP 80| EC2[EC2 / Docker host]
    Agent[Remote Docker host agent] -->|Outbound API requests| Web[Frontend Nginx]
    EC2 --> Web
    Web -->|/api/* and health routes| API[FastAPI backend]
    API --> DB[(PostgreSQL 16)]
    Prom[Prometheus] --> API
    Prom --> Node[Node Exporter]
    Prom --> Rules[Prometheus rules]
    Rules --> AM[Alertmanager]
    Vol[(Named Docker volume)] --- DB
    Caddy[Caddy TLS profile - optional] -. optional path .-> Web
~~~

### Production Compose inventory

| Service | Image/build source | Purpose | Public host port |
|---|---|---|---|
| postgres | postgres:16-alpine | Persistent application database | None; internal network |
| backend | Built from backend/Dockerfile | FastAPI API and /metrics | None; internal network |
| frontend | Built from frontend/Dockerfile | React assets, Nginx and selected proxy paths | TCP 80 |
| prometheus | prom/prometheus:v2.54.1 | Scrapes metrics and evaluates rules | None; internal network |
| node-exporter | prom/node-exporter:v1.8.2 | Exposes host OS metrics | None; internal network |
| alertmanager | prom/alertmanager:v0.27.0 | Groups and routes Prometheus alerts | None; internal network |
| caddy | caddy:2-alpine | Optional TLS reverse proxy | TCP 443 when tls profile is enabled |

**Local versus production:** Grafana and cAdvisor exist in the local docker-compose.yml, but they are not services in the current docker-compose.prod.yml. The current Prometheus configuration has targets for Prometheus, Node Exporter, the backend, and Alertmanager. It does not define a cAdvisor target. External Alertmanager notification delivery is not verified because the current webhook receiver lists are empty.

## 4. AWS services: current versus optional

| Service | Status and role |
|---|---|
| Amazon EC2 | Hosts the Docker Compose deployment |
| VPC and security group | Provide networking and firewall rules for EC2 |
| EC2 block storage / EBS | Persists host files; verify actual block-device mapping and backup plan in AWS |
| Elastic IP | Listed as a deployment option in the existing guide; current IP allocation is not confirmed here |
| Route 53 or external DNS | Optional for a stable custom domain; not required for the IP demo |
| Systems Manager | Planned deployment connection path; not established as the active GitHub deployment method |
| CloudWatch | Future/evaluation integration; application logs and custom metrics are not verified as configured |
| S3 | No verified application backup integration |
| RDS | Not used by current Compose architecture; PostgreSQL runs on the EC2 host |
| ECR | Not established as the image source; Compose builds backend and frontend images on host |
| Load balancer | No active load balancer is confirmed in the single-host design |

Provisioning commands and costs in existing project guides are examples, not proof that the corresponding resources currently exist or that example prices are current.

## 5. Network and security-group design

The current demo is HTTP on port 80. A previously reviewed security group had rules for HTTP 80, HTTPS 443, and SSH 22. SSH access was restricted by source IP rules. GitHub-hosted runner connectivity failed because the active runner IP was not permitted, and runner addresses changed between diagnostic runs.

| Port | Intended use | Guidance |
|---|---|---|
| 80/TCP | Public HTTP web app and possible TLS validation/redirect path | Keep open if required by current web and TLS design |
| 443/TCP | HTTPS when the domain and TLS proxy are configured | Verify TLS first |
| 22/TCP | SSH administration; used by current CD workflow | Restrict to trusted administrator sources; do not open to the world as a workaround |
| 5432/TCP | PostgreSQL | Keep private; do not publish publicly |
| 8000/TCP | FastAPI backend | Not published by production Compose; keep internal |
| 9090/TCP | Prometheus UI/API | Keep internal unless protected access is intentionally designed |
| 9100/TCP | Node Exporter | Do not expose publicly |
| 9093/TCP | Alertmanager | Do not expose publicly |

GitHub-hosted runner IPs change, and its published CIDR ranges are very large. Adding single transient runner IPs as permanent /32 rules is unreliable. The earlier idea of a single prefix list for all published ranges was not practical under ordinary AWS prefix-list and security-group quotas.

### Transport security

A security-group rule for port 443 does not prove HTTPS is active. The production Compose file defines Caddy behind the optional tls profile and expects domain configuration. Test certificate issuance, hostname, routing and renewal before advertising HTTPS.

Do not send real user credentials, agent keys, or sensitive telemetry over the current HTTP demo. Use test credentials until the HTTPS endpoint is verified.

## 6. Environment configuration

The repository contains .env.example and .env.production.example. These are templates. The actual production environment file is expected at:

/home/ubuntu/cloud_monitor/.env

Relevant settings include application name/environment, CORS origins, database user/password/name, DATABASE_URL, JWT signing secret and expiry, optional frontend API base URL, and domain settings for the optional TLS proxy. Read the current Compose and environment templates before changing values.

### Rules

- Never commit the actual production .env file.
- Use generated high-entropy database and JWT secrets.
- Keep POSTGRES_* values consistent with DATABASE_URL.
- Set CORS origins to actual intended browser origins.
- Do not overwrite the production .env with an example file.
- Do not print secrets in CI logs, issue comments, or screenshots.
- Validate configuration and service health after changes without revealing secret values.

The CD workflow checks that production .env exists and intentionally does not copy the example file over it.

## 7. Safe host inspection

Run these commands only from an authorized administrator session. They inspect current state and do not intentionally delete data.

### Container state

~~~bash
cd /home/ubuntu/cloud_monitor
sudo docker compose -f docker-compose.prod.yml ps
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
~~~

### Recent logs

~~~bash
sudo docker compose -f docker-compose.prod.yml logs --tail=100 backend
sudo docker compose -f docker-compose.prod.yml logs --tail=100 frontend
sudo docker compose -f docker-compose.prod.yml logs --tail=100 postgres
sudo docker compose -f docker-compose.prod.yml logs --tail=100 prometheus
sudo docker compose -f docker-compose.prod.yml logs --tail=100 alertmanager
~~~

Redact credentials, personal information, agent identifiers, and sensitive payloads before sharing logs.

### Check the web endpoint

On the EC2 host:

~~~bash
curl -i http://127.0.0.1/health
curl -i http://127.0.0.1/
~~~

From a machine that can reach the public endpoint:

~~~bash
curl -I http://3.25.150.231/
curl -i http://3.25.150.231/health
~~~

The public root should serve the frontend. The current Nginx configuration proxies /health to the backend. Use the local backend address or container network for /docs and /metrics; the public frontend proxy does not expose every backend route.

## 8. Monitoring and observability

### Local services and URLs

The local Compose configuration binds its ports to loopback. Common URLs are:

| Service | Local address |
|---|---|
| React/Nginx frontend | http://localhost:5173 |
| FastAPI | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |
| Alertmanager | http://localhost:9093 |
| Node Exporter | http://localhost:9100/metrics |
| cAdvisor | http://localhost:8080 |
| PostgreSQL mapping | localhost:5433 |

Start the local frontend profile:

~~~bash
docker compose --profile frontend up -d --build
docker compose ps
~~~

### Production Prometheus and Node Exporter

Production Compose sets Prometheus retention to two days. Configured scrape jobs include Prometheus, Node Exporter, the backend and Alertmanager. Verify actual target health using Prometheus target status or host/container logs before assuming telemetry is arriving.

Node Exporter exposes host OS metrics over the internal Docker network. cAdvisor is not a service in the production Compose file and is not present in the current Prometheus target list.

### Grafana and Alertmanager

Grafana is configured in the local Compose stack, not in the current production Compose file. Alertmanager's routes and receiver names are defined, but webhook lists are empty. External email, chat, or webhook delivery should be considered unconfigured until a receiver is added and a test notification is observed.

## 9. CI/CD status and planned Systems Manager migration

### CI workflow

The repository's .github/workflows/ci.yml includes:
- Python 3.12 setup and dependency installation
- pytest for backend and agent tests
- Node.js 20 and npm ci
- frontend production build and output verification
- validation of both local and production Compose configurations

Check the specific GitHub Actions run before reporting that a commit passed CI.

### Current SSH-based CD

The .github/workflows/cd.yml workflow defines SSH deployment from a GitHub-hosted runner to EC2, followed by Compose deployment and health/telemetry checks. It requires configured GitHub secrets and an existing production .env on EC2.

Recent debugging found TCP port 22 from GitHub-hosted runners was unreachable because the active runner egress address was not allowed by the EC2 security group. That makes the current SSH-based deployment an unreliable, unresolved workflow. CI/CD migration is currently deferred.

### Planned migration to AWS Systems Manager

GitHub issue #9 tracks replacing runner-originated SSH with Systems Manager Run Command. Recommended staged approach:

1. Read the EC2 instance ID, IAM instance profile, and SSM Agent status.
2. Confirm EC2 is online as a Systems Manager managed node.
3. Configure a least-privilege instance role and required outbound access to SSM endpoints.
4. Test an innocuous read-only SSM command.
5. Configure GitHub-to-AWS authentication with OIDC and narrowly scoped permissions.
6. Update CD to invoke only the approved deployment operation through SSM.
7. Test in a controlled run and verify the web app, backend health, Prometheus targets and PostgreSQL persistence.
8. Keep existing administrator access until SSM deployment is confirmed.
9. Only then remove the deployment's dependency on runner-originated inbound SSH.

Do not change the security group or IAM permissions until the staged design has been reviewed.

## 10. Safe deployment checklist

Before deploying:
1. Confirm the EC2 instance, region, repository revision and Compose file.
2. Inspect local tracked changes and current Git commit on EC2.
3. Verify production .env exists and is not about to be overwritten.
4. Check PostgreSQL health.
5. Confirm a recent database backup exists and can be accessed.
6. Validate Compose configuration.
7. Check CI results for the commit to deploy.

Useful preflight commands:

~~~bash
cd /home/ubuntu/cloud_monitor
git status --short
git log -1 --oneline
sudo docker compose -f docker-compose.prod.yml config --quiet
sudo docker compose -f docker-compose.prod.yml ps
~~~

Inspect git status because a deployment workflow can reset tracked files. Do not leave valuable uncommitted production changes in tracked files.

After deployment:
- Verify expected containers and health states.
- Open the public frontend and inspect /health.
- Confirm backend database connectivity.
- Verify Prometheus targets are up.
- Check that alert rule metric names exist.
- Test agent telemetry in a controlled environment.
- Confirm existing user, agent and metric records remain present.

Never use docker compose down -v as a deployment or recovery shortcut. The named database volume contains production data.

## 11. PostgreSQL persistence, backup and restore

### What the volume provides

Production Compose declares the named volume cloudmonitor-prod_postgres_data mounted at /var/lib/postgresql/data. The volume survives ordinary container replacement while it is retained. This is not a substitute for a verified off-host backup. Confirm the actual EC2 block-device mapping before claiming the database uses a dedicated EBS volume.

### Example logical dump

Create a backup before schema migrations or risky releases. Protect the output because it may contain user and agent data. Example, assuming the actual production database/user are cloudmonitor:

~~~bash
cd /home/ubuntu/cloud_monitor
BACKUP_FILE="$HOME/cloudmonitor-db-$(date +%Y%m%d-%H%M%S).sql"
sudo docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U cloudmonitor cloudmonitor > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
~~~

Validate actual database names/credentials and check the command exit status and output before trusting the dump. A backup on the same EC2 host is not an off-host backup. S3 integration is not established by the current application configuration.

### Restore testing

Test restore into a separate database or isolated environment. Confirm the dump imports, expected tables exist, the application connects, user/agent records are consistent, and application health works. Never test restoration by overwriting the only production database.

Define a recovery point objective (acceptable data loss window) and recovery time objective (acceptable outage duration). Choose backup frequency and retention from those objectives rather than claiming an untested guarantee.

## 12. Rollback principles

For a failed release, restore a known-good application version while preserving the database. Prefer a reviewed Git revert or a known-good revision, then rebuild/restart only intended application services. Check schema changes before rolling application code back: code rollback may not be compatible with a migrated database.

Before rollback:
- confirm the known-good revision;
- preserve production .env;
- capture relevant logs;
- verify backup status;
- never delete the named database volume.

After rollback, verify containers, /health, frontend/API behavior, Prometheus targets, database connectivity and existing records. Do not automatically downgrade a database for every application rollback; schema changes may be irreversible or incompatible with old code.

## 13. Cost and sizing considerations

The deployment intentionally uses a single EC2 host rather than several managed services. This reduces the number of resources but combines application, database and monitoring on one host. It has a single-host failure domain, so disk capacity, memory, CPU and backups matter.

Before increasing metric retention or adding CloudWatch logs, RDS, a load balancer or other services:
- inspect current EC2/storage sizes;
- review account billing and Cost Explorer;
- estimate log ingestion, retention, traffic and alarms;
- estimate backup/snapshot storage costs;
- deploy optional resources only when the benefit justifies the ongoing cost.

Cost numbers in existing notes are examples. Pricing and free-tier eligibility depend on region, instance, account, usage and current AWS offers. Use the AWS Pricing Calculator and account billing data before decisions.

## 14. Troubleshooting

### Web app unavailable
1. Check EC2 state/public address.
2. Verify the security group permits the required web port.
3. Inspect frontend/backend Compose state and logs.
4. Test the host-local web root and /health route.
5. Confirm Nginx paths match service names.

### API or database errors
1. Inspect backend logs without exposing secrets.
2. Verify backend container health.
3. Verify PostgreSQL health and DATABASE_URL.
4. Inspect browser network errors and status codes.
5. Use local Swagger UI to inspect route schemas where backend access is available.

### Agent pending/offline
1. Confirm the process/container is running.
2. Inspect agent logs for Docker or TLS errors.
3. Verify CLOUDMONITOR_SERVER and the agent key.
4. Confirm key is current, not rotated/revoked.
5. Verify outbound connectivity from the monitored host.
6. Check heartbeat and ingestion requests.
7. Confirm the logged-in dashboard account owns that agent.

### Prometheus target down
1. Inspect Prometheus and target logs.
2. Check service names/ports on the Compose network.
3. Confirm target is configured in monitoring/prometheus/prometheus.yml.
4. Validate the metrics endpoint from Prometheus's network.
5. Confirm actual metric names before altering rules.
6. Remember that current targets include the backend and Node Exporter, not cAdvisor.

### Alert notifications absent
The current Alertmanager receiver config has empty webhook lists. Configure and test a real receiver before expecting external notifications.

### SSH CD fails
1. Inspect the failing GitHub Actions step.
2. Verify EC2 address and SSH service.
3. Check allowed administrator source rules without opening SSH to the world.
4. Verify SSH private key and known-host values remain correct and secret.
5. Remember runner IPs change; single-/32 allowlisting is not durable.
6. Keep deployment paused until a stable connection approach is ready.

## 15. Operations checklists

### Before deployment
- [ ] Correct instance, region, repository revision and Compose file confirmed
- [ ] EC2 tracked changes reviewed
- [ ] Production .env exists and is protected
- [ ] PostgreSQL is healthy
- [ ] Recent backup exists and is stored securely
- [ ] Compose configuration validates
- [ ] CI result reviewed for target commit

### After deployment
- [ ] Containers report expected states
- [ ] Web frontend loads
- [ ] /health responds correctly
- [ ] Backend reaches PostgreSQL
- [ ] Prometheus targets are up
- [ ] Alert rules reference metrics that exist
- [ ] Agent heartbeat/telemetry works in a controlled test
- [ ] Existing records remain present
- [ ] No secrets or private endpoints are exposed

### Before enabling HTTPS
- [ ] Domain and DNS records configured
- [ ] Caddy TLS profile and hostname configuration verified
- [ ] Required security-group ports checked
- [ ] Certificate issuance and renewal tested
- [ ] Redirect behavior confirmed if required
- [ ] CORS origins and agent URL updated
- [ ] Login and agent telemetry tested over HTTPS
- [ ] README updated only after verification

## 16. Related documents

- [README](../README.md)
- [Project Build & Architecture](PROJECT_BUILD_AND_ARCHITECTURE.md)
- [Existing AWS deployment guide](DEPLOYMENT_AWS.md)
- [CI/CD setup guide](CICD_SETUP_GUIDE.md)
- [Production Compose](../docker-compose.prod.yml)
- [Local Compose](../docker-compose.yml)
- [Caddy configuration](../Caddyfile)
- [Issue #9 — Systems Manager migration](https://github.com/ayushcmd/cloud_monitor/issues/9)

## 17. Team

Sarnendu Das, Parveen Kumar, and Ayush Raj — BSc CSDA students at IIT Patna, fifth semester.
