#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install system dependencies required by Playwright's browsers
apt-get update && apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon-x11-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgtk-3-0 libasound2 libgbm-dev

# 2. Install your npm packages
npm install

# 3. Install the Playwright browsers (without trying to install system deps again)
npx playwright install