[private]
default:
    @just --list

# 检查 TypeScript 类型.
typecheck:
    pnpm run typecheck

# 构建宿主和客户端产物.
build:
    pnpm run build

# 运行无凭据的检测和续写回归测试.
test:
    pnpm run test

# 依次进行类型检查, 构建和回归测试.
verify: typecheck build test
