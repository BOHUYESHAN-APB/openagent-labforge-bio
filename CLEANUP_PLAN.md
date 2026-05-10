# 清理计划：移除 OpenClaude/Codex 兼容性代码

## 要删除的目录
- src/cli/
- src/compat/adapters/
- src/compat/config-writers/
- src/compat/renderers/

## 要删除的文件
- src/compat/adapter.ts
- src/compat/capabilities.ts
- src/compat/install-plan.ts
- src/compat/rollback.ts

## 要保留的文件
- src/compat/types.ts (简化，只保留 OpenCode 需要的类型)
- src/utils/compat.ts (跨平台工具)

## 要更新的文件
- package.json (移除 CLI 相关的 bin 和 scripts)
