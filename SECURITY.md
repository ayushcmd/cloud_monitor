# Security Policy

## Supported versions

Security fixes target the current `main` branch. Older commits, forks, and
unmaintained deployments do not have a separate backport or support commitment.
CloudMonitor is an academic project; response times are best-effort.

## Report a vulnerability

Do not disclose exploit details, credentials, or personal data in public issues
or pull requests. Use GitHub's **Security → Report a vulnerability** option if
it is available for this repository. Otherwise, contact a maintainer privately
using a channel published on their GitHub profile. If no channel is available,
open an issue asking only for a private security contact, without vulnerability
details.

Include the affected commit/version, component, impact, minimal reproduction,
and sanitized evidence. Tell maintainers whether you know of active exploitation.
Coordinate public disclosure after a fix or mitigation is available. Reports
are handled on a best-effort basis; no bounty or response deadline is promised.

## Safe testing

Test against a local instance or infrastructure you are authorized to assess.
Do not access another user's data, disrupt the shared demo, run denial-of-service
tests, or use development failure-simulation endpoints against production.
Stop testing if you encounter sensitive data and report the minimum evidence
needed to describe the issue.

## Deployment precautions

- Use HTTPS for sign-in and agent enrollment. The hosted HTTPS endpoint is
  `https://cloudmonitorsite.duckdns.org`; see [HTTPS setup](docs/HTTPS_SETUP.md).
- Keep `.env`, SSH private keys, JWT secrets, database passwords, and agent
  tokens out of Git, screenshots, issue reports, and logs. Rotate exposed values.
- Keep production databases and internal monitoring services off public ports.
  Review access to any monitoring routes exposed through the reverse proxy.
- Use explicit CORS origins and keep development simulation features disabled
  in production.
- Update dependencies and container images, monitor resource pressure, and
  maintain tested database backups.
- Use least-privilege AWS roles and GitHub OIDC for deployment. Review changes
  to workflows, IAM permissions, and production configuration before applying.

Security reports and audits under `docs/security/` record findings at a point
in time; they do not guarantee that every deployment is secure.
