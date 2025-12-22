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

  if (!shareUrl || !shareUrl.includes('chatgpt.com/share/')) {
    return res.status(400).json({ error: '請提供有效的 ChatGPT 分享連結' });
  }

  let browser;
  try {
    console.log('[Puppeteer API] 正在啟動瀏覽器...');
    
    // 啟動 Puppeteer with Serverless Chromium
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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
    
    // 嘗試等待對話元素出現
    try {
      await page.waitForSelector('article, [data-testid], .group', { timeout: 10000 });
      console.log('[Puppeteer API] 找到對話元素');
    } catch (e) {
      console.log('[Puppeteer API] 無法找到對話元素，繼續等待...');
    }
    
    // 延長等待時間到 10 秒
    await new Promise(resolve => setTimeout(resolve, 10000));
    
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
      
      // 提取對話訊息（使用更精確的 selector）
      const messageElements = document.querySelectorAll('[data-message-author-role]');
      
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
      
      return { messages, title };
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
