# Deployment status

## Supported targets

- **Amazon Lightsail VM:** the multi-stage Dockerfile builds Next.js standalone output, runs as UID 1001, persists sessions in `/app/storage`, and exposes an HTTP healthcheck. `docker-compose.yml` binds the app to host loopback and optionally adds Caddy HTTPS through the `https` profile.
- **OpenAI Sites / Cloudflare Workers:** the Vinext build produces a Worker bundle, and the `DB` binding persists sessions through D1. `drizzle/0000_many_zzzax.sql` is the canonical schema migration.

## Verified locally

The September 10 baseline passed both production build commands and local HTTP/browser checks; that historical record is in [QA](QA.md). The September 22 gateway integration passed Next.js production compilation and a real-model browser rehearsal, documented in [Gateway validation](GATEWAY_VALIDATION_2026-09-22.md). A successful build is distinct from public hosting.

The team organiser gateway credential was supplied privately and exercised successfully. This is an Ollama-compatible gateway backed by the organiser's model service, not direct AWS console access. No Lightsail instance, public URL or completed AWS deployment is claimed. Docker execution was not available on the authoring Mac and still requires verification on a Docker-enabled host.

Compose explicitly sets `SESSION_DIR=/app/storage` so a blank `SESSION_DIR` in the example `.env` cannot override durable volume storage. Keep runtime secrets in the server's `.env`; do not bake them into the image. The optional Caddy profile supplies HTTPS but not authentication or rate limiting.

For Lightsail setup, follow the Docker and Amazon Lightsail sections in the [README](../README.md). Runtime secrets belong in `.env` or the deployment secret manager and must never be baked into the image.
