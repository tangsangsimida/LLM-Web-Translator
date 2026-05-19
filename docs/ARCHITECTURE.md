# Architecture

LLM Web Translator 是一个无构建流程的 Chrome Manifest V3 扩展。

## 组件

```text
Popup UI -> background service worker -> model provider API
Page DOM <- content script <- background service worker
Options UI -> chrome.storage.sync
```

## `src/background.js`

职责：

- 创建右键菜单
- 处理快捷键
- 读取用户设置
- 选择服务商策略
- 调用 Chat Completions API
- 解析模型返回并清理 `<think>` 等非译文内容

服务商差异通过策略配置处理，包括 endpoint、结构化输出参数、是否发送 `thinking` 或 `reasoning_effort`。

## `src/content.js`

职责：

- 收集页面可见文本节点
- 按段落/文本块分片
- 根据用户设置并发翻译
- 显示段落级加载圆圈
- 替换原文或插入双语对照译文
- 处理右键选区翻译
- 恢复原文

## `src/popup.js`

职责：

- 当前页翻译和恢复
- popup 文本翻译
- 快速修改目标语言和并发数

## `src/options.js`

职责：

- 服务商选择
- API Key 和模型配置
- 目标语言、自定义语言、并发数和双语模式设置
- 打开 Chrome 快捷键管理页

## 数据流

1. 用户触发翻译。
2. content script 收集文本并发给 background。
3. background 根据服务商策略调用模型 API。
4. background 返回译文数组。
5. content script 更新页面 DOM。

## 恢复原文

普通替换模式会保存原始 text node。双语模式会插入额外译文节点。恢复时分别还原 text node 并移除译文节点。
