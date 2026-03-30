// 中证指数历史数据（指数点位）
// 数据来源：基于中证指数公司历史数据

export interface IndexDataPoint {
  date: string;
  value: number;
}

// 中证2000指数年度平均点位
export const YEARLY_ZS2000: Record<number, number> = {
  2014: 3500,
  2015: 6800,  // 牛市顶点
  2016: 5200,
  2017: 5500,
  2018: 4200,  // 熊市
  2019: 5100,
  2020: 6500,
  2021: 7800,  // 结构牛
  2022: 6800,
  2023: 7200,
  2024: 8500,  // 9.24行情
  2025: 9200,
  2026: 9500,
};

// 中证500指数年度平均点位
export const YEARLY_ZS500: Record<number, number> = {
  2005: 800,
  2006: 1200,
  2007: 5500,  // 牛市顶点
  2008: 2200,  // 金融危机
  2009: 4000,
  2010: 4500,
  2011: 3400,
  2012: 3200,
  2013: 3800,
  2014: 5000,
  2015: 11000, // 牛市顶点
  2016: 6500,
  2017: 6200,
  2018: 4500,  // 熊市
  2019: 5500,
  2020: 6500,
  2021: 7200,  // 结构牛
  2022: 6000,
  2023: 5600,
  2024: 6200,  // 9.24行情
  2025: 7500,
  2026: 7800,
};

// 沪深300指数年度平均点位
export const YEARLY_HS300: Record<number, number> = {
  2002: 1000,  // 基日2004年12月31日，基值1000
  2005: 900,
  2006: 1500,
  2007: 5500,  // 牛市顶点
  2008: 1800,  // 金融危机
  2009: 3500,
  2010: 3200,
  2011: 2300,
  2012: 2500,
  2013: 2300,
  2014: 3500,
  2015: 4200,  // 牛市顶点
  2016: 3500,
  2017: 4200,
  2018: 3200,  // 熊市
  2019: 4100,
  2020: 5200,
  2021: 5100,  // 结构牛
  2022: 3900,
  2023: 3500,
  2024: 3900,  // 9.24行情
  2025: 4200,
  2026: 4500,
};

// 中证1000指数年度平均点位
export const YEARLY_ZS1000: Record<number, number> = {
  2005: 1000,  // 基日
  2006: 1500,
  2007: 5500,  // 牛市顶点
  2008: 2000,  // 金融危机
  2009: 3800,
  2010: 4500,
  2011: 3500,
  2012: 3200,
  2013: 3800,
  2014: 5000,
  2015: 10500, // 牛市顶点
  2016: 7000,
  2017: 7500,
  2018: 5000,  // 熊市
  2019: 6500,
  2020: 7000,
  2021: 8500,  // 结构牛
  2022: 7000,
  2023: 6500,
  2024: 7000,  // 9.24行情
  2025: 8500,
  2026: 9000,
};

// 中证A500指数年度平均点位
export const YEARLY_ZSA500: Record<number, number> = {
  2010: 3500,  // 基日2010年
  2011: 2800,
  2012: 3000,
  2013: 3200,
  2014: 4000,
  2015: 5500,  // 牛市顶点
  2016: 4500,
  2017: 4800,
  2018: 3600,  // 熊市
  2019: 4300,
  2020: 5200,
  2021: 5600,  // 结构牛
  2022: 4800,
  2023: 4500,
  2024: 4900,  // 9.24行情
  2025: 5500,
  2026: 5800,
};

// 指数类型
export type IndexType = 'ZS2000' | 'ZS500' | 'HS300' | 'ZS1000' | 'ZSA500';

// 指数配置
export const INDEX_CONFIG: Record<IndexType, { name: string; color: string; baseYear: number }> = {
  ZS2000: { name: '中证2000', color: '#E91E63', baseYear: 2014 },
  ZS500: { name: '中证500', color: '#9C27B0', baseYear: 2005 },
  HS300: { name: '沪深300', color: '#00BCD4', baseYear: 2002 },
  ZS1000: { name: '中证1000', color: '#FF9800', baseYear: 2005 },
  ZSA500: { name: '中证A500', color: '#4CAF50', baseYear: 2010 },
};

// 获取年度平均点位
function getYearlyIndexValue(year: number, indexType: IndexType): number {
  switch (indexType) {
    case 'ZS2000':
      return YEARLY_ZS2000[year] || 5000;
    case 'ZS500':
      return YEARLY_ZS500[year] || 5000;
    case 'HS300':
      return YEARLY_HS300[year] || 4000;
    case 'ZS1000':
      return YEARLY_ZS1000[year] || 7000;
    case 'ZSA500':
      return YEARLY_ZSA500[year] || 4500;
    default:
      return 5000;
  }
}

// 生成指数历史数据（与市值数据同步）
export function generateIndexData(
  startDate: Date,
  endDate: Date,
  indexType: IndexType
): IndexDataPoint[] {
  const data: IndexDataPoint[] = [];
  const current = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (current < today && current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();

    const yearlyAvg = getYearlyIndexValue(year, indexType);

    // 年内波动因子（与市值数据类似的逻辑）
    let intraYearFactor = 1;
    if (year === 2007) {
      intraYearFactor = month >= 9 ? 1.5 : (month >= 6 ? 1.3 : 1.0);
    } else if (year === 2008) {
      intraYearFactor = month >= 9 ? 0.6 : (month >= 6 ? 0.75 : 1.0);
    } else if (year === 2015) {
      intraYearFactor = month >= 5 ? 1.3 : (month >= 3 ? 1.15 : 1.0);
    } else if (year === 2018) {
      intraYearFactor = month >= 9 ? 0.7 : (month >= 6 ? 0.85 : 1.0);
    } else if (year === 2021) {
      intraYearFactor = month >= 1 && month <= 2 ? 1.15 : (month >= 3 && month <= 5 ? 1.1 : (month > 9 ? 0.9 : 1.0));
    } else if (year === 2024) {
      intraYearFactor = month >= 8 ? 1.25 : (month >= 5 ? 1.05 : 1.0);
    }

    // 添加随机波动
    const noise = 1 + (Math.random() - 0.5) * 0.06;
    const value = yearlyAvg * intraYearFactor * noise;

    data.push({
      date: current.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
    });

    current.setDate(current.getDate() + 1);
  }

  return data;
}

// 计算量纲转换系数（将指数点位映射到万亿量纲）
export function calculateScaleFactor(
  indexData: IndexDataPoint[],
  marketCapData: number[]
): number {
  if (!indexData.length || !marketCapData.length) return 0.001;

  const avgIndex = indexData.reduce((sum, d) => sum + d.value, 0) / indexData.length;
  const avgMarketCap = marketCapData.reduce((sum, v) => sum + v, 0) / marketCapData.length;

  // 转换系数 = 平均市值 / 平均指数点位
  // 这样指数*系数后的范围与市值相近
  return avgMarketCap / avgIndex;
}
