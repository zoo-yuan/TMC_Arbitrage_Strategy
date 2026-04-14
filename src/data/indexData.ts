// 指数类型与配置

export interface IndexDataPoint {
  date: string;
  value: number;
}

// 指数类型
export type IndexType = 'SHCOMP' | 'ZS2000' | 'ZS500' | 'HS300' | 'ZS1000' | 'ZSA500' | 'ZSHL';

// 指数配置（sinaSymbol 对应新浪财经K线API的symbol参数）
export const INDEX_CONFIG: Record<IndexType, { name: string; color: string; sinaSymbol: string }> = {
  SHCOMP: { name: '上证指数', color: '#F44336', sinaSymbol: 'sh000001' },
  ZS2000: { name: '中证2000', color: '#E91E63', sinaSymbol: 'sz399303' },
  ZS500:  { name: '中证500',  color: '#9C27B0', sinaSymbol: 'sh000905' },
  HS300:  { name: '沪深300',  color: '#00BCD4', sinaSymbol: 'sh000300' },
  ZS1000: { name: '中证1000', color: '#FF9800', sinaSymbol: 'sh000852' },
  ZSA500: { name: '中证A500', color: '#4CAF50', sinaSymbol: 'sh000510' },
  ZSHL:   { name: '中证红利', color: '#795548', sinaSymbol: 'sh000922' },
};

// 计算量纲转换系数（将指数点位映射到万亿量纲）
export function calculateScaleFactor(
  indexData: IndexDataPoint[],
  marketCapData: number[]
): number {
  if (!indexData.length || !marketCapData.length) return 0.001;

  const avgIndex = indexData.reduce((sum, d) => sum + d.value, 0) / indexData.length;
  const avgMarketCap = marketCapData.reduce((sum, v) => sum + v, 0) / marketCapData.length;

  return avgMarketCap / avgIndex;
}
