# LLM Web Translator

![LLM Web Translator logo](assets/logo-mark.svg)

一个 Manifest V3 Chrome 扩展，用用户自己的大模型 API 翻译网页、选中文本和手动输入文本。

扩展不绑定任何固定服务商。用户只需要选择服务商、填写 API Key 和模型名，插件会按内置策略调用 OpenAI-compatible Chat Completions API。

## 功能

- 一键翻译当前网页
- 快捷键翻译/恢复当前网页，默认 `Alt+Q`
- 选中文本后右键「翻译选中内容」
- popup 中输入文本并直接翻译
- 支持目标语言快速切换和自定义目标语言
- 支持双语对照模式，保留原文并在后方显示译文。当前功能正在实验中
- 支持并发线程数设置，默认 4，范围 1 到 12
- 支持段落级加载状态，正在翻译的段落会显示加载圆圈
- 单个段落失败不会中断整页翻译
- 已默认内置多服务商策略：OpenAI、DeepSeek、OpenRouter、MiniMax、DashScope

## 本地加载

1. 打开 Chrome，进入 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目目录
5. 打开扩展设置页，选择服务商并填写 API Key 和模型名

## 使用方式

### 翻译当前网页

点击扩展图标，在 popup 中点击「翻译当前页」。

### 快捷键翻译/恢复

默认快捷键是 `Alt+Q`：

- 第一次按：翻译当前页
- 再次按：恢复原网页

如需修改快捷键：

1. 打开扩展设置页
2. 点击「自定义快捷键」
3. 在 `LLM Web Translator` 下修改 `Translate the current page`

### 翻译选中文本

1. 在网页中选中一段文字
2. 右键
3. 点击「翻译选中内容」

### 文本翻译

点击扩展图标，在 popup 的「文本翻译」输入框中输入文字并点击「翻译文本」。

## 服务商策略

| 服务商 | Endpoint | 输出策略 | 备注 |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `json_schema` | 支持严格结构化输出 |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `json_object` | 自动发送 `thinking: disabled` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `json_schema` | 增加 OpenRouter attribution headers |
| MiniMax | `https://api.minimax.io/v1/chat/completions` | `json_object` | OpenAI-compatible |
| DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `json_object` | DashScope 兼容模式 |

更多细节见 [服务商策略文档](docs/PROVIDERS.md)。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 操作当前标签页内容 |
| `contextMenus` | 提供右键「翻译选中内容」菜单 |
| `scripting` | 给已打开页面注入 content script |
| `storage` | 保存用户配置 |
| `http://*/*`, `https://*/*` | 读取页面文本并访问用户选择的模型 API |

## 隐私

扩展不收集遥测，不内置后端服务，不上传数据到项目作者服务器。翻译请求会发送给用户选择的大模型服务商。

完整说明见 [隐私政策](PRIVACY.md)。

## 开发

项目不依赖构建工具，直接使用原生 HTML/CSS/JavaScript。

```text
manifest.json          Chrome MV3 manifest
src/background.js      Service worker、服务商策略、API 调用、右键菜单
src/content.js         网页文本收集、替换、双语对照、恢复原文
src/popup.html/js      popup 页面和文本翻译
src/options.html/js    设置页面
styles/                popup/options 样式
assets/                logo 和 Chrome 图标
docs/                  架构和服务商说明
```

代码结构见 [架构文档](docs/ARCHITECTURE.md)。

## 贡献

欢迎 issue 和 pull request。提交前请阅读 [贡献指南](CONTRIBUTING.md)。

## 安全

如果你发现安全问题，请不要公开提交漏洞细节。处理方式见 [安全策略](SECURITY.md)。

## License

[MIT](LICENSE)
