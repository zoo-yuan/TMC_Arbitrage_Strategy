# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A股总市值与GDP比值可视化 - A React-based visualization tool showing the ratio of China's A-share market capitalization to GDP.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (requires proxy server running)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run ESLint
npm run lint
```

## Architecture

### Two-Server Architecture

The application requires **both** servers running during development:

1. **Vite Dev Server** (`npm run dev`) - Serves the React frontend on port 5173
2. **Proxy Server** (`node server/proxy.cjs`) - Express proxy on port 3000 that fetches real-time market data from East Money (东方财富)

The Vite config includes a proxy that forwards `/api/market` requests to the Express server on port 3000.

### Data Flow

1. **Real-time data**: `useRealtimeMarketCap` hook in `src/hooks/useMarketData.ts` fetches from `http://localhost:3000/api/total-market-cap` every 30 seconds
2. **Historical data**: `generateHistoricalMarketData` generates synthetic daily data based on yearly averages with intra-year adjustments for known market events (2007, 2008, 2015, 2018, 2021, 2024)
3. **GDP data**: Static data in `src/data/gdpData.ts` with estimates for 2025-2026

### Key Components

- `MarketValueChart.tsx` - ECharts visualization with GDP ratio reference lines
- `useMarketData.ts` - Combines historical and real-time market data
- `App.tsx` - Period selector and layout

### Tech Stack

- React 19 + TypeScript
- Vite 8 with @tailwindcss/vite plugin
- Tailwind CSS 4
- ECharts 6 via echarts-for-react
- ESLint 9 with typescript-eslint

## Project Structure

```
server/
  proxy.cjs          # Express proxy for East Money API
src/
  components/        # React components
  hooks/             # Custom hooks (data fetching)
  data/              # Static GDP data
  App.tsx            # Main app component
  main.tsx           # Entry point
```
