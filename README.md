# dsh-visualize

DSH 对话内生成式 UI 插件：模型调 `visualize` 工具，Web UI 里就地渲染成**可交互的沙箱卡片**——模拟器、图表、对比面板、UI mockup，超越纯文本的探索。

<div align="center">

https://github.com/user-attachments/assets/93ff08ef-cf32-4a87-bf63-274c1a0a71e2

</div>

| 组成 | 作用 |
|---|---|
| `visualize` 工具 | 读 fragment 文件、按契约校验，把内容内联进持久化 `tool/result` meta（模型上下文只出现路径，replay 永远可渲染） |
| bundled `visualize` skill | 教模型 fragment 契约：结构、主题变量、基础组件类、尺寸与资源限制 |
| Web UI 卡片 | `tool.call.toolview` 键 `visualize`：`<iframe sandbox="allow-scripts">` + 独立 CSP 渲染，桥接 DSH 主题色（含鲸鱼蓝主色），高度随内容自适应 |

## 安装

构建产物随仓库分发（`lib/` 已提交），无 install、无 build、无运行时依赖：

```sh
git clone https://github.com/dsh-external/dsh-visualize.git
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add link:/path/to/dsh-visualize
# 重启 dsh web，刷新页面
```

配置行由 bundle patch 自动插入，无需手动编辑 cordis.patch.yml。

装了社区 [plugin-registry](https://github.com/dsh-external/plugin-registry) 的用户也可以在设置页「插件」面板安装；最新 DSH 已移除旧的 `dsh registry` 命令。

开发者改源码后：`pnpm install && pnpm run check`（typecheck + 测试 + 重新构建 `lib/`）。

## 配置

| Key | 默认 | 说明 |
|---|---|---|
| `maxFragmentBytes` | `1000000` | 单个 fragment 的字节上限；超限在工具调用时报错并提示模型降采样 |

## 工作方式

1. 模型把 fragment（纯 HTML 片段，无 `<!doctype>`/`<html>`/`<head>`/`<body>`）写进会话工作区，如 `viz/sorting-lab.html`。
2. 调 `visualize(path, title?, mode?)`；`mode: "wide"` 仅用于多面板并排对比。
3. 卡片在对话流内渲染；编辑文件后再调一次即更新。

**安全边界**：iframe `sandbox="allow-scripts"`（不透明 origin，摸不到宿主页面）+ frame 自带 CSP——`default-src 'none'`，禁 `fetch`/XHR/WebSocket/嵌套 frame/表单提交，静态资源仅限 7 个固定 CDN 源（cdnjs、jsdelivr、esm.sh、unpkg、三个字体源）。

**主题**：frame 内变量 `--background`/`--foreground`/`--primary`/`--viz-series-1..6` 等由卡片在渲染时从宿主 `--dsw-alias-*` design token 桥接（`--primary` = DeepSeek 鲸鱼蓝），明暗切换实时跟随；非 DSH 宿主回退到内置 `light-dark()` 配色。

## 验证

1. 让模型「做一个冒泡排序的可视化」→ 对话里出现可交互卡片，主会话历史只有一次工具调用。
2. 切换明暗主题 → 卡片配色即时跟随。
3. 重启 `dsh web` 回放会话 → 卡片原样重现（不依赖 fragment 文件仍存在）。

## 参考

- 灵感来自 Codex 桌面端的 `/visualize` 效果
- skill 的 references/ 分层与 Chart.js 优先路线借鉴 [himself65/finance-skills](https://github.com/himself65/finance-skills/tree/main/plugins/ui-tools/skills/generative-ui)

## 已知限制

- 卡片是 Web UI 专属；TUI/headless 客户端按官方 toolview 降级显示工具结果文本（含路径）。
- fragment 无法发起网络请求（CSP 有意为之）；数据须内联并降采样。
- 交互回传通道（frame 内按钮把选中数据发成 follow-up 消息）留待 v2。
