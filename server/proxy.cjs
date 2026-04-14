const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
app.use(cors());

// 通用HTTP GET请求封装（带超时）
function httpGet(url, options = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.substring(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ============================================================
// 数据源1: 上海证券交易所官方API
// 返回: { TOTAL_VALUE: 总市值(亿元), NEGO_VALUE: 流通市值(亿元), ... }
// ============================================================
function getSSEMarketSummary() {
  const url = 'http://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_SJ_GPSJ_GPSJZM_TJSJ_L&PRODUCT_NAME=%E8%82%A1%E7%A5%A8,%E4%B8%BB%E6%9D%BF,%E7%A7%91%E5%88%9B%E6%9D%BF&type=inParams';
  return httpGet(url, {
    headers: {
      'Referer': 'http://www.sse.com.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  }).then(json => {
    // result 是 { "0": {...股票总计}, "1": {...主板}, "2": {...科创板} }
    const stockTotal = json.result['0'];
    return {
      totalValue: parseFloat(stockTotal.TOTAL_VALUE) * 1e8,  // 亿元 -> 元
      flowValue: parseFloat(stockTotal.NEGO_VALUE) * 1e8,
      stockCount: parseInt(stockTotal.LIST_COM_NUM),
      tradeDate: stockTotal.TRADE_DATE,
    };
  });
}

// ============================================================
// 数据源2: 深圳证券交易所官方API
// 返回: 证券类别统计，包含 股票 总市值
// 自动回退到最近的交易日（当天可能没有数据）
// ============================================================
function getSZSEMarketSummary() {
  // 尝试最近5个日期，找到有数据的交易日
  const tryDates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    tryDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  return tryDates.reduce((promise, dateStr) => {
    return promise.catch(async () => {
      const url = `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1803_sczm&TABKEY=tab1&txtQueryDate=${dateStr}&random=${Math.random()}`;
      const json = await httpGet(url, {
        headers: {
          'Referer': 'https://www.szse.cn/market/overview/index.html',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });

      const rows = json[0]?.data;
      if (!rows || rows.length === 0) throw new Error('SZSE: 无数据 ' + dateStr);

      const stockRow = rows.find(r => r.lbmc.trim() === '股票');
      if (!stockRow) throw new Error('SZSE: 未找到股票行 ' + dateStr);

      return {
        totalValue: parseFloat(stockRow.sjzz.replace(/,/g, '')) * 1e8,
        flowValue: parseFloat(stockRow.ltsz.replace(/,/g, '')) * 1e8,
        stockCount: parseInt(stockRow.zqsl),
      };
    });
  }, Promise.reject(new Error('start')));
}

// ============================================================
// 数据源3: 东方财富push2 API（备用）
// ============================================================
function getEMIndexMarketCap(secid) {
  const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f116,f117&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2`;
  return httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    }
  }).then(json => json.data).catch(() => null);
}

// 获取A股总市值 - 优先使用官方交易所API
async function getTotalAMarketCap() {
  let shData = null;
  let szData = null;

  // 尝试获取上海数据
  try {
    shData = await getSSEMarketSummary();
    console.log(`[MarketCap] SSE: ${(shData.totalValue / 1e12).toFixed(2)}万亿, ${shData.stockCount}只, 日期:${shData.tradeDate}`);
  } catch (e) {
    console.log('[MarketCap] SSE失败:', e.message);
  }

  // 尝试获取深圳数据
  try {
    szData = await getSZSEMarketSummary();
    console.log(`[MarketCap] SZSE: ${(szData.totalValue / 1e12).toFixed(2)}万亿, ${szData.stockCount}只`);
  } catch (e) {
    console.log('[MarketCap] SZSE失败:', e.message);
  }

  // 如果官方API都成功
  if (shData && szData) {
    // 北交所市值通过东方财富获取（北交所没有方便的官方API）
    let bjTotal = 0;
    let bjFlow = 0;
    try {
      const bj = await getEMIndexMarketCap('0.899050');
      if (bj && bj.f116 && bj.f116 > 0) {
        bjTotal = bj.f116;
        bjFlow = bj.f117 || 0;
        console.log(`[MarketCap] BJ via EM: ${(bjTotal / 1e12).toFixed(2)}万亿`);
      }
    } catch (e) {
      console.log('[MarketCap] BJ via EM失败:', e.message);
    }

    return {
      total: shData.totalValue + szData.totalValue + bjTotal,
      flow: shData.flowValue + szData.flowValue + bjFlow,
      source: 'official_exchange',
      breakdown: {
        sh: { name: '沪市', total: shData.totalValue, flow: shData.flowValue, stockCount: shData.stockCount },
        sz: { name: '深市', total: szData.totalValue, flow: szData.flowValue, stockCount: szData.stockCount },
        bj: { name: '北证', total: bjTotal, flow: bjFlow },
      },
    };
  }

  // 降级: 使用东方财富指数API
  console.log('[MarketCap] 降级到东方财富API');
  try {
    const [sh, sz, bj] = await Promise.all([
      getEMIndexMarketCap('1.000001'),
      getEMIndexMarketCap('0.399106'),
      getEMIndexMarketCap('0.899050'),
    ]);

    const shTotal = sh?.f116 || 0;
    const szTotal = sz?.f116 || 0;
    const bjTotal = bj?.f116 || 0;
    const total = shTotal + szTotal + bjTotal;

    return {
      total,
      flow: (sh?.f117 || 0) + (sz?.f117 || 0) + (bj?.f117 || 0),
      source: 'eastmoney_fallback',
      breakdown: {
        sh: { name: '沪市', total: shTotal },
        sz: { name: '深市', total: szTotal },
        bj: { name: '北证', total: bjTotal },
      },
    };
  } catch (e) {
    throw new Error('所有数据源均失败: ' + e.message);
  }
}

// 搜索股票（A股+港股）- 使用东方财富智能提示API
function searchStock(keyword) {
  return new Promise((resolve, reject) => {
    const encodedKeyword = encodeURIComponent(keyword);

    const options = {
      hostname: 'searchapi.eastmoney.com',
      path: `/api/suggest/get?input=${encodedKeyword}&type=14&count=20&_=${Date.now()}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://quote.eastmoney.com/',
        'Accept': '*/*',
        'Connection': 'keep-alive',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const allData = json.QuotationCodeTable?.Data || [];

          // 转换并标记市场类型
          const results = allData.map(item => {
            const market = String(item.MarketType);
            let isAshare = false;
            let marketType = '';

            // 判断市场类型
            // 0=深圳主板, 1=上海, 2=创业板(深圳), 100=北京, 5=港股
            if (market === '0' || market === '2') {
              isAshare = true;
              marketType = market === '2' ? '创业板' : '深圳A股';
            } else if (market === '1') {
              isAshare = true;
              marketType = '上海A股';
            } else if (market === '100') {
              isAshare = true;
              marketType = '北京A股';
            } else if (market === '5') {
              marketType = '港股';
            } else {
              marketType = item.SecurityTypeName || '其他';
            }

            return {
              code: item.Code,
              name: item.Name,
              market: item.MarketType,
              secid: item.QuoteID || `${market}.${item.Code}`,
              type: marketType,
              isAshare: isAshare
            };
          });

          // 只返回A股和港股，过滤掉指数、基金、债券等
          const validResults = results.filter(r =>
            r.isAshare || String(r.market) === '5'
          );
          resolve(validResults);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);

    req.end();
  });
}

// 获取股票历史K线数据
// A股使用新浪财经API，港股使用东方财富K线API
function getStockKline(secid, market, code, limit = 500) {
  // 港股：secid 以 116. 开头，使用东方财富K线API
  if (String(secid).startsWith('116.')) {
    return getHKStockKline(secid, code, limit);
  }

  // A股：使用新浪财经K线API
  return getAStockKline(secid, market, code, limit);
}

// A股K线数据 - 新浪财经API
function getAStockKline(secid, market, code, limit = 500) {
  return new Promise((resolve, reject) => {
    // 转换市场类型：创业板(2) -> 深圳(sz), 上海(sh)
    const actualMarket = String(market) === '2' || String(market) === '0' ? 'sz' : 'sh';
    const actualSecid = `${actualMarket}${code}`;

    // 使用新浪财经K线API
    const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${actualSecid}&scale=240&ma=5&datalen=${limit}`;

    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const klines = Array.isArray(json) ? json : [];

          // 解析K线数据并转换格式
          const parsed = klines.map(k => ({
            date: k.day,
            open: parseFloat(k.open),
            close: parseFloat(k.close),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            volume: parseFloat(k.volume),
            amount: 0,
            amplitude: 0,
            changePercent: 0,
            changeAmount: 0,
            turnover: 0,
          }));

          resolve({
            name: '',
            code: code,
            market: String(market) === '2' ? '0' : String(market),
            secid: `${String(market) === '2' ? '0' : String(market)}.${code}`,
            klines: parsed
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 港股K线数据 - 东方财富K线API
function getHKStockKline(secid, code, limit = 500) {
  const url = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${limit}&ut=fa5fd1943c7b386f172d6893dbfba10b`;

  return httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    }
  }).then(json => {
    const klines = json.data?.klines || [];

    // 解析K线数据：date,open,close,high,low,volume,amount
    const parsed = klines.map(k => {
      const parts = k.split(',');
      return {
        date: parts[0],
        open: parseFloat(parts[1]),
        close: parseFloat(parts[2]),
        high: parseFloat(parts[3]),
        low: parseFloat(parts[4]),
        volume: parseFloat(parts[5]),
        amount: parseFloat(parts[6]),
        amplitude: 0,
        changePercent: 0,
        changeAmount: 0,
        turnover: 0,
      };
    });

    return {
      name: json.data?.name || '',
      code: code,
      market: 5,
      secid: secid,
      klines: parsed
    };
  });
}

// 获取股票实时数据（包含PE）
// A股价格需/100，港股价格直接是元
function getStockRealtime(secid) {
  return new Promise((resolve, reject) => {
    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f170,f171,f177,f20,f21,f162,f163,f164,f167&ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2`;
    http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://quote.eastmoney.com/',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const d = json.data;
          // 港股 secid 以 116. 开头，价格直接是元；A股价格需除以100
          const isHK = String(secid).startsWith('116.');
          const divisor = isHK ? 1 : 100;
          // PE: f163=PE(TTM), f164=PE(静态), f162=PE(动态)
          const peTTM = d?.f163 && d.f163 !== '-' ? parseFloat(d.f163) : 0;
          const peStatic = d?.f164 && d.f164 !== '-' ? parseFloat(d.f164) : 0;
          const pe = peTTM || peStatic || 0;
          resolve({
            code: d?.f57,
            name: d?.f58,
            price: d?.f43 ? d.f43 / divisor : 0,
            change: d?.f170 ? d.f170 / divisor : 0,
            changePercent: d?.f171 ? d.f171 / 100 : 0,
            pe: pe,
            pb: d?.f167 && d.f167 !== '-' ? parseFloat(d.f167) : 0,
            marketCap: d?.f20 && d.f20 !== '-' ? d.f20 / 1e8 : 0,
            floatCap: d?.f21 && d.f21 !== '-' ? d.f21 / 1e8 : 0,
            high: d?.f44 ? d.f44 / divisor : 0,
            low: d?.f45 ? d.f45 / divisor : 0,
            volume: d?.f47 || 0,
            amount: d?.f48 || 0,
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// API: 获取实时总市值
app.get('/api/total-market-cap', async (req, res) => {
  try {
    const result = await getTotalAMarketCap();
    const bd = result.breakdown || {};

    res.json({
      success: true,
      data: {
        total: (result.total / 1e12).toFixed(2),
        flow: (result.flow / 1e12).toFixed(2),
        source: result.source,
        sh: { name: '沪市', total: ((bd.sh?.total || 0) / 1e12).toFixed(2), stockCount: bd.sh?.stockCount },
        sz: { name: '深市', total: ((bd.sz?.total || 0) / 1e12).toFixed(2), stockCount: bd.sz?.stockCount },
        bj: { name: '北证', total: ((bd.bj?.total || 0) / 1e12).toFixed(2) },
        timestamp: new Date().toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 搜索股票
app.get('/api/stock/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.json({ success: false, error: '请输入搜索关键词' });
    }
    const results = await searchStock(keyword);
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 获取股票历史数据
app.get('/api/stock/kline', async (req, res) => {
  try {
    const { secid, code, market, limit = 500 } = req.query;
    if (!secid) {
      return res.json({ success: false, error: '缺少secid参数' });
    }
    const data = await getStockKline(secid, market, code, parseInt(limit));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 获取股票实时数据
app.get('/api/stock/realtime', async (req, res) => {
  try {
    const { secid } = req.query;
    if (!secid) {
      return res.json({ success: false, error: '缺少secid参数' });
    }
    const data = await getStockRealtime(secid);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================
// 指数K线数据 - 优先新浪财经API，备选东方财富push2his
// ============================================================
const INDEX_EM_SECID = {
  'sh000922': '1.000922',  // 中证红利：新浪数据异常，用东方财富
};

function getIndexKline(symbol, limit = 500) {
  // 检查是否需要直接走东方财富
  const emSecid = INDEX_EM_SECID[symbol];
  if (emSecid) {
    return getIndexKlineFromEM(emSecid, limit);
  }

  // 默认走新浪
  return getIndexKlineFromSina(symbol, limit).then(data => {
    // 新浪数据不足时，尝试东方财富补充
    if (data.length < Math.min(limit, 10)) {
      const emSecid2 = sinaToEMSecid(symbol);
      if (emSecid2) {
        console.log(`[IndexKline] ${symbol} 新浪数据不足(${data.length})，尝试东方财富`);
        return getIndexKlineFromEM(emSecid2, limit).catch(() => data);
      }
    }
    return data;
  });
}

// 新浪 -> 东方财富 secid 转换
function sinaToEMSecid(symbol) {
  const map = {
    'sh000001': '1.000001', 'sh000300': '1.000300', 'sh000905': '1.000905',
    'sh000922': '1.000922', 'sh000852': '1.000852', 'sh000510': '1.000510',
    'sz399303': '0.399303', 'sz399106': '0.399106',
  };
  return map[symbol] || null;
}

// 新浪财经K线
function getIndexKlineFromSina(symbol, limit) {
  const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&datalen=${limit}`;
  return httpGet(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  }).then(json => {
    const klines = Array.isArray(json) ? json : [];
    return klines.map(k => ({
      date: k.day,
      close: parseFloat(k.close),
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      volume: parseFloat(k.volume),
    }));
  }).catch(() => []);
}

// 东方财富K线（备选）
function getIndexKlineFromEM(secid, limit) {
  const url = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${limit}&ut=fa5fd1943c7b386f172d6893dbfba10b`;
  return httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/',
    }
  }).then(json => {
    const klines = json.data?.klines || [];
    return klines.map(k => {
      const p = k.split(',');
      return { date: p[0], open: parseFloat(p[1]), close: parseFloat(p[2]), high: parseFloat(p[3]), low: parseFloat(p[4]), volume: parseFloat(p[5]) };
    });
  });
}

// ============================================================
// 市值历史数据 - 基于真实指数数据回算
// ============================================================
async function getMarketCapHistory(limit = 500) {
  // 1. 获取当前真实总市值（SH/SZ/BJ 分项）
  let currentMCap;
  try {
    currentMCap = await getTotalAMarketCap();
  } catch (e) {
    throw new Error('获取当前市值失败: ' + e.message);
  }

  const currentSH = (currentMCap.breakdown?.sh?.total || 0) / 1e12; // 万亿
  const currentSZ = (currentMCap.breakdown?.sz?.total || 0) / 1e12;
  const currentBJ = (currentMCap.breakdown?.bj?.total || 0) / 1e12;

  // 2. 获取上证指数和深证综指的真实K线
  const [shKline, szKline] = await Promise.all([
    getIndexKline('sh000001', limit),
    getIndexKline('sz399106', limit),
  ]);

  if (!shKline.length || !szKline.length) {
    throw new Error('指数K线数据为空');
  }

  // 3. 最新交易日的指数收盘价（作为基准）
  const latestSH = shKline[shKline.length - 1].close;
  const latestSZ = szKline[szKline.length - 1].close;

  // 4. 构建日期->收盘价映射
  const szMap = new Map(szKline.map(k => [k.date, k.close]));

  // 5. 按日期计算历史市值
  const result = [];
  for (const sh of shKline) {
    const szClose = szMap.get(sh.date);
    if (!szClose) continue; // 只保留两个市场都有数据的日期

    const shRatio = sh.close / latestSH;
    const szRatio = szClose / latestSZ;
    const avgRatio = (shRatio + szRatio) / 2;

    const totalValue = currentSH * shRatio + currentSZ * szRatio + currentBJ * avgRatio;

    // GDP: 取当年值（简化处理）
    const year = parseInt(sh.date.substring(0, 4));
    const gdp = getGDPForYear(year);

    result.push({
      date: sh.date,
      totalValue: Math.round(totalValue * 100) / 100,
      gdp: gdp,
      ratio: gdp > 0 ? Math.round((totalValue / gdp) * 10000) / 10000 : 0,
    });
  }

  return result;
}

// GDP年度数据（万亿元，用于服务端计算）
const GDP_BY_YEAR = {
  2000: 10.0, 2001: 11.0, 2002: 12.0, 2003: 13.6, 2004: 16.0,
  2005: 18.5, 2006: 21.9, 2007: 27.0, 2008: 32.0, 2009: 34.9,
  2010: 41.2, 2011: 48.9, 2012: 54.0, 2013: 59.3, 2014: 64.4,
  2015: 68.9, 2016: 74.4, 2017: 83.2, 2018: 91.9, 2019: 98.7,
  2020: 101.6, 2021: 114.4, 2022: 121.0, 2023: 126.1, 2024: 134.9,
  2025: 134.9, 2026: 134.9 * 1.05,
};

function getGDPForYear(year) {
  return GDP_BY_YEAR[year] || (year >= 2026 ? 134.9 * Math.pow(1.05, year - 2025) : 50);
}

// API: 获取指数K线
app.get('/api/index/kline', async (req, res) => {
  try {
    const { symbol, limit = 500 } = req.query;
    if (!symbol) {
      return res.json({ success: false, error: '缺少symbol参数' });
    }
    const data = await getIndexKline(symbol, parseInt(limit));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 获取市值历史数据
app.get('/api/market-cap/history', async (req, res) => {
  try {
    const { limit = 500 } = req.query;
    const data = await getMarketCapHistory(parseInt(limit));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Market API server running on http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /api/total-market-cap`);
  console.log(`  GET /api/market-cap/history?limit=500`);
  console.log(`  GET /api/index/kline?symbol=sh000001&limit=500`);
  console.log(`  GET /api/stock/search?keyword=xxx`);
  console.log(`  GET /api/stock/kline?secid=x.xxxxxx&limit=500`);
  console.log(`  GET /api/stock/realtime?secid=x.xxxxxx`);
});
