# Contributing to CloudMonitor

Thanks for helping improve CloudMonitor. Read the [README](README.md),
[Code of Conduct](CODE_OF_CONDUCT.md), and [Security Policy](SECURITY.md) first.

## Propose a change

Use GitHub issues for reproducible bugs and focused feature proposals. Include
the affected component, expected and actual behavior, reproduction steps, and
sanitized logs. Discuss substantial architecture or deployment changes before
implementing them. Report vulnerabilities privately as described in SECURITY.md.

## Local development

1. Fork or clone the repository and create a branch for one change.
2. Follow the README setup instructions. Copy `.env.example` to `.env` and use
   local test credentials. Never commit real credentials, tokens, private keys,
   database files, or sensitive telemetry.
3. Install Python dependencies from `backend/requirements.txt` and
   `agent/requirements.txt` in a virtual environment.
4. Run `npm ci` in `frontend`, then `npm run dev` for the UI.
5. Use your local environment for testing; do not test failure simulations
   against the shared production deployment.

## Validate your change

Use the checks relevant to your change. CI is defined in
[ci.yml](.github/workflows/ci.yml).

For backend/agent changes, run from the repository root with `APP_ENV=test`,
`DATABASE_URL=sqlite:///./test.db`, a test-only JWT secret of at least 32
characters, and `PYTHONPATH=backend:.` (use `backend;.` on Windows):

```sh
pytest -v --tb=short tests/ agent/tests/
```

For frontend changes:

```sh
cd frontend
npm ci
npm run build
```

For Compose changes, use `docker compose -f docker-compose.yml config --quiet`
and `docker compose -f docker-compose.prod.yml config --quiet` with placeholder
environment values. Check UI changes in light/dark mode and at mobile widths.

## Pull requests

- Explain the problem, resulting behavior, and validation performed.
- Keep changes focused; add meaningful regression tests for behavior changes.
- Include screenshots for visible UI changes and update affected documentation.
- Call out migrations, deployment steps, and rollback considerations.
- Preserve unrelated work and wait for the required CI checks and review.

Maintainers may request revisions or defer changes outside the project's scope.
Submitting a pull request does not authorize a production deployment.

## Licensing and assets

Contributions are submitted under the [Apache License 2.0](LICENSE), unless
explicitly stated otherwise and agreed with maintainers. Submit only work you
have permission to contribute and retain third-party attribution notices.

The logo source is `docs/Icon.png`; its unchanged web copy is
`frontend/public/cloudmonitor-logo.png`. Keep both copies synchronized when
intentionally replacing the logo. Application branding uses `BrandLogo.jsx`.
