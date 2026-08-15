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

推荐直接从 GitHub 安装到 DSH 的 `web` profile：

```sh
dsh plugin --profile web add github:Nagi-ovo/dsh-visualize
# 如果 dsh web 正在运行，重启后刷新页面
```

可以运行 `dsh --profile web --dump-config` 确认插件已经进入最终配置。需要修改源码时，克隆仓库并在仓库目录运行 `dsh plugin --profile web add .`；构建产物已经提交，不需要额外构建。使用社区 [plugin-registry](https://github.com/dsh-external/plugin-registry) 的用户也可以从「设置 → 插件」安装。

## 怎么用

直接告诉模型你想看什么，例如「做一个能调参数的排序算法可视化」。模型会写出一份 HTML fragment，再调用 `visualize(path, title?, mode?)` 把它放进对话。适合并排比较的内容可以使用 `mode: "wide"`。

卡片会跟随 DSH 的明暗主题和鲸鱼蓝配色。会话重放时，页面从持久化的工具结果恢复，不依赖原始 fragment 文件仍然存在。

## 安全

卡片运行在不透明来源的 sandboxed iframe 中，不能接触宿主页面。CSP 会阻止网络请求、嵌套页面和表单提交，只允许从固定 CDN 加载静态资源。单个 fragment 默认上限为 `1000000` 字节，可以通过 `maxFragmentBytes` 调整。

## 限制

目前只在 Web UI 中渲染交互卡片，TUI 和 headless 客户端会显示普通工具结果。卡片内的按钮暂时不能向主对话发送 follow-up 消息。

灵感来自 Codex 桌面端的 `/visualize`；skill 的分层 reference 和 Chart.js 优先路线借鉴了 [himself65/finance-skills](https://github.com/himself65/finance-skills/tree/main/plugins/ui-tools/skills/generative-ui)。
