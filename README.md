# 🚗 AutoArbitrage

An Autonomous Agentic ETL Pipeline for High-Value Asset Tracking

AutoArbitrage is a data pipeline designed to monitor the Singapore automotive market for specific 7-seater hybrid models (Mitsubishi Outlander, Toyota Noah, Nissan Serena, Honda Stepwgn). It bypasses the "messy web" by combining headless browser scraping with LLM-powered data extraction and a deterministic valuation engine.

## 🏗️ The Architecture

The system follows a strict Extract, Transform, Load (ETL) pattern to ensure data integrity and cost-efficiency (~$12/month).

- **Ingestion (Extract):** A standalone Node.js scraper (`scraper-worker`) running on a **DigitalOcean Droplet (2GB RAM)** crawls local listing portals (SGCarMart) every 6 hours using Playwright.
- **The Agentic Brain (Transform):** Raw HTML/Text is processed by **DeepSeek / Gemini 2.5 Flash**. The LLM acts as a high-speed parser to return strict JSON, extracting price, mileage, manufacturing year, and precise **Registration Date (Reg Date)**.
- **The Valuation Engine (Score):** A TypeScript function applies a weighted mathematical formula, utilizing the exact **Registration Date** to calculate vehicle age and derive a Deal Score (0-100).
- **State Management (Load):** Data is persisted in **Supabase (PostgreSQL)**. If a price drop is detected, a new record is created in the `price_history` table.
- **Alerting:** If Deal Score ≥ 85, a Telegram Bot pings the user with a direct link and a value breakdown.

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 (App Router) / Tailwind CSS (Deployed on Vercel)
- **Scraper:** Standalone Node.js + Playwright (Headless Chromium) (Deployed on DigitalOcean)
- **Database:** Supabase (PostgreSQL + RLS)
- **AI Inference:** DeepSeek / Google Gemini 2.5 Flash (via AI SDK)
- **Alerts:** Telegram Bot API
- **Visualization:** Recharts.js

## 📊 Database Schema

The system uses a relational model to track historical price deltas, allowing for "Price Drop" alerts.

| Table | Key Fields | Purpose |
| --- | --- | --- |
| vehicles | make, model, baseline_depreciation | Master list of tracked models. |
| listings | current_price, registration_date, deal_score | Current state of active market ads. |
| price_history | listing_id, price, recorded_at | Tracking price fluctuations over time. |

## 🛠️ Project Structure

- `/src`: Next.js frontend and shared types/logic.
- `/scraper-worker`: Standalone Node.js project for the Linux VPS.
- `supabase_schema.sql`: Database schema and `upsert_listing` RPC.

## 🚀 Setup & Deployment

### 1. Supabase (Database)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and execute the full contents of [`supabase_schema.sql`](./supabase_schema.sql). This creates:
   - `vehicles` — target models and baselines
   - `listings` — live market data with deal scores
   - `price_history` — historical price tracking
   - `upsert_listing` — RPC function for atomic insert/update
3. Add your target vehicles to the `vehicles` table via the Table Editor or SQL:

   ```sql
   INSERT INTO vehicles (make, model, baseline_fuel_mileage, baseline_depreciation)
   VALUES ('Toyota', 'Noah', 15000, 12000);
   ```

4. Note your **Project URL** and **Anon Key** from **Settings → API**.

### 2. Vercel (Frontend)

1. Fork/clone this repository.
2. Import the project into [Vercel](https://vercel.com).
3. Add the following environment variables in **Settings → Environment Variables**:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

4. Deploy. The dashboard will be live at your Vercel URL (e.g., `https://your-app.vercel.app`).

### 3. Scraper Worker (DigitalOcean)

For full deployment instructions, see [scraper-worker/README.md](./scraper-worker/README.md).

**Quick start:**

1. Provision a **DigitalOcean Droplet** (Ubuntu 24.04, $12/mo 2GB RAM, SGP1 region).
2. SSH in, create swap space, and install Node.js 20:

   ```bash
   ssh root@<your-droplet-ip>

   # Create 1GB swap (required — Chromium crashes without it)
   fallocate -l 1G /swapfile
   chmod 600 /swapfile
   mkswap /swapfile
   swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab

   # Install Node.js 20
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   ```

3. Upload the worker (from your local machine), then install dependencies on the droplet:

   ```bash
   rsync -av --exclude node_modules scraper-worker/ root@<your-droplet-ip>:/opt/scraper-worker/
   ssh root@<your-droplet-ip>
   cd /opt/scraper-worker
   npm install
   npx playwright install --force --with-deps chromium
   cp env.example .env && nano .env
   ```

4. Configure the `.env` with your keys:

   | Variable | Description |
   | --- | --- |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_SECRET_KEY` | Supabase secret key |
   | `AI_PROVIDER` | `deepseek`, `google`, or `openai` |
   | `DEEPSEEK_API_KEY` | Your DeepSeek API key |
   | `TELEGRAM_BOT_TOKEN` | Telegram bot token for alerts |
   | `TELEGRAM_CHAT_ID` | Telegram chat ID to receive alerts |
   | `SCRAPE_LIMIT` | Max listings per vehicle per run (default: 5) |
   | `DASHBOARD_URL` | Your Vercel dashboard URL |

5. Test run: `npx ts-node index.ts --limit 1`
6. Set up a cron job to run every 6 hours:

   ```bash
   crontab -e
   # Add:
   0 */6 * * * cd /opt/scraper-worker && /usr/bin/npx ts-node index.ts >> /var/log/scraper.log 2>&1
   ```

## 💰 Estimated Monthly Cost

AutoArbitrage is designed to be highly cost-efficient by separating the headless browser (DigitalOcean) from the intelligence layer (DeepSeek API).

### 1. DigitalOcean VPS

- Basic Droplet (2GB RAM, 1 CPU, 50GB SSD)
- Ensures sufficient memory for Playwright headless browsing.
- **Cost: $12.00 / month**

### 2. DeepSeek API (`deepseek-chat`)

Based on the current DeepSeek V3 token pricing ($0.27 - $0.28 per 1M Input tokens, $0.42 per 1M Output tokens):

- **Workload Assumptions:**
  - 25 listings scraped every 6 hours = **100 listings/day** = **3,000 listings/month**.
  - Input strings (7,000 char scrape limit + prompt) ≈ **2,000 input tokens per listing**.
  - JSON Output payload ≈ **150 output tokens per listing**.

- **Token Math:**
  - Input Tokens/Month: 3,000 × 2,000 = **6M tokens** ($0.28 * 6 = **$1.68**)
  - Output Tokens/Month: 3,000 × 150 = **0.45M tokens** ($0.42 * 0.45 = **$0.19**)

- **Cost: ~$1.87 / month**

### 3. Vercel & Supabase

- **Vercel:** Frontend hosting fits entirely within the free Hobby Tier.
- **Supabase:** Database usage fits entirely within the free Starter Tier.

### **Total Estimated Project Cost: ~$13.87 / month**
