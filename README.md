# XUSUO交换机

AI 公益站 · 鸡蛋羊毛汇总 —— 一个纯静态的公益站/中转站分享网站，分享实测可用的 AI 中转站（注册送额度、每日签到领蛋）与好用的开源工具。

> 在线预览：https://danjack85.github.io/xusuo-switch/

## 特性

- 🗂️ 卡片式站点清单：站名 / 域名 / 可用模型 / 注册额度 / 每日签到 / 注册要求 / 使用反馈，一目了然
- 🔍 关键词搜索 + 模型 / 注册方式筛选
- 🌗 深色模式（跟随系统，可手动切换，自动记忆）
- 📋 一键复制注册链接（页面内链接含邀请参数，卡片上有标注）
- 📱 响应式布局，桌面 / 移动端均可正常浏览
- ⚠️ 内置「先读这一段」与风险提示区块

## 本地运行

纯静态站点，无需构建，直接双击 `index.html` 即可；或起一个本地服务：

```bash
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 实时状态抓取

站点状态与模型列表由 GitHub Actions 定时抓取（每 3 小时，`.github/workflows/fetch-status.yml`）：

1. `scripts/fetch_status.py` 从 `assets/data.js` 解析站点清单，探测各站 `/api/status` 与 `/api/pricing`；
2. 结果写入 `assets/live.json` 并自动提交，Pages 随之更新；
3. 前端加载 `live.json`，在卡片上叠加「在线 / 暂不可达 / 多次不可达 / 拦截」实时徽章；抓到公开模型报价时以实时列表替换静态标签。

状态含义：`online` 接口正常响应；`blocked` 被防护墙拦截无法验证；`unreachable` 超时/连接失败（连续 ≥4 次显示「多次不可达」）。任一探测网络 12 小时内见过在线则延续在线结论（AgentRouter 主站对海外探测入口返回着陆页，由备用入口 `ps.air-outer.com` 探测）。手动触发：仓库 Actions 页运行「抓取公益站状态」。本地手动抓取：`python scripts/fetch_status.py > live.tmp.json && mv live.tmp.json assets/live.json`（注意不能直接重定向覆盖 live.json，脚本要先读它做合并）。

## 修改内容

所有站点与工具数据都集中在 [`assets/data.js`](assets/data.js)，增删改站点只需要编辑这个文件，页面会自动渲染。

## 目录结构

```
├── index.html        # 页面结构
├── favicon.svg       # 站点图标
├── assets/
│   ├── style.css     # 样式（含深色模式 / 响应式）
│   ├── data.js       # 站点 / 工具数据（改这里）
│   └── app.js        # 渲染与交互逻辑
└── README.md
```

## 部署

托管在 GitHub Pages（`main` 分支根目录），推送到 `main` 后页面会自动更新。

## 免责声明

本站仅作信息汇总与学习交流。收录只代表某个时间点实测能用，不构成任何形式的担保；所有站点均由第三方运营，额度与规则随时会变，请自行甄别风险。中转站能看到你发过去的全部请求内容，涉密内容不要经第三方中转。

设计灵感来自开源项目 [ai-switch](https://github.com/ijry/ai-switch)（MIT License）。
