import { useState, useCallback, useEffect } from 'react';

export interface StockInfo {
  code: string;
  name: string;
  market: number;
  secid: string;
  type: string;
  isAshare: boolean;
}

export interface StockKlineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number;
  changePercent: number;
  changeAmount: number;
  turnover: number;
}

export interface StockRealtimeData {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  pe: number;
  pb: number;
  marketCap: number;
  floatCap: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
}

export interface SelectedStock {
  info: StockInfo;
  klines: StockKlineData[];
  realtime: StockRealtimeData | null;
  color: string;
}

const STOCK_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

export function useStockSearch() {
  const [results, setResults] = useState<StockInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:3000/api/stock/search?keyword=${encodeURIComponent(keyword)}`);
      const json = await res.json();
      if (json.success) {
        setResults(json.data);
      } else {
        setError(json.error);
        setResults([]);
      }
    } catch (e: any) {
      setError(e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, search };
}

export function useStockKline(secid: string, code: string, market: string | number, limit: number = 500) {
  const [data, setData] = useState<StockKlineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!secid) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:3000/api/stock/kline?secid=${secid}&code=${code}&market=${market}&limit=${limit}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data.klines || []);
        } else {
          setError(json.error);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [secid, code, market, limit]);

  return { data, loading, error };
}

export function useStockRealtime(secid: string) {
  const [data, setData] = useState<StockRealtimeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!secid) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/stock/realtime?secid=${secid}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (e) {
        console.error('Failed to fetch realtime data:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // 每30秒刷新一次
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [secid]);

  return { data, loading };
}

export function useSelectedStocks() {
  const [stocks, setStocks] = useState<SelectedStock[]>([]);

  const addStock = useCallback(async (info: StockInfo) => {
    // 检查是否已存在
    if (stocks.some(s => s.info.secid === info.secid)) {
      return;
    }

    // 获取历史数据
    try {
      const res = await fetch(`http://localhost:3000/api/stock/kline?secid=${info.secid}&code=${info.code}&market=${info.market}&limit=500`);
      const json = await res.json();

      if (json.success) {
        const colorIndex = stocks.length % STOCK_COLORS.length;
        const newStock: SelectedStock = {
          info,
          klines: json.data.klines || [],
          realtime: null,
          color: STOCK_COLORS[colorIndex],
        };

        // 获取实时数据
        const realtimeRes = await fetch(`http://localhost:3000/api/stock/realtime?secid=${info.secid}`);
        const realtimeJson = await realtimeRes.json();
        if (realtimeJson.success) {
          newStock.realtime = realtimeJson.data;
        }

        setStocks(prev => [...prev, newStock]);
      }
    } catch (e) {
      console.error('Failed to add stock:', e);
    }
  }, [stocks]);

  const removeStock = useCallback((secid: string) => {
    setStocks(prev => prev.filter(s => s.info.secid !== secid));
  }, []);

  const updateRealtimeData = useCallback((secid: string, data: StockRealtimeData) => {
    setStocks(prev => prev.map(s =>
      s.info.secid === secid ? { ...s, realtime: data } : s
    ));
  }, []);

  return { stocks, addStock, removeStock, updateRealtimeData };
}

// 计算股票价格的量纲转换系数，使其与市值/GDP曲线可比
export function calculateStockScaleFactor(
  stockPrices: number[],
  marketCapData: number[]
): number {
  if (!stockPrices.length || !marketCapData.length) return 1;

  const avgStockPrice = stockPrices.reduce((sum, p) => sum + p, 0) / stockPrices.length;
  const avgMarketCap = marketCapData.reduce((sum, v) => sum + v, 0) / marketCapData.length;

  // 转换系数 = 平均市值 / 平均股价
  // 这样股价 * 系数后的范围与市值相近
  return avgMarketCap / avgStockPrice;
}
