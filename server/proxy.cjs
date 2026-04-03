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
// ============================================================
function getSZSEMarketSummary() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const url = `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1803_sczm&TABKEY=tab1&txtQueryDate=${dateStr}&random=${Math.random()}`;
  return httpGet(url, {
    headers: {
      'Referer': 'https://www.szse.cn/market/overview/index.html',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    }
  }).then(json => {
    // json 是数组，json[0].data 是各行数据
    const rows = json[0].data;
    // 找"股票"行（不含缩进的顶层行）
    const stockRow = rows.find(r => r.lbmc.trim() === '股票');
    if (!stockRow) throw new Error('SZSE: 未找到股票行');

    return {
      totalValue: parseFloat(stockRow.sjzz.replace(/,/g, '')) * 1e8,  // 亿元 -> 元
      flowValue: parseFloat(stockRow.ltsz.replace(/,/g, '')) * 1e8,
      stockCount: parseInt(stockRow.zqsl),
    };
  });
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

// 搜索股票（A股专用）- 使用东方财富智能提示API
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

          // 转换并标记A股
          const results = allData.map(item => {
            const market = String(item.MarketType);
            let isAshare = false;
            let marketType = '';
            let secidPrefix = market;

            // 判断市场类型
            // 0=深圳主板, 1=上海, 2=创业板(深圳), 100=北京, 5=港股
            if (market === '0' || market === '2') {
              isAshare = true;
              marketType = market === '2' ? '创业板' : '深圳A股';
              secidPrefix = market;
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
              secid: `${secidPrefix}.${item.Code}`,
              type: marketType,
              isAshare: isAshare
            };
          });

          // 优先返回A股，如果没有A股则返回全部
          const ashares = results.filter(r => r.isAshare);
          resolve(ashares.length > 0 ? ashares : results);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);

    req.end();
  });
}

// 获取股票历史K线数据 - 使用新浪财经API
function getStockKline(secid, market, code, limit = 500) {
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

// 获取股票实时数据（包含PE）
function getStockRealtime(secid) {
  return new Promise((resolve, reject) => {
    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f170,f171,f177,f20,f21,f23,f9&ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2`;
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
          resolve({
            code: d?.f57,
            name: d?.f58,
            price: d?.f43 ? d.f43 / 100 : 0,
            change: d?.f170 ? d.f170 / 100 : 0,
            changePercent: d?.f171 ? d.f171 / 100 : 0,
            pe: d?.f9 || 0,
            pb: d?.f23 ? d.f23 / 100 : 0,
            marketCap: d?.f20 ? d.f20 / 1e8 : 0,
            floatCap: d?.f21 ? d.f21 / 1e8 : 0,
            high: d?.f44 ? d.f44 / 100 : 0,
            low: d?.f45 ? d.f45 / 100 : 0,
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Market API server running on http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /api/total-market-cap`);
  console.log(`  GET /api/stock/search?keyword=xxx`);
  console.log(`  GET /api/stock/kline?secid=x.xxxxxx&limit=500`);
  console.log(`  GET /api/stock/realtime?secid=x.xxxxxx`);
});
