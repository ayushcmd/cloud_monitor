#!/usr/bin/env bash
# ==============================================================================
# CloudMonitor — EC2 Automated Bootstrap & Provisioning Script (User-Data)
# Compatible with Ubuntu 22.04 LTS / 24.04 LTS (x86_64 and arm64 / Graviton)
# ==============================================================================
set -euo pipefail

echo "=== [1/6] Updating system packages ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    git \
    awscli \
    jq \
    ufw

echo "=== [2/6] Installing official Docker CE & Compose Plugin ==="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"

echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu

echo "=== [3/6] Hardening Host Firewall (UFW) ==="
# Allow SSH, HTTP, HTTPS only
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
# Never allow unauthenticated Docker daemon (2375) or direct Postgres (5432)
ufw --force enable

echo "=== [4/6] Setting up CloudMonitor Application Directory ==="
APP_DIR="/opt/cloudmonitor"
mkdir -p "${APP_DIR}"
chown -R ubuntu:ubuntu "${APP_DIR}"

cd "${APP_DIR}"
# If cloning via Git:
# git clone https://github.com/YOUR_ORG/cloud_monitor.git .

echo "=== [5/6] Generating Secure Production Environment ==="
if [ ! -f "${APP_DIR}/.env" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')

    cat <<EOF > "${APP_DIR}/.env"
APP_NAME=CloudMonitor-API
APP_ENV=production
DOMAIN_NAME=localhost
CORS_ORIGINS=http://localhost,https://localhost
POSTGRES_USER=cloudmonitor
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=cloudmonitor
DATABASE_URL=postgresql://cloudmonitor:${DB_PASS}@postgres:5432/cloudmonitor
JWT_SECRET_KEY=${JWT_SECRET}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
EOF
    chmod 600 "${APP_DIR}/.env"
    chown ubuntu:ubuntu "${APP_DIR}/.env"
fi

echo "=== [6/6] Bootstrap complete. Ready for docker compose -f docker-compose.prod.yml up -d ==="
