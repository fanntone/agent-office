# AI 辦公室

把這台電腦上正在工作的 AI 畫成一間 2.5D 辦公室裡的小人物：每個 Claude Code 對話是一個人，
用本機 [Strata](https://github.com/Niko1221/Strata) 模型的 agent 也是，Strata 伺服器本身則是機櫃旁的機器人。
人物會走回座位打字、托腮思考、去咖啡區等你回覆、趴桌睡覺，新來的從門口走進來。

只在本機跑（`127.0.0.1`），不連外網，不需要安裝任何套件。

## 需要

- **Node.js 18 以上**
- **[Claude Code](https://claude.com/claude-code)**：人物來自它寫在 `~/.claude/projects/` 的對話紀錄（只讀，不改）。
- Strata 不是必要的：沒在跑時，機器人顯示「沒開機」。模型名稱含 `qwen` 的對話會畫成 Strata 人物，其他畫成 Claude。

## 用法

| | Windows | macOS / Linux |
|---|---|---|
| 開（背景啟動並開瀏覽器） | 雙擊 `start-office.cmd` | `npm start` |
| 關 | 雙擊 `stop-office.cmd` | `npm run stop` |

- 網址：http://127.0.0.1:4317 ；示範模式（假角色輪流換狀態）：http://127.0.0.1:4317/?demo
- 點人物或機器人，右邊會出現它的卡片和最近 10 個動作；點空白處或按 Esc 關掉。
- 換 port：設環境變數 `PORT`。Strata 不在預設位址時設 `STRATA_URL`（預設 `http://127.0.0.1:8080`）。

## 人物會做什麼

| 狀態 | 動作 |
|---|---|
| 🔧 用工具 | 坐在自己桌前打字，螢幕亮著 |
| 💭 思考 | 坐在桌前托腮 |
| ❗ 等你回覆 | 去咖啡區拿杯子閒晃 |
| 💤 10 分鐘沒動作 | 趴在桌上打瞌睡 |
| 新出現／離開 | 從門口走進來／走出去 |

只顯示最近一小時有動作的 agent。畫面上只有工具名和短摘要（例如 `Bash：Run tests`），不顯示對話內容。

## 開發

- `npm test`：全部測試（資料解析、平面圖與尋路、人物模擬、卡片內容、頁面接線、真實 HTTP 端到端、啟動器）。
- `node tools/screenshot.js <out.png> [寬] [高] [網址] [等待毫秒]`：用 headless Edge 截圖看畫面（Windows）。
- 規格在 `SPEC.md`。

## 授權

MIT，見 [LICENSE](LICENSE)。
