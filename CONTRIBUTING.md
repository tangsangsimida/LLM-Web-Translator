# Contributing

感谢你考虑贡献 LLM Web Translator。

## 开发流程

1. Fork 仓库并创建分支。
2. 修改代码或文档。
3. 在 Chrome `chrome://extensions` 中重新加载扩展并手动验证。
4. 提交 pull request，说明改动动机、影响范围和验证方式。

## 代码约定

- 不引入构建工具，除非有明确收益。
- 优先保持原生 HTML/CSS/JavaScript。
- 服务商差异放在 `src/background.js` 的策略配置中处理。
- 页面 DOM 修改逻辑集中在 `src/content.js`。
- 不提交 API Key、截图中的密钥或其他敏感信息。

## 提交建议

提交信息建议使用简短动词开头：

```text
Add DashScope provider strategy
Fix bilingual restore behavior
Document privacy policy
```

## Pull Request Checklist

- [ ] 已在 Chrome 中重新加载扩展并验证核心路径
- [ ] 如改动权限，已更新 README 的权限说明
- [ ] 如新增服务商，已更新 `docs/PROVIDERS.md`
- [ ] 如涉及隐私或数据流，已更新 `PRIVACY.md`
