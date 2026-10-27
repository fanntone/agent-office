# AI 辦公室 — 規格

一個只在本機跑的網頁：把正在工作的 AI（Claude Code 的對話、Strata 的 agent、Strata 伺服器本身）
畫成辦公室裡的可愛人物，一眼看出誰在做什麼。

## 資料來源（都在本機，唯讀）

1. **對話紀錄**：`~/.claude/projects/<資料夾>/<sessionId>.jsonl`。Claude Code 與 claude-local（Strata agent）
   每做一步就寫一行 JSON。我們只讀，不寫。
   subagent 各自一個檔：`<資料夾>/<sessionId>/subagents/agent-<agentId>.jsonl`（workflow 開的再深一兩層，
   在 `subagents/workflows/<id>/` 底下），旁邊的 `agent-<agentId>.meta.json` 做完時會有 `"finished": true`。
2. **Strata 伺服器**：`GET {STRATA_URL}/metrics`，看 `live.state` 等欄位。

## 一行紀錄長這樣（只列會用到的欄位）

```json
{"type":"assistant","timestamp":"2026-10-27T02:25:55.926Z","cwd":"C:\\Users\\you\\Desktop\\五子棋",
 "sessionId":"527d12f4-...","message":{"model":"claude-opus-5-5","content":[{"type":"tool_use","name":"Bash","input":{"command":"npm test","description":"Run tests"}}]}}
{"type":"user","timestamp":"...","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"...","content":"..."}]}}
{"type":"user","timestamp":"...","message":{"role":"user","content":"幫我加音效"}}
```

`type` 不是 `user` / `assistant` 的行（例如 `summary`、`system`、`file-history-snapshot`）一律略過。
`message.content` 可能是字串，也可能是陣列；狀態看陣列的**最後一個**元素。

## lib/agents.js（純函式，不碰檔案與網路）

### `kindOf(model)` → `'claude'` | `'strata'`
model 含 `qwen`（不分大小寫）→ `'strata'`，其他（包含沒有 model）→ `'claude'`。

### `summarize(toolName, input)` → 字串
依序取第一個有值的：`input.description`、`input.file_path` 的檔名（只要最後一段）、`input.pattern`、
`input.command`、`input.url`。都沒有就回空字串。超過 40 個字元截斷為前 40 個字元加 `…`。

### `describe(entry)` → `{ state, activity }`，entry 是**最後一筆** user/assistant 行
| 最後一筆 | state | activity |
|---|---|---|
| assistant，最後內容是 `tool_use` | `tool` | `{工具名}：{summarize}`（summarize 為空時只有 `{工具名}`） |
| assistant，最後內容是 `thinking` | `thinking` | `思考中` |
| assistant，最後內容是 `text` | `waiting` | `等你回覆` |
| user，最後內容是 `tool_result` | `thinking` | `看工具結果` |
| user，內容是字串或 `text` | `thinking` | `收到新訊息` |

### `parseSession(lines, now)` → agent 物件或 `null`
`lines` 是 JSON 字串陣列（第一行可能是被截斷的半行：解析失敗的行一律略過）。`now` 是毫秒時間戳。
沒有任何 user/assistant 行 → `null`。回傳：

```js
{
  id,            // 有頂層 agentId 的（subagent）用 agentId；否則用 sessionId（取最後一筆有它的行）。
                 // subagent 每行的 sessionId 是父對話的，不能拿來當 id
  kind,          // kindOf(最後一筆有 model 的 assistant 行的 model)
  model,         // 那個 model 字串，沒有就是 null
  project,       // cwd 的最後一段資料夾名（最後一筆有 cwd 的行），沒有就是 null
  lastAt,        // 最後一筆 user/assistant 行的 timestamp，轉成毫秒
  state,         // describe 的結果；但 now - lastAt > 10 分鐘 → 'sleeping'，activity 改成 '睡著了'
  activity,
  recent,        // 最近 10 個動作，新的在前：[{ at: 毫秒, text: describe(該行).activity }]，
                 // 只算 assistant 的 tool_use 行與 user 的字串訊息行（「收到新訊息」）
}
```

### `serverState(metrics)` → `{ state, activity, gpuTemp }`
`metrics` 是 `/metrics` 的 JSON，連不上時傳 `null`。
| 條件 | state | activity |
|---|---|---|
| `metrics` 是 null | `offline` | `沒開機` |
| `live.queued > 0` | `queued` | `排隊 {queued} 個` |
| `live.state === 'reading'` 且有 `prompt_total` | `reading` | `讀 prompt {四捨五入的百分比}%` |
| `live.state === 'reading'` 沒有 `prompt_total` | `reading` | `讀 prompt` |
| `live.state === 'generating'` 且 `tok_s` 是數字 | `generating` | `寫字中 {tok_s 取一位小數} tok/s` |
| `live.state === 'generating'` 沒有 `tok_s`（剛開始寫，還沒有速度） | `generating` | `寫字中` |
| 其他 | `idle` | `待命` |
`gpuTemp` = `metrics.hardware.gpu_temp`，沒有就是 `null`。

## lib/scan.js

### `scan(projectsDir, now, readTailBytes = 262144)` → agent 陣列
- 列出 `projectsDir` 底下每個子資料夾裡的 `*.jsonl`，以及每個 `<子資料夾>/<名字>/subagents/` 底下（含更深的資料夾）的 `*.jsonl`。
- subagent 的 `.meta.json` 寫著 `finished: true` → 不算（人物走出門）；沒有 meta 檔或沒寫 → 還在工作。
- 只看修改時間在 `now` 往前 60 分鐘內的檔案。
- 每個檔案只讀**最後** `readTailBytes` 個位元組，切成行交給 `parseSession`。
- 去掉 `null`，依 `lastAt` 新到舊排序。
- `projectsDir` 不存在 → 回空陣列。
- 讀不到的項目**跳過，不讓整個掃描失敗**：列出後才被刪掉的檔案或資料夾（`ENOENT`）、不是資料夾的路徑（`ENOTDIR`）、名字是 `*.jsonl`
  的資料夾（`EISDIR`）、沒權限（`EACCES`、`EPERM`）。其他錯誤照常拋出。

## server.js

- 環境變數：`PORT`（預設 4317，`0` = 隨機）、`CLAUDE_PROJECTS_DIR`（預設 `~/.claude/projects`）、
  `STRATA_URL`（預設 `http://127.0.0.1:8080`）。
- 只綁 `127.0.0.1`。啟動後在 stdout 印一行：`listening on http://127.0.0.1:{實際 port}`。
- `GET /api/agents` → `{ at, agents: scan(...), server: serverState(metrics) }`。
  `metrics` 用 `fetch` 取，逾時 1 秒；失敗就當 `null`。
- `GET /api/stream` → Server-Sent Events，每秒送一次 `data: {同 /api/agents 的 JSON}\n\n`。
- 其他 `GET` → 送 `public/` 底下的檔案（`/` = `index.html`）；路徑不得跑出 `public/`；找不到 → 404。
- 只用 Node 內建模組，不裝任何套件。

## 辦公室畫面

2.5D 等角（isometric）的可愛辦公室，畫在一張 canvas 上；人物、家具、牆面全部由程式畫，不用圖片、字型或外部函式庫。
參考 Pixel Agents 的概念（每個 agent 一個會動的人物），畫面是原創的。

| 檔案 | 內容 |
|---|---|
| `public/world.js` | 平面圖：16×12 格、9 張辦公桌與座位、家具佔的格子、門、機器人位置、咖啡區等候點、懶骨頭；等角座標 `toScreen`；廣度優先尋路 `findPath` |
| `public/sim.js` | `Office`：`update(/api/agents 的 JSON)` 給每個人目標，`step(秒)` 讓人物沿路走過去；`assignSeats` |
| `public/draw.js` | 由遠到近畫地板、牆、家具、人物，最後畫泡泡 |
| `public/main.js` | 接 `/api/stream`（或 `?demo` 的示範角色），每一格動畫呼叫 `step` 與 `draw` |

### 誰去哪裡
| 狀態 | 去處 | 姿勢 |
|---|---|---|
| `tool` / `thinking` | 自己的桌子 | 坐著（`workPose`）：`tool` 打字（雙手輪流敲筆電、頭跟著點、程式碼小條從螢幕飄出）；Read／Grep／Glob／WebFetch／WebSearch 等查資料的工具改成雙手拿一張紙在胸前看；`thinking` 托腮加思考泡泡 |
| `sleeping` | 自己的桌子 | 趴桌打瞌睡、飄 Zzz |
| `waiting` | 咖啡區的空位 | 站著拿杯子，每 6–12 秒換到另一個空位（會走動） |
| 從資料消失 | 走到門口後消失 | — |
| 沒有桌子的（第 10 個以後） | 工作中 → 咖啡區；睡著 → 懶骨頭 | — |

- 座位用 `assignSeats`：上次在的保留原座位、新來的拿最小空位、離開的讓出。人物不會因排序變動換位子。
- **頁面剛打開時**每個人直接出現在該在的位置；之後才出現的人從門口走進來。
- 等候點、懶骨頭同一時間只給一個人；回座位時要讓出。
- 走路只走空格子，繞開家具；速度 2.4 格/秒。
- Strata 伺服器是機櫃旁的機器人：天線燈、機櫃燈號、臉上的眼睛隨 `server.state` 變化。

### 畫面
- 每個人頭上一個泡泡：第一行是名字（`Claude · {project}` / `Strata · {project}`，用該角色的顏色），第二行是圖示加 `activity`。
  名字放在泡泡裡、不放腳下，避免被下一排的泡泡蓋住。泡泡由遠到近畫。
- 機器人的泡泡放在機櫃頂上（牆面高度），不跟辦公桌的泡泡搶位置。
- 人物：大頭、圓臉、黑點眼睛、腮紅；Claude 是橘色連帽衣加星形髮夾，Strata 是青綠上衣加三層條紋帽。
  外表依 id（`lookOf`）：5 種膚色、6 種髮色、4 種髮型（齊瀏海／旁分／長髮／包頭）、四分之一的人戴眼鏡；同一個 id 永遠長一樣。
- 每張桌子：一台筆電、抽屜，加兩樣小物（`deskItems(桌號)`）：桌子左端依桌號輪流馬克杯／盆栽／一疊書／筆筒，
  右端每兩張桌換一樣：小鴨／甜甜圈／仙人掌／便利貼。
- 筆電在座位的正前方：人物是面向畫面正下方畫的，在這個格子上就是 +x 與 +y 各一半，所以筆電放在桌面中間偏右
  （不是座位 +y 的正對面），螢幕朝人、矮的上蓋朝觀眾，不會擋到臉。坐著的人與椅子往桌子挪 0.25 格。
  椅子跟人一樣用正面畫：椅背置中在身體後面、坐墊在身體下、一根中柱加圓底座，藍灰色（不跟兩種角色撞色）。
  坐著也畫大腿：桌子後緣在畫面上是斜的，身體右下方會露出一截，沒腿就像浮在空中。
  打字與看紙的手臂由桌子畫（畫在筆電底座與上蓋之間），因為桌子在人前面，人自己畫的手會被桌子蓋住。
- 跟著資料變的東西：坐著的人在用工具時筆電上蓋的燈與上緣發藍光、思考時發黃光、趴睡時不亮；
  白板三條長條是正在工作／等你回覆／睡著的人數（`tally`，每人一格）；有人在等你回覆時咖啡機上的杯子冒蒸氣。
- 房間像一個立體模型：地板前緣與牆的頂面、斷面畫出厚度；牆下半有護牆板。地板分區：工作區是交錯接縫的木條地板，
  咖啡區（x ≥ 12、y ≤ 5）是磁磚，休息區是有滾邊的地毯。牆上有白板、軟木板便利貼、掛畫、時鐘、咖啡區的黑板。
- 窗外是城市天際線，天色依瀏覽器的現在時間（`skyAt(小時)`）：6 點 dawn、7–16 點 day、17–18 點 dusk、其他 night；
  白天有雲飄過，晚上有星星、大樓窗戶亮燈。
- canvas 依視窗等比縮放（扣掉頁首、頁尾與內距），沒有水平捲軸。

### 點人物看卡片（`public/panel.js`）
- 點人物或機器人（`Draw.hit`：點到的身體範圍內最靠近觀眾的那個）→ 右側卡片；窄螢幕時在底部。
- 人物卡：名字、狀態、正在做什麼、模型、上次動作多久前、最近 10 個動作（時間 HH:MM:SS＋文字，新的在前）。
- 機器人卡：狀態、正在做什麼、GPU 溫度。
- 卡片跟著即時資料更新；那個人離開辦公室時卡片自動關掉。點空白處、✕ 或 Esc 關掉。
- 被選中的人泡泡變金色粗框，腳下有金色光圈（坐著時光圈會被桌子擋住，所以泡泡也要標）。
- `?select=<id>` 或 `?select=robot` 打開頁面就選好（截圖用）。

### 啟動器（`tools/office.js`、`start-office.cmd`、`stop-office.cmd`）
- `start`：`/api/agents` 沒回應就以背景隱藏程序啟動 `server.js`（關掉命令視窗也繼續跑），pid 記在
  `%TEMP%/agent-office-{port}.pid`，等它回應後印 `started at {網址} (pid N)`；已經在跑就印 `already running at {網址}`。
  最後開瀏覽器（`OFFICE_NO_BROWSER=1` 時不開）。
- `stop`：沒在跑 → `not running`；有 pid 就結束它並等到不再回應 → `stopped`；
  有回應但不是這個工具啟動的 → 報錯，不亂殺。

### server.js
`/api/agents` 的 `Content-Type` 是 `application/json; charset=utf-8`。

## 隱私

畫面上只出現：工具名、`summarize` 的短摘要、資料夾名、模型名、時間。**不顯示對話內容**。
