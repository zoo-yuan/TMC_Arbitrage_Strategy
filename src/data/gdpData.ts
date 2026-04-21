// 中国GDP数据（单位：万亿元人民币）
// 2026年为预估：2025年GDP * (1 + 5%) ≈ 140万亿
export interface GDPData {
  year: number;
  gdp: number; // 万亿元人民币
  isEstimate?: boolean;
}

export const gdpData: GDPData[] = [
  { year: 2000, gdp: 10.0 },
  { year: 2001, gdp: 11.0 },
  { year: 2002, gdp: 12.0 },
  { year: 2003, gdp: 13.6 },
  { year: 2004, gdp: 16.0 },
  { year: 2005, gdp: 18.5 },
  { year: 2006, gdp: 21.9 },
  { year: 2007, gdp: 27.0 },
  { year: 2008, gdp: 32.0 },
  { year: 2009, gdp: 34.9 },
  { year: 2010, gdp: 41.2 },
  { year: 2011, gdp: 48.9 },
  { year: 2012, gdp: 54.0 },
  { year: 2013, gdp: 59.3 },
  { year: 2014, gdp: 64.4 },
  { year: 2015, gdp: 68.9 },
  { year: 2016, gdp: 74.4 },
  { year: 2017, gdp: 83.2 },
  { year: 2018, gdp: 91.9 },
  { year: 2019, gdp: 98.7 },
  { year: 2020, gdp: 101.6 },
  { year: 2021, gdp: 114.4 },
  { year: 2022, gdp: 121.0 },
  { year: 2023, gdp: 126.1 },
  { year: 2024, gdp: 134.9 },
  { year: 2025, gdp: 134.9 * 1.05, isEstimate: true }, // 2024年GDP × 1.05 ≈ 141.6
  { year: 2026, gdp: 134.9 * 1.05 * 1.05, isEstimate: true }, // 按年增5%估算
];

export function getGDPByYear(year: number): GDPData | undefined {
  return gdpData.find(d => d.year === year);
}

export function getGDPForDate(date: Date): number {
  const year = date.getFullYear();
  const data = getGDPByYear(year);
  if (data) return data.gdp;

  // 对于未知年份，使用线性插值或外推
  const sortedData = [...gdpData].sort((a, b) => a.year - b.year);
  if (year < sortedData[0].year) return sortedData[0].gdp;
  if (year > sortedData[sortedData.length - 1].year) {
    const lastData = sortedData[sortedData.length - 1];
    const growthRate = 1.05; // 默认增长率
    return lastData.gdp * Math.pow(growthRate, year - lastData.year);
  }
  return sortedData[sortedData.length - 1].gdp;
}

// GDP比例系数
export const GDP_RATIOS = [0.3, 0.5, 0.6, 0.8, 1.0, 1.17];

export const GDP_RATIO_COLORS: Record<number, string> = {
  0.3: '#91CC75',
  0.5: '#FAC858',
  0.6: '#EE6666',
  0.8: '#FC8452',
  1.0: '#FF6B6B',
  1.17: '#9A60B4',
};
