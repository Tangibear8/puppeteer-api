import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
  // 設定 CORS 標頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 處理 OPTIONS 請求（preflight）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 支援 GET 和 POST 請求
  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'Puppeteer API for ChatGPT Conversation Fetching',
      status: 'running',
      usage: 'POST /api/fetch-chatgpt with { "shareUrl": "https://chatgpt.com/share/..." }'
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shareUrl } = req.body;

  // 支援兩種網址格式：chatgpt.com 和 chat.openai.com
  const isValidUrl = shareUrl && (
    shareUrl.includes('chatgpt.com/share/') || 
    shareUrl.includes('chat.openai.com/share/')
  );
  
  if (!isValidUrl) {
    return res.status(400).json({ error: '請提供有效的 ChatGPT 分享連結' });
  }

  let browser;
  try {
    console.log('[Puppeteer API] 正在啟動瀏覽器...');
    
    // 關閉 WebGL （可能會影響渲染）
    chromium.setGraphicsMode = false;
    
    // 啟動 Puppeteer with Serverless Chromium
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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
    
    // 滾動到頁面底部（觸發懶載入）
    console.log('[Puppeteer API] 滾動到頁面底部...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 滾動回頂部
    console.log('[Puppeteer API] 滾動回頂部...');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    
    // 再等待 10 秒確保所有元素都載入完成
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('[Puppeteer API] 等待完成，開始提取對話...');
    
    // 執行 JavaScript 提取對話內容
    console.log('[Puppeteer API] 正在提取對話內容...');
    
    const conversationData = await page.evaluate(() => {
      const messages = [];
      let title = '';
      
      // 提取標題
      const titleEl = document.querySelector('title');
      if (titleEl) {
        title = titleEl.textContent.replace('ChatGPT - ', '').trim();
      }
      
      // Debug: 輸出所有可能的選擇器
      const allElements = document.querySelectorAll('[data-message-author-role]');
      const userElements = document.querySelectorAll('[data-message-author-role="user"]');
      const assistantElements = document.querySelectorAll('[data-message-author-role="assistant"]');
      
      const debug = {
        'total': allElements.length,
        'user': userElements.length,
        'assistant': assistantElements.length,
        'data-message-id': document.querySelectorAll('[data-message-id]').length,
        'article': document.querySelectorAll('article').length,
        '.group': document.querySelectorAll('.group').length,
        'sampleAssistantText': assistantElements.length > 0 ? assistantElements[0].textContent.substring(0, 100) : null
      };
      
      // 提取對話訊息（使用更精確的 selector）
      const messageElements = document.querySelectorAll('[data-message-author-role]');
      
      // 如果沒有找到，嘗試其他選擇器
      if (messageElements.length === 0) {
        console.log('No elements with data-message-author-role, trying alternatives...');
        const altElements = document.querySelectorAll('[data-message-id]');
        if (altElements.length > 0) {
          return { messages: [], title, debug, error: 'Found data-message-id elements but no data-message-author-role' };
        }
      }
      
      messageElements.forEach((el) => {
        // 從 data attribute 中提取角色
        const role = el.getAttribute('data-message-author-role');
        
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
    
    await browser.close();
    
    // 回傳對話資料
    res.status(200).json({
      success: true,
      messages: conversationData.messages,
      title: conversationData.title,
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
