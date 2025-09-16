#!/usr/bin/env bash
set -euo pipefail

# Generate an RSA certificate and configure Nginx for HTTPS termination.
# Usage: ./scripts/setup_https.sh example.com

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${1:-llm.local}"
CERT_DIR="/etc/ssl/llm-gateway"

log() {
  echo "[https] $*"
}

require_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
}

generate_certificates() {
  log "Generating RSA certificate for ${DOMAIN}"
  mkdir -p "${CERT_DIR}"
  chmod 700 "${CERT_DIR}"
  openssl req -x509 -nodes -sha256 \
    -newkey rsa:4096 \
    -days 365 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=${DOMAIN}/O=LLM Gateway/OU=Security" >/dev/null 2>&1
  chmod 600 "${CERT_DIR}/privkey.pem"
  chown root:root "${CERT_DIR}/privkey.pem" "${CERT_DIR}/fullchain.pem"

  if [[ ! -f "${CERT_DIR}/dhparam.pem" ]]; then
    log "Generating strong Diffie-Hellman parameters (this may take a while)"
    openssl dhparam -out "${CERT_DIR}/dhparam.pem" 4096 >/dev/null 2>&1
  fi
}

configure_nginx() {
  local nginx_conf="/etc/nginx/sites-available/llm-gateway.conf"
  log "Configuring Nginx reverse proxy"
  sed "s/{{SERVER_NAME}}/${DOMAIN}/g" "${REPO_ROOT}/config/nginx/llm_gateway.conf" > "${nginx_conf}"
  ln -sf "${nginx_conf}" /etc/nginx/sites-enabled/llm-gateway.conf
  nginx -t
  systemctl reload nginx
}

main() {
  require_root
  command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
  command -v nginx >/dev/null || { echo "nginx must be installed" >&2; exit 1; }

  generate_certificates
  configure_nginx

  log "HTTPS setup complete"
}

main "$@"
