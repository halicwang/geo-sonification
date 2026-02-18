# 项目规则

修改完不要自动 git commit + git push。

# 项目概述

交互式地图声化工具：前端 Mapbox 地图 → Node.js 服务器（WebSocket）→ 通过 OSC 协议发送地理数据到 Max/MSP 进行声音合成。数据为当前快照（now-only），无历史时间序列。

# 技术栈

- 前端：原生 HTML/CSS/JS + Mapbox GL JS（无框架）
- 后端：Node.js + Express，测试用 Jest
- 通信：WebSocket（端口 3001）+ OSC/UDP（端口 7400 → Max/MSP）
- 数据源：Google Earth Engine 导出的 CSV → PMTiles 矢量瓦片

# 常用命令

- `npm start` — 启动服务器
- `npm run dev` — 开发模式（自动重启）
- `npm test` — 运行测试
- `npm run check:csv` — 检查 CSV 数据格式
- `npm run clean:cache` — 清除缓存

# 项目结构

- `frontend/` — 前端（Mapbox 地图 UI），纯静态文件由 server 托管
- `server/` — Node.js 后端，处理 WebSocket、OSC、数据聚合
- `data/` — 地理数据（CSV 原始数据 + 缓存）
- `gee/` — Google Earth Engine 导出脚本
- `sonification/` — Max/MSP patch
- `scripts/` — 辅助脚本

# 核心架构

- 双模式 OSC：视口内网格数 ≤50 时切换到 per-grid 模式（每个网格独立发送 OSC），否则为 aggregated 模式（发送聚合统计）。阈值通过 .env 配置，带迟滞防抖。
- 前端无构建步骤，直接编辑 `frontend/` 下的文件即可。

# 注意事项

- `.env` 和 `frontend/config.local.js` 含敏感配置，不要提交到 git
