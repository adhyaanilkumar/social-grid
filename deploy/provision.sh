#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (deploy-plan.md D5). Run as root, once:
#   sudo bash provision.sh
# Safe to run again: each step checks what's already done.
#
# What it does, and why:
# - Docker and Compose from Ubuntu's own packages, to run compose.prod.yml.
# - A "deploy" user that releases run as, with the same SSH keys as the default "ubuntu" user. Being in the docker
#   group makes it root-equivalent on this machine, which is acceptable for a single-app server.
# - SSH: keys only (no passwords) and no root login, so password-guessing bots get nowhere.
# - ufw firewall: only 22 (SSH), 80 and 443 (Caddy). Note that ports Docker publishes skip ufw; that's why only
#   Caddy publishes any. Also open just these three in Lightsail's own firewall (Networking tab).
# - Automatic security updates.
# - 2 GB of swap: disk used as overflow memory, so a spike slows the machine down instead of killing a container.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash provision.sh" >&2
  exit 1
fi

echo "== Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq docker.io docker-compose-v2 ufw unattended-upgrades curl
systemctl enable --now docker

echo "== deploy user"
if ! id deploy > /dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [ -f /home/ubuntu/.ssh/authorized_keys ]; then
  install -m 600 -o deploy -g deploy /home/ubuntu/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi
install -d -m 750 -o deploy -g deploy /opt/social-grid

echo "== SSH: keys only, no root"
cat > /etc/ssh/sshd_config.d/99-social-grid.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh

echo "== Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Swap"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Use swap only when memory is really short.
echo 'vm.swappiness=10' > /etc/sysctl.d/99-social-grid.conf
sysctl -q --system

echo "Done. Next: copy compose.prod.yml, Caddyfile, release.sh, rollback.sh and .env to /opt/social-grid as deploy."
