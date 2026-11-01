# CloudMonitor — CI/CD Setup and Operations

**Last verified:** 1 November 2026  
**Repository:** ayushcmd/cloud_monitor  
**Production deployment:** GitHub Actions + AWS OIDC + Systems Manager Run Command  
**AWS Region:** ap-southeast-2

This guide describes the CI and the current production CD workflow. The older SSH-based runner-to-EC2 deployment is not the active delivery path.

## 1. Workflow files

~~~text
.github/
└── workflows/
    ├── ci.yml    # Test, build and Compose validation
    └── cd.yml    # Manual SSM production operations
~~~

### CI workflow

The CI workflow runs on pushes and pull requests for the configured branches, and can also be run manually.

Jobs:
1. **Backend & Agent Test Suite** — Python 3.12, installs backend/agent requirements and runs pytest for tests/ and agent/tests/.
2. **Frontend Build & Asset Verification** — Node.js 20, npm ci, npm run build and verifies frontend/dist/index.html.
3. **Docker Compose Specification Validation** — validates docker-compose.yml and docker-compose.prod.yml.

A green CI run verifies the tested commit against those jobs. Review workflow annotations as well as the final status; warnings may remain even when checks pass.

### CD workflow

The active workflow is **CloudMonitor CD — Deploy to AWS EC2 via SSM**. It is currently manual-only through workflow_dispatch. CI runs on push/PR, but merging or pushing to main does not itself deploy production.

The production job uses:
- GitHub Environment: production
- GitHub job permissions: contents: read and id-token: write
- GitHub OIDC audience: sts.amazonaws.com
- AWS role: CloudMonitorGitHubDeployRole
- AWS Region: ap-southeast-2
- SSM document: AWS-RunShellScript
- EC2 role: CloudMonitorEC2SSMRole
- Target: the configured CloudMonitor production EC2 instance

No long-lived AWS access key is required by this OIDC flow. The current SSM workflow does not use SSH private-key or known-host secrets.

## 2. GitHub Environment configuration

Open repository **Settings** → **Environments** → **production**.

### Environment variables

| Name | Purpose |
|---|---|
| AWS_ACCOUNT_ID | Expected 12-digit AWS account |
| AWS_DEPLOY_ROLE_ARN | ARN of CloudMonitorGitHubDeployRole |
| EC2_INSTANCE_ID | CloudMonitor production EC2 instance ID |

The region is configured in cd.yml as ap-southeast-2.

### Deployment branch rule

In **Deployment branches and tags**, use **Selected branches and tags** and allow main only. The IAM trust subject is scoped to the production Environment and must match the subject printed by the workflow's OIDC inspection step.

### Protection rules

Required reviewers and wait timers were not enabled in the verified setup; administrator bypass was allowed. For stronger release governance, consider adding independent required reviewers and disabling administrator bypass if supported by the repository plan/settings.

Legacy SSH secrets may remain in the Environment from the previous deployment. The current SSM workflow does not reference them. Search every workflow and script before removing any legacy value. Never reveal private key contents.

## 3. AWS IAM components

Two IAM roles have different responsibilities:

| Role | Trusted entity | Purpose |
|---|---|---|
| CloudMonitorEC2SSMRole | EC2 service | Attached to the production instance; includes AmazonSSMManagedInstanceCore |
| CloudMonitorGitHubDeployRole | GitHub OIDC provider | Assumed by GitHub Actions; permits the approved SSM operation on the CloudMonitor EC2 target |

The OIDC provider is token.actions.githubusercontent.com with audience sts.amazonaws.com. The GitHub deployment role trust policy must match the exact production Environment subject from the workflow's OIDC claim inspection. Do not use a broad repository or organization wildcard.

The inline policy CloudMonitorSSMDeployPolicy permits the required SSM describe, approved RunShellScript send-command and command-invocation read operations. The send-command resource scope is restricted to the AWS-RunShellScript document and the specific CloudMonitor instance. Do not attach AdministratorAccess.

For the full click-by-click AWS Console procedure, example trust policy, policy JSON and instance-role attachment, see:

**[AWS IAM, GitHub OIDC, SSM and Production Setup](AWS_IAM_OIDC_SSM_PRODUCTION_SETUP.md)**

## 4. Run the SSM workflow

Open repository **Actions** → **CloudMonitor CD — Deploy to AWS EC2 via SSM** → **Run workflow**. Select workflow source main.

Available operations:

| Operation | Use | Production confirmation |
|---|---|---|
| oidc-check | Validate OIDC claims and AWS STS role assumption | No |
| ssm-preflight | Confirm EC2 Online in SSM and inspect Docker/Compose state without deployment | No |
| deploy | Fetch main, build/update production services and run health checks | Required |
| rollback | Restore the previous recorded Git revision and rebuild application services | Required |

### Recommended production release sequence

1. Confirm the intended code is merged to main and CI is green.
2. Run oidc-check and confirm the issuer, audience, subject and assumed role.
3. Run ssm-preflight and confirm the CloudMonitor EC2 managed node is Online.
4. Verify production .env exists on EC2, is not Git-tracked and passes configuration validation.
5. Verify a recent PostgreSQL backup exists and can be read.
6. Check EC2 disk/memory headroom and production Compose configuration.
7. Run deploy and check the production confirmation input.
8. Watch the SSM command output inside the workflow.
9. Verify frontend, backend, Prometheus targets and PostgreSQL persistence independently.

Do not run deploy to test connectivity. Use oidc-check and ssm-preflight for non-deploying checks.

## 5. What deployment changes on EC2

The current deployment script:
1. Checks the production directory and .env file.
2. Refuses to continue if .env is tracked by Git.
3. Records the previous commit in /var/lib/cloudmonitor/previous-deploy-sha.
4. Fetches origin/main and checks out origin/main.
5. Validates production Compose configuration.
6. Pulls Prometheus, Node Exporter and Alertmanager images.
7. Builds backend and frontend images on the EC2 host.
8. Runs docker compose up -d --remove-orphans.
9. Waits for frontend HTTP 200.
10. Waits for backend /health to report status=healthy.
11. Waits for the required Prometheus targets to report up.
12. Records the successful revision in /var/lib/cloudmonitor/last-successful-deploy-sha.

The script does not run docker compose down -v. It does not intentionally delete or recreate the PostgreSQL volume.

## 6. Rollback

Rollback is a deliberate production operation:
1. Open the SSM CD workflow and select **Run workflow**.
2. Choose main and operation rollback.
3. Check the production confirmation input.
4. Start the workflow and inspect SSM output.
5. Verify application health after rollback.

The workflow restores the previous Git revision, rebuilds backend/frontend and runs Compose. This is a code/build rollback only. It does not restore PostgreSQL data, reverse Alembic migrations or revert arbitrary data changes. Take a database backup before schema-changing releases and keep schema changes backward-compatible where possible.

## 7. Production safeguards

- Keep /home/ubuntu/cloud_monitor/.env outside Git and with restrictive permissions.
- Never print or commit secrets.
- Do not replace production .env with an example file.
- Preserve named PostgreSQL volume cloudmonitor-prod_postgres_data.
- Never run docker compose down -v on production.
- Keep administrator access restricted; SSM deployment removes the runner's need for inbound SSH but does not itself establish human Session Manager access.
- Do not claim HTTPS is active solely because security group port 443 is open. TLS remains a separate security task.
- Production Prometheus read access remains a separate hardening task.

## 8. Verified production deployment

The first controlled SSM production deployment completed successfully on 1 November 2026.

| Check | Verified result |
|---|---|
| Deployed commit | f536dad97518a761c12b83ff578ff3194e9ed04f |
| Last-successful-deploy SHA | Matched deployed commit |
| Frontend | HTTP 200 |
| Backend | Healthy |
| PostgreSQL | Healthy |
| Prometheus | Healthy |
| Alertmanager | Running |
| Node Exporter | Running |
| Prometheus target pools | alertmanager, cloudmonitor-backend, node-exporter and prometheus all up |
| PostgreSQL volume | cloudmonitor-prod_postgres_data preserved |

The migration is tracked as complete in [Issue #9](https://github.com/ayushcmd/cloud_monitor/issues/9). Broader production-security work remains in [Issue #12](https://github.com/ayushcmd/cloud_monitor/issues/12).

## 9. Troubleshooting quick reference

| Symptom | Check |
|---|---|
| EC2 not Online in SSM | Attached EC2 instance profile, AmazonSSMManagedInstanceCore, SSM Agent, IMDS and outbound HTTPS |
| OIDC AccessDenied | Exact issuer/audience/subject, IAM trust JSON, production Environment and role ARN |
| SSM command fails | Open SSM command ID and inspect instance invocation Output and Error |
| not a git repository | Confirm /home/ubuntu/cloud_monitor contains .git and origin is correct |
| set: Illegal option -o pipefail | Run Bash scripts through bash -lc, not the default POSIX /bin/sh |
| confirm_production error | Select deploy/rollback and check the confirmation input |
| backend unhealthy | Inspect backend logs, configuration validation and database connectivity |
| Prometheus target down | Inspect target status, Docker service names, network and scrape configuration |
| database/rollback concern | Stop; preserve volume and backup. Code rollback does not restore or reverse database changes |

## 10. Related documentation

- [Detailed AWS IAM/OIDC/SSM setup](AWS_IAM_OIDC_SSM_PRODUCTION_SETUP.md)
- [SSM deployment migration record](SSM_DEPLOYMENT_MIGRATION.md)
- [Production AWS operations](AWS_DEPLOYMENT_AND_OPERATIONS.md)
- [GitHub Actions SSM workflow](../.github/workflows/cd.yml)
- [CI workflow](../.github/workflows/ci.yml)
- [Production Compose](../docker-compose.prod.yml)
