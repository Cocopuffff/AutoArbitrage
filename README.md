# 🚗 AutoArbitrage

An Autonomous Agentic ETL Pipeline for High-Value Asset Tracking

AutoArbitrage is a production-grade data pipeline designed to monitor the Singapore automotive market for specific 7-seater hybrid models (Kia Sorento, Toyota Noah, Mitsubishi Outlander). It bypasses the "messy web" by combining headless browser scraping with LLM-powered data extraction and a deterministic valuation engine.

## 🏗️ The Architecture

The system follows a strict Extract, Transform, Load (ETL) pattern to ensure data integrity and cost-efficiency ($<$10/month).

- Ingestion (Extract): A Playwright script hosted on GitHub Actions crawls local listing portals every 6 hours.
- The Agentic Brain (Transform): Raw HTML/Text is sent to Groq/DeepSeek. The LLM acts as a high-speed parser to return strict JSON, extracting mileage, COE expiry, and registration dates.
- The Valuation Engine (Score): A TypeScript function applies a weighted mathematical formula to the JSON data to calculate a Deal Score (0-100).
- State Management (Load): Data is persisted in Supabase (PostgreSQL). If a price drop is detected, a new record is created in the price_history table.
- Alerting: If Deal Score > 85, a Telegram Bot pings the user with a direct link and a breakdown of the value.

## 🛠️ Tech Stack

- Framework: Next.js 15 (App Router)
- Scraping: Playwright (Headless Chromium)
- Database: Supabase (PostgreSQL + Row Level Security)
- AI Inference: Groq / DeepSeek API (Llama 3.1 / 3.3)
- CI/CD: GitHub Actions (Cron Jobs)
- Visualization: Recharts.js

## 📊 Database Schema

The system uses a relational model to track historical price deltas, allowing for "Price Drop" alerts.

| Table | Key Fields | Purpose |
| --- | --- | --- |
| vehicles | make, model, baseline_depreciation | Master list of tracked models. |
| listings | current_price, mileage, deal_score | Current state of active market ads. |
| price_history | listing_id, price, recorded_at | Tracking price fluctuations over time. |

## 🔒 Security & Authorization

To protect the tracking parameters while remaining a public portfolio piece:

- Public Access: Dashboard is read-only via Supabase RLS. Anyone can view market trends and the mock alert UI.
- Admin Access: Mutations (adding new car models or deleting listings) require Supabase Auth. Only the repository owner can modify the monitoring targets.

## 🛠️ Setup & Installation

1. Clone the repo: git clone <https://github.com/yourusername/AutoArbitrage.git>
2. Install dependencies: npm install
3. Environment Variables: Setup .env.local with your:
    - Supabase URL
    - Gemini / DeepSeek / OpenAI API Key
    - AI Provider
    - Cron Secret
    - Telegram Bot Token
4. Database Migration: Run the SQL scripts provided in /supabase/migrations.
5. Test Scraper: npm run scrape:test
