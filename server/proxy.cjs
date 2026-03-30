const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());

// 获取东方财富指数总市值
function getIndexMarketCap(secid) {
  return new Promise((resolve, reject) => {
    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f116,f117&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
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
              secidPrefix = market; // 创业板也是2开头
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
    // 返回格式: [{"day":"2025-10-29","open":"386.000","high":"400.040","low":"384.700","close":"400.000","volume":"34474046"}, ...]
    const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${actualSecid}&scale=240&ma=5&datalen=${limit}`;

    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // 新浪API返回的是JSON格式但不标准，需要处理
          const json = JSON.parse(data);
          const klines = Array.isArray(json) ? json : [];

          // 解析K线数据并转换格式
          const parsed = klines.map(k => ({
            date: k.day,  // 日期格式: YYYY-MM-DD
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
    // f9=市盈率(动态), f23=市净率, f20=总市值, f21=流通市值
    const url = `http://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f170,f171,f177,f20,f21,f23,f9&ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const d = json.data;
          resolve({
            code: d?.f57,           // 股票代码
            name: d?.f58,           // 股票名称
            price: d?.f43 ? d.f43 / 100 : 0,        // 当前价格 (需要除以100)
            change: d?.f170 ? d.f170 / 100 : 0,     // 涨跌额
            changePercent: d?.f171 ? d.f171 / 100 : 0, // 涨跌幅
            pe: d?.f9 || 0,         // 市盈率(动态)
            pb: d?.f23 ? d.f23 / 100 : 0,           // 市净率
            marketCap: d?.f20 ? d.f20 / 1e8 : 0,    // 总市值(亿元)
            floatCap: d?.f21 ? d.f21 / 1e8 : 0,     // 流通市值(亿元)
            high: d?.f44 ? d.f44 / 100 : 0,         // 最高价
            low: d?.f45 ? d.f45 / 100 : 0,          // 最低价
            volume: d?.f47 || 0,    // 成交量
            amount: d?.f48 || 0,    // 成交额
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
    const sh = await getIndexMarketCap('1.000001'); // 上证
    const sz = await getIndexMarketCap('0.399001');  // 深证

    const totalCap = ((sh?.f116 || 0) + (sz?.f116 || 0)) / 1e12; // 转为万亿
    const flowCap = ((sh?.f117 || 0) + (sz?.f117 || 0)) / 1e12;

    res.json({
      success: true,
      data: {
        total: totalCap.toFixed(2),
        flow: flowCap.toFixed(2),
        sh: { code: sh?.f57, name: sh?.f58, total: ((sh?.f116 || 0) / 1e12).toFixed(2) },
        sz: { code: sz?.f57, name: sz?.f58, total: ((sz?.f116 || 0) / 1e12).toFixed(2) },
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
