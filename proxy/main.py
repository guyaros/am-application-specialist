"""main.py — Anthropic API proxy for the AM Application Specialist tool.

WHY THIS EXISTS
The frontend (a static index.html) previously called the Anthropic API
directly from the browser, which required shipping an API key to every
client. This proxy holds a single key server-side (as an environment
variable) and forwards requests, so the key is never exposed to clients.

It adds three pilot-grade guardrails the client-side approach could not:
  1. Access control   — callers must present a shared access token.
  2. Budget cap        — a cumulative USD limit; requests are refused once
                         the configured spend is reached.
  3. Usage accounting  — correct per-model cost (Haiku vs Sonnet) + logging.

SCOPE
This is a minimal pilot proxy, not a hardened multi-tenant backend. Read
the LIMITATIONS section in README.md before relying on the budget cap — the
hard financial guarantee must be a spend limit set on the key in the
Anthropic Console, not this in-memory counter.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# --- Configuration (all secrets come from environment variables) ------------

ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
ACCESS_TOKEN: str = os.environ.get("PROXY_ACCESS_TOKEN", "")

# Cumulative spend limit in USD across the pilot. Once exceeded, the proxy
# refuses further calls. This is a SOFT early cutoff (see LIMITATIONS).
BUDGET_USD: float = float(os.environ.get("PROXY_BUDGET_USD", "50"))

# Comma-separated origins allowed to call this proxy (the frontend's
# GitHub Pages URL). Set this in production; "*" is only a dev fallback.
ALLOWED_ORIGINS: list[str] = os.environ.get("PROXY_ALLOWED_ORIGINS", "*").split(",")

ANTHROPIC_URL: str = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION: str = "2023-06-01"

# Models the proxy is allowed to call, so the endpoint cannot be repurposed
# to call arbitrary/expensive models. Pricing is USD per 1M tokens.
# WARNING: verify these against current Anthropic pricing before launch —
# they drive both the budget cap and the cost reported to the owner.
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 1.0, "output": 5.0},  # verify
}


@dataclass
class UsageLedger:
    """In-memory record of cumulative token usage and spend.

    NOTE: this resets whenever the process restarts (on deploy, and on
    Render's free tier, after the service sleeps from inactivity). It is a
    soft early cutoff, not a hard guarantee. The real financial backstop is
    a spend limit set on the API key in the Anthropic Console.
    """

    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    runs: int = 0

    def add(self, model: str, in_tok: int, out_tok: int) -> float:
        """Record one upstream call and return its cost in USD."""
        price = MODEL_PRICING.get(model, {"input": 0.0, "output": 0.0})
        call_cost = in_tok * price["input"] / 1e6 + out_tok * price["output"] / 1e6
        self.input_tokens += in_tok
        self.output_tokens += out_tok
        self.cost_usd += call_cost
        self.runs += 1
        return call_cost


ledger = UsageLedger()
app = FastAPI(title="AM Specialist Proxy", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# --- Request model ----------------------------------------------------------

class MessagesRequest(BaseModel):
    """Subset of the Anthropic Messages API that the frontend sends."""

    model: str
    messages: list[dict[str, Any]]
    max_tokens: int = Field(default=2500, ge=1, le=8192)
    system: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=1.0)


# --- Helpers ----------------------------------------------------------------

def _require_config() -> None:
    """Fail fast if the server is misconfigured (missing secrets)."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Server missing ANTHROPIC_API_KEY")
    if not ACCESS_TOKEN:
        raise HTTPException(status_code=500, detail="Server missing PROXY_ACCESS_TOKEN")


def _check_access(token: str | None) -> None:
    """Reject callers that do not present the shared pilot access token."""
    if not token or token != ACCESS_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing access token")


# --- Routes -----------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness check and current usage snapshot (contains no secrets)."""
    return {
        "status": "ok",
        "runs": ledger.runs,
        "input_tokens": ledger.input_tokens,
        "output_tokens": ledger.output_tokens,
        "cost_usd": round(ledger.cost_usd, 4),
        "budget_usd": BUDGET_USD,
        "budget_remaining_usd": round(max(0.0, BUDGET_USD - ledger.cost_usd), 4),
    }


@app.post("/v1/messages")
async def proxy_messages(
    body: MessagesRequest,
    x_access_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """Forward a Messages request to Anthropic using the server-side key.

    Enforces access control, an allowed-model list, and the cumulative
    budget cap before making the upstream call. Returns Anthropic's raw
    JSON response unchanged so the frontend needs no response remapping.
    """
    _require_config()
    _check_access(x_access_token)

    if body.model not in MODEL_PRICING:
        raise HTTPException(status_code=400, detail=f"Model not allowed: {body.model}")

    if ledger.cost_usd >= BUDGET_USD:
        raise HTTPException(
            status_code=429,
            detail=f"Pilot budget of ${BUDGET_USD:.2f} reached. Contact the owner.",
        )

    payload: dict[str, Any] = {
        "model": body.model,
        "max_tokens": body.max_tokens,
        "messages": body.messages,
    }
    if body.system:
        payload["system"] = body.system
    if body.temperature is not None:
        payload["temperature"] = body.temperature

    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(ANTHROPIC_URL, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {exc}") from exc

    data = resp.json()

    if resp.status_code != 200:
        # Surface Anthropic's error message without leaking the key.
        message = data.get("error", {}).get("message", "Upstream error")
        raise HTTPException(status_code=resp.status_code, detail=message)

    usage = data.get("usage", {})
    in_tok = int(usage.get("input_tokens", 0))
    out_tok = int(usage.get("output_tokens", 0))
    call_cost = ledger.add(body.model, in_tok, out_tok)

    # Printed to stdout -> visible in Render logs. Swap for a DB write to get
    # durable, per-user accounting (see README.md).
    print(
        f"[usage] model={body.model} in={in_tok} out={out_tok} "
        f"cost=${call_cost:.4f} total=${ledger.cost_usd:.4f} runs={ledger.runs}",
        flush=True,
    )

    return data
