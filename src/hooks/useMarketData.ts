import { useState, useEffect, useMemo } from 'react';
import { GDP_RATIOS } from '../data/gdpData';
import { INDEX_CONFIG, type IndexType } from '../data/indexData';

export interface MarketDataPoint {
  date: string;
  totalValue: number; // 万亿元
  gdp: number; // 当年GDP
  ratio: number; // totalValue / gdp
  indexValues?: Record<IndexType, number>; // 指数点位（真实值）
  avgStockPrice?: number; // 全市场平均股价（元）
  etfShares?: number; // ETF300总份额（亿份）
  etfNetAssets?: number; // ETF300净资产（亿元）
}

export interface RealtimeMarketCap {
  total: string;   // 总市值（万亿）
  flow: string;    // 流通市值（万亿）
  sh: { name: string; total: string };
  sz: { name: string; total: string };
  bj: { name: string; total: string };
  timestamp: string;
}

// 获取实时市值
export function useRealtimeMarketCap() {
  const [realtimeCap, setRealtimeCap] = useState<RealtimeMarketCap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/total-market-cap');
        const json = await res.json();
        if (mounted && json.success) {
          setRealtimeCap(json.data);
        } else if (mounted) {
          setError(json.error || '获取数据失败');
        }
      } catch (e: any) {
        if (mounted) {
          setError(e.message || '网络错误');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { realtimeCap, loading, error };
}

// 获取市值历史数据（从服务端API）
function useMarketCapHistory(limit: number) {
  const [data, setData] = useState<MarketDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:3000/api/market-cap/history?limit=${limit}`);
        const json = await res.json();
        if (mounted && json.success) {
          setData(json.data || []);
        } else if (mounted) {
          setError(json.error || '获取历史数据失败');
        }
      } catch (e: any) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
  }, [limit]);

  return { data, loading, error };
}

// 获取多个指数K线数据（单个 hook，不违反 React 规则）
function useIndexKlines(indices: IndexType[], limit: number) {
  const [indexData, setIndexData] = useState<Record<string, { date: string; close: number }[]>>({});

  useEffect(() => {
    if (!indices.length) return;

    let mounted = true;
    const fetchData = async () => {
      const results: Record<string, { date: string; close: number }[]> = {};
      // 并行请求所有选中指数
      await Promise.all(indices.map(async (idx) => {
        const config = INDEX_CONFIG[idx];
        if (!config?.sinaSymbol) return;
        try {
          const res = await fetch(`http://localhost:3000/api/index/kline?symbol=${config.sinaSymbol}&limit=${limit}`);
          const json = await res.json();
          if (json.success) {
            results[idx] = json.data || [];
          }
        } catch (e) {
          console.error(`Failed to fetch index ${idx}:`, e);
        }
      }));

      if (mounted) {
        setIndexData(prev => ({ ...prev, ...results }));
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [indices.join(','), limit]);

  return indexData;
}

// 获取平均股价历史数据
function useAvgStockPrice(limit: number, enabled: boolean) {
  const [data, setData] = useState<{ date: string; avgPrice: number }[]>([]);

  useEffect(() => {
    if (!enabled) { setData([]); return; }

    let mounted = true;
    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/avg-stock-price/history?limit=${limit}`);
        const json = await res.json();
        if (mounted && json.success) {
          setData(json.data || []);
        }
      } catch (e) {
        console.error('Failed to fetch avg stock price:', e);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [limit, enabled]);

  return data;
}

// 获取ETF300份额历史数据（季度数据，全量70个季度）
function useETFShares(enabled: boolean) {
  const [data, setData] = useState<{ date: string; totalShares: number; netAssets: number }[]>([]);

  useEffect(() => {
    if (!enabled) { setData([]); return; }

    let mounted = true;
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/etf/shares-history?code=510300');
        const json = await res.json();
        if (mounted && json.success) {
          setData(json.data || []);
        }
      } catch (e) {
        console.error('Failed to fetch ETF shares:', e);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [enabled]);

  return data;
}

// 根据周期计算需要的交易日数（1年约250个交易日）
export function periodToLimit(period: string, customRange?: { start: Date; end: Date }): number {
  if (period === 'CUSTOM' && customRange) {
    const calendarDays = Math.ceil((customRange.end.getTime() - customRange.start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(Math.ceil(calendarDays * 250 / 365), 30);
  }
  switch (period) {
    case '1M': return 22;
    case '6M': return 125;
    case '1Y': return 250;
    case '3Y': return 750;
    case '5Y': return 1250;
    case '10Y': return 2500;
    case 'ALL': return 8000;
    default: return 8000;
  }
}

export function useMarketData(
  period: '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'ALL' | 'CUSTOM',
  customRange?: { start: Date; end: Date },
  selectedIndices: IndexType[] = [],
  showAvgPrice: boolean = false,
  showETFShares: boolean = false
) {
  const { realtimeCap } = useRealtimeMarketCap();
  const limit = periodToLimit(period, customRange);

  // 获取市值历史数据
  const { data: historyData } = useMarketCapHistory(limit);

  // 获取指数K线数据（单个hook调用，不违反规则）
  const indexDataMap = useIndexKlines(selectedIndices, limit);

  // 获取平均股价数据
  const avgPriceData = useAvgStockPrice(limit, showAvgPrice);

  // 获取ETF份额数据
  const etfSharesData = useETFShares(showETFShares);

  return useMemo(() => {
    if (!historyData.length) return [];

    // 构建指数日期映射
    const indexDateMaps: Record<string, Map<string, number>> = {};
    for (const idx of selectedIndices) {
      indexDateMaps[idx] = new Map(
        (indexDataMap[idx] || []).map(d => [d.date, d.close])
      );
    }

    // 构建平均股价日期映射
    const avgPriceMap = new Map(avgPriceData.map(d => [d.date, d.avgPrice]));

    // 构建ETF份额映射：对每个交易日，取最近的季度数据
    const etfSharesMap = new Map<string, { totalShares: number; netAssets: number }>();
    if (etfSharesData.length > 0) {
      // etfSharesData已按日期升序排列
      let lastIdx = 0;
      for (const d of historyData) {
        // 找到 <= d.date 的最晚季度数据
        while (lastIdx < etfSharesData.length - 1 && etfSharesData[lastIdx + 1].date <= d.date) {
          lastIdx++;
        }
        if (etfSharesData[lastIdx].date <= d.date) {
          etfSharesMap.set(d.date, { totalShares: etfSharesData[lastIdx].totalShares, netAssets: etfSharesData[lastIdx].netAssets });
        }
      }
    }

    // 合并指数数据到市值数据
    const merged = historyData.map(d => {
      const indexValues: Partial<Record<IndexType, number>> = {};
      for (const idx of selectedIndices) {
        const val = indexDateMaps[idx]?.get(d.date);
        if (val !== undefined) {
          indexValues[idx] = val;
        }
      }

      const etf = etfSharesMap.get(d.date);

      return {
        ...d,
        indexValues: selectedIndices.length > 0 ? indexValues as Record<IndexType, number> : undefined,
        avgStockPrice: avgPriceMap.get(d.date),
        etfShares: etf?.totalShares,
        etfNetAssets: etf?.netAssets,
      };
    });

    // 用实时数据替换最后一天
    if (realtimeCap) {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastIdx = merged.length - 1;
      if (lastIdx >= 0) {
        const lastDate = merged[lastIdx].date;
        if (lastDate === todayStr || lastDate <= todayStr) {
          const total = parseFloat(realtimeCap.total);
          const gdp = merged[lastIdx].gdp;
          merged[lastIdx] = {
            ...merged[lastIdx],
            totalValue: total,
            ratio: gdp > 0 ? Math.round((total / gdp) * 10000) / 10000 : merged[lastIdx].ratio,
          };
        }
      }
    }

    return merged;
  }, [historyData, realtimeCap, selectedIndices, indexDataMap, avgPriceData, etfSharesData]);
}

export { GDP_RATIOS };
export type { IndexType } from '../data/indexData';
export { INDEX_CONFIG } from '../data/indexData';
export { calculateScaleFactor } from '../data/indexData';
