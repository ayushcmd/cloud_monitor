# CloudMonitor — AWS IAM, GitHub OIDC, SSM and Production Setup

**Verified:** 1 November 2026  
**Repository:** ayushcmd/cloud_monitor  
**AWS region:** ap-southeast-2 (Sydney)  
**GitHub Environment:** production  
**Production host directory:** /home/ubuntu/cloud_monitor  
**Status:** First SSM production deployment verified

This is the button-by-button record of the AWS and GitHub configuration used to move CloudMonitor production delivery from runner-originated SSH to GitHub OIDC plus AWS Systems Manager Run Command.

> **Secrets and identifiers:** Values below use placeholders where appropriate. Never commit production .env contents, JWTs, database passwords, agent keys, AWS access keys, private keys or secret values. Do not paste them into issue comments or workflow logs.

---

## 1. Architecture and roles

~~~text
GitHub Actions (production Environment)
        |
        | OIDC token: issuer token.actions.githubusercontent.com
        | audience sts.amazonaws.com
        v
IAM role: CloudMonitorGitHubDeployRole
        |
        | short-lived STS credentials
        | ssm:SendCommand
        v
AWS Systems Manager Run Command
        |
        v
CloudMonitor EC2 instance / SSM Agent
        |
        | runs AWS-RunShellScript
        v
/home/ubuntu/cloud_monitor
        |
        | fetch origin/main, checkout, Docker Compose
        v
frontend | backend | postgres | prometheus
         | node-exporter | alertmanager
~~~

There are two distinct roles:

| Role | Trusted entity | Purpose |
|---|---|---|
| CloudMonitorEC2SSMRole | AWS service: EC2 | Lets the EC2 instance's SSM Agent register with and communicate with Systems Manager |
| CloudMonitorGitHubDeployRole | GitHub OIDC web identity | Lets the approved GitHub Actions job assume a short-lived AWS role and call the SSM deployment path |

The EC2 role is attached to the instance as an instance profile. The GitHub role is not attached to EC2.

**Current workflow behavior:** the CD workflow is manual-only through workflow_dispatch. A push or merge to main runs CI but does not automatically deploy production. Deploy and rollback require an explicit confirmation input. Do not describe this as push-triggered automatic CD.

GitHub-hosted runners do not need inbound SSH access to deploy through SSM. Keep restricted administrator SSH as a break-glass path until an alternative human access method, such as Session Manager, is separately tested. Do not open port 22 to the internet.

---

## 2. Prepare the values

Collect these from your own account:

| Value | Source |
|---|---|
| AWS account ID | AWS account menu or STS caller identity |
| Region | ap-southeast-2 |
| EC2 instance ID | EC2 → Instances → CloudMonitor production host |
| GitHub repository | ayushcmd/cloud_monitor |
| GitHub Environment | production |
| Exact OIDC subject | Inspect OIDC claims step of an oidc-check workflow run |
| Deployment role ARN | IAM → Roles → CloudMonitorGitHubDeployRole |

Do not select another project's instance. CloudMonitor and other project instances may appear in the same EC2 or Fleet Manager list.

---

## 3. EC2 instance role and SSM Agent

### 3.1 Create or verify the EC2 role

1. Open AWS Console → IAM.
2. Select **Roles** in the left navigation.
3. Select **Create role**.
4. Under **Trusted entity type**, choose **AWS service**.
5. Choose **EC2** as the use case.
6. Select **Next** to add permissions.
7. Search for and select **AmazonSSMManagedInstanceCore**.
8. Select **Next**.
9. Set role name to **CloudMonitorEC2SSMRole**.
10. Add a description explaining that the role allows the CloudMonitor EC2 host to communicate with Systems Manager.
11. Review that the trusted entity is EC2 and the policy is AmazonSSMManagedInstanceCore.
12. Select **Create role**.

If the role already exists with this trust and policy, reuse it. Do not create a duplicate.

### 3.2 Attach the role to CloudMonitor EC2

1. Open **EC2** → **Instances**.
2. Select only the CloudMonitor production instance.
3. Choose **Actions** → **Security** → **Modify IAM role**.
4. Select **CloudMonitorEC2SSMRole** from the IAM role dropdown.
5. Select **Update IAM role**.
6. Return to instance details and confirm the role is attached.

### 3.3 Verify the SSM Agent

On the authorized Ubuntu host, run:

~~~bash
sudo snap list amazon-ssm-agent
sudo snap services amazon-ssm-agent
sudo ssm-cli get-diagnostics --output table
~~~

Check that the agent is enabled/running, EC2 IMDS is accessible, AWS credentials resolve to the EC2 instance role, and regional SSM endpoints are reachable.

The EC2 host needs outbound HTTPS (TCP 443) to required AWS endpoints. SSM does not require an inbound listener or inbound security-group port.

### 3.4 Confirm Fleet Manager registration

1. Open **Systems Manager**.
2. Open **Fleet Manager** → **Managed nodes**.
3. Refresh the list.
4. Find the CloudMonitor instance by its instance ID/name.
5. Confirm its node state is Running and ping status is **Online**.

If it is not Online, check the EC2 role, SSM Agent, IMDS and outbound endpoint connectivity before continuing.

---

## 4. GitHub OIDC identity provider

### 4.1 Check for an existing provider first

1. Open **IAM** → **Identity providers**.
2. Find **token.actions.githubusercontent.com**.
3. Open the provider.
4. Confirm type is **OpenID Connect**.
5. Confirm audience is **sts.amazonaws.com**.

The CloudMonitor AWS account already had this provider. Reuse it. Do not create duplicates or delete a provider used by other roles.

### 4.2 Create it only if absent

1. Select **Add provider**.
2. Choose **OpenID Connect**.
3. Provider URL: **https://token.actions.githubusercontent.com**
4. Audience: **sts.amazonaws.com**
5. Select **Add provider**.
6. Reopen the provider and verify the URL and audience.

---

## 5. GitHub deployment role

### 5.1 Create the role

1. Open **IAM** → **Roles** → **Create role**.
2. For **Trusted entity type**, choose **Web identity**.
3. Choose identity provider **token.actions.githubusercontent.com**.
4. Choose audience **sts.amazonaws.com**.
5. Enter GitHub organization/owner **ayushcmd** and repository **cloud_monitor** if prompted.
6. Continue to **Add permissions**.

The simplified console form may initially generate broader trust conditions. After role creation, edit the Trust relationship JSON so the subject is restricted to the exact production Environment subject shown by the workflow's OIDC check.

### 5.2 Add the inline SSM policy

1. On **Add permissions**, select **Create inline policy**.
2. Open the **JSON** editor.
3. Replace the editor contents with the policy below, inserting your AWS account ID and exact EC2 instance ID.
4. Continue and name the inline policy **CloudMonitorSSMDeployPolicy**.

~~~json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DescribeManagedInstances",
      "Effect": "Allow",
      "Action": "ssm:DescribeInstanceInformation",
      "Resource": "*"
    },
    {
      "Sid": "AllowApprovedRunShellScriptDocument",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": "arn:aws:ssm:ap-southeast-2::document/AWS-RunShellScript"
    },
    {
      "Sid": "AllowCommandOnlyOnCloudMonitorInstance",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": "arn:aws:ec2:ap-southeast-2:<AWS_ACCOUNT_ID>:instance/<CLOUDMONITOR_EC2_INSTANCE_ID>"
    },
    {
      "Sid": "ReadCommandInvocationResults",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
~~~

The two ssm:SendCommand resource entries are intentional: one is the approved SSM document and one is the exact EC2 target. Keep the target resource restricted to the CloudMonitor instance. Do not substitute a wildcard EC2 resource or attach AdministratorAccess.

The read actions above use Resource "*". Review AWS service authorization/resource-level support before trying to narrow those permissions.

### 5.3 Name and create the role

1. On **Name, review, and create**, enter role name **CloudMonitorGitHubDeployRole**.
2. Suggested description: Allows the CloudMonitor GitHub Actions production workflow to authenticate through OIDC and deploy to EC2 with Systems Manager Run Command.
3. Confirm the trusted entity is GitHub OIDC.
4. Confirm inline policy CloudMonitorSSMDeployPolicy is attached.
5. Select **Create role**.
6. Open the created role and copy its ARN for the GitHub Environment variable.

### 5.4 Edit the trust relationship

Open the role → **Trust relationships** → **Edit trust policy**.

Use this pattern and replace placeholders with the actual AWS account ID and exact OIDC subject:

~~~json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "<EXACT_SUBJECT_FROM_OIDC_CHECK>"
        }
      }
    }
  ]
}
~~~

The immutable subject observed for this CloudMonitor setup was:

~~~text
repo:ayushcmd@252997256/cloud_monitor@1419373799:environment:production
~~~

GitHub subject formats can depend on repository OIDC subject-claim settings. The subject printed in the current workflow run is authoritative. It must match the trust policy exactly. Do not replace it with repo-wide or branch-wide wildcards.

1. Select **Update policy**.
2. Reopen **Trust relationships** and verify the saved JSON.

---

## 6. GitHub production Environment

### 6.1 Open the existing Environment

1. Open GitHub repository **ayushcmd/cloud_monitor**.
2. Select **Settings**.
3. Open **Environments**.
4. Open the existing **production** Environment.
5. Do not delete/recreate it; it already holds the workflow configuration.

### 6.2 Restrict deployment branches

1. In **Deployment branches and tags**, choose **Selected branches and tags**.
2. Select **Add deployment branch or tag rule**.
3. Add branch **main**.
4. Confirm that one branch, main, is allowed.

### 6.3 Review Environment protection

The verified setup left **Required reviewers** and **Wait timer** unchecked and allowed administrators to bypass configured rules.

For stronger governance, consider adding a required reviewer and disabling administrator bypass if the repository plan/settings permit. These were not mandatory approval gates during the verified deployment.

### 6.4 Add the three Environment variables

Scroll to **Environment variables** → **Add environment variable**. Create:

| Variable name | Value |
|---|---|
| AWS_ACCOUNT_ID | Your 12-digit AWS account ID |
| AWS_DEPLOY_ROLE_ARN | ARN of CloudMonitorGitHubDeployRole |
| EC2_INSTANCE_ID | CloudMonitor production EC2 instance ID |

The workflow sets AWS_REGION to ap-southeast-2 in YAML. These are GitHub Environment variables, not repository secrets.

### 6.5 Legacy SSH secrets

The Environment previously contained EC2_HOST, EC2_USER, EC2_SSH_PRIVATE_KEY and EC2_SSH_KNOWN_HOSTS secrets. The current SSM workflow does not consume them. They were left in place during migration. Search all workflows before removing them. Never reveal private-key values.

---

## 7. GitHub Actions operations

Workflow file: **.github/workflows/cd.yml**  
Workflow name: **CloudMonitor CD — Deploy to AWS EC2 via SSM**

The workflow job has contents:read and id-token:write. The id-token permission permits requesting the OIDC token; AWS permissions are granted by the assumed IAM role, not by the GitHub permission alone.

### Available operations

| Operation | Behavior | Requires production confirmation |
|---|---|---|
| oidc-check | Inspects issuer/audience/subject, assumes the AWS role and verifies caller identity | No |
| ssm-preflight | Confirms EC2 Online in SSM and runs read-only Docker/Compose checks | No |
| deploy | Fetches main, builds/updates production services and runs health checks | Yes |
| rollback | Restores the previously recorded Git revision and rebuilds application services | Yes |

The OIDC token itself is never printed. The workflow prints only the claims needed to compare with IAM trust.

### Run oidc-check

1. Open repository **Actions**.
2. Select **CloudMonitor CD — Deploy to AWS EC2 via SSM**.
3. Select **Run workflow**.
4. Under **Use workflow from**, choose main.
5. Choose operation **oidc-check**.
6. Leave production confirmation unchecked.
7. Select **Run workflow**.
8. Expand OIDC inspection, AWS credential configuration and role-assumption steps.
9. Confirm issuer, audience, subject and STS caller identity are correct.

### Run ssm-preflight

1. Open the same workflow and select **Run workflow**.
2. Choose main.
3. Choose operation **ssm-preflight**.
4. Leave production confirmation unchecked.
5. Select **Run workflow**.
6. Confirm the EC2 node is Online and preflight output reports the expected Compose services.

This operation is read-only. It does not deploy or restart the application.

### Run deploy

Only after CI is green, OIDC check and SSM preflight pass, production configuration is validated and a fresh database backup is verified:

1. Open **Actions** → **CloudMonitor CD — Deploy to AWS EC2 via SSM**.
2. Select **Run workflow**.
3. Choose main.
4. Choose operation **deploy**.
5. Check the confirmation input **Required for production deploy and rollback**.
6. Select **Run workflow** and complete any configured Environment approval.
7. Expand **Run SSM preflight, deployment, or rollback**.
8. Confirm the deployment SHA and health checks succeeded.

Do not use deploy just to test connectivity; use oidc-check and ssm-preflight for that.

### What deploy does

The current script:
1. Checks the deployment directory and production .env.
2. Refuses to deploy if .env is Git-tracked.
3. Records the current Git SHA under /var/lib/cloudmonitor/previous-deploy-sha.
4. Fetches origin/main and checks out the remote main revision.
5. Validates production Compose configuration.
6. Pulls Prometheus, Node Exporter and Alertmanager images.
7. Builds backend and frontend images on EC2.
8. Runs docker compose up -d --remove-orphans.
9. Waits for frontend HTTP 200.
10. Waits for backend /health to report status=healthy.
11. Waits for the required Prometheus scrape pools to be up.
12. Records /var/lib/cloudmonitor/last-successful-deploy-sha.

It does not use docker compose down -v. Never add that command to production deployment or recovery.

---

## 8. One-time Git checkout bootstrap on the existing EC2 host

### Why it was necessary

The existing production directory had been prepared from an archive and did not contain a .git directory. The SSM workflow expects Git metadata to fetch and check out origin/main.

This was a one-time repair for the existing host. A new server should be provisioned from a deliberate Git clone/deployment process instead of blindly repeating this procedure.

### Safe sequence used

1. Inspect the current production directory, .env, archives, SQL backup and Compose files.
2. Confirm .env exists and has restrictive permissions; mode 600 was verified.
3. Create and verify a PostgreSQL backup before deployment.
4. Initialize Git in the existing directory as the ubuntu user, not root.
5. Configure origin to the CloudMonitor GitHub repository.
6. Add local-only exclusions for backup artifacts where needed using .git/info/exclude. Keep the committed .gitignore as the normal project exclusion source.
7. Verify .env, .env.save, archives, SQL dumps and local database files are ignored and not staged.
8. Inspect staged filenames before creating a local baseline commit.
9. Create a local baseline commit/tag representing the existing deployed source.
10. Fetch origin/main without checking it out; compare baseline and candidate main.
11. Allow the guarded deployment workflow to perform checkout only after checks pass.

The EC2 baseline/tag is a local recovery reference, not a GitHub backup or substitute for a SQL dump. Never push production secrets, backup files or the baseline archive to GitHub.

The one-time bootstrap used a 69-file baseline after filename checks. That number is specific to the original host state, not a requirement for future releases.

---

## 9. Production secrets and configuration

Production environment file: **/home/ubuntu/cloud_monitor/.env**

Rules:
- Keep it outside Git tracking.
- Keep permissions restrictive; mode 600 was verified.
- Never print the file or pass secret values into logs.
- Never overwrite it with .env.example or .env.production.example.
- Keep PostgreSQL connection settings consistent.
- Use a high-entropy random JWT signing secret.
- Validate candidate configuration before restarting services.

During the first security-enabled deployment, the JWT secret was rotated to a cryptographically random 256-bit value without printing it. Existing JWTs signed with the previous secret became invalid and users had to authenticate again. Never record the new value in this guide.

The candidate production config was validated using the running backend container's environment before the deployment. The validator accepted the configured JWT and PostgreSQL settings.

---

## 10. Database backup, persistence and rollback

### PostgreSQL volume

The verified production named volume is **cloudmonitor-prod_postgres_data**. The first SSM deployment preserved this volume.

Never run:
- docker compose down -v
- docker volume rm cloudmonitor-prod_postgres_data
- commands that recreate or delete the production data volume

### Backup

Before the first SSM deployment, a PostgreSQL custom-format dump was created on the EC2 host, protected with restrictive permissions and validated using pg_restore --list.

A same-host backup is not an off-host disaster-recovery copy. Maintain a separate protected backup and periodically test restores.

### Schema compatibility

Before deployment, the database was checked:
- Application tables were present.
- Agent fields os_type and agent_version were present.
- Alembic revision was 003_os_and_version.

The deployment workflow's code rollback is not a database rollback. It does not restore a SQL dump or reverse Alembic migrations. Keep schema changes backward-compatible where possible and take a separate backup before a schema-changing release.

### Run rollback

1. Open **Actions** → **CloudMonitor CD — Deploy to AWS EC2 via SSM** → **Run workflow**.
2. Choose main.
3. Choose operation **rollback**.
4. Check production confirmation.
5. Select **Run workflow**.
6. Inspect SSM output and verify frontend/backend health.

The rollback script reads the previous SHA from /var/lib/cloudmonitor/previous-deploy-sha, checks that the commit exists, checks it out, rebuilds backend/frontend and starts Compose. It records the former current SHA for the next rollback.

Rollback restores application source/build state only. It does not restore a database backup or undo schema/data changes. If schema incompatibility is suspected, stop and use a database-specific recovery plan.

---

## 11. Completed production verification — 1 November 2026

The first controlled SSM deployment completed successfully.

| Verification | Observed result |
|---|---|
| GitHub Actions SSM deployment | Successful |
| Deployed Git commit | f536dad97518a761c12b83ff578ff3194e9ed04f |
| Last-successful-deploy SHA | Matched deployed commit |
| Frontend | HTTP 200 |
| Backend /health | status=healthy |
| PostgreSQL | Healthy |
| Prometheus | Healthy |
| Alertmanager | Running |
| Node Exporter | Running |
| Prometheus required targets | alertmanager, cloudmonitor-backend, node-exporter, prometheus all up |
| PostgreSQL volume | cloudmonitor-prod_postgres_data, preserved |
| Alembic revision | 003_os_and_version |

These checks verify the SSM delivery path and the application state observed immediately after deployment. They do not imply every broader production-security task is complete.

### Post-deployment check

Run via Systems Manager Run Command (AWS-RunShellScript), targeting only the CloudMonitor instance:

~~~bash
set -eu
cd /home/ubuntu/cloud_monitor

echo "=== DEPLOYED COMMIT ==="
sudo -u ubuntu -- git rev-parse HEAD

echo "=== LAST SUCCESSFUL DEPLOY ==="
sudo cat /var/lib/cloudmonitor/last-successful-deploy-sha

echo "=== COMPOSE SERVICES ==="
sudo docker compose -f docker-compose.prod.yml ps

echo "=== FRONTEND ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\\n" http://127.0.0.1/

echo "=== BACKEND ==="
curl -fsS http://127.0.0.1/health

echo "=== PROMETHEUS TARGETS ==="
curl -fsS http://127.0.0.1/prom/api/v1/targets
~~~

Redact private identifiers from output. Never print .env.

---

## 12. Troubleshooting

### EC2 not Online in Fleet Manager

Check:
1. CloudMonitorEC2SSMRole is attached as the EC2 instance profile.
2. The role includes AmazonSSMManagedInstanceCore.
3. SSM Agent is installed, enabled and running.
4. IMDS is reachable.
5. Outbound HTTPS to regional SSM endpoints works.
6. Re-run sudo ssm-cli get-diagnostics --output table.

### OIDC role assumption fails

Check:
1. Workflow job has permissions id-token: write.
2. Job uses environment production.
3. OIDC provider audience is sts.amazonaws.com.
4. The subject printed by Inspect OIDC claims exactly matches token.actions.githubusercontent.com:sub in the IAM trust policy.
5. The role ARN is in the correct Environment variable.
6. The assumed role belongs to the intended AWS account.

Do not solve a subject mismatch by changing the trust subject to a wildcard.

### SSM command fails

Open the GitHub run and expand **Run SSM preflight, deployment, or rollback**. Capture the SSM command ID, then open Systems Manager → **Run Command** → command ID → instance invocation → **Output** and **Error**.

Typical causes:
- **not a git repository:** the original deployment directory came from an archive; check Git initialization, checkout and remote.
- **set: Illegal option -o pipefail:** POSIX /bin/sh was used for a Bash script. The current workflow explicitly wraps the remote script with bash -lc.
- **confirm_production=true:** deploy/rollback were requested without the confirmation input.
- **EC2 not Online:** repair instance role, SSM Agent or outbound connectivity.
- **Permission denied:** inspect ownership/permissions; do not recursively change ownership of production data.

### Production config validation fails

Do not print secrets. Check that JWT_SECRET_KEY and DATABASE_URL exist, use valid production values and match the configured PostgreSQL user/password/database. The production validator rejects known development/placeholder values and insufficient JWT-secret length.

### Deployment health check fails

Inspect service state and logs without exposing credentials:

~~~bash
sudo docker compose -f /home/ubuntu/cloud_monitor/docker-compose.prod.yml ps
sudo docker logs --tail 100 cloudmonitor-backend
sudo docker logs --tail 100 cloudmonitor-frontend
sudo docker logs --tail 100 cloudmonitor-prometheus
~~~

Check frontend HTTP status, backend /health, Prometheus target status, free disk and memory. If deployment failed after changing code, inspect whether automatic code rollback completed before initiating another rollback.

---

## 13. Security work that remains outside Issue #9

The SSM migration is complete, but broader production security is not.

| Item | Status after SSM migration |
|---|---|
| GitHub runner needs inbound SSH to deploy | No |
| EC2 SSM managed-node connectivity | Verified Online |
| GitHub OIDC role assumption | Verified |
| SSM deployment and application health checks | Verified |
| PostgreSQL volume preservation | Verified |
| HTTP-to-HTTPS/TLS | Outstanding; production was verified over HTTP |
| Unauthenticated Prometheus read access | Lifecycle actions were blocked; read access remains a separate hardening task |
| Agent Docker socket privilege hardening | Separate security task |
| SSM Session Manager as human break-glass access | Not established by deployment verification |
| Automatic push-to-main production deployment | Not enabled; CD remains manual-only |

Track these items in the broader production-security issue and relevant follow-up issues. Do not describe CloudMonitor as fully security-hardened solely because SSM deployment works.

---

## 14. Console navigation quick reference

| Task | Console navigation |
|---|---|
| Create/inspect EC2 role | AWS Console → IAM → Roles |
| Attach EC2 role | EC2 → Instances → select CloudMonitor → Actions → Security → Modify IAM role |
| Check OIDC provider | IAM → Identity providers |
| Create GitHub deploy role | IAM → Roles → Create role → Web identity |
| Edit OIDC trust policy | IAM → Roles → CloudMonitorGitHubDeployRole → Trust relationships → Edit trust policy |
| Edit inline policy | IAM → Roles → CloudMonitorGitHubDeployRole → Permissions → CloudMonitorSSMDeployPolicy |
| Verify managed node | Systems Manager → Fleet Manager → Managed nodes |
| Run host-side command | Systems Manager → Run Command → AWS-RunShellScript |
| Configure GitHub variables | GitHub repository → Settings → Environments → production → Environment variables |
| Restrict deploy branch | GitHub repository → Settings → Environments → production → Deployment branches and tags |
| Run deployment | GitHub repository → Actions → CloudMonitor CD — Deploy to AWS EC2 via SSM → Run workflow |

---

## 15. Related resources

- [CloudMonitor repository](https://github.com/ayushcmd/cloud_monitor)
- [CI workflow](../.github/workflows/ci.yml)
- [SSM CD workflow](../.github/workflows/cd.yml)
- [Production Compose](../docker-compose.prod.yml)
- [Issue #9 — completed SSH-to-SSM migration](https://github.com/ayushcmd/cloud_monitor/issues/9)
- [Issue #12 — broader production security hardening](https://github.com/ayushcmd/cloud_monitor/issues/12)
- [AWS Systems Manager documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/what-is-systems-manager.html)
- [AmazonSSMManagedInstanceCore policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html)
- [GitHub Actions OIDC in AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Systems Manager service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html)

---

## 16. Completion record

**Issue #9:** Closed as completed on 1 November 2026 after successful GitHub OIDC role assumption, SSM preflight, SSM production deployment, application health verification and PostgreSQL volume verification.

**Verified deployment date:** 1 November 2026  
**Verified deployed commit:** f536dad97518a761c12b83ff578ff3194e9ed04f

Review the live AWS Console, GitHub Environment, IAM trust policy and workflow file if they change. This guide documents the setup and observed state; it does not replace live configuration verification.
