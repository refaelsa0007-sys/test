# LLM Gateway Server Hardening Toolkit

This project provides a set of automation scripts and a reference web service to
bootstrap a hardened Ubuntu server that terminates HTTPS traffic with an RSA
certificate and proxies requests to an LLM behind a regex-driven data loss
prevention (DLP) layer.

## Components

- **scripts/harden_server.sh** – applies security hardening, including kernel
  tuning, firewalling, Fail2Ban, and unattended upgrades.
- **scripts/setup_https.sh** – creates an RSA certificate with OpenSSL and
  configures Nginx for HTTPS offloading.
- **scripts/deploy_app.sh** – installs the FastAPI-based DLP gateway as a
  systemd service.
- **app/** – Python application exposing a `/v1/prompt` endpoint that checks
  prompts against common sensitive-data patterns before forwarding them to an
  upstream LLM.

## Prerequisites

- Ubuntu 22.04 LTS (or a compatible Debian-based distribution)
- Root privileges for running the setup scripts
- Outbound connectivity to reach your target LLM endpoint (optional)

## Usage

Clone the repository onto the server and run the scripts in order:

```bash
sudo ./scripts/harden_server.sh
sudo ./scripts/setup_https.sh example.com
sudo ./scripts/deploy_app.sh
```

Replace `example.com` with the hostname you intend to serve. The HTTPS script
creates the following files under `/etc/ssl/llm-gateway/`:

- `privkey.pem` – 4096-bit RSA private key
- `fullchain.pem` – self-signed certificate valid for one year
- `dhparam.pem` – Diffie-Hellman parameters for stronger forward secrecy

The deployment script installs the FastAPI application to `/opt/llm-gateway`
and registers a systemd service named `llm-gateway.service`. The service listens
on `127.0.0.1:8000`; the Nginx reverse proxy terminates TLS and forwards traffic
locally.

## Configuring the DLP Gateway

The application honours several environment variables that can be set in the
systemd unit file or exported before starting the server:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_API_ENDPOINT` | *(stubbed responses)* | HTTPS endpoint of the upstream LLM |
| `LLM_API_KEY` | *(unset)* | API key or bearer token for the LLM |
| `DLP_POLICY` | `block` | Default enforcement mode (`block` or `mask`) |
| `DLP_ALLOW_MASKING` | `true` | Whether clients may request masking via the API |
| `LOG_LEVEL` | `INFO` | Python logging level |

When `LLM_API_ENDPOINT` is not configured, the service returns a stub response
which is useful for functional testing of the DLP layer.

### API Example

Send a prompt with masking enabled to replace sensitive matches before the
request is forwarded:

```bash
curl -k https://example.com/v1/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Use card 4111 1111 1111 1111 today", "mask": true}'
```

The response includes the sanitized prompt as well as any DLP detections.

## Security Considerations

- Running `harden_server.sh` will disable password-based SSH authentication and
  require key-based login. Ensure that you have uploaded SSH keys before
  executing the script.
- Review the generated Nginx configuration and adjust the cipher suites to
  comply with your organisation's policies.
- Replace the self-signed certificate with one issued by a trusted authority for
  production use.

## Development and Testing

Create a virtual environment and install the Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r app/requirements.txt pytest
```

Run the automated tests:

```bash
pytest
```

You can start the API locally (without TLS) using uvicorn:

```bash
uvicorn app.app:app --reload --host 0.0.0.0 --port 8000
```

The DLP patterns are defined in `app/dlp.py`. Adjust or extend them to match
sensitive tokens relevant to your environment.
