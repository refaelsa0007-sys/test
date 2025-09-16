#!/usr/bin/env bash
set -euo pipefail

# Deploy the LLM gateway application with regex-based DLP onto the current host.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="llm-gateway"
APP_DIR="/opt/llm-gateway"
PY_BIN="python3"

log() {
  echo "[deploy] $*"
}

require_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo "This script must be run as root" >&2
    exit 1
  fi
}

create_user() {
  if id "${APP_USER}" >/dev/null 2>&1; then
    log "User ${APP_USER} already exists"
  else
    log "Creating dedicated system user ${APP_USER}"
    useradd --system --shell /usr/sbin/nologin --create-home --home-dir "${APP_DIR}" "${APP_USER}"
  fi
}

sync_application_code() {
  log "Syncing application code to ${APP_DIR}"
  mkdir -p "${APP_DIR}"
  rm -rf "${APP_DIR}/app"
  cp -r "${REPO_ROOT}/app" "${APP_DIR}/"
  install -o "${APP_USER}" -g "${APP_USER}" -m 0700 -d "${APP_DIR}/run"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
}

setup_virtualenv() {
  log "Creating Python virtual environment"
  "${PY_BIN}" -m venv "${APP_DIR}/venv"
  "${APP_DIR}/venv/bin/pip" install --upgrade pip >/dev/null
  "${APP_DIR}/venv/bin/pip" install -r "${APP_DIR}/app/requirements.txt" >/dev/null
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
}

configure_systemd() {
  log "Installing systemd service"
  install -m 0644 -o root -g root "${REPO_ROOT}/config/systemd/llm-gateway.service" /etc/systemd/system/llm-gateway.service
  systemctl daemon-reload
  systemctl enable --now llm-gateway.service
}

main() {
  require_root
  command -v "${PY_BIN}" >/dev/null || { echo "python3 is required" >&2; exit 1; }

  create_user
  sync_application_code
  setup_virtualenv
  configure_systemd

  log "Deployment finished"
}

main "$@"
