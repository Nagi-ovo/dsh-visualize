# dsh-visualize

![dsh-visualize](assets/social-preview.jpg)

<p align="center">
  <a href="README.md">简体中文</a> | <strong>English</strong>
</p>

<p align="center">
  <a href="https://dshfind.com/en/plugins/Nagi-ovo/dsh-visualize?ref=badge"><img src="https://dshfind.com/api/card/Nagi-ovo/dsh-visualize?lang=en" alt="dsh-visualize on the dshfind plugin directory" width="440"></a>
</p>

DSH does not have to answer with text alone. When the model calls `visualize`, the Web UI renders an interactive card inside the conversation for simulators, charts, comparison panels, and UI mockups.

<div align="center">

[![Interactive visualization rendered inside a DSH conversation](assets/demo.webp)](assets/demo.mp4)

</div>

## Install

Install from npm into DSH's `web` profile:

```sh
dsh plugin --profile web add @nagi-ovo/dsh-visualize
# If dsh web is running, restart it and refresh the page.
```

GitHub also works: `dsh plugin --profile web add github:Nagi-ovo/dsh-visualize`. Run `dsh --profile web --dump-config` to confirm that the plugin is present in the final configuration. For local development, clone the repository and run `dsh plugin --profile web add .` from its root; committed build output means no separate build step is required. Users of the community [plugin-registry](https://github.com/dsh-external/plugin-registry) can also install it from Settings → Plugins.

Compatible with DSH 0.1.1-rc.2 through 0.2.1-rc.2.

## Use it

Tell the model what you want to explore, for example, “make an adjustable visualization of a sorting algorithm.” The model calls `visualize` with the whole HTML fragment as its `fragment` argument (plus an optional `title` and `mode`), and the card starts rendering while the model is still writing it. Side-by-side comparisons can use `mode: "wide"`. To correct a card it already drew, the model calls `action: "update"` with the card's `path` and one exact `old_str` → `new_str` replacement instead of resending the markup; `path` is only used by `update`.

When the thing to build is bigger than a chat card, such as a dashboard with filters, a multi-view tool, a full-screen simulation, or a complete desktop mockup, the model builds a standalone page with `mode: "page"`. The conversation shows a launcher card with the title, a one-line description (the `summary` argument), a live thumbnail of the page, and an **Open page** button that opens the page full-size in a new tab. If the browser blocks the tab, **Show here** displays the page in the conversation instead. After an `update`, a tab you already opened keeps the old version; click **Open page** again to see the change.

Cards follow the DSH light or dark theme and whale-blue palette. When the chat column is too narrow, the **Open in new window** button at the right of the card header opens the card full-size in its own tab, themed as DSH was when you opened it and still running inside the same sandboxed iframe. Session replay restores cards from the persistent tool result, so the original fragment file does not need to remain on disk.

A copy of each card's fragment is saved to `~/.dsh/visualize/sessions/<session id>/<title>-<hash>.html` (under `$DSH_HOME/visualize/` when `DSH_HOME` is set), one directory per conversation and never inside your project, so `git status` stays free of `viz/`. `update` patches that copy. Cards that older versions wrote under `viz/` in the workspace can still be updated in place. The plugin does not clean these files up; you can delete `~/.dsh/visualize/` at any time and existing conversations still replay their cards.

By default DSH folds a finished turn's tool process. While it does, the turn's cards also appear under the final answer, so you see them without opening the process; with Work details set to Verbose they stay in place only.

## Security

Each card runs in a sandboxed iframe with an opaque origin and cannot access the host page. Opening a card in a new window, including a page's **Open page**, keeps that: the new tab carries no model code of its own, and the fragment still runs only inside an iframe with the same sandbox and CSP, so it cannot read DSH's cookies, localStorage, or login token. Its CSP blocks network requests, nested pages, and form submissions, while allowing static assets from a fixed set of CDNs. Fragments are limited to `1000000` bytes by default; change `maxFragmentBytes` to use a different limit.

## Limitations

Interactive cards currently render only in the Web UI. TUI and headless clients show the standard tool result instead. Buttons inside a card cannot yet send follow-up messages to the conversation.

Inspired by `/visualize` in the Codex desktop app. The layered skill references and Chart.js-first approach draw from [himself65/finance-skills](https://github.com/himself65/finance-skills/tree/main/plugins/ui-tools/skills/generative-ui).
