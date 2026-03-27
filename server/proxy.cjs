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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Market API server running on http://localhost:${PORT}`);
});
