import React, { useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { MarketDataPoint } from '../hooks/useMarketData';
import { GDP_RATIOS, calculateScaleFactor, INDEX_CONFIG, type IndexType } from '../hooks/useMarketData';
import { GDP_RATIO_COLORS } from '../data/gdpData';
import type { SelectedStock } from '../hooks/useStockData';
import { calculateStockScaleFactor } from '../hooks/useStockData';

interface MarketValueChartProps {
  data: MarketDataPoint[];
  selectedIndices: IndexType[];
  selectedStocks?: SelectedStock[];
}

export const MarketValueChart: React.FC<MarketValueChartProps> = ({ data, selectedIndices, selectedStocks = [] }) => {
  const getOption = useCallback(() => {
    if (!data.length) return {};

    // 按日期排序
    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const dates = sortedData.map(d => d.date);
    const marketValues = sortedData.map(d => d.totalValue);

    // 计算指数的量纲转换系数
    const indexScaleFactors: Record<IndexType, number> = {
      ZS2000: 1,
      ZS500: 1,
      HS300: 1,
      ZS1000: 1,
      ZSA500: 1,
    };

    for (const idx of selectedIndices) {
      const indexValues = sortedData
        .map(d => d.indexValues?.[idx])
        .filter((v): v is number => v !== undefined);

      if (indexValues.length > 0) {
        indexScaleFactors[idx] = calculateScaleFactor(
          indexValues.map((v, i) => ({ date: dates[i], value: v })),
          marketValues
        );
      }
    }

    // 计算股票的量纲转换系数
    const stockScaleFactors: Record<string, { price: number; pe: number }> = {};
    for (const stock of selectedStocks) {
      const prices = stock.klines.map(k => k.close);
      const pes = stock.klines.map(k => {
        // 估算PE: 假设每股收益相对稳定，PE = 价格 / 每股收益
        // 这里简化处理，使用价格与平均价格的比值来估算相对PE变化
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const pe = stock.realtime?.pe || 20;
        return pe * (k.close / avgPrice);
      });

      stockScaleFactors[stock.info.secid] = {
        price: calculateStockScaleFactor(prices, marketValues),
        pe: calculateStockScaleFactor(pes.filter(p => p > 0), marketValues) * 0.5, // PE量纲更小
      };
    }

    // 构建系列数据
    const series: any[] = [
      {
        name: '总市值',
        type: 'line',
        data: marketValues,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#5470C6',
          width: 2,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(84, 112, 198, 0.3)' },
              { offset: 1, color: 'rgba(84, 112, 198, 0.05)' },
            ],
          },
        },
        z: 10,
      },
      ...GDP_RATIOS.map(ratio => ({
        name: `${ratio}×GDP`,
        type: 'line' as const,
        data: sortedData.map(d => d.gdp * ratio),
        smooth: false,
        symbol: 'none',
        lineStyle: {
          color: GDP_RATIO_COLORS[ratio],
          type: ratio === 1.0 ? ('dashed' as const) : ('solid' as const),
          width: 1,
          opacity: 0.7,
        },
        z: 1,
      })),
    ];

    // 添加指数系列（使用右Y轴1）
    for (const idx of selectedIndices) {
      const config = INDEX_CONFIG[idx];
      const scaleFactor = indexScaleFactors[idx];
      const indexData = sortedData.map(d => ({
        value: d.indexValues?.[idx] ? d.indexValues[idx]! * scaleFactor : null,
        originalValue: d.indexValues?.[idx],
      }));

      series.push({
        name: config.name,
        type: 'line',
        yAxisIndex: 1,
        data: indexData.map(d => d.value),
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: config.color,
          width: 2,
        },
        z: 5,
      });
    }

    // 添加股票系列
    for (const stock of selectedStocks) {
      const scaleFactor = stockScaleFactors[stock.info.secid];

      // 准备股票的日期-价格映射
      const priceMap = new Map(stock.klines.map(k => [k.date, k.close]));
      const peMap = new Map(stock.klines.map(k => {
        const avgPrice = stock.klines.reduce((sum, kk) => sum + kk.close, 0) / stock.klines.length;
        const basePE = stock.realtime?.pe || 20;
        const estimatedPE = basePE * (k.close / avgPrice);
        return [k.date, estimatedPE];
      }));

      // 股票价格线（使用右Y轴2）
      const stockPriceData = dates.map(date => {
        const price = priceMap.get(date);
        return price ? price * scaleFactor.price : null;
      });

      series.push({
        name: `${stock.info.name}(价)`,
        type: 'line',
        yAxisIndex: selectedIndices.length > 0 ? 2 : 1,
        data: stockPriceData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: stock.color,
          width: 2,
        },
        z: 8,
      });

      // 股票PE线（使用右Y轴3）
      const stockPEData = dates.map(date => {
        const pe = peMap.get(date);
        return pe ? pe * scaleFactor.pe : null;
      });

      series.push({
        name: `${stock.info.name}(PE)`,
        type: 'line',
        yAxisIndex: selectedIndices.length > 0 ? 3 : 2,
        data: stockPEData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: stock.color,
          width: 1,
          type: 'dashed',
          opacity: 0.8,
        },
        z: 7,
      });
    }

    // 构建legend数据
    const legendData = [
      '总市值',
      ...GDP_RATIOS.map(r => `${r}×GDP`),
      ...selectedIndices.map(idx => INDEX_CONFIG[idx].name),
      ...selectedStocks.flatMap(s => [`${s.info.name}(价)`, `${s.info.name}(PE)`]),
    ];

    // 构建Y轴配置
    const yAxis: any[] = [
      // 左Y轴：市值（万亿元）
      {
        type: 'value',
        name: '市值（万亿）',
        nameTextStyle: {
          fontSize: 11,
        },
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => value.toFixed(0),
        },
        splitLine: {
          lineStyle: {
            color: '#eee',
          },
        },
      },
    ];

    // 右Y轴1：指数点位
    if (selectedIndices.length > 0) {
      yAxis.push({
        type: 'value',
        name: '指数',
        nameTextStyle: {
          fontSize: 11,
        },
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => value.toFixed(0),
        },
        splitLine: {
          show: false,
        },
      });
    }

    // 右Y轴2：股价
    if (selectedStocks.length > 0) {
      yAxis.push({
        type: 'value',
        name: '股价',
        nameTextStyle: {
          fontSize: 11,
        },
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => value.toFixed(0),
        },
        splitLine: {
          show: false,
        },
      });

      // 右Y轴3：PE
      yAxis.push({
        type: 'value',
        name: 'PE',
        nameTextStyle: {
          fontSize: 11,
        },
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => value.toFixed(0),
        },
        splitLine: {
          show: false,
        },
      });
    }

    return {
      backgroundColor: '#ffffff',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        borderWidth: 1,
        textStyle: {
          color: '#333',
          fontSize: 12,
        },
        formatter: (params: any[]) => {
          const date = params[0]?.axisValue;
          if (!date) return '';

          const dataIndex = params[0]?.dataIndex;
          const marketData = sortedData[dataIndex];
          if (!marketData) return '';

          const ratio = (marketData.totalValue / marketData.gdp * 100).toFixed(2);

          let html = `<div style="font-weight: bold; margin-bottom: 8px;">${date}</div>`;
          html += `<div style="margin: 4px 0;">总市值: <span style="color: #5470C6; font-weight: bold;">${marketData.totalValue.toFixed(2)} 万亿</span></div>`;
          html += `<div style="margin: 4px 0;">当年GDP: <span style="color: #666;">${marketData.gdp.toFixed(2)} 万亿</span></div>`;
          html += `<div style="margin: 4px 0;">实时比例: <span style="color: #EE6666; font-weight: bold;">${ratio}%</span></div>`;

          // 添加指数信息
          for (const idx of selectedIndices) {
            const config = INDEX_CONFIG[idx];
            const indexValue = marketData.indexValues?.[idx];
            if (indexValue !== undefined) {
              html += `<div style="margin: 4px 0;">${config.name}: <span style="color: ${config.color}; font-weight: bold;">${indexValue.toFixed(2)}</span></div>`;
            }
          }

          // 添加股票信息
          for (const stock of selectedStocks) {
            const priceMap = new Map(stock.klines.map(k => [k.date, k.close]));
            const price = priceMap.get(date);
            if (price !== undefined) {
              const avgPrice = stock.klines.reduce((sum, k) => sum + k.close, 0) / stock.klines.length;
              const basePE = stock.realtime?.pe || 20;
              const estimatedPE = basePE * (price / avgPrice);
              html += `<div style="margin: 4px 0;">${stock.info.name}: <span style="color: ${stock.color}; font-weight: bold;">¥${price.toFixed(2)}</span> <span style="color: ${stock.color}; opacity: 0.7;">PE:${estimatedPE.toFixed(1)}</span></div>`;
            }
          }

          return html;
        },
      },
      legend: {
        show: true,
        top: 10,
        textStyle: {
          fontSize: 11,
        },
        data: legendData,
      },
      grid: {
        left: 60,
        right: selectedStocks.length > 0 ? 140 : (selectedIndices.length > 0 ? 80 : 60),
        top: 50,
        bottom: 60,
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: {
          fontSize: 11,
          rotate: 45,
          formatter: (value: string) => {
            const date = new Date(value);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          },
        },
        axisLine: {
          lineStyle: {
            color: '#ddd',
          },
        },
      },
      yAxis,
      series,
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          show: true,
          start: 0,
          end: 100,
          height: 20,
          bottom: 10,
        },
      ],
    };
  }, [data, selectedIndices, selectedStocks]);

  return (
    <div className="w-full h-full min-h-[500px]">
      <ReactECharts
        option={getOption()}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </div>
  );
};
