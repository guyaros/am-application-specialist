# AM Specialist Proxy

A minimal backend that holds a single Anthropic API key server-side and
forwards Messages API requests for the AM Application Specialist tool.
It replaces the previous browser-side key, and adds access control,
a budget cap, and correct per-model cost accounting.

## Endpoints

- `POST /v1/messages` — forwards `{model, messages, max_tokens, system}` to
  Anthropic. Requires header `x-access-token`. Returns Anthropic's raw JSON.
- `GET /health` — usage snapshot (runs, tokens, spend, remaining budget).

## Deploy to Render

1. Push these files to a Git repo (a subfolder is fine).
2. Render → **New** → **Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Python 3
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (see `.env.example`):
   - `ANTHROPIC_API_KEY`
   - `PROXY_ACCESS_TOKEN`  (generate: `openssl rand -hex 24`)
   - `PROXY_BUDGET_USD`     (e.g. `50`)
   - `PROXY_ALLOWED_ORIGINS` (the frontend's GitHub Pages URL)
5. Deploy, then open `/health` in a browser to confirm it is live.
6. **Set a hard spend limit on the API key in the Anthropic Console.**
   This — not the proxy — is the real financial cap (see LIMITATIONS).

## Frontend change required

The frontend must stop calling `api.anthropic.com` directly and instead
call `POST {render-url}/v1/messages` with header `x-access-token`, sending
the same body. Remove the `x-api-key` header, the
`anthropic-dangerous-direct-browser-access` header, and the BYOK key screen.

## LIMITATIONS (read before relying on the budget cap)

- **The budget cap is a soft early cutoff, not a hard guarantee.** Spend is
  tracked in memory and resets whenever the process restarts — including on
  Render's free tier, which sleeps the service after ~15 minutes of
  inactivity. After a restart the counter starts again from zero.
- **The real cap is the Anthropic Console spend limit on the key.** Set it.
  Tell the budget owner that the Console limit is the guarantee; the proxy
  cap is a convenience that stops early and shows a friendly message.
- For durable, per-user accounting, add a database (or a Render persistent
  disk) and write usage there instead of the in-memory ledger.
- `/health` is unauthenticated and exposes spend totals (no secrets). Lock
  it down if that matters.
