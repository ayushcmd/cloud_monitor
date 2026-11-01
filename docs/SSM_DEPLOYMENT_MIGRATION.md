# Issue #9 — Migrate EC2 deployment from SSH to AWS Systems Manager

**Status:** Completed and verified on 1 November 2026  
**Repository:** ayushcmd/cloud_monitor  
**Production region:** ap-southeast-2 (Sydney)  
**Production deployment workflow:** CloudMonitor CD — Deploy to AWS EC2 via SSM

## Outcome

CloudMonitor's GitHub Actions deployment path has been migrated from runner-originated SSH to GitHub OIDC plus AWS Systems Manager Run Command.

The first controlled production deployment completed successfully. GitHub Actions assumed the dedicated AWS deployment role, verified that the EC2 instance was Online in Systems Manager, invoked AWS-RunShellScript, deployed GitHub main and passed its frontend, backend and Prometheus health checks.

### Verified production state

| Acceptance criterion | Result |
|---|---|
| EC2 registered and Online in Systems Manager | Complete |
| GitHub OIDC provider and deployment role | Complete; live role assumption verified |
| GitHub Actions can invoke the approved SSM command | Complete |
| GitHub-hosted runner needs inbound SSH to deploy | No |
| Production deployment and health checks succeed | Complete |
| PostgreSQL data and named volume preserved | Complete |
| IAM trust and deployment permissions documented | Complete |
| Rollback and troubleshooting documented | Complete |
| HTTP application access | Verified |
| HTTPS/TLS | Tracked separately under broader production security work |

Production verification recorded:
- Deployed commit: f536dad97518a761c12b83ff578ff3194e9ed04f
- Frontend: HTTP 200
- Backend /health: status=healthy
- PostgreSQL: healthy
- Prometheus required targets: alertmanager, cloudmonitor-backend, node-exporter and prometheus all up
- PostgreSQL volume: cloudmonitor-prod_postgres_data, preserved
- Alembic revision checked before deployment: 003_os_and_version

The successful deployment does not mean all production-security work is complete. HTTP/TLS hardening, unauthenticated Prometheus read access, agent Docker socket privilege hardening and human SSM Session Manager access remain separate work.

## Architecture

~~~text
GitHub Actions (production Environment)
        |
        | GitHub OIDC token
        v
IAM role: CloudMonitorGitHubDeployRole
        |
        | short-lived AWS credentials
        | ssm:SendCommand
        v
AWS Systems Manager Run Command
        |
        v
CloudMonitor EC2 / SSM Agent
        |
        v
/home/ubuntu/cloud_monitor
        |
        v
Docker Compose production services
~~~

Two IAM roles are used for different purposes:

- CloudMonitorEC2SSMRole — trusted by the EC2 service and attached to the instance profile. It includes AmazonSSMManagedInstanceCore.
- CloudMonitorGitHubDeployRole — trusts the GitHub OIDC provider and permits the production GitHub Actions job to invoke the approved SSM command on the specific CloudMonitor instance.

The OIDC provider is token.actions.githubusercontent.com with audience sts.amazonaws.com. The trust policy is scoped to the CloudMonitor repository's production Environment subject. The exact subject must match the claims printed by the workflow's OIDC inspection step.

## GitHub workflow behavior

The workflow is .github/workflows/cd.yml.

It is currently manual-only through workflow_dispatch. A push or merge to main runs CI but does not automatically deploy production. This is intentional: production deploy/rollback require an explicit operation selection and confirmation.

| Operation | Purpose | Confirmation |
|---|---|---|
| oidc-check | Inspect OIDC claims and verify AWS STS role assumption | Not required |
| ssm-preflight | Verify the EC2 managed node is Online and run read-only preflight checks | Not required |
| deploy | Fetch main, build/update production services and run health checks | Required |
| rollback | Restore the previous recorded Git revision and rebuild application services | Required |

The deployment script records the previous revision under /var/lib/cloudmonitor/previous-deploy-sha and the successful revision under /var/lib/cloudmonitor/last-successful-deploy-sha. It validates Compose configuration, pulls monitoring images, builds backend/frontend, runs docker compose up -d --remove-orphans and checks frontend, backend and required Prometheus targets.

The workflow does not use docker compose down -v and does not delete/recreate the PostgreSQL volume.

## Important first-deployment bootstrap note

The existing production directory initially came from a deployment archive and did not contain Git metadata. The SSM workflow expects a Git checkout.

For this one-time migration, the existing directory was inspected, sensitive files and backups were protected/excluded, a local baseline commit/tag was created, and origin/main was fetched and compared before the guarded deployment workflow checked out main.

This local EC2 baseline is a recovery reference, not a GitHub backup. Production .env and SQL/archive backups must never be pushed to GitHub.

## Operational safety

- Keep production .env at /home/ubuntu/cloud_monitor/.env, outside Git tracking and with restrictive permissions.
- Never print or commit production secrets.
- Keep administrator SSH restricted as a break-glass path until a separate human access method is tested. GitHub-hosted runners no longer need inbound SSH to deploy.
- Take and verify a PostgreSQL backup before risky or schema-changing releases.
- The rollback operation is a source/build rollback, not a database rollback. It does not restore PostgreSQL data or reverse schema migrations.
- Never run docker compose down -v or remove cloudmonitor-prod_postgres_data.
- After deployment, verify the frontend, backend health, Prometheus targets, PostgreSQL health and existing data.

## Detailed setup and click-by-click runbook

See [AWS IAM, GitHub OIDC, SSM and Production Setup](AWS_IAM_OIDC_SSM_PRODUCTION_SETUP.md). It documents:
- EC2 instance role creation and attachment
- SSM Agent diagnostics and Fleet Manager registration
- GitHub OIDC provider verification
- GitHub deployment IAM role, trust relationship and inline policy
- GitHub production Environment variables and main-only branch restriction
- OIDC check, SSM preflight, deploy and rollback operations
- First-time Git checkout bootstrap, backup, production verification and troubleshooting

## References

- [GitHub Actions SSM workflow](../.github/workflows/cd.yml)
- [Production Compose](../docker-compose.prod.yml)
- [AWS Systems Manager documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/what-is-systems-manager.html)
- [GitHub Actions OIDC in AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Systems Manager service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html)
