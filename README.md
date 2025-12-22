# Puppeteer API for ChatGPT Conversation Fetching

這是一個獨立的 Puppeteer API 服務，用於抓取 ChatGPT 分享連結的對話內容。

## 部署到 Vercel

1. 安裝 Vercel CLI：
```bash
pnpm add -g vercel
```

2. 登入 Vercel：
```bash
vercel login
```

3. 部署：
```bash
vercel --prod
```

## API 使用方式

### POST /api/fetch-chatgpt

**請求：**
```json
{
  "shareUrl": "https://chatgpt.com/share/xxxxx"
}
```

**回應：**
```json
{
  "success": true,
  "html": "...",
  "shareUrl": "https://chatgpt.com/share/xxxxx"
}
```

## 本地測試

```bash
vercel dev
```

然後訪問 http://localhost:3000/api/fetch-chatgpt
