2026 年 AI API 接口现状：

**主流协议**
- OpenAI Chat Completions 格式（`/v1/chat/completions`）已成为事实标准
- 兼容该格式的厂商：OpenAI、DeepSeek、通义千问、智谱、Kimi、Groq、Together AI、OpenRouter 等
- Anthropic 于 2026 年 3 月推出 OpenAI-compatible endpoint（`https://api.anthropic.com/v1/chat/completions`）

**Anthropic 原生协议**
- 端点：`/v1/messages`
- 认证头：`x-api-key`（而非 `Authorization: Bearer`）
- system prompt 放在 `system` 字段（而非 `messages` 数组的 `system` role）
- 请求体包含 `max_tokens`（OpenAI 格式为 `max_completion_tokens`）

**认证差异**
- 大多数厂商：`Authorization: Bearer {api_key}`
- Anthropic 原生 Messages API：`x-api-key: {api_key}`

**流式响应格式**
- OpenAI SSE：`data: {"choices":[{"delta":{"content":"..."}}]}`
- Anthropic SSE（兼容端点）：与 OpenAI 基本一致
- Anthropic SSE（原生）：`data: {"type":"content_block_delta","delta":{"text":"..."}}`

**第三方聚合平台**
- OpenRouter、Vercel AI Gateway、Braintrust Gateway 等提供统一接入层
- 内部自动处理不同厂商的格式差异
- 支持一次调用同时访问多个模型

**模型参数**
- 模型名由用户指定字符串，后端原样转发
- 不同厂商模型名互不兼容（如 OpenAI 的 `gpt-4o` 与 Anthropic 的 `claude-sonnet-4-6`）

**非流式 vs 流式**
- 非流式：单次 POST 返回完整 JSON
- 流式：`stream: true`，通过 SSE 逐字推送，需客户端支持事件流解析