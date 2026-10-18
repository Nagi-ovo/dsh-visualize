# dsh-visualize

![dsh-visualize](assets/social-preview.jpg)

<p align="center">
  <strong>简体中文</strong> | <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://dshfind.com/zh/plugins/Nagi-ovo/dsh-visualize?ref=badge"><img src="https://dshfind.com/api/card/Nagi-ovo/dsh-visualize?lang=zh" alt="dsh-visualize 在 dshfind 插件目录上的展示卡" width="440"></a>
</p>

让 DSH 不只回答一段文字。模型调用 `visualize` 后，Web UI 会在对话里直接出现一张可交互卡片，用来做模拟器、图表、对比面板或 UI mockup。

<div align="center">

[![DSH 对话内生成交互式可视化演示](assets/demo.webp)](assets/demo.mp4)

</div>

## 安装

推荐用 npm 装到 DSH 的 `web` profile：

```sh
dsh plugin --profile web add @nagi-ovo/dsh-visualize
# 如果 dsh web 正在运行，重启后刷新页面
```

也可以从 GitHub 安装：`dsh plugin --profile web add github:Nagi-ovo/dsh-visualize`。可以运行 `dsh --profile web --dump-config` 确认插件已经进入最终配置。需要修改源码时，克隆仓库并在仓库目录运行 `dsh plugin --profile web add .`；构建产物已经提交，不需要额外构建。使用社区 [plugin-registry](https://github.com/dsh-external/plugin-registry) 的用户也可以从「设置 → 插件」安装。

兼容 DSH 0.1.1-rc.2 到 0.2.1-rc.2。

## 怎么用

直接告诉模型你想看什么，例如「做一个能调参数的排序算法可视化」。模型调用 `visualize`，把整段 HTML fragment 直接作为 `fragment` 参数传入（可选 `title`、`mode`），卡片在模型生成参数时就开始渲染。适合并排比较的内容可以使用 `mode: "wide"`。要修正已经画出的卡片，模型用 `action: "update"` 加上卡片的 `path` 和一处 `old_str` → `new_str` 替换，不必重发整段 markup；`path` 只用于 `update`。

要做的东西比一张聊天卡片大时，比如带筛选的数据看板、多视图工具、全屏模拟或完整的桌面端 mockup，模型会用 `mode: "page"` 做一个独立页面。对话里显示一张启动卡片：标题、一行说明（`summary` 参数）、页面的实时缩略图和「打开页面」按钮，点按钮后页面在新标签页里全尺寸打开。浏览器拦下新标签页时，可以点「在对话中展开」直接在对话里查看。用 `update` 改过页面后，已经打开的标签页不会自动刷新，再点一次「打开页面」即可。

卡片会跟随 DSH 的明暗主题，默认风格使用鲸鱼蓝配色（其他风格见下文）。聊天栏放不下时，点卡片标题行右侧的「在新窗口打开」按钮，可以在新标签页里全尺寸查看，页面沿用打开那一刻的主题，内容仍在同样的 sandboxed iframe 里运行。会话重放时，页面从持久化的工具结果恢复，不依赖原始 fragment 文件仍然存在。

每张卡片的 fragment 另存一份到 `~/.dsh/visualize/sessions/<会话 id>/<标题>-<hash>.<style>.html`（设置了 `DSH_HOME` 时在 `$DSH_HOME/visualize/` 下），按会话分开，不写进你的项目目录，`git status` 不会出现 `viz/`。`update` 改写的就是这份文件。旧版本写在工作区 `viz/` 下的卡片仍然可以 `update`，原地修改。插件不会自动清理这些文件，需要时可以直接删除 `~/.dsh/visualize/`，已有会话的卡片照常重放。

DSH 默认会把已完成回合的工具过程折叠起来。折叠时，这一轮画出的卡片会再显示在最终回答下方，不用展开过程也能看到；「工作步骤展示」选「完全展开」时则只在原位显示。

## 卡片风格

插件内置 5 种卡片风格，在 DSH 的「设置 → 插件 → dsh-visualize」里用 `style` 选择（也可以写进 profile 配置），默认是 `whale`：

| `style` | 风格 | 适合 |
| --- | --- | --- |
| `whale` | 鲸蓝（默认）：跟 DSH 界面同一套颜色和系统字体 | 什么都行 |
| `editorial` | 报刊：衬线标题直接写结论，一条线高亮、其余退成灰，直接标注 | 趋势、比较、「这个数说明了什么」 |
| `paper` | 论文：衬线、L 形坐标轴、色盲安全配色，颜色加标记形状双重编码，「图 1 ·」图注 | 实验结果、学习曲线、带公式的讲解 |
| `sketch` | 手绘：手写字体、rough.js 草图线条、荧光笔标注 | 概念、直觉、流程 |
| `terminal` | 终端：等宽字体、直角、虚线网格、key–value 标签 | 延迟、吞吐、算法逐步执行 |

风格分两层。颜色、字体、圆角、图表默认值（网格、轴线、线宽）由卡片外壳注入，每种风格都同时适配明暗主题，背景保持透明；版式和写法（标题怎么写、要不要图注、用不用 rough.js）是一段风格说明，附加在 skill 末尾交给模型。风格说明只替换 `design.md` 里的审美建议，fragment 规则、CSP、主题变量、11px 下限和 lint 都不受影响。产品界面 mockup 不套用风格，按被画产品自己的样子来。

每张卡片在持久化的结果和副本文件名里记下它生成时的风格，之后改设置不会改变已有卡片，会话重放、「在新窗口打开」和模型用 `update` 修改时都保持原样。有风格之前保存的卡片文件名里没有风格，`update` 时按当前设置重新渲染。模型还在写卡片时显示的预览，在 DSH 页面加载时读取设置，改设置后刷新已打开的页面即可。`editorial`、`paper`、`sketch`、`terminal` 会从 Google Fonts 加载字体；`paper` 只在卡片里有公式时才加载 KaTeX。

### 自定义风格

在 Markdown 文件里用自然语言写下你的偏好，例如「主色用墨绿，标题不超过 12 个字，数字保留一位小数」。插件会把它附加在内置风格说明之后：

- 全局：`~/.dsh/visualize/style.md`（设置了 `DSH_HOME` 时是 `$DSH_HOME/visualize/style.md`），所有会话生效。
- 工作区：`<工作区>/.dsh/visualize-style.md`，只在这个工作区的会话里生效。

两者冲突时，优先级是：你在对话里说的 > 工作区文件 > 全局文件 > 内置风格。每个文件只读取前 4 KB，文件不存在就跳过。改动在模型下一次加载 visualize skill 时生效（通常是新会话的第一张卡片）。自定义风格只影响模型怎么写卡片，不改变外壳注入的颜色和字体；要换颜色，在说明里写明，模型会在卡片根元素上覆盖对应的主题变量。

## 安全

卡片运行在不透明来源的 sandboxed iframe 中，不能接触宿主页面。在新窗口打开（包括页面模式的「打开页面」）时，新标签页本身不含任何模型代码，fragment 依旧只在同样 sandbox 和 CSP 的 iframe 里运行，读不到 DSH 的 cookie、localStorage 或登录凭据。CSP 会阻止网络请求、嵌套页面和表单提交，只允许从固定 CDN 加载静态资源。单个 fragment 默认上限为 `1000000` 字节，可以通过 `maxFragmentBytes` 调整。

## 限制

目前只在 Web UI 中渲染交互卡片，TUI 和 headless 客户端会显示普通工具结果。卡片内的按钮暂时不能向主对话发送 follow-up 消息。

灵感来自 Codex 桌面端的 `/visualize`；skill 的分层 reference 和 Chart.js 优先路线借鉴了 [himself65/finance-skills](https://github.com/himself65/finance-skills/tree/main/plugins/ui-tools/skills/generative-ui)。
