<div align="center">
  <h1>🚀 Custom Tech Blog RSS Aggregator</h1>
  <p>
    A personalized, fully automated aggregator for the best Engineering Blogs and Tech Resources on the internet. Built with Next.js 16, Puppeteer, MongoDB, and GitHub Actions.
  </p>

  <p>
    <i>✨ Created entirely using AI (Google Antigravity & Gemini) ✨</i>
  </p>
</div>

---

## 📖 Overview

This repository contains a full-stack web application designed to curate, aggregate, and elegantly display articles from various engineering blogs. While standard RSS readers only work for sites that provide valid XML feeds, this aggregator goes a step further by implementing **custom web scrapers** to ingest articles from popular tech companies that don't provide RSS feeds (or provide broken ones).

## ✨ Features

- **Hybrid Ingestion Engine**:
  - **Standard RSS**: Parses standard feeds provided via an OPML file (`feeds.opml`) using `rss-parser`.
  - **Custom Scrapers**: Puppeteer and API-based scrapers for stubborn sites (Coinbase, Zomato, DoorDash, LinkedIn, Target, RisingStack).
- **Automated CI/CD Pipeline**: GitHub Actions runs the orchestrator script (`npm run ingest`) every 4 hours to keep the database fresh.
- **Resilient Orchestration**: Custom scraper errors are isolated. If a site changes its layout and a scraper breaks, the orchestrator catches it, logs a warning, and continues scraping the remaining sites.
- **Modern Tech Stack**: Built with Next.js 16 (App Router), React 19, and Tailwind CSS.
- **Premium UI/UX**: Designed with a sleek dark mode, glassmorphism components, and a highly responsive layout.

## 🛠️ Architecture & Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, Lucide Icons
- **Backend / API**: Next.js Route Handlers
- **Database**: MongoDB Atlas
- **Scraping**: Puppeteer, `puppeteer-extra-plugin-stealth`, native `fetch` API, XML/JSON parsing
- **Automation**: GitHub Actions

## 📁 Repository Structure

```text
├── .github/workflows/          # GitHub Actions configurations (cron & manual triggers)
│   └── ingest.yml
├── feeds.opml                  # The master OPML list of standard RSS feeds
├── favourite_companies.json    # Curated favourite companies dataset
├── rss-aggregator/             # Next.js Application
│   ├── scripts/                # Ingestion & Database Scripts
│   │   ├── ingest.mjs          # Main orchestrator (Parses OPML & runs custom scrapers)
│   │   ├── ingest-*.mjs        # Custom scrapers (e.g. Coinbase, DoorDash, Zomato, Target, LinkedIn)
│   │   └── db.mjs              # MongoDB connection utilities
│   ├── src/app/                # Next.js App Router (UI & API routes)
│   └── package.json            # Project dependencies and npm scripts
└── README.md
```

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js (v20 or higher)
- MongoDB Cluster (e.g. MongoDB Atlas)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rohankapoor94/Tech-Blog.git
   cd Tech-Blog/rss-aggregator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the `rss-aggregator` directory with your MongoDB connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/techblogs?retryWrites=true&w=majority
   ```

4. **Run the initial ingestion:**
   Populate your database by running the ingestion orchestrator:
   ```bash
   npm run ingest
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

## ☁️ Deployment (Vercel)

Deploying to [Vercel](https://vercel.com) is simple with the nested directory configuration:

1. Import your GitHub repository into Vercel.
2. Under **Project Settings** > **General**:
   - Set **Root Directory** to `rss-aggregator`.
3. Under **Environment Variables**:
   - Add `MONGODB_URI` with your MongoDB Atlas connection string.
4. Deploy! Next.js will build and deploy automatically on every push.

## ⚙️ Automated Ingestion (GitHub Actions)

The repository uses GitHub Actions (`.github/workflows/ingest.yml`) to automatically update the feed every 4 hours (`0 */4 * * *` UTC).

To enable this on your fork/repository:
1. Go to your repository **Settings** > **Secrets and variables** > **Actions**.
2. Add a repository secret named `MONGODB_URI` with your connection string.
3. The workflow runs automatically on schedule, but can also be manually triggered anytime via the **Actions** tab with the **Run workflow** button.

## 📝 Acknowledgment

This entire repository, including the robust web scrapers, database integrations, React components, and automated pipelines, was conceptualized and developed in collaboration with an advanced AI agent.
