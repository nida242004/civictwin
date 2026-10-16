# Deploying Praesidium to Google Cloud Run (free tier)

The image is a Next.js **standalone** build served by **Bun** (`Dockerfile`), listening on
`PORT=8080`, `HOSTNAME=0.0.0.0`. All API keys are read **at request time** from the runtime
environment, so the same image works with or without keys:

| Variable | Needed for | Without it |
|---|---|---|
| `GEMINI_API_KEYS` (comma-separated) or `GEMINI_API_KEY` | planner, satellite vision layout, local intel, narration | rule-based planner, OSM-only import, deterministic captions |
| `TYPESAFE_API_KEY` | live Jev behaviour tables / quick-pick scoring | pre-baked Jev tables + heuristics (demo is identical) |
| `GOOGLE_MAPS_API_KEY` (optional) | Google satellite capture | Esri World Imagery |
| `GEMINI_MODEL` (optional) | preferred model | built-in model chain |

No `NEXT_PUBLIC_*` variables are used, so nothing has to be passed at build time.
`.env*` is excluded by `.dockerignore` / `.gcloudignore`, so local keys never enter the image.

## 1. One-time setup

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 2. Deploy (build from source with Cloud Build)

Run from this folder (`civictwin/`):

```bash
gcloud run deploy praesidium \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 40 \
  --timeout 300 \
  --cpu-boost
```

### Option A — plain env vars (quickest)

```bash
gcloud run services update praesidium --region asia-south1 \
  --set-env-vars "^@^GEMINI_API_KEYS=key1,key2,key3@TYPESAFE_API_KEY=your_typesafe_key"
```

(`^@^` switches the list delimiter to `@` because the Gemini value itself contains commas.)

### Option B — Secret Manager (recommended)

```bash
printf '%s' 'key1,key2,key3'     | gcloud secrets create gemini-api-keys  --data-file=-
printf '%s' 'your_typesafe_key'  | gcloud secrets create typesafe-api-key --data-file=-

PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
for s in gemini-api-keys typesafe-api-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done

gcloud run services update praesidium --region asia-south1 \
  --set-secrets "GEMINI_API_KEYS=gemini-api-keys:latest,TYPESAFE_API_KEY=typesafe-api-key:latest"
```

Windows PowerShell: replace the trailing `\` with a backtick `` ` `` (or put each command on one line).

## 3. Verify

```bash
URL=$(gcloud run services describe praesidium --region asia-south1 --format='value(status.url)')
curl -s "$URL/api/health"
```

`/api/health` reports which providers are configured (`geminiConfigured`, `typesafeJevConfigured`,
active fallbacks) — never key values. Then open `$URL`, click **Launch live demo**, and run a simulation.

## 4. Updating

Re-run the `gcloud run deploy … --source .` command. Env vars / secrets persist across deploys.

## Local container test (optional)

```bash
docker build -t praesidium .
docker run --rm -p 8080:8080 -e GEMINI_API_KEYS=... -e TYPESAFE_API_KEY=... praesidium
# → http://localhost:8080
```

The `BUN_VERSION` build arg (default `1.3`) selects the `oven/bun` base image; match your local `bun --version` major.minor if the lockfile complains.

## Cost note

With `--min-instances 0` the service scales to zero when idle, so you pay nothing while nobody is using it.
Cloud Run's free tier (per billing account, per month) covers roughly 180,000 vCPU-seconds, 360,000 GiB-seconds and
2 million requests — at 1 vCPU / 1 GiB that is about **50 instance-hours of active traffic a month**, far more than a demo
or hackathon judging needs. `--max-instances 2` caps the worst case. Expect a cold start of a few seconds after idle
(`--cpu-boost` shortens it). Other small costs: Cloud Build minutes (a free monthly allowance covers occasional deploys; each build takes ~3–5 min) and Artifact Registry
storage for the image (0.5 GB free; the image is a few hundred MB — delete old revisions' images if you redeploy often).
Gemini and TypeSafe usage is billed by those providers separately; the server rate-limits AI routes per client IP to protect
the keys on a public URL. Check current prices at https://cloud.google.com/run/pricing before relying on these numbers.

## Notes

- Do **not** deploy a locally built `.next*/standalone` folder: Next copies `.env` into it. Always build in the container.
- Projects are stored in the visitor's browser (IndexedDB); the service is stateless, so scaling to zero loses nothing.
- In-memory rate limits and caches are per instance — fine for `--max-instances 2`.
