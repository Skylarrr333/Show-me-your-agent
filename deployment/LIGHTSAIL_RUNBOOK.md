# Lightsail deployment and verification

This is the deployment procedure, not evidence that a cloud instance already exists. Actual resource details and results belong in `docs/DEPLOYMENT.md` only after verification.

## 1. Obtain the team AWS account

Use the organiser-provided AWS Account Login Guide. Its portal is <https://d2b23xu0lcyxcz.cloudfront.net/> and the username is the team code. The account holder completes email verification, MFA and password setup. Passwords and MFA codes do not belong in this repository or deployment logs.

If no active account lease exists, request the **Hackathon Lease**, review its terms and submit for NUS-ISS approval. Only an approved lease permits **Login to account**. Select the assigned role shown by that account's access portal. The guide's sample account identifiers are not this team's account. The model gateway API key cannot log into AWS.

## 2. Provision within the competition allocation

- Inspect existing instances first to avoid duplicate charges.
- Use an allowed Lightsail Linux/Ubuntu VM in the organiser-approved region. Check the displayed plan price and remaining shared hosting/inference allocation before creating it.
- Attach a static public IP, keep SSH restricted to the operator, and expose only ports 80/443 for the web application. Port 3000 remains loopback-only.
- Install Docker Engine and Compose from the [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
- Use a hostname that resolves to the static IP. If no team domain is available, an IP-derived demo hostname is an option, but its DNS provider is an additional dependency.
- Avoid unattended optional services, snapshots or larger plans that were not needed for the demo. Stopping a VM is not a promise that all resource charges stop.

AWS references: [instance creation](https://docs.aws.amazon.com/lightsail/latest/userguide/getting-started-with-amazon-lightsail.html), [plans](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html), [SSH](https://docs.aws.amazon.com/en_en/lightsail/latest/userguide/amazon-lightsail-ssh-using-terminal.html).

## 3. Transfer an exact source release

Deploy a clean commit from `main`. A Git archive includes tracked source without `.env.local`, sessions, local diagnostics, dependencies or build output:

```bash
git status --short
git rev-parse HEAD
git archive --format=tar.gz --output=/private/tmp/propmatch-source.tar.gz HEAD
```

Transfer this archive over verified SSH/SCP to the team instance. Do not put a personal GitHub token on the VM to clone a private repository. Verify the SSH host key through the authenticated AWS console before trusting the connection. Extract into a release-specific directory, for example `/opt/propmatch/releases/FULL_COMMIT_SHA`.

Keep runtime `.env` in a private shared directory such as `/opt/propmatch/shared/app.env` (permissions 600). Link it as `.env` in the release directory. It must contain only the needed model configuration, `DATA_MODE=synthetic`, `DOMAIN`, the access gate settings below, and `APP_COMMIT_SHA` set to the exact 40-character source commit. Keep optional provider keys out of a deployment that does not use them. To enable OneMap, preserve server-only `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` in this protected runtime file across releases. See `docs/ONEMAP_SETUP_ZH.md`. The public GreyLite tiles and external Google Maps links need no key.

## 4. Protect the paid demo

The supplied HTTPS profile requires a shared judge-access username and bcrypt password hash. Generate a strong distinct access password privately and run:

```bash
docker run --rm -it caddy:2-alpine caddy hash-password
```

Put `DEMO_AUTH_USER=judge` and the resulting `DEMO_AUTH_HASH` in `.env`. **Single-quote the hash** so Docker Compose preserves literal dollar signs. The plaintext password is shared privately with the team/judges, never written in README or source. A missing hash causes proxy configuration to fail rather than opening the app without protection.

Basic authentication is used only over HTTPS. Caddy obtains and renews a public certificate for a correctly configured public hostname. No self-signed certificate bypass is a valid public deployment result. Shared access is a demo gate, not individual agency accounts or full rate limiting. See [Caddy authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth) and [automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## 5. Start and inspect

From the release directory on the VM:

```bash
sudo docker compose -p propmatch --profile https config --quiet
sudo docker compose -p propmatch --profile https up -d --build
sudo docker compose -p propmatch --profile https ps
```

Keep the same Compose project name (`propmatch`) on each release so the `sessions`, `caddy_data` and `caddy_config` volumes are reused. The app runs as UID 1001, stores sessions in `/app/storage`, and logs are size-rotated. Do not run `down -v` during an update. Use sanitized logs to diagnose startup; do not paste environment dumps or `docker inspect` output containing credentials.

## 6. Verify from outside the VM

The repository's verifier requires the public HTTPS origin, private judge access credentials and the expected source commit. Put these in an ignored local environment file, for example `.propmatch-data/deployment-check.env`:

```dotenv
DEPLOY_CHECK_URL=https://YOUR_DEPLOYED_HOST
DEPLOY_CHECK_USER=judge
DEPLOY_CHECK_PASSWORD=YOUR_PRIVATE_ACCESS_PASSWORD
DEPLOY_EXPECTED_COMMIT=THE_FULL_40_CHARACTER_GIT_COMMIT
```

Then run locally:

```bash
node --env-file=.propmatch-data/deployment-check.env --import tsx scripts/verify-deployment.ts
```

This checks unauthenticated and incorrect-password rejection, authenticated page/status access, exact release identity, HTTPS cookie flags, session creation and reload. It does not call a model. It saves a private session probe under ignored `.propmatch-data/` and prints only sanitized checks.

For an explicitly authorized real-model demonstration (normal API usage applies):

```bash
node --env-file=.propmatch-data/deployment-check.env --import tsx scripts/verify-deployment.ts --live
```

It tests the actual gateway run, constraints, human approval and session-local withdrawal/reprice scenarios. These changes affect only the new verification session. `--exercise` is the equivalent no-cost deterministic workflow and refuses a paid provider unless `--live` is supplied.

Restart only the app container in an agreed demonstration window:

```bash
sudo docker compose -p propmatch restart app
```

After it is healthy, run the local verifier with `--resume` to check that the recorded session survived. This reuses the private probe; it does not perform another model call. Set `DEPLOY_REPORT_FILE` to save a sanitized report separately from the private cookie file.

## 7. Record evidence and synchronize GitHub

Record the URL, region/instance plan, source commit, verification time, access method, TLS result, workflow result and persistence result in the deployment record. Do not include account credentials, cookies, SSH keys or plaintext judge passwords. Capture a browser demonstration with the correct model badge and the synthetic-data disclosure.

Commit the final deployment code/docs to `main`, deploy that commit, and verify `/api/status` reports the same `release.commit` as GitHub. A build-only CI success is separate from this real AWS deployment proof. Preserve the previous release and volume for rollback; do not delete live sessions during rollback.

CI runs a disposable Docker/Caddy HTTPS test with a process-local test CA, no OS trust-store changes, no real model key, and no changes to any deployed instance. It checks the same access gate, workflow and restart persistence before release.

## 26 September homepage / HDB release

The main app now uses the Kaggle-backed HDB agent, not the legacy synthetic workspace. Build the image from the full Git archive including `data/hdb/kaggle-v1.zip`. The Docker `hdb-data` stage verifies the source hash and imports all 228,225 records; the runner includes `/app/data/hdb-resales.sqlite` and sets `HDB_RESALE_DB`. Do not override it with a developer's local path. Session volumes and credentials are unchanged.

The health probe is `/api/homes`. Also verify `/api/status` → `homes.ready=true`, `homes.count=228225`, and the expected release SHA. Run `scripts/verify-deployment.ts --homes` with the existing private verification environment to exercise SQL search, rejection, approval, withdrawal and session persistence without any paid LLM call. `--resume` checks the same session after an operator restart. The normal CI `--exercise` covers both legacy and current homepage workflows.

Outbound HTTPS is needed for organiser model calls and official OneMap authentication, address search, routes and facilities. The browser loads GreyLite tiles directly from OneMap. Public API requests are cached and rate-limited in one process. No new AWS resources, permissions, ports or paid mapping subscription are needed. Verify at least one real address, route and nearby lookup after deployment; missing credentials must remain a visible error. See `docs/ONEMAP_SETUP_ZH.md` for credential renewal and coverage limits.

Rollback: start the prior release's Compose build with the same project name and durable session volume, then restore `/opt/propmatch/current`. New optional home-search session fields do not affect old sessions. Rollback does not delete the current data archive or session volume.
