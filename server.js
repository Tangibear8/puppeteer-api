import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// 首頁
app.get('/', (req, res) => {
  res.json({
    message: 'Puppeteer API for ChatGPT Conversation Fetching',
    status: 'running',
    usage: 'POST /api/fetch-chatgpt with { "shareUrl": "https://chatgpt.com/share/..." }'
  });
});

// API 端點
app.post('/api/fetch-chatgpt', async (req, res) => {
  const { shareUrl } = req.body;

  if (!shareUrl || !shareUrl.includes('chatgpt.com/share/')) {
    return res.status(400).json({ error: '請提供有效的 ChatGPT 分享連結' });
  }

  let browser;
  try {
    console.log('[Puppeteer API] 正在啟動瀏覽器...');
    
    // 啟動 Puppeteer（完整版）
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    
    // 設定 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 隱藏 webdriver 特徵
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });
    
    console.log(`[Puppeteer API] 正在載入頁面: ${shareUrl}`);
    
    // 前往分享頁面
    await page.goto(shareUrl, { 
      waitUntil: 'networkidle2',
      timeout: 90000
    });
    
    console.log('[Puppeteer API] 頁面載入完成，等待渲染...');
    
    // 等待 data-message-author-role 元素出現
    console.log('[Puppeteer API] 等待對話元素載入...');
    try {
      await page.waitForSelector('[data-message-author-role="assistant"]', { timeout: 20000 });
      console.log('[Puppeteer API] 找到 assistant 訊息');
    } catch (e) {
      console.log('[Puppeteer API] 無法找到 assistant 訊息，嘗試繼續...');
    }
    
    // 等待 5 秒確保所有元素都載入完成
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('[Puppeteer API] 等待完成，開始提取對話...');
    
    // 執行 JavaScript 提取對話內容
    console.log('[Puppeteer API] 正在提取對話內容...');
    const conversationData = await page.evaluate(() => {
      const messages = [];
      const debug = {
        totalElements: 0,
        userElements: 0,
        assistantElements: 0
      };
      
      // 提取標題
      const titleElement = document.querySelector('h1, title');
      const title = titleElement ? titleElement.textContent.trim() : 'Untitled Conversation';
      
      // 提取對話訊息（使用更精確的 selector）
      const messageElements = document.querySelectorAll('[data-message-author-role]');
      
      debug.totalElements = messageElements.length;
      
      messageElements.forEach((el) => {
        // 從 data attribute 中提取角色
        const role = el.getAttribute('data-message-author-role');
        
        if (role === 'user') {
          debug.userElements++;
        } else if (role === 'assistant') {
          debug.assistantElements++;
        }
        
        // 只提取實際對話內容，過濾掉標籤
        // 嘗試多種方式提取內容
        let content = '';
        
        // 方法1：尋找內容區域
        const contentDiv = el.querySelector('[data-message-content], .markdown, .prose');
        if (contentDiv) {
          content = contentDiv.textContent.trim();
        } else {
          // 方法2：直接使用元素內容
          content = el.textContent.trim();
        }
        
        // 過濾掉標籤和空白
        content = content
          .replace(/^(ChatGPT said:|You said:)\s*/i, '')  // 移除標籤
          .replace(/^(ChatGPT|You)\s*:?\s*/i, '')  // 移除角色名稱
          .trim();
        
        // 只保留有實際內容的訊息
        if (content && content.length > 5 && 
            !content.match(/^(ChatGPT said|You said):?$/i)) {
          messages.push({
            role: role,
            content: content
          });
        }
      });
      
      return { messages, title, debug };
    });
    
    console.log(`[Puppeteer API] 提取到 ${conversationData.messages.length} 則訊息`);
    console.log(`[Puppeteer API] 標題: ${conversationData.title}`);
    console.log(`[Puppeteer API] Debug: ${JSON.stringify(conversationData.debug)}`);
    
    await browser.close();
    
    // 回傳對話資料
    res.status(200).json({
      success: true,
      messages: conversationData.messages,
      title: conversationData.title,
      debug: conversationData.debug,
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
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`🚀 Puppeteer API 正在運行於 port ${PORT}`);
});
