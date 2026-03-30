import { useState, useEffect, useMemo } from 'react';
import { getGDPForDate, GDP_RATIOS } from '../data/gdpData';
import { generateIndexData, type IndexType } from '../data/indexData';

export interface MarketDataPoint {
  date: string;
  totalValue: number; // 万亿元
  gdp: number; // 当年GDP
  ratio: number; // totalValue / gdp
  indexValues?: Record<IndexType, number>; // 指数点位（原始值）
}

export interface RealtimeMarketCap {
  total: string;   // 总市值（万亿）
  flow: string;    // 流通市值（万亿）
  sh: { name: string; total: string };
  sz: { name: string; total: string };
  timestamp: string;
}

// 中国A股总市值历史数据（单位：万亿元人民币）
// 参考真实历史数据
const YEARLY_AVG_MARKET_CAP: Record<number, number> = {
  2000: 5.0,
  2001: 4.3,
  2002: 3.8,
  2003: 4.2,
  2004: 3.7,
  2005: 3.2,  // 熊市底部
  2006: 7.0,
  2007: 32.0, // 牛市顶点
  2008: 12.0, // 金融危机
  2009: 24.0,
  2010: 26.5,
  2011: 21.0,
  2012: 23.0,
  2013: 24.0,
  2014: 37.0,
  2015: 53.0, // 牛市顶点
  2016: 50.0,
  2017: 56.0,
  2018: 43.0, // 贸易战
  2019: 59.0,
  2020: 79.0,
  2021: 92.0, // 结构牛顶点
  2022: 78.0,
  2023: 82.0,
  2024: 85.0,
  2025: 88.0, // 2025年预估
  2026: 92.0, // 2026年预估
};

function getYearlyAvgMarketCap(year: number): number {
  return YEARLY_AVG_MARKET_CAP[year] || 50;
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
    // 每30秒刷新一次
    const interval = setInterval(fetchData, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { realtimeCap, loading, error };
}

// 生成历史市值数据（不包含今天，今天用实时数据）
function generateHistoricalMarketData(
  startDate: Date,
  endDate: Date,
  selectedIndices: IndexType[] = []
): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  const current = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 预生成指数数据
  const indexDataMap: Record<IndexType, ReturnType<typeof generateIndexData>> = {
    ZS2000: selectedIndices.includes('ZS2000') ? generateIndexData(startDate, endDate, 'ZS2000') : [],
    ZS500: selectedIndices.includes('ZS500') ? generateIndexData(startDate, endDate, 'ZS500') : [],
    HS300: selectedIndices.includes('HS300') ? generateIndexData(startDate, endDate, 'HS300') : [],
    ZS1000: selectedIndices.includes('ZS1000') ? generateIndexData(startDate, endDate, 'ZS1000') : [],
    ZSA500: selectedIndices.includes('ZSA500') ? generateIndexData(startDate, endDate, 'ZSA500') : [],
  };

  // 创建日期到指数值的映射
  const indexValueMap: Record<IndexType, Map<string, number>> = {
    ZS2000: new Map(indexDataMap.ZS2000.map(d => [d.date, d.value])),
    ZS500: new Map(indexDataMap.ZS500.map(d => [d.date, d.value])),
    HS300: new Map(indexDataMap.HS300.map(d => [d.date, d.value])),
    ZS1000: new Map(indexDataMap.ZS1000.map(d => [d.date, d.value])),
    ZSA500: new Map(indexDataMap.ZSA500.map(d => [d.date, d.value])),
  };

  while (current < today && current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const gdp = getGDPForDate(current);

    const yearlyAvg = getYearlyAvgMarketCap(year);

    let intraYearFactor = 1;
    if (year === 2007) {
      intraYearFactor = month >= 9 ? 1.3 : (month >= 6 ? 1.2 : 1.0);
    } else if (year === 2008) {
      intraYearFactor = month >= 9 ? 0.7 : (month >= 6 ? 0.85 : 1.0);
    } else if (year === 2015) {
      intraYearFactor = month >= 5 ? 1.25 : (month >= 3 ? 1.15 : 1.0);
    } else if (year === 2018) {
      intraYearFactor = month >= 9 ? 0.75 : (month >= 6 ? 0.9 : 1.0);
    } else if (year === 2021) {
      intraYearFactor = month >= 1 && month <= 2 ? 1.15 : (month >= 3 && month <= 5 ? 1.1 : (month > 9 ? 0.9 : 1.0));
    } else if (year === 2024) {
      intraYearFactor = month >= 8 ? 1.15 : (month >= 5 ? 1.05 : 1.0);
    }

    const noise = 1 + (Math.random() - 0.5) * 0.08;
    const totalValue = yearlyAvg * intraYearFactor * noise;

    const dateStr = current.toISOString().split('T')[0];

    // 构建指数值对象
    const indexValues: Partial<Record<IndexType, number>> = {};
    for (const idx of selectedIndices) {
      const value = indexValueMap[idx].get(dateStr);
      if (value !== undefined) {
        indexValues[idx] = value;
      }
    }

    data.push({
      date: dateStr,
      totalValue: Math.round(totalValue * 100) / 100,
      gdp: gdp,
      ratio: Math.round((totalValue / gdp) * 10000) / 10000,
      indexValues: selectedIndices.length > 0 ? indexValues as Record<IndexType, number> : undefined,
    });

    current.setDate(current.getDate() + 1);
  }

  return data;
}

export function useMarketData(
  period: '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'ALL' | 'CUSTOM',
  customRange?: { start: Date; end: Date },
  selectedIndices: IndexType[] = []
) {
  const { realtimeCap } = useRealtimeMarketCap();

  return useMemo(() => {
    let endDate: Date;
    let startDate: Date;

    if (period === 'CUSTOM' && customRange) {
      endDate = new Date(customRange.end);
      startDate = new Date(customRange.start);
    } else {
      endDate = new Date();
      endDate.setHours(0, 0, 0, 0);

      switch (period) {
        case '1M':
          startDate = new Date(endDate);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case '6M':
          startDate = new Date(endDate);
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1Y':
          startDate = new Date(endDate);
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case '3Y':
          startDate = new Date(endDate);
          startDate.setFullYear(startDate.getFullYear() - 3);
          break;
        case '5Y':
          startDate = new Date(endDate);
          startDate.setFullYear(startDate.getFullYear() - 5);
          break;
        case '10Y':
          startDate = new Date(endDate);
          startDate.setFullYear(startDate.getFullYear() - 10);
          break;
        case 'ALL':
        default:
          startDate = new Date('2000-01-01');
          break;
      }
    }

    const historicalData = generateHistoricalMarketData(startDate, endDate, selectedIndices);

    // 如果包含今天，用实时数据替换今天的值
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (realtimeCap && today >= startDate && today <= endDate) {
      const todayStr = today.toISOString().split('T')[0];
      const todayIndex = historicalData.findIndex(d => d.date === todayStr);
      const gdp = getGDPForDate(today);

      // 保留原有的指数值
      const existingIndexValues = todayIndex >= 0 ? historicalData[todayIndex].indexValues : undefined;

      if (todayIndex >= 0) {
        historicalData[todayIndex] = {
          date: todayStr,
          totalValue: parseFloat(realtimeCap.total),
          gdp: gdp,
          ratio: Math.round((parseFloat(realtimeCap.total) / gdp) * 10000) / 10000,
          indexValues: existingIndexValues,
        };
      } else {
        historicalData.push({
          date: todayStr,
          totalValue: parseFloat(realtimeCap.total),
          gdp: gdp,
          ratio: Math.round((parseFloat(realtimeCap.total) / gdp) * 10000) / 10000,
          indexValues: existingIndexValues,
        });
      }
    }

    return historicalData;
  }, [period, customRange, realtimeCap, selectedIndices]);
}

export { GDP_RATIOS };
export type { IndexType } from '../data/indexData';
export { INDEX_CONFIG } from '../data/indexData';
export { calculateScaleFactor } from '../data/indexData';
