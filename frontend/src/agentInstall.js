export function agentInstallCommand(shell, local, id, serverUrl = '', agentKey = '') {
  const name = `cloudmonitor-agent-${id}`;
  const targetServer = local ? 'http://backend:8000' : (serverUrl || 'https://your-cloudmonitor-server.com');
  const targetKey = agentKey || 'YOUR_GENERATED_AGENT_KEY';

  if (shell === 'compose') {
    return `# Save as compose.agent.yml in the repository root, then run:
# docker compose -f compose.agent.yml up -d --build
services:
  agent:
    build: ./agent
    image: cloudmonitor-agent:latest
    container_name: ${name}
    restart: unless-stopped
    env_file: ./cloudmonitor-agent.env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
${local ? '    networks: [cloudmonitor]\nnetworks:\n  cloudmonitor:\n    external: true\n    name: cloudmonitor-network' : ''}`;
  }

  const runCmd = `docker run -d --name ${name} --restart unless-stopped ${local ? '--network cloudmonitor-network ' : ''}--mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly --env-file ./cloudmonitor-agent.env cloudmonitor-agent:latest`;

  if (shell === 'powershell') {
    return `# Secure 1-Click Installer for PowerShell (Windows)
# Creates credentials file outside source control, verifies Docker, and starts agent
@"
CLOUDMONITOR_SERVER=${targetServer}
CLOUDMONITOR_AGENT_KEY=${targetKey}
"@ | Out-File -Encoding utf8 ./cloudmonitor-agent.env

docker info
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop / Docker Engine (Linux containers) first' }
docker build -t cloudmonitor-agent:latest ./agent
if ($LASTEXITCODE -ne 0) { throw 'Agent build failed; check network and repository path' }
${runCmd}`;
  }

  if (shell === 'cmd') {
    return `:: 1-Click Installer for Windows Command Prompt (CMD)
(
echo CLOUDMONITOR_SERVER=${targetServer}
echo CLOUDMONITOR_AGENT_KEY=${targetKey}
) > cloudmonitor-agent.env
docker info && docker build -t cloudmonitor-agent:latest ./agent && ${runCmd}`;
  }

  // Linux / macOS (Bash)
  return `# Secure 1-Click Installer for Linux & macOS
cat << 'EOF' > ./cloudmonitor-agent.env
CLOUDMONITOR_SERVER=${targetServer}
CLOUDMONITOR_AGENT_KEY=${targetKey}
EOF
chmod 600 ./cloudmonitor-agent.env

docker info && docker build -t cloudmonitor-agent:latest ./agent && ${runCmd}`;
}
