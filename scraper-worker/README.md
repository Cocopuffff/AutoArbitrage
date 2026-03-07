# AutoArbitrage Scraper Worker

The scraping logic from the Next.js frontend has been extracted into this standalone Node.js project. This is designed to run independently on a Linux VPS (e.g., DigitalOcean Droplet) to bypass the limitations of Vercel Serverless Functions.

## 🏗️ Project Structure

```text
scraper-worker/
├── index.ts            # Main entrypoint
├── package.json
├── tsconfig.json
├── .env.example        # Template for env vars
└── src/
    ├── scraper.ts      # Playwright scraper (memory-optimized)
    ├── llm.ts          # AI extraction
    ├── db.ts           # Supabase client + scoring + upsert
    └── telegram.ts     # Telegram alerts
```

## 🛠️ Testing Locally

1. **Install Dependencies:**

   ```bash
   npm install
   ```

2. **Configure Environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your actual values (Supabase, LLM, Telegram)
   ```

3. **Run the Script:**

   ```bash
   npx ts-node index.ts --limit 1
   ```

---

## 🚀 Deployment to DigitalOcean Droplet

### 1. Provision the Droplet

- **Image:** Ubuntu 24.04 LTS
- **Plan:** Basic, Regular CPU, **$12/mo (2GB RAM, 1 CPU)**
- **Region:** Singapore (SGP1) recommended.

### 2. Install Dependencies on Droplet

Connect to your droplet via SSH and run:

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Playwright system dependencies
npx -y playwright install-deps
npx -y playwright install chromium
```

### 3. Deploy the Worker

On your local machine, use `scp` to upload the worker folder:

```bash
scp -r scraper-worker root@<your-droplet-ip>:/opt/scraper-worker
```

### 4. Final Setup on Droplet

```bash
cd /opt/scraper-worker
npm install
cp .env.example .env
nano .env # Enter your real API keys
```

### 5. Automate with Cron

Open the crontab editor:

```bash
crontab -e
```

Add this line to run the scraper every 6 hours and log the output:

```cron
0 */6 * * * cd /opt/scraper-worker && /usr/bin/npx ts-node index.ts >> /var/log/scraper.log 2>&1
```

Monitor with: `tail -f /var/log/scraper.log`
