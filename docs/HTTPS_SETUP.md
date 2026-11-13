# Production HTTPS

Public URL: https://cloudmonitorsite.duckdns.org

Set the DuckDNS A record to the EC2 public IPv4 address (currently 3.25.150.231).
Do not use DuckDNS's automatic browser IP detection: that selects your PC's IP.

In the server's untracked `.env`, set `DOMAIN_NAME=cloudmonitorsite.duckdns.org`
and `COMPOSE_PROFILES=tls`. Add `https://cloudmonitorsite.duckdns.org` to
`CORS_ORIGINS`, preserving any other required origins. Never overwrite existing
database credentials or JWT secrets with the example file.

Caddy publishes TCP 443 and obtains/renews a Let's Encrypt certificate using
TLS-ALPN-01. Keep port 443 reachable and the `caddy_data` volume persistent.
Nginx owns port 80 and redirects the DuckDNS hostname to HTTPS. Loopback and
legacy IP requests remain available for existing deployment/agent compatibility.
Use the HTTPS hostname for browser sign-in and new agent configurations.

All HTTPS routes pass through Nginx, preserving login rate limiting and the
blocked Prometheus lifecycle endpoints. HSTS initially uses a one-day lifetime.
The existing CD workflow reads `COMPOSE_PROFILES` from `.env`, so later deploys
keep Caddy enabled. No paid load balancer or DNS service is required.

Validation:

```sh
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
curl -I http://cloudmonitorsite.duckdns.org/  # 308 to HTTPS
curl -fsS https://cloudmonitorsite.duckdns.org/health
curl -fsS https://cloudmonitorsite.duckdns.org/api/health
curl -fsS https://cloudmonitorsite.duckdns.org/prom/api/v1/targets
```

If EC2 is stopped and started, its non-Elastic public IP may change: update
DuckDNS before expecting certificate renewal or traffic to work. A reboot does
not change the IP. Changing the public hostname also requires updating the
hostname-specific redirect in `frontend/nginx.conf`.

For rollback, remove `COMPOSE_PROFILES=tls` from `.env`, revert the HTTPS commit,
and redeploy. Do not delete any Docker volumes.
