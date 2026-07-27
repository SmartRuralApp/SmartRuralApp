# Smart Gram Panchayat - Production Deployment Guide

This document explains how to prepare, verify, and deploy the Smart Gram Panchayat Digital Governance platform.

---

## 📋 Features & Architecture

* **Backend**: Express + EJS web app with GZIP compression (`compression`) and security headers (`helmet`).
* **Database**: High-performance in-memory SQLite wrapper (`sql.js`) synced dynamically to disk.
* **ML Engines**: Python-based classifiers for property tax default risk, complaint category classification, scheme eligibility predictions, duplicate grouping, and the GramMitra AI chatbot.

---

## ⚙️ Environment Variables (`.env`)

Create a `.env` file in the root directory. You can copy the template from `.env.example`:

| Key | Description | Default |
| --- | --- | --- |
| `PORT` | The port the Express server will listen on. | `3000` |
| `NODE_ENV` | `development` or `production` (enables secure cookies & trust proxy). | `production` |
| `DATABASE_PATH` | Path where the SQLite file is written and persisted. | `data/panchayat.db` |
| `PYTHON_EXECUTABLE` | Explicit path or command to run Python (e.g. `python3`, `/usr/bin/python`). If blank, auto-probes the system. | *(auto-detected)* |
| `SESSION_SECRET` | Secret key used to sign and encrypt session cookies. | `panchayat-secret-key-2026-prod` |
| `FAST2SMS_API_KEY` | API key credentials for Fast2SMS gateway integrations. | *(optional)* |

---

## 🛠️ Local Installation & Setup

1. **Install Node.js Dependencies**:
   ```bash
   npm install
   ```
2. **Install Python Requirements**:
   Ensure you have Python 3.10+ installed. Install the machine learning dependencies:
   ```bash
   pip install pandas numpy scikit-learn openpyxl
   ```
3. **Generate/Train ML Models**:
   Ensure that the baseline classifier binaries exist in `models/`. You can retrain models from scratch using:
   ```bash
   python ml/train.py
   ```
4. **Launch the Server**:
   ```bash
   npm start
   ```

---

## 🚀 Cloud Deployments

The platform is designed to be fully platform-agnostic and deployable on any containerized or PAAS cloud service.

### 1. Render Deployment (`render.com`)
1. Create a new **Web Service** on Render.
2. Link your GitHub repository.
3. Configure the environment runtime:
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
4. Set the following **Environment Variables** in the service settings:
   * `NODE_ENV=production`
   * `SESSION_SECRET=a-secure-random-phrase`
   * `PORT=10000` (Render allocates this automatically, but good to declare)
5. **Python Dependency Resolution**:
   Add a `render.yaml` or define a build script that installs Python dependencies, or use Render's native Python buildpack alongside the Node buildpack.

### 2. Railway Deployment (`railway.app`)
1. Create a new project on Railway and link your GitHub repository.
2. Railway automatically detects `package.json` and runs `npm install` followed by `npm start`.
3. Set the Environment Variables in the project dashboard (`NODE_ENV=production`, `SESSION_SECRET=your-secret`).
4. Railway natively installs Python if specified in a `Nixpacks` config, or you can add a `nixpacks.toml` in your root directory to request python3:
   ```toml
   [providers.python]
   requirements = "requirements.txt"
   ```

### 3. Azure App Service
1. Create an **App Service** plan (Linux environment recommended for Node+Python apps).
2. Configure deployment via GitHub Actions or local Git.
3. Set Application Settings in the Azure Portal (corresponds to `.env` variables).
4. Define a custom startup command under Configuration: `node server.js`.

---

## 🩺 Troubleshooting & Diagnostics

* **Startup Checklists**:
  On startup, the console prints a complete diagnostic checklist checking DB connection, schema tables, Python executable availability, model binaries, dataset spreadsheets, and upload folders.
* **Session Issues**:
  If logins do not persist on reverse proxy setups (e.g. behind Render/Railway Load Balancers), ensure `NODE_ENV` is set to `production` so that `app.set('trust proxy', 1)` is correctly configured.
