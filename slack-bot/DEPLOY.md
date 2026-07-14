# Deploying the claudex Slack bot

Cloud Run · project `yash-test-495112` · region `asia-south1` (matches `backend-api`).

## CI/CD (recommended)

`.github/workflows/deploy-slack-bot.yml` deploys per environment on push (PRs just run
the tests): **`uat` → `claudex-slack-bot-uat`** (points at the uat API) and
**`main` → `claudex-slack-bot`** (points at the prod API). `workflow_dispatch` lets you
trigger a deploy manually. It uses the same keyless Workload Identity Federation as
`deploy-api.yml`, and the Slack/bot secrets are pulled from **Secret Manager via
`--set-secrets`** — they never touch GitHub.

**One-time setup** (approval-gated GCP writes — run once):

```bash
PROJECT=yash-test-495112

# 1. Secrets (see §"secret values" below for what goes in each)
printf %s '<xoxb…>' | gcloud secrets create claudex-slack-bot-token --data-file=- --project="$PROJECT"
printf %s '<signing>' | gcloud secrets create claudex-slack-signing  --data-file=- --project="$PROJECT"
printf %s '<cbt_…>'  | gcloud secrets create claudex-bot-token       --data-file=- --project="$PROJECT"

# 2. Dedicated runtime SA + read access to the three secrets
gcloud iam service-accounts create claudex-slack-bot --project="$PROJECT"
SA="claudex-slack-bot@${PROJECT}.iam.gserviceaccount.com"
for S in claudex-slack-bot-token claudex-slack-signing claudex-bot-token; do
  gcloud secrets add-iam-policy-binding "$S" --project="$PROJECT" \
    --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor
done
# The API's runtime SAs also need to read the shared bot token:
for ENV in uat prod; do
  gcloud secrets add-iam-policy-binding claudex-bot-token --project="$PROJECT" \
    --member="serviceAccount:claudex-api-${ENV}@${PROJECT}.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done

# 3. Let the deployer SA act-as the bot runtime SA (same deployer as the API)
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --member="serviceAccount:claudex-deployer@${PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

# 4. (optional) override the API/dashboard URLs the bot points at
#    gh variable set SLACK_BOT_API_URL --body 'https://<api-url>'
#    gh variable set SLACK_BOT_DASHBOARD_URL --body 'https://docs.devxlabs.ai'
```

> ⚠️ **Ordering:** `deploy-api.yml` now also mounts `CLAUDEX_BOT_TOKEN=claudex-bot-token:latest`,
> so the `claudex-bot-token` secret (step 1) **must exist before you merge** — otherwise the
> next API deploy fails on a missing secret. Create the secrets first, then merge.

After setup, merging to `main` deploys the bot automatically. Then set the three Slack
request URLs (see §5). The manual `gcloud` flow below is the bootstrap / fallback.

---

## Manual deploy (bootstrap / fallback)

You need three secret values:
- `SLACK_BOT_TOKEN` — `xoxb-…` (Slack app → Install App → Bot User OAuth Token)
- `SLACK_SIGNING_SECRET` — Slack app → Basic Information → Signing Secret
- `CLAUDEX_BOT_TOKEN` — the shared bot↔backend secret (any random 30+ char string;
  the **same value** goes into `backend-api`)

## 1. Store the secrets in Secret Manager

```bash
PROJECT=yash-test-495112

# shared bot ↔ backend secret (create once)
printf %s 'cbt_xxxxxxxx' | gcloud secrets create claudex-bot-token       --data-file=- --project="$PROJECT"
# Slack app credentials
printf %s 'xoxb-xxxxxxxx' | gcloud secrets create claudex-slack-bot-token --data-file=- --project="$PROJECT"
printf %s 'f563xxxxxxxx' | gcloud secrets create claudex-slack-signing   --data-file=- --project="$PROJECT"
```
If a secret already exists, add a new version instead:
`gcloud secrets versions add <name> --data-file=- --project="$PROJECT"`.

## 2. Grant the runtime service account read access

```bash
SA="claudex-api@${PROJECT}.iam.gserviceaccount.com"   # reuse the API SA, or a dedicated bot SA
for S in claudex-bot-token claudex-slack-bot-token claudex-slack-signing; do
  gcloud secrets add-iam-policy-binding "$S" --project="$PROJECT" \
    --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor
done
```

## 3. Deploy the bot (run from `slack-bot/`)

```bash
gcloud run deploy claudex-slack-bot \
  --source . --region asia-south1 --project "$PROJECT" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --set-env-vars API_URL=https://claudex-api-632653045864.asia-south1.run.app,DASHBOARD_URL=https://docs.devxlabs.ai \
  --set-secrets SLACK_BOT_TOKEN=claudex-slack-bot-token:latest,SLACK_SIGNING_SECRET=claudex-slack-signing:latest,CLAUDEX_BOT_TOKEN=claudex-bot-token:latest
```
Note the printed **Service URL**. Verify: `curl https://<service-url>/health` → `{"ok":true}`.

## 4. Give backend-api the same shared secret

```bash
gcloud run services update claudex-api --region asia-south1 --project "$PROJECT" \
  --update-secrets CLAUDEX_BOT_TOKEN=claudex-bot-token:latest
```

## 5. Point Slack at the deployed bot

In the Slack app, set all three request URLs to `https://<service-url>/slack/events`:
- **Event Subscriptions** → Request URL (must show *Verified* — the bot must be live)
- **Interactivity & Shortcuts** → Request URL
- **Slash Commands** → `/claudex` → Request URL

Reinstall the app if Slack prompts. Open the bot's **Home** tab to see the dashboard.

## Notes
- The service is `--allow-unauthenticated` because Slack must reach it; every request
  is verified by the signing secret, and every `/v1` call is app-auth-gated.
- Hardening (Cloud Armor / an external LB) is a follow-up, same as `backend-api`.
