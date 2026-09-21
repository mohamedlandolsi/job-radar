# Job Radar: Zero-Cost AI Job Hunting Pipeline

An automated n8n pipeline that scans 10+ remote job boards, applies deterministic hard filters, scores matches via a multi-provider LLM fallback router, and delivers daily digests to Discord and Google Sheets. 

Built to replicate production-grade B2B GTM intelligence architectures (signal ingestion → scoring → routing) on a strict $0 infrastructure budget.

## 🏗️ Architecture & Funnel Economics
Manual job hunting is noisy. This pipeline treats job hunting like a B2B lead generation funnel:
1. **Ingestion:** Pulls from RemoteOK, Remotive, Arbeitnow, WWR, HN Algolia, and specialized GTM/RevOps boards.
2. **Deterministic Gates ($0 cost):** Drops legal disclaimers, enforces date windows, blocks non-remote policies, and vetoes senior-level titles using pure JavaScript before any AI is called.
3. **Deduplication:** Checks against a persistent Google Sheets `seen` database to prevent duplicate processing.
4. **LLM Router (Fallback Chain):** Sends survivors to Groq (primary) → Gemini Flash (fallback) to extract visa signals, score fit, and flag red flags.
5. **Explainable Scoring:** Weighted formula (Match + Filter Fit + Feasibility + Recency) with confidence intervals.
6. **Delivery:** Rich Discord embeds and structured Google Sheets logging.

## ⚙️ Tech Stack
- **Orchestration:** n8n (Self-hosted via Docker)
- **Infrastructure:** GCP Always Free Tier (`e2-micro` VM)
- **Storage/State:** Google Sheets (Service Account API)
- **AI/LLM:** Groq, Google Gemini (Custom JS Fetch Router)
- **Delivery:** Discord Webhooks

## 🚀 Local Setup
1. Import `Job Radar.json` into your n8n instance.
2. Copy `.env.example` to `.env` and fill in your API keys.
3. Create a Google Service Account and share your tracking Sheet with it as Editor.
4. Map the Google Sheets credentials inside the n8n UI.

## 📊 Telemetry & Ops
Every run appends a row to the `ops` tab tracking: `merged_jobs`, `survivors`, `llm_calls`, `providers_used`, and `failures`. This ensures silent failures are caught immediately without opening the workflow canvas.
