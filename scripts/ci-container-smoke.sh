#!/usr/bin/env bash
set -euo pipefail

# Disposable CI resources only; never use a production volume or server.
probe_dir=$(mktemp -d)
probe_prefix="propmatch-ci-${GITHUB_RUN_ID:-local}-$$"
probe_app="$probe_prefix-app"
probe_proxy="$probe_prefix-proxy"
probe_volume="$probe_prefix-sessions"
cleanup() {
  docker rm -f "$probe_proxy" "$probe_app" >/dev/null 2>&1 || true
  docker network rm "$probe_prefix" >/dev/null 2>&1 || true
  docker volume rm "$probe_volume" >/dev/null 2>&1 || true
  rm -rf -- "$probe_dir"
}
trap cleanup EXIT

export APP_COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
export DEPLOY_EXPECTED_COMMIT="$APP_COMMIT_SHA"
export DEPLOY_CHECK_URL=https://localhost:3443
export DEPLOY_CHECK_USER=judge
export DEPLOY_CHECK_PASSWORD
DEPLOY_CHECK_PASSWORD=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))')
export DEMO_AUTH_USER="$DEPLOY_CHECK_USER"
export DEMO_AUTH_HASH
DEMO_AUTH_HASH=$(printf '%s\n' "$DEPLOY_CHECK_PASSWORD" | docker run --rm -i caddy:2-alpine caddy hash-password)
export DEPLOY_PROBE_STATE="$probe_dir/session.json"
export NODE_EXTRA_CA_CERTS="$probe_dir/ca.crt"

# An empty hash must fail closed, even if an operator forgets configuration.
if docker run --rm -e DOMAIN=localhost -e DEMO_AUTH_USER=judge -e DEMO_AUTH_HASH= \
  -v "$PWD/deployment/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile >"$probe_dir/invalid-config.log" 2>&1; then
  echo 'FAIL: HTTPS proxy accepted missing access credentials.' >&2
  exit 1
fi

docker network create "$probe_prefix" >/dev/null
docker volume create "$probe_volume" >/dev/null
docker run -d --name "$probe_app" --network "$probe_prefix" --network-alias app \
  -e LLM_MODE=demo -e DATA_MODE=synthetic -e APP_COMMIT_SHA \
  -v "$probe_volume:/app/storage" propmatch-agent:ci >/dev/null
docker run -d --name "$probe_proxy" --network "$probe_prefix" \
  -p 127.0.0.1:3443:3443 -e DOMAIN=localhost:3443 -e DEMO_AUTH_USER -e DEMO_AUTH_HASH \
  -v "$PWD/deployment/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine >/dev/null

for attempt in $(seq 1 60); do
  if docker cp "$probe_proxy:/data/caddy/pki/authorities/local/root.crt" "$probe_dir/ca.crt" >/dev/null 2>&1 &&
    [ "$(curl --silent --cacert "$probe_dir/ca.crt" --output /dev/null --write-out '%{http_code}' https://localhost:3443/api/status || true)" = 401 ] &&
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$probe_app")" = healthy ]; then
    break
  fi
  sleep 1
done

# Trust only this disposable test CA for this Node process; no OS trust changes.
npm run verify:deployment -- --exercise
docker restart "$probe_app" >/dev/null
for attempt in $(seq 1 60); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' "$probe_app")" = healthy ]; then break; fi
  sleep 1
done
npm run verify:deployment -- --resume
