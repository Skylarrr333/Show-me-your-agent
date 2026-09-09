# Deployment status

## Supported targets

- **Amazon Lightsail VM:** the multi-stage Dockerfile builds Next.js standalone output, runs as UID 1001, persists sessions in `/app/storage`, and exposes an HTTP healthcheck. `docker-compose.yml` binds the app to host loopback and optionally adds Caddy HTTPS through the `https` profile.
- **OpenAI Sites / Cloudflare Workers:** the Vinext build produces a Worker bundle, and the `DB` binding persists sessions through D1. `drizzle/0000_many_zzzax.sql` is the canonical schema migration.

## Verified locally

Both production build commands passed after a clean lockfile install. The Next standalone server, a compiled static asset and the session API returned HTTP 200, and the Sites / Vite development target also returned HTTP 200. Any published private Sites URL belongs in release records rather than source documentation.

No Amazon Lightsail instance or live Bedrock credentials were supplied, so this repository does not claim that those external services have been exercised.

For Lightsail setup, follow the Docker and Amazon Lightsail sections in the [README](../README.md). Runtime secrets belong in `.env` or the deployment secret manager and must never be baked into the image.
