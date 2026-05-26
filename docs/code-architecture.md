# Code Architecture Summary

## Project Overview

**A股总市值与GDP比值可视化** (China A-Share Market Cap / GDP Ratio Visualization)

A React SPA that visualizes the ratio of China's total A-share market capitalization to GDP, with support for overlaying index data, individual stock comparisons, average stock price, and ETF share count tracking.

## Directory Structure

```
TMC_Arbitrage_Strategy/
├── server/
│   └── proxy.cjs              # Express API proxy (port 3000)
├── src/
│   ├── components/
│   │   └── MarketValueChart.tsx  # ECharts multi-axis chart
│   ├── data/
│   │   ├── gdpData.ts           # Static GDP data 2000-2026
│   │   └── indexData.ts         # Index config & scale factor calculation
│   ├── hooks/
│   │   ├── useMarketData.ts     # Market cap data orchestration
│   │   └── useStockData.ts      # Stock search, kline, realtime hooks
│   ├── App.tsx                  # Root component (all UI + state)
│   ├── main.tsx                 # React entry point
│   └── index.css                # Tailwind CSS import + base styles
├── index.html                   # HTML shell
├── vite.config.ts               # Vite + Tailwind + proxy config
├── tsconfig.json                # TypeScript strict mode, ES2023
├── eslint.config.js             # ESLint 9 flat config
└── package.json                 # Dependencies & scripts
```

## Tech Stack

| Layer       | Technology            | Version |
|-------------|-----------------------|---------|
| UI          | React                 | 19.x    |
| Language    | TypeScript (strict)   | 5.9     |
| Build       | Vite                  | 8.x     |
| Styling     | Tailwind CSS          | 4.x     |
| Charts      | ECharts (via echarts-for-react) | 6.x |
| Server      | Express (CommonJS)    | 5.x     |

## Two-Server Architecture

The app requires **two concurrent processes** during development:

```
Browser :5173 ──→ Vite Dev Server ──→ Express Proxy :3000 ──→ External APIs
                   (serves React)      (fetches live data)     (东方财富, 新浪, 上交所, 深交所)
```

- **Vite** (`npm run dev`) serves the React frontend on port 5173.
- **Express** (`node server/proxy.cjs`) runs on port 3000, proxying requests to external APIs to avoid CORS issues.

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      External APIs                           │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ 上交所+深交所      │  │ 新浪财经 K线API                   │ │
│  │ (实时总市值)       │  │ (历史OHLCV数据)                   │ │
│  ├──────────────────┤  ├──────────────────────────────────┤ │
│  │ 东方财富 push2    │  │ 东方财富 基金F10                   │ │
│  │ (北证市值,个股)    │  │ (ETF份额变动, gmbd)               │ │
│  └────────┬─────────┘  └──────────────┬───────────────────┘ │
└───────────┼───────────────────────────┼─────────────────────┘
            │                           │
┌───────────▼───────────────────────────▼─────────────────────┐
│  server/proxy.cjs  (Express :3000)                           │
│                                                              │
│  GET /api/total-market-cap     → getSSEMarketSummary() + ... │
│  GET /api/market-cap/history   → getMarketCapHistory()       │
│  GET /api/index/kline          → getIndexKline()             │
│  GET /api/stock/search         → searchStock()               │
│  GET /api/stock/kline          → getStockKline()             │
│  GET /api/stock/realtime       → getStockRealtime()          │
│  GET /api/avg-stock-price/...  → getAvgStockPriceHistory()   │
│  GET /api/etf/shares-history   → getETFSharesHistory()       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  React Hooks                                                │
│                                                              │
│  useRealtimeMarketCap() ─── 30s polling                      │
│  useMarketData(period, range, indices, avgPrice, etfShares)  │
│    ├─ useMarketCapHistory(limit)  [真实指数K线回算]           │
│    ├─ useIndexKlines(indices)     [新浪/东方财富K线]          │
│    ├─ useAvgStockPrice(limit)     [上交所历史总股本+估算]     │
│    ├─ useETFShares()              [东方财富基金F10季度数据]   │
│    └─ 合并所有数据源到 MarketDataPoint[]                      │
│                                                              │
│  useStockSearch()  ─── debounced 300ms                       │
│  useSelectedStocks()                                         │
│    ├─ addStock() ──→ stock/kline + stock/realtime            │
│    └─ removeStock()                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Components                                                 │
│                                                              │
│  App.tsx                                                     │
│  ├─ State: period, customRange, selectedIndices, stocks      │
│  │         showAvgPrice, showETFShares                       │
│  ├─ Header (realtime ratio display)                          │
│  ├─ Period selector (1M..ALL, custom date range)             │
│  ├─ Index selector (7 indices, checkboxes)                   │
│  ├─ ETF300份额 toggle                                        │
│  ├─ 平均股价 toggle                                          │
│  ├─ Stock selector (search dropdown + selected chips)        │
│  ├─ Legend bar                                               │
│  └─ MarketValueChart                                         │
│       ├─ Left Y-axis: market cap (万亿)                      │
│       ├─ Right Y-axis 1: index (scaled)                      │
│       ├─ Right Y-axis 2: stock price (scaled)               │
│       └─ Right Y-axis 3: stock PE (scaled)                  │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### `server/proxy.cjs`

Express proxy with 8 endpoints. Uses Node.js `http` module (no axios/fetch). Fetches from:
- **上交所** `query.sse.com.cn` — 实时+历史总市值、总股本
- **深交所** `www.szse.cn/api` — 实时总市值
- **East Money** `push2.eastmoney.com` — 北证市值、个股搜索、实时行情(PE/PB)、指数K线
- **East Money** `push2his.eastmoney.com` — 历史K线
- **East Money** `fundf10.eastmoney.com` — 基金规模变动(ETF份额历史)
- **Sina Finance** `money.finance.sina.com.cn` — A股+指数历史K线

### `src/hooks/useMarketData.ts`

Core data orchestration hook. Exports:
- **`useRealtimeMarketCap()`** — polls `/api/total-market-cap` every 30s
- **`useMarketData(period, customRange, indices, showAvgPrice, showETFShares)`** — returns `MarketDataPoint[]`
- **`useMarketCapHistory(limit)`** — fetches real index K-lines and back-calculates market cap
- **`useIndexKlines(indices, limit)`** — fetches selected index K-lines in parallel
- **`useAvgStockPrice(limit, enabled)`** — average stock price from SSE historical data
- **`useETFShares(enabled)`** — ETF300 quarterly share data from East Money fund F10
- **`periodToLimit(period, customRange)`** — converts period string to trading day count

Key interfaces: `MarketDataPoint { date, totalValue, gdp, ratio, indexValues?, avgStockPrice?, etfShares?, etfNetAssets? }`, `RealtimeMarketCap`

### `src/hooks/useStockData.ts`

Stock-related hooks. Exports:
- **`useStockSearch()`** — debounced search via `/api/stock/search`
- **`useSelectedStocks()`** — manages an array of `SelectedStock`, each with kline + realtime data
- **`calculateStockScaleFactor(prices, marketCapData)`** — computes a multiplier so stock prices visually align with the market cap curve

### `src/components/MarketValueChart.tsx`

Single ECharts component. Renders:
1. **Market cap area line** — left Y-axis (万亿)
2. **6 GDP ratio reference lines** — 0.3x, 0.5x, 0.6x, 0.8x, 1.0x, 1.17x
3. **Index overlays** — right Y-axis 1, auto-scaled
4. **Average stock price** — left Y-axis, auto-scaled
5. **ETF300 share count** — left Y-axis, step line, auto-scaled
6. **Stock price lines** — right Y-axis 2, auto-scaled
7. **Stock PE lines** — right Y-axis 3, auto-scaled (dashed)

### `src/data/gdpData.ts`

Static GDP data array (2000-2026). 2025-2026 are estimates (2024 GDP x 1.05^n).

### `src/data/indexData.ts`

Configuration for 7 indices:
- 上证指数 (SHCOMP), 中证2000 (ZS2000), 中证500 (ZS500), 沪深300 (HS300), 中证1000 (ZS1000), 中证A500 (ZSA500), 中证红利 (ZSHL)

Each has Sina symbol mapping and color config. Exports `calculateScaleFactor()`.

### `src/App.tsx`

Root component containing all UI state and layout. State variables:
- `period` — selected time period (1M/6M/1Y/3Y/5Y/10Y/ALL/CUSTOM)
- `customStartDate`, `customEndDate` — custom range inputs
- `selectedIndices` — toggled index overlays
- `showAvgPrice` — average stock price toggle
- `showETFShares` — ETF300 share count toggle
- `stockKeyword`, `showSearchResults` — stock search UX state
- `selectedStocks` — added stocks with kline + realtime data

## Dimension Scaling Strategy

The chart uses up to 4 Y-axes with different units (万亿, points, yuan, PE ratio). To make all series visually comparable on a shared chart area, scaling factors are computed:

```
scaleFactor = avg(marketCapData) / avg(seriesData)
```

Each series is multiplied by its factor so its average aligns with the market cap average. Tooltips display original (unscaled) values.

## Data Generation Notes

Historical market cap data is **back-calculated from real index K-lines**:
- Fetches SSE Composite (上证指数) and SZSE Composite (深证综指) K-lines up to 8000 trading days (~1996)
- Uses current real market cap breakdown (SH/SZ/BJ) to back-calculate historical values
- GDP reference lines are not drawn before 2000 (no GDP data)

ETF300 share data is quarterly (from East Money fund F10, ~59 quarters since 2012), mapped to daily data points using step interpolation.

## Build & Deploy

```bash
npm install          # Install deps
npm run dev          # Vite dev server on :5173 (also run: node server/proxy.cjs)
npm run build        # tsc -b && vite build → dist/
npm run preview      # Serve production build
npm run lint         # ESLint check
```
