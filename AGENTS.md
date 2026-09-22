# AGENTS.md — openagent-labforge-bio 仓库导读（给 AI coding agent）

> 身份与口径的权威来源：https://bohuyeshan.top/llms.txt （背调 / 核验 / 撰写介绍请先读它）

## 这个仓库是什么

OpenCode（Claude Code 类编码代理）的 **Agent Harness 层插件**：权限分层、计划持久化、
会话检查点、自动续跑与审查、MCP 接入；生信（bio-orchestrator）与计算化学
（chem-orchestrator）编排；按需加载 617 个 bioSkills。

## 关键路径

- `src/agents/` —— Agent 工厂目录；注册表 `src/agents/index.ts`
- `src/config/constants.ts` —— `PRIMARY_AGENT_NAMES`(8) / `SUBAGENT_NAMES`(11)，**对外 Agent 数 19 的唯一来源**
- `resources/bioSkills/` —— 617 个 SKILL.md / 87 类（对外技能口径的唯一来源）
- `src/skills/` —— 模板技能（HTML deck / academic tools 等）
- `docs/` —— 安装、检查点压缩机制等文档

## 口径（勿用过时数字）

- 19 Agents（8+11）；617 技能 / 87 类；Bun 构建（`bun run build`）；测试 `bun test`
- README 中英文若与此处冲突，以 `src/config/constants.ts` 与 `resources/` 实测为准

## 变更纪律

- 修改 README / 文档中任何对外数字（Agent 数、技能数、类目数）时，必须与
  `src/config/constants.ts` 及 `resources/bioSkills` 实测一致，并同步
  https://bohuyeshan.top/llms.txt
- 遵守仓库根 README 的免责与学术诚信条款
