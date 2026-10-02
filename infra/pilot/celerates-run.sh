#!/bin/bash
# Recreate one Celerates pilot container on the VPS with its recorded run shape (docs/security/01, M0).
# Secrets come only from /etc/celerates/secrets (root:root 700/600), never from /tmp or Git.
#
#   infra/pilot/celerates-run.sh erp [image]                 # default celerates-erp:pilot
#   infra/pilot/celerates-run.sh intelligence-api [image]    # default celerates-intelligence-api:pilot
#   infra/pilot/celerates-run.sh integration-worker [image]
#
# The container is removed and started again: a short outage of that one service.
set -euo pipefail
SECRETS=/etc/celerates/secrets
NET=digital-bast-v2_backend
CMD=()
case "${1:-}" in
  erp)
    NAME=celerates-erp; IMAGE=${2:-celerates-erp:pilot}; ENV_FILE=$SECRETS/celerates-erp.env
    # Identity-document KEK keyring (uid 1000 = node, mode 400); IDENTITY_KEYRING_FILE points here.
    ARGS=(-p 127.0.0.1:3000:3000 -v "$SECRETS/identity-keyring:/run/secrets/identity-keyring:ro") ;;
  intelligence-api)
    NAME=celerates-intelligence-api; IMAGE=${2:-celerates-intelligence-api:pilot}; ENV_FILE=$SECRETS/intelligence-api.env
    ARGS=(-p 127.0.0.1:8000:8000); CMD=(uvicorn cdi.api:app --host 0.0.0.0 --port 8000) ;;
  integration-worker)
    NAME=celerates-integration-worker; IMAGE=${2:-celerates-intelligence-api:pilot}; ENV_FILE=$SECRETS/intelligence-api.env
    ARGS=(--entrypoint python); CMD=(-m cdi.worker) ;;
  *) echo "usage: $0 erp|intelligence-api|integration-worker [image]" >&2; exit 2 ;;
esac
# SMTP App Password for email codes (uid 1000, mode 400), mounted only once it exists; SMTP_PASSWORD_FILE points here.
if [ "$1" = erp ] && sudo test -f "$SECRETS/smtp-password"; then ARGS+=(-v "$SECRETS/smtp-password:/run/secrets/smtp-password:ro"); fi
docker image inspect "$IMAGE" >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true
# --env-file is read by the docker client, so it runs as root to open the root-only file.
sudo docker run -d --name "$NAME" --restart unless-stopped "${ARGS[@]}" --env-file "$ENV_FILE" "$IMAGE" "${CMD[@]}" >/dev/null
docker network connect "$NET" "$NAME"
echo "$NAME started from $IMAGE"
