# Issue #9 — Migrate EC2 deployment from SSH to AWS Systems Manager

**Status:** SSM workflow prepared on a feature branch. The existing EC2 instance role is attached, SSM reports the instance Online, the GitHub OIDC provider and deployment role exist, and the repository production environment has the three AWS variables plus a main-only deployment rule. GitHub OIDC role assumption and Run Command execution still require workflow verification.

## Why the SSH deployment is failing

The current CD run fails at the SSH connectivity step with a TCP port 22 connection timeout. This is a network reachability failure before the deployment command starts; it is not evidence of a bad SSH key.

The replacement workflow uses GitHub Actions OIDC to assume a narrowly scoped AWS role and Systems Manager Run Command to contact one EC2 instance. The workflow wraps each remote script with `bash -lc` so Bash-specific constructs are not accidentally interpreted by the default POSIX shell. The EC2 SSM Agent initiates outbound HTTPS connections. GitHub-hosted runners do not need inbound SSH access to the instance. AWS documents outbound HTTPS on port 443 to regional SSM endpoints; no inbound SSM port is required: https://docs.aws.amazon.com/systems-manager/latest/userguide/troubleshooting-ssm-agent.html

## Important rollout guard

The updated `.github/workflows/cd.yml` is intentionally **workflow_dispatch-only** during migration. It does not deploy on a push or PR merge. This prevents merging the workflow from unexpectedly initiating production deployment before AWS prerequisites are in place.

Available operations:

1. `oidc-check` — requests a GitHub OIDC token, prints only issuer/audience/subject claims (never the token), assumes the configured AWS role with STS, and verifies the AWS account/caller identity. It does not send an SSM command or change EC2.
2. `ssm-preflight` — authenticates to AWS, verifies the configured EC2 instance is Online in SSM, and sends a read-only preflight command.
3. `deploy` — requires `confirm_production=true`; deploys `origin/main` through SSM and runs local frontend/backend/Prometheus health checks on EC2.
4. `rollback` — requires `confirm_production=true`; restores the previous Git revision recorded on EC2.

After one successful controlled SSM deployment and operational review, a follow-up change can re-enable push-to-main for automatic CD. Do not add the push trigger before SSM is verified.

## AWS setup checklist

### 1. Confirm the existing EC2 SSM registration

The CloudMonitor EC2 instance already has CloudMonitorEC2SSMRole with AmazonSSMManagedInstanceCore, and Fleet Manager reports the instance as Online. The GitHub role policy is restricted to the exact EC2 instance ARN, so an EC2 tag is not required for this implementation. The workflow polls for up to 30 minutes and sets a 35-minute GitHub job timeout to allow image build and health-check time.

### 2. EC2 instance profile — completed

The existing CloudMonitor EC2 instance has CloudMonitorEC2SSMRole attached with the AWS-managed AmazonSSMManagedInstanceCore policy. SSM Agent diagnostics passed, and the instance is listed as Online in Fleet Manager. No further EC2 role change is needed.

### 3. SSM Agent and network connectivity — completed

The Ubuntu 24.04 host has SSM Agent 3.3.4793.0 running and enabled. ssm-cli get-diagnostics --output table reported success for IMDS, SSM, EC2 Messages, SSM Messages, S3, KMS, Logs, Monitoring, AWS role credentials, and agent service checks. Fleet Manager subsequently showed the CloudMonitor instance as Online. No inbound SSH change is required for GitHub-hosted runners to use SSM. Keep administrator SSH access as a break-glass path until the new deployment route is fully tested.

### 4. GitHub OIDC identity provider — already exists

The AWS account already has the OpenID Connect provider token.actions.githubusercontent.com with audience sts.amazonaws.com. Reuse it; do not create a duplicate or delete the existing provider.

### 5. GitHub deployment role trust policy — already created

The role CloudMonitorGitHubDeployRole exists and trusts the GitHub OIDC provider for the immutable CloudMonitor repository identity and GitHub Environment production. The expected subject is repo:ayushcmd@252997256/cloud_monitor@1419373799:environment:production. The workflow's oidc-check now verifies the emitted subject and performs an actual AWS STS role assumption. If the STS step fails, compare the emitted subject with the role trust policy before changing either.

Depending on the repository's OIDC subject-claim setting, the subject may use one of these forms:

- Legacy: `repo:ayushcmd/cloud_monitor:environment:production`
- Immutable: `repo:ayushcmd@252997256/cloud_monitor@1419373799:environment:production`

The environment's deployment branch rule allows main only. Do not allow repository-wide or branch-wide wildcards in the IAM trust policy.

Example trust policy (replace the account ID and subject with the actual values):

```json
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
```

### 6. Attach the deployment role permissions

The GitHub role is limited to AWS-RunShellScript on the exact CloudMonitor EC2 instance, plus the read operations needed to verify the command. The policy attached in AWS uses the actual account and instance identifiers.

```json
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
      "Sid": "SendOnlyAwsRunShellScriptDocument",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": "arn:aws:ssm:ap-southeast-2::document/AWS-RunShellScript"
    },
    {
      "Sid": "SendOnlyToCloudMonitorInstance",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": "arn:aws:ec2:ap-southeast-2:<AWS_ACCOUNT_ID>:instance/<EC2_INSTANCE_ID>"
    },
    {
      "Sid": "ReadCommandInvocationResult",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
```

The read actions above use `Resource: "*"`; verify resource-level support and condition keys against the current Systems Manager service authorization reference: https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html

### 7. Add GitHub Environment variables

In GitHub → Settings → Environments → `production` → Environment variables, configure:

| Variable | Value |
|---|---|
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `AWS_DEPLOY_ROLE_ARN` | ARN of the GitHub OIDC deployment role |
| `EC2_INSTANCE_ID` | Existing CloudMonitor EC2 instance ID |

The region is set in the workflow to `ap-southeast-2`. Consider adding required reviewers to the `production` GitHub Environment so deploy and rollback operations receive an approval gate.

## Runbook after this PR is merged

1. Open Actions → **CloudMonitor CD — Deploy to AWS EC2 via SSM** → Run workflow.
2. Select `oidc-check`. Confirm the emitted OIDC subject matches the IAM trust policy and that STS returns the expected AWS account and assumed role.
3. Run `ssm-preflight`. It must confirm the EC2 managed node is Online and complete the harmless read-only command.
5. Run `deploy` with `confirm_production=true` and complete any GitHub Environment approval. Verify the public application from outside EC2 and verify PostgreSQL data/persistence using a known non-sensitive application-level check. The workflow's health probes run against localhost on EC2.
6. Use `rollback` with explicit confirmation if rollback is required.
7. Only after the first successful SSM deployment and rollback procedure are reviewed should a follow-up PR restore automatic deployment on pushes to `main`.

## Data and access safety

- No SSH key or known-host secret is used by the SSM workflow.
- The workflow does not require inbound SSH from GitHub-hosted runners.
- It checks that `/home/ubuntu/cloud_monitor/.env` exists and is not Git-tracked; it never prints the file contents.
- It uses `docker compose config --quiet`, `build`, and `up -d --remove-orphans`.
- It does **not** use `docker compose down -v`, delete volumes, or recreate PostgreSQL storage.
- The deploy operation records the previous Git revision under `/var/lib/cloudmonitor/` and attempts a source/build rollback if deployment or local health checks fail. This is a **code/config rollback only**: it does not restore PostgreSQL data or reverse database schema migrations. Keep schema changes backward-compatible across rollback, and take/verify a separate database backup before any release that changes schema or data.
- Keep SSH access available for trusted administration until SSM is Online, the read-only preflight succeeds, and the required break-glass access method has been tested.
- No AWS resources are changed by merging this workflow/documentation PR. Actual AWS configuration and production deployment remain separate, deliberate steps.

## Current acceptance status

| Acceptance criterion | Status |
|---|---|
| EC2 registered and Online in SSM | Complete — Fleet Manager reports Online |
| GitHub OIDC provider, role, and trust policy | Configured — live STS assumption pending `oidc-check` |
| GitHub invokes the approved SSM command | Pending `ssm-preflight` |
| Runner no longer requires inbound SSH | Implemented in the prepared workflow; pending live preflight |
| Production deployment and health checks succeed | Pending controlled deployment |
| PostgreSQL persistent storage is preserved | Workflow avoids volume removal/recreation; live verification pending |
| Least-privilege IAM and rollback procedure | Policy and runbook prepared; AWS review/verification pending |
