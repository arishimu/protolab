# 10: 文档收尾（安装运行说明 + README 登记）

**What to build:** 让下一个使用者（包括未来的你自己）能把这个工具跑起来：README 补安装与运行说明——前置条件本机 ProVerif 2.x、路径注入方式（ADR-0002 后果）、启动前后端的命令；登记 pv-lens MVP 已完成及其用法；工程收尾检查（`.gitignore` 无泄漏、无临时代码）。

**Blocked by:** 09

**Status:** resolved

- [x] README 增补：安装前置、ProVerif 路径注入说明、启动步骤、四个内置样例简介
- [x] README 中 pv-lens 状态从「设计与实现中」更新为「MVP 完成」并登记用法
- [x] 工程收尾：无临时代码/调试残留、`.gitignore` 覆盖构建产物与录制中间物
- [x] 新手（无本仓库经验的人）照 README 可独立跑起四样例全流程

## Comments

2026-09-18 完成。

**README**：根 `README.md` 目录结构登记 `pv-lens/`；原「下一步（设计与实现中）」改写为「pv-lens：规范叙事视图 + ProVerif 验证（MVP 已完成）」，新增前置条件（Node ≥ 20 / pnpm / 本机 ProVerif 2.x 与 opam 安装）、安装与双进程启动（`pnpm install && pnpm build`；`pnpm start` + `pnpm --filter @pv-lens/web dev`）、`PROVERIF_PATH` / opam env 路径注入、四个内置样例结果表、typecheck/test 与 fixture 再生成命令。

**启动链路实测**（照 README 逐条执行）：`pnpm build` 三包通过；`pnpm start` 打印 `listening on http://127.0.0.1:8787`，`/api/health` 返回 4 样例；`vite dev`（5173）与 `vite preview`（4173）的 `/api` 代理均可转发 `/api/health` 与 `/api/verify`；四个内置样例经 `POST /api/verify` 逐个实测，判定与 spec「Further Notes」实测结果表逐条一致（hello 2 条、握手 3 条全 true、NS 修正版 2 条全 true、NS 原版 6 条含 3 条 false）。

**文档收尾**：spec「stdout 解析事实」原写的 `RESULT <查询> is true|false|cannot be proved.` 已改为按 2.05 真实形态分列（`is true|false` 与不带 `is` 的 `cannot be proved`）；`fixtures/PROVENANCE.md` 的录制说明同步限定为 `is true|false`（四样例不出现 `cannot be proved`，真实形态另见该文件「人工构造 fixture」）；spec 的 #09 验收记录补注「口径已由 #10 统一」并订正测试计数（195 为追加 trace 切片回归前的快照，当前 196）。

**工程收尾**：`packages` 下除两处正当的 `console.log`（sync 脚本完成提示、server 启动横幅）外无 TODO/FIXME/debugger/console 调试残留；`pv-lens/.gitignore` 经 `git check-ignore` 核验覆盖 `dist/`、`node_modules/`、`*.tsbuildinfo`、`.env`、日志；录制中间物只落在 `os.tmpdir()`（适配器 `mkdtemp`），不进入仓库。

**回归**：`pnpm typecheck` 三包通过；`pnpm test` 16 文件 196 项通过（含真实 ProVerif 集成冒烟）。
