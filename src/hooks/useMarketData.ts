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

// 根据周期计算需要的日数
function periodToLimit(period: string, customRange?: { start: Date; end: Date }): number {
  if (period === 'CUSTOM' && customRange) {
    const days = Math.ceil((customRange.end.getTime() - customRange.start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(days, 30);
  }
  switch (period) {
    case '1M': return 30;
    case '6M': return 180;
    case '1Y': return 365;
    case '3Y': return 1100;
    case '5Y': return 1800;
    case '10Y': return 3650;
    case 'ALL': return 5000;
    default: return 5000;
  }
}

export function useMarketData(
  period: '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'ALL' | 'CUSTOM',
  customRange?: { start: Date; end: Date },
  selectedIndices: IndexType[] = [],
  showAvgPrice: boolean = false
) {
  const { realtimeCap } = useRealtimeMarketCap();
  const limit = periodToLimit(period, customRange);

  // 获取市值历史数据
  const { data: historyData } = useMarketCapHistory(limit);

  // 获取指数K线数据（单个hook调用，不违反规则）
  const indexDataMap = useIndexKlines(selectedIndices, limit);

  // 获取平均股价数据
  const avgPriceData = useAvgStockPrice(limit, showAvgPrice);

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

    // 合并指数数据到市值数据
    const merged = historyData.map(d => {
      const indexValues: Partial<Record<IndexType, number>> = {};
      for (const idx of selectedIndices) {
        const val = indexDateMaps[idx]?.get(d.date);
        if (val !== undefined) {
          indexValues[idx] = val;
        }
      }

      return {
        ...d,
        indexValues: selectedIndices.length > 0 ? indexValues as Record<IndexType, number> : undefined,
        avgStockPrice: avgPriceMap.get(d.date),
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
  }, [historyData, realtimeCap, selectedIndices, indexDataMap, avgPriceData]);
}

export { GDP_RATIOS };
export type { IndexType } from '../data/indexData';
export { INDEX_CONFIG } from '../data/indexData';
export { calculateScaleFactor } from '../data/indexData';
