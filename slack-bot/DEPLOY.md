# Deploying the claudex Slack bot

Cloud Run · project `yash-test-495112` · region `asia-south1` (matches `backend-api`).

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
