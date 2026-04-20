# NovelWriter

AI 写作辅助工作台，界面参考深色代码编辑器与纸质设计稿的组合：正文区保持高密度写作，右侧保存长期记忆、模型接口和生成输出。

## 运行

```bash
npm install
npm run dev
```

## 接入 Ollama

1. 本机启动 Ollama。
2. 拉取一个中文写作可用模型，例如：

```bash
ollama pull qwen3:8b
```

3. 在右侧「接口」面板中选择 `Ollama`。
4. Base URL 使用 `http://localhost:11434`。
5. 模型填写本机已有模型名。当前项目默认值是这台机器上已存在的 `gemma4:e2b`。
6. 点击「测试连接」。

## 接入其他 API

右侧「接口」面板选择 `OpenAI-compatible`，填写：

- Base URL：例如 `https://api.example.com/v1`
- 模型：服务商提供的模型名
- API Key：服务商密钥

应用会请求 `POST /chat/completions`，适合大多数兼容 OpenAI Chat Completions 协议的服务。

## 快捷动作

- `1` 续写：按当前文风继续写。
- `2` 润色：保留剧情，强化画面和节奏。
- `3` 扩写：把片段扩成更完整的一场戏。
- `4` 记忆：抽取人物、世界观、伏笔等长期记忆。
- `+` 自定义：执行右侧接口面板里的自定义指令。

正文、记忆和接口配置会保存在浏览器本地存储中。
