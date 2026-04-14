# DESIGN.md — A股总市值与GDP比值可视化

## 架构概览

```
┌─────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│  Vite Dev Server    │  /api │  Express Proxy       │ HTTP  │  外部数据源           │
│  (React + Tailwind) │──────▶│  (port 3000)         │──────▶│  上交所/深交所/东方财富 │
│  port 5173          │       │                      │       │  新浪财经             │
└─────────────────────┘       └──────────────────────┘       └──────────────────────┘
```

双服务器架构：
- **Vite Dev Server** (port 5173) — React 前端，通过 Vite proxy 转发 `/api` 请求到 Express
- **Express Proxy** (port 3000) — 代理层，从多个数据源获取数据，统一返回 JSON

## 数据源

| 数据源 | 用途 | API |
|--------|------|-----|
| 上海证券交易所 | 沪市总市值/流通市值 | `query.sse.com.cn/commonQuery.do` |
| 深圳证券交易所 | 深市总市值/流通市值 | `www.szse.cn/api/report/ShowReport/data` |
| 东方财富 push2 | 北证市值(备用)、个股实时数据 | `push2.eastmoney.com/api/qt/stock/get` |
| 东方财富 K线 | 港股历史K线 | `push2his.eastmoney.com/api/qt/stock/kline/get` |
| 东方财富搜索 | 股票代码/名称搜索 | `searchapi.eastmoney.com/api/suggest/get` |
| 新浪财经 | A股历史K线 | `money.finance.sina.com.cn/quotes_service/` |

## API端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/total-market-cap` | 获取A股总市值（沪+深+北证），优先官方交易所API |
| GET | `/api/stock/search?keyword=xxx` | 搜索股票（A股+港股） |
| GET | `/api/stock/kline?secid=x.xxxxxx&code=xxx&market=x&limit=500` | 获取股票历史K线 |
| GET | `/api/stock/realtime?secid=x.xxxxxx` | 获取股票实时数据（价格、PE、市值等） |

### secid 格式

东方财富统一标的ID格式为 `{MktNum}.{Code}`：

| 市场 | MktNum | 示例 |
|------|--------|------|
| 深圳主板/创业板 | 0 | `0.000001` (平安银行) |
| 上海 | 1 | `1.600519` (贵州茅台) |
| 港股 | 116 | `116.00700` (腾讯控股) |
| 北证指数 | 0 | `0.899050` (北证50) |

## 前端组件结构

```
App.tsx
├── Header (实时比值显示)
├── Period Selector (1M/6M/1Y/3Y/5Y/10Y/ALL/自定义)
├── Index Selector (上证/中证2000/500/1000/沪深300/A500/红利)
├── Stock Selector (搜索+已选列表)
├── Legend (图例)
└── MarketValueChart (ECharts图表)
    ├── 左Y轴: 总市值（万亿）
    ├── 右Y轴1: 指数点位
    ├── 右Y轴2: 股价
    └── 右Y轴3: PE
```

## 数据流

### 总市值数据
1. `useRealtimeMarketCap` → 每30秒 fetch `/api/total-market-cap` → 实时总市值
2. `generateHistoricalMarketData` → 基于年度均值+年内波动因子+噪声 生成合成历史数据
3. 两者合并：当天用实时数据替换合成数据

### GDP数据
- 静态数据 `src/data/gdpData.ts`，2025-2026为预估值
- 比例参考线: 0.3×, 0.5×, 0.6×, 0.8×, 1.0×, 1.17× GDP

### 指数叠加
- `generateIndexData()` 基于年度平均点位生成合成历史数据
- 通过 `calculateScaleFactor()` 做量纲转换（指数点位 → 万亿量级）
- 支持指数: 上证/中证2000/500/1000/沪深300/A500/红利

### 个股叠加
1. 搜索: `useStockSearch` → `/api/stock/search` → 东方财富智能提示
2. 添加: `useSelectedStocks.addStock()` → 同时获取K线+实时数据
3. 显示: 通过 `calculateStockScaleFactor()` 量纲转换后叠加到图表
4. PE估算: `basePE × (当前价 / 平均价)` 近似

## 技术栈

- React 19 + TypeScript
- Vite 8 + @tailwindcss/vite
- Tailwind CSS 4
- ECharts 6 (echarts-for-react)
- Express 5 (代理服务)
