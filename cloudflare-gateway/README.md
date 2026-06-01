# NovelWriter DeepSeek Gateway

杩欐槸涓€涓?Cloudflare Workers 缃戝叧锛屾敮鎸侊細

- 鐢ㄦ埛娉ㄥ唽 / 鐧诲綍
- 姣忎釜鐢ㄦ埛鐙珛 API Key锛堢敤浜庤皟鐢ㄦā鍨嬶級
- 缁熶竴杞彂鍒?DeepSeek 鎺ュ彛锛堥殣钘忎綘鐨勭湡瀹?`DeepSeek_API_KEY`锛?- 姣忔璇锋眰鐢ㄩ噺璁板綍锛堟ā鍨嬨€乼okens銆佺姸鎬佺爜銆佽€楁椂锛?
## 璺敱

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /auth/api-keys`
- `POST /auth/api-keys`
- `POST /auth/api-keys/:id/revoke`
- `GET /auth/usage?days=7`
- `GET /admin/users` (header: `x-admin-token`)
- `GET /admin/users/:id/usage?days=7` (header: `x-admin-token`)
- `GET /health`
- `/v1/*` 浠ｇ悊鍒?DeepSeek锛堝繀椤诲甫鐢ㄦ埛 API Key锛?
## 1. 瀹夎

```bash
cd cloudflare-gateway
npm install
npx wrangler login
```

## 2. 鍒涘缓 D1 鏁版嵁搴?
```bash
npx wrangler d1 create novelwriter_gateway
```

鍛戒护浼氳繑鍥?`database_id`锛屾妸瀹冨～鍒?`wrangler.jsonc`锛?
```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "novelwriter_gateway",
    "database_id": "杩欓噷鏇挎崲鎴愮湡瀹?ID"
  }
]
```

## 3. 搴旂敤鏁版嵁搴撹縼绉?
```bash
npx wrangler d1 migrations apply novelwriter_gateway --remote
```

## 4. 閰嶇疆 Secrets

璁剧疆浣犺嚜宸辩殑瓒呯畻涓績 key锛堟湇鍔＄绉佹湁锛屼笉涓嬪彂缁欏鎴风锛夛細

```bash
npx wrangler secret put DeepSeek_API_KEY
```

璁剧疆鐧诲綍鎬佺鍚嶅瘑閽ワ紙浠绘剰闀块殢鏈哄瓧绗︿覆锛夛細

```bash
npx wrangler secret put JWT_SECRET
```

璁剧疆绠＄悊鍛樻帴鍙ｄ护鐗岋紙浣犺嚜宸变繚瀛橈級锛?
```bash
npx wrangler secret put ADMIN_TOKEN
```

## 5. 鏈湴璋冭瘯

澶嶅埗 `.dev.vars.example` 涓?`.dev.vars`锛屽～鍏ユ湰鍦板€硷細

```bash
copy .dev.vars.example .dev.vars
npm run dev
```

## 6. 閮ㄧ讲

```bash
npm run deploy
```

## 7. 瀹㈡埛绔皟鐢ㄦ柟寮?
### 7.1 鐢ㄦ埛娉ㄥ唽

`POST /auth/register`

```json
{
  "email": "user@example.com",
  "password": "12345678"
}
```

杩斿洖锛?
- `token`锛氱敤鎴风櫥褰?token锛堢敤浜庣鐞嗘帴鍙ｏ級
- `apiKey`锛氳鐢ㄦ埛榛樿妯″瀷璋冪敤 key锛堢敤浜?`/v1/*`锛?
### 7.2 鐢ㄦ埛鐧诲綍

`POST /auth/login`

```json
{
  "email": "user@example.com",
  "password": "12345678"
}
```

### 7.3 璋冩ā鍨?
鎶婂師鏈?base URL 鏀规垚浣犵殑 Worker锛?
`https://<your-worker>.workers.dev`

璇锋眰 `/v1/chat/completions` 鏃跺甫鐢ㄦ埛 key锛? 閫?1锛夛細

- `Authorization: Bearer nwk_xxx`
- `x-api-key: nwk_xxx`

缃戝叧浼氳嚜鍔ㄤ娇鐢ㄤ綘鐨?`DeepSeek_API_KEY` 鍘昏皟鐢?DeepSeek銆?
## 瀹夊叏璇存槑

- 瀹㈡埛绔笉鍐嶄繚瀛樹綘鐨勬€昏处鍙?`DeepSeek_API_KEY`
- 姣忎釜鐢ㄦ埛鍙嬁鍒拌嚜宸辩殑 `nwk_` key锛屽彲鍗曠嫭鍚婇攢
- 鍙鐢ㄦ埛璁惧鍙鍒?key锛屽氨涓嶈兘鍋氬埌鈥滅粷瀵逛笉鍙牬瑙ｂ€濓紱鐪熸瀹夊叏杈圭晫鍦ㄦ湇鍔＄缃戝叧

