# Privacy Policy

LLM Web Translator 是一个本地运行的 Chrome 扩展。

## 数据处理

扩展会读取用户当前网页中的可见文本，用于翻译当前页面或选中文本。用户也可以在 popup 中手动输入待翻译文本。

翻译时，相关文本会发送给用户在设置中选择的大模型服务商，例如 OpenAI、DeepSeek、OpenRouter、MiniMax 或 DashScope。

## API Key

用户填写的 API Key 保存在 Chrome 的 `chrome.storage.sync` 中。项目作者没有服务器，也不会接收或保存用户 API Key。

## 不收集的数据

扩展不收集：

- 遥测数据
- 浏览历史
- 用户身份信息
- 翻译内容副本
- API Key 副本

## 第三方服务

用户选择的大模型服务商可能会处理翻译请求内容。请阅读对应服务商的隐私政策和数据使用条款。

## 权限原因

扩展需要网页访问权限来读取和替换当前页面文本，需要网络权限来访问用户选择的大模型 API。

## 联系

如果你准备发布自己的 fork，请在此处替换为你的联系邮箱或 issue 地址。
