#!/usr/bin/env bash
set -euo pipefail

# Harden an Ubuntu host with sensible defaults for running the LLM gateway.
# This script must be executed as root and is designed to be idempotent.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  echo "[harden] $*"
}

require_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
}

enable_unattended_upgrades() {
  log "Enabling unattended security upgrades"
  apt-get install -y unattended-upgrades >/dev/null
  DEBIAN_FRONTEND=noninteractive dpkg-reconfigure --priority=low unattended-upgrades
}

configure_sysctl() {
  local sysctl_file="/etc/sysctl.d/99-llm-gateway.conf"
  log "Applying kernel hardening parameters in ${sysctl_file}"
  cat >"${sysctl_file}" <<'CFG'
# Harden network stack
net.ipv4.ip_forward = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
kernel.randomize_va_space = 2
CFG
  sysctl --system >/dev/null
}

configure_sshd() {
  local sshd_config="/etc/ssh/sshd_config"
  if [[ -f "${sshd_config}" ]]; then
    log "Hardening SSH daemon configuration"
    cp "${sshd_config}"{,.bak}
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "${sshd_config}"
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "${sshd_config}"
    sed -i 's/^#\?KexAlgorithms.*/KexAlgorithms curve25519-sha256@libssh.org/' "${sshd_config}" || true
    if ! grep -q '^AllowTcpForwarding no' "${sshd_config}"; then
      echo 'AllowTcpForwarding no' >> "${sshd_config}"
    fi
    systemctl restart sshd
  else
    log "sshd_config not found, skipping SSH hardening"
  fi
}

configure_ufw() {
  log "Configuring uncomplicated firewall"
  ufw --force reset >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
}

configure_fail2ban() {
  log "Configuring Fail2Ban"
  apt-get install -y fail2ban >/dev/null
  install -m 0644 -o root -g root "${REPO_ROOT}/config/fail2ban/jail.local" /etc/fail2ban/jail.local
  systemctl enable --now fail2ban
}

main() {
  require_root

  log "Updating package cache and upgrading base system"
  apt-get update >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get -y upgrade >/dev/null

  log "Installing base packages"
  apt-get install -y ufw curl gnupg python3 python3-venv ca-certificates nginx >/dev/null

  configure_sysctl
  configure_sshd
  configure_ufw
  configure_fail2ban
  enable_unattended_upgrades

  log "System hardening complete"
}

main "$@"
