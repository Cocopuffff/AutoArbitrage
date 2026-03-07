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

Detailed setup and deployment instructions for both the **Vercel Frontend** and the **DigitalOcean Scraper** can be found in the codebase and conversation artifacts.

1. **Database:** Execute `supabase_schema.sql` in your Supabase SQL Editor.
2. **Frontend:** Deploy the root directory to Vercel and configure variables (see `env.example`).
3. **Scraper:** Follow the instructions in [scraper-worker/README.md](./scraper-worker/README.md) to deploy to a Linux VPS (Ubuntu 24.04 recommended).

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
