# Provider Strategies

服务商策略集中在 `src/background.js` 的 `PROVIDER_STRATEGIES`。

## OpenAI

```text
https://api.openai.com/v1/chat/completions
```

策略：

- `response_format: json_schema`
- `json_schema.strict: true`
- 默认 `reasoning_effort: minimal`

## DeepSeek

```text
https://api.deepseek.com/chat/completions
https://api.deepseek.com/v1/chat/completions
```

策略：

- `response_format: json_object`
- `thinking: { type: "disabled" }`
- 不发送 `reasoning_effort`

## OpenRouter

```text
https://openrouter.ai/api/v1/chat/completions
```

策略：

- `response_format: json_schema`
- 增加 `HTTP-Referer` 和 `X-OpenRouter-Title`
- 不发送 `reasoning_effort`

## MiniMax

```text
https://api.minimax.io/v1/chat/completions
https://api.minimaxi.com/v1/chat/completions
```

策略：

- `response_format: json_object`
- 不发送 `reasoning_effort`

## DashScope

```text
https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
```

策略：

- `response_format: json_object`
- 不发送 `reasoning_effort`

## 添加新服务商

1. 在 `PROVIDER_STRATEGIES` 添加策略。
2. 在 `src/options.html` 增加服务商 tab。
3. 在 `src/options.js` 的 `PROVIDER_OPTIONS` 添加默认模型和说明。
4. 更新 README 和本文件。
5. 手动测试整页翻译、右键翻译和 popup 文本翻译。
