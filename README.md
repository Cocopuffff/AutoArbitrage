# 🚗 AutoArbitrage

_An automated data pipeline for real-time market analysis, leveraging a distributed architecture for cost-efficient intelligence capability._

AutoArbitrage is a purpose-built data pipeline designed to monitor the Singapore automotive market for specific 7-seater hybrid vehicles (Mitsubishi Outlander, Toyota Noah, Nissan Serena, Honda Stepwgn). By marrying headless browser automation with LLM-powered data extraction, it transforms the "messy web" of classified ads into a structured, highly deterministic valuation engine and real-time alerting system.

## 🏗️ Architecture & Data Pipeline

The system implements a robust Extract, Transform, Load (ETL) architecture to ensure continuous data integrity while maintaining strict cost-efficiency (operationally under $15/month).

- **Data Ingestion (Extract):** A fault-tolerant Node.js worker (`scraper-worker`) running on a **DigitalOcean Droplet** orchestrates web crawling via Playwright, pulling live supply data from local listing portals on scheduled intervals.
- **AI-Powered Transformation:** Raw unstructured text/HTML is passed through **DeepSeek / Gemini 2.5 Flash**. The LLM operates primarily as a high-speed deterministic data parser, strictly enforcing JSON schema extraction for fields like price, mileage, and registration dates without generation drift.
- **Valuation Engine (Business Logic):** A TypeScript-based decision engine applies a weighted mathematical formula based on live data and exact registration dates to derive a normalized **Deal Score (0-100)** for every asset.
- **State Management (Load):** Normalized data is securely persisted in **Supabase (PostgreSQL)**. Time-series price tracking is handled via an append-only `price_history` table to monitor delta shifts and arbitrage opportunities.
- **Event-Driven Alerting:** When the Valuation Engine flags a Deal Score ≥ 80, a Telegram Bot pushes an immediate, actionable alert to the end-user with a complete value breakdown and direct asset link.

## 🛠️ Technology Stack

**Frontend & Visualization**

- Next.js 16 (App Router) & Tailwind CSS (Deployed on Vercel)
- Recharts.js for time-series and metric visualization

**Backend & Data Engineering**

- Standalone Node.js + Playwright (Headless Chromium on DigitalOcean)
- Supabase (PostgreSQL) with Row Level Security (RLS) policies

**AI & Integrations**

- Vercel AI SDK integration mapping to DeepSeek and Google Gemini 2.5 Flash
- Telegram Bot API for event notifications

## 💰 Unit Economics & Operating Costs

A key design principle of AutoArbitrage was decoupling the compute-heavy headless browsing (DigitalOcean) from the intelligence layer (serverless AI APIs) to achieve highly optimized unit economics.

### 1. Compute Infrastructure (DigitalOcean)

- **Basic Droplet** (2GB RAM, 1 CPU, 50GB SSD)
- Dedicated environment to ensure sufficient memory for Playwright headless execution.
- **Cost: $12.00 / month**

### 2. AI Inference API (`deepseek-chat`)

Leveraging highly efficient token pricing models ($0.27 - $0.28 per 1M Input tokens, $0.42 per 1M Output tokens):

- **Workload Assumptions:**
  - 25 listings scraped every 6 hours = **100 listings/day** = **3,000 listings/month**.
  - Input strings (7,000 char scrape limit + prompt) ≈ **2,000 input tokens per listing**.
  - JSON Output payload ≈ **150 output tokens per listing**.

- **Token Math:**
  - Input Tokens/Month: 3,000 × 2,000 = **6M tokens** ($0.28 \* 6 = **$1.68**)
  - Output Tokens/Month: 3,000 × 150 = **0.45M tokens** ($0.42 \* 0.45 = **$0.19**)

- **Cost: ~$1.87 / month**

### 3. Frontend & Database (Vercel & Supabase)

- **Vercel:** Lean deployment configuration limits usage entirely within the free Hobby Tier.
- **Supabase:** Database usage operates entirely within the free Starter Tier.

### **Total Operating Cost: ~$13.87 / month**

## 📊 Relational Data Schema

The system relies on a clean relational model to construct historical pricing deltas and enable automated "Price Drop" alerts.

| Table           | Key Fields                                   | Purpose                                              |
| --------------- | -------------------------------------------- | ---------------------------------------------------- |
| `vehicles`      | make, model, baseline_depreciation           | Master taxonomy of tracked assets.                   |
| `listings`      | current_price, registration_date, deal_score | Current state representation of market inventory.    |
| `price_history` | listing_id, price, recorded_at               | Time-series tracking for price fluctuation analysis. |

## 🛠️ Project Structure

- `/src`: Next.js frontend and shared types/logic.
- `/scraper-worker`: Standalone Node.js project targeting Linux VPS environments.
- `supabase_schema.sql`: Database schema definition and `upsert_listing` RPC.

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

   | Variable                        | Value                     |
   | ------------------------------- | ------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key    |

4. Deploy. The dashboard will be live at your Vercel URL (e.g., `https://your-app.vercel.app`).

### 3. Scraper Worker (DigitalOcean)

For full deployment instructions, see [scraper-worker/README.md](./scraper-worker/README.md).

**Quick start:**

1. Provision a **DigitalOcean Droplet** (Ubuntu 24.04, $12/mo 2GB RAM, SGP1 region).
2. SSH in, create swap space, and install Node.js 20:

   ```bash
   ssh root@<your-droplet-ip>

   # Create 1GB swap (required — Chromium crashes without it)
   fallocate -l 2G /swapfile
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

   | Variable              | Description                                   |
   | --------------------- | --------------------------------------------- |
   | `SUPABASE_URL`        | Supabase project URL                          |
   | `SUPABASE_SECRET_KEY` | Supabase secret key                           |
   | `AI_PROVIDER`         | `deepseek`, `google`, or `openai`             |
   | `DEEPSEEK_API_KEY`    | Your DeepSeek API key                         |
   | `TELEGRAM_BOT_TOKEN`  | Telegram bot token for alerts                 |
   | `TELEGRAM_CHAT_ID`    | Telegram chat ID to receive alerts            |
   | `SCRAPE_LIMIT`        | Max listings per vehicle per run (default: 5) |
   | `DASHBOARD_URL`       | Your Vercel dashboard URL                     |

5. Change directory to `scraper-worker` root: `cd /opt/scraper-worker`
6. Test run: `npx ts-node index.ts --limit 1`
7. Set up a cron job to run every 6 hours:

   ```bash
   crontab -e
   # Add:
   0 */6 * * * cd /opt/scraper-worker && /usr/bin/npx ts-node index.ts >> /var/log/scraper.log 2>&1
   ```
