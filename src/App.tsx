import { useState, useCallback, useEffect } from 'react';
import { MarketValueChart } from './components/MarketValueChart';
import { useMarketData, useRealtimeMarketCap, GDP_RATIOS, type IndexType } from './hooks/useMarketData';
import { GDP_RATIO_COLORS } from './data/gdpData';
import { INDEX_CONFIG } from './data/indexData';
import { useStockSearch, useSelectedStocks, type StockInfo } from './hooks/useStockData';
import './index.css';

type Period = '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'ALL' | 'CUSTOM';

const PERIODS: { value: Period; label: string }[] = [
  { value: '1M', label: '近1月' },
  { value: '6M', label: '近6月' },
  { value: '1Y', label: '近1年' },
  { value: '3Y', label: '近3年' },
  { value: '5Y', label: '近5年' },
  { value: '10Y', label: '近10年' },
  { value: 'ALL', label: '全历史' },
  { value: 'CUSTOM', label: '自定义' },
];

const AVAILABLE_INDICES: IndexType[] = ['SHCOMP', 'ZS2000', 'ZS500', 'ZS1000', 'HS300', 'ZSA500', 'ZSHL'];

function App() {
  const [period, setPeriod] = useState<Period>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('2024-01-01');
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedIndices, setSelectedIndices] = useState<IndexType[]>([]);

  // 股票搜索
  const [stockKeyword, setStockKeyword] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const { results: stockResults, loading: stockLoading, search } = useStockSearch();
  const { stocks: selectedStocks, addStock, removeStock } = useSelectedStocks();

  // 构建自定义时间范围
  const customRange = period === 'CUSTOM' ? {
    start: new Date(customStartDate),
    end: new Date(customEndDate),
  } : undefined;

  const data = useMarketData(period, customRange, selectedIndices);
  const { realtimeCap, loading, error } = useRealtimeMarketCap();

  const latestData = data[data.length - 1];
  const currentRatio = latestData ? (latestData.totalValue / latestData.gdp * 100).toFixed(2) : '0';

  // 处理指数选择
  const toggleIndex = (index: IndexType) => {
    setSelectedIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  // 股票搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stockKeyword.trim()) {
        search(stockKeyword);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [stockKeyword, search]);

  // 选择股票
  const handleSelectStock = useCallback(async (stock: StockInfo) => {
    await addStock(stock);
    setStockKeyword('');
    setShowSearchResults(false);
  }, [addStock]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">A股总市值与GDP比值</h1>
              <p className="text-sm text-gray-500 mt-1">China A-Share Market Cap / GDP Ratio</p>
            </div>
            <div className="text-right">
              {loading ? (
                <div className="text-sm text-gray-500">加载中...</div>
              ) : error ? (
                <div className="text-sm text-red-500">数据加载失败</div>
              ) : (
                <>
                  <div className="text-sm text-gray-500">实时比值</div>
                  <div className="text-3xl font-bold text-blue-600">{currentRatio}%</div>
                  <div className="text-xs text-gray-400 mt-1">
                    总市值: {latestData?.totalValue.toFixed(2)}万亿 | GDP: {latestData?.gdp.toFixed(2)}万亿
                    {realtimeCap && (
                      <span className="ml-2 text-green-500">● 实时</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Period Selector */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600 mr-2">周期:</span>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 自定义时间选择 */}
          {period === 'CUSTOM' && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <span className="text-sm text-gray-600">时间区间:</span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">开始:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-gray-400">-</span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">结束:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Index Selector */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-gray-600">叠加指数:</span>
            {AVAILABLE_INDICES.map(idx => {
              const config = INDEX_CONFIG[idx];
              const isSelected = selectedIndices.includes(idx);
              return (
                <label
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                    isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleIndex(idx)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: isSelected ? config.color : '#666' }}
                  >
                    {config.name}
                  </span>
                </label>
              );
            })}
            <span className="text-xs text-gray-400 ml-2">（指数点位将自动量纲转换以匹配市值曲线）</span>
          </div>
        </div>
      </div>

      {/* Stock Selector */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">叠加个股:</span>
              <div className="relative">
                <input
                  type="text"
                  value={stockKeyword}
                  onChange={(e) => {
                    setStockKeyword(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  placeholder="输入股票代码或名称..."
                  className="w-64 px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* 搜索结果下拉框 */}
                {showSearchResults && stockKeyword.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 overflow-auto">
                    {stockLoading ? (
                      <div className="px-3 py-2 text-sm text-gray-500">搜索中...</div>
                    ) : stockResults.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">未找到相关股票</div>
                    ) : (
                      stockResults.map((stock) => (
                        <button
                          key={stock.secid}
                          onClick={() => handleSelectStock(stock)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{stock.name}</span>
                            <span className="text-xs text-gray-500">{stock.code}</span>
                          </div>
                          <div className="text-xs text-gray-400">{stock.type}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400">（股价和PE将自动量纲转换以匹配市值曲线）</span>
            </div>

            {/* 已选股票列表 */}
            {selectedStocks.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap pt-2 border-t">
                <span className="text-sm text-gray-500">已选:</span>
                {selectedStocks.map((stock) => (
                  <div
                    key={stock.info.secid}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm"
                    style={{ backgroundColor: `${stock.color}20`, border: `1px solid ${stock.color}` }}
                  >
                    <span className="font-medium" style={{ color: stock.color }}>
                      {stock.info.name}
                    </span>
                    {stock.realtime && (
                      <span className="text-xs text-gray-600">
                        {stock.info.isAshare === false ? 'HK$' : '¥'}{stock.realtime.price.toFixed(2)} | PE:{stock.realtime.pe.toFixed(1)}
                      </span>
                    )}
                    <button
                      onClick={() => removeStock(stock.info.secid)}
                      className="ml-1 text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-blue-500 rounded"></div>
              <span className="text-gray-600">总市值</span>
            </div>
            {GDP_RATIOS.map(ratio => (
              <div key={ratio} className="flex items-center gap-1.5">
                <div
                  className="w-4 h-0.5 rounded"
                  style={{
                    borderStyle: ratio === 1.0 ? 'dashed' : 'solid',
                    borderWidth: '1px',
                    borderColor: GDP_RATIO_COLORS[ratio],
                  }}
                ></div>
                <span className="text-gray-600">{ratio}×GDP</span>
              </div>
            ))}
            {selectedIndices.map(idx => (
              <div key={idx} className="flex items-center gap-1.5">
                <div
                  className="w-4 h-0.5 rounded"
                  style={{ backgroundColor: INDEX_CONFIG[idx].color }}
                ></div>
                <span className="text-gray-600">{INDEX_CONFIG[idx].name}</span>
              </div>
            ))}
            {selectedStocks.map(stock => (
              <div key={stock.info.secid} className="flex items-center gap-1.5">
                <div
                  className="w-4 h-0.5 rounded"
                  style={{ backgroundColor: stock.color }}
                ></div>
                <span className="text-gray-600">{stock.info.name}(价)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow p-4" style={{ height: '600px' }}>
          <MarketValueChart
            data={data}
            selectedIndices={selectedIndices}
            selectedStocks={selectedStocks}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 py-4">
        数据来源: 上交所+深交所官方接口(实时) + 东方财富(北证) | 2026年GDP为预估（2025年GDP × 1.05）
        {selectedIndices.length > 0 && ' | 指数数据为模拟历史数据'}
      </footer>
    </div>
  );
}

export default App;
