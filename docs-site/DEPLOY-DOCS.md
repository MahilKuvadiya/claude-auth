# Deploying the docs site (gated to @devxlabs.ai)

Static Astro Starlight site, served by nginx on Cloud Run, gated to the **devxlabs.ai** Google
Workspace via **Identity-Aware Proxy (IAP)** behind an external HTTPS load balancer.

Why IAP (not a public GCS bucket): a public bucket can't enforce domain-gating. IAP does browser
Google-SSO at the edge and only admits `@devxlabs.ai` identities. IAP attaches to a **backend
service** (Cloud Run via a serverless NEG), which is why the site runs on Cloud Run, not a bucket.

```sh
P=yash-test-495112 ; R=asia-south1
```

## 1. Deploy the service (locked; only the LB may reach it)
CI does this on merge (`.github/workflows/deploy-docs.yml`), or manually:
```sh
cd docs-site
gcloud run deploy claudex-docs --source . --project $P --region $R \
  --no-allow-unauthenticated --ingress internal-and-cloud-load-balancing
```

## 2. Serverless NEG + backend service + IAP
```sh
gcloud compute network-endpoint-groups create claudex-docs-neg --region $R \
  --network-endpoint-type=serverless --cloud-run-service=claudex-docs --project $P
gcloud compute backend-services create claudex-docs-be --global --project $P
gcloud compute backend-services add-backend claudex-docs-be --global \
  --network-endpoint-group=claudex-docs-neg --network-endpoint-group-region=$R --project $P
# OAuth consent screen (Internal) must exist first (console: APIs & Services → OAuth consent).
gcloud iap web enable --resource-type=backend-services --service=claudex-docs-be --project $P
```

## 3. HTTPS load balancer + managed cert
```sh
gcloud compute url-maps create claudex-docs-lb --default-service claudex-docs-be --project $P
gcloud compute ssl-certificates create claudex-docs-cert --domains docs.devxlabs.ai --global --project $P
gcloud compute target-https-proxies create claudex-docs-proxy \
  --url-map claudex-docs-lb --ssl-certificates claudex-docs-cert --project $P
gcloud compute forwarding-rules create claudex-docs-fr --global \
  --target-https-proxy claudex-docs-proxy --ports 443 --project $P
# point docs.devxlabs.ai at the forwarding-rule IP; wait for cert = ACTIVE.
```

## 4. Grant access to the Workspace domain
```sh
gcloud iap web add-iam-policy-binding --resource-type=backend-services --service=claudex-docs-be \
  --member="domain:devxlabs.ai" --role="roles/iap.httpsResourceAccessor" --project $P
```

Result: `https://docs.devxlabs.ai` → Google sign-in → only `@devxlabs.ai` users admitted. Non-domain
Google accounts are denied by IAP. Cloud CDN can be toggled on the backend service for caching.

## Animations
Designed Lottie assets go in `public/anim/` (e.g. `hero.lottie`) and render via `<Lottie/>`; where
absent, the hand-built SVG explainers play. Author Lottie in After Effects/Bodymovin or LottieFiles.
