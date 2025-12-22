import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  // 只接受 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shareUrl } = req.body;

  if (!shareUrl || !shareUrl.includes('chatgpt.com/share/')) {
    return res.status(400).json({ error: '請提供有效的 ChatGPT 分享連結' });
  }

  let browser;
  try {
    console.log('[Puppeteer API] 正在啟動瀏覽器...');
    
    // 啟動 Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // 設定 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`[Puppeteer API] 正在載入頁面: ${shareUrl}`);
    
    // 前往分享頁面
    await page.goto(shareUrl, { 
      waitUntil: 'networkidle2',
      timeout: 90000
    });
    
    console.log('[Puppeteer API] 頁面載入完成，等待渲染...');
    
    // 等待頁面完全載入
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 獲取渲染後的 HTML
    const html = await page.content();
    
    console.log(`[Puppeteer API] HTML 長度: ${html.length} 字元`);
    
    await browser.close();
    
    // 回傳 HTML
    res.status(200).json({
      success: true,
      html,
      shareUrl
    });

  } catch (error) {
    console.error('[Puppeteer API] 錯誤:', error);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({
      error: '抓取頁面失敗',
      message: error.message
    });
  }
}
