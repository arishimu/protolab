# GUI 测试档案

本目录归档 pv-lens 的 GUI 测试报告、两轮整改方案、结项后补丁与合并前复核截图。

## 文档

| 文件 | 内容 | 完成时间 |
|---|---|---|
| `gui-test-report.md` | 首轮 GUI 测试报告，记录问题清单、复现路径与截图证据 | 2026-11-02 |
| `gui-test-remediation.md` | 第一轮整改方案与实施记录，含 P0–P3 共 46 项及 V1–V4 盲区补测 | 2026-11-03 |
| `gui-test-remediation-2.md` | 第二轮整改方案与实施记录，含 R01–R20 共 20 项、第 10 节全量回归与第 13 节结项后补丁 | 2026-11-04 |

## 截图目录

| 目录 | 张数 | 批次 | 引用文档 |
|---|---|---|---|
| `gui-test-screenshots/` | 91 | 首轮测试原始截图 | `gui-test-report.md` |
| `17-screenshots/` | 15 | 第一轮 P1，遮挡与溢出、线型与灰度 | `gui-test-remediation.md` |
| `18-screenshots/` | 9 | 第一轮 P2，交互与布局 | `gui-test-remediation.md` |
| `19-screenshots/` | 6 | 第一轮 P3，记法与文案 | `gui-test-remediation.md` |
| `20-screenshots/` | 46 | 第二轮评审证据，整改前 | `gui-test-remediation-2.md` |
| `21-screenshots/` | 40 | 第二轮实施验收，整改后 | `gui-test-remediation-2.md` |
| `22-screenshots/` | 10 | 结项后补丁与合并前复核，含冲突标记修复前后对照 | `docs/summary.md` 补丁条目；`gui-test-remediation-2.md` 第 13 节 |
| `23-screenshots/` | 62（60 PNG + 2 PDF） | 语义分组阶段 0 原型、阶段 2 操作组、阶段 3 交换段、阶段 4 解释层与阶段 5 目标/归因验收：四视口折叠/展开/嵌套/拒绝路径/灰度与打印，组摘要、审计面板、消息列表、段带、概念抽屉、查询三行、会话目标与归因 | `docs/summary.md` 2026-11-05 条目；`.scratch/pv-lens-grouping/spec.md`；实现票 28–33 |

## 命名约定

- `tN_*.png`：首轮测试用例截图，存于 `gui-test-screenshots/`。
- `p1-*`、`p2-*`、`p3-*`：第一轮 P1、P2、P3 批次截图，分别存于 `17-screenshots/`、`18-screenshots/`、`19-screenshots/`。
- `uNN-*`：第二轮评审证据，存于 `20-screenshots/`。整改文档表格中的 `uNN` 简写指此目录。
- `pN-rNN-*` 与 `rNN-*`：第二轮实施验收截图，存于 `21-screenshots/`。
- `merge-*`：结项后补丁与合并前复核截图，存于 `22-screenshots/`；`merge-conflict-marker-overlap.png` 为修复前证据，其余为修复后或主链路复核。
- `sg0-protoN-<state>-<宽度>.png`：语义分组阶段 0 原型截图，存于 `23-screenshots/`。`proto1` 为密码操作组，`proto2` 为交换段；`<state>` 取 `collapsed`、`expanded`、`nested`、`override`、`gray`、`conflict`、`reject-*`、`collapsed-full`、`expanded-full`；`<宽度>` 为 1920、1440、1280、1024。`sg0-protoN-print.pdf` 为打印预览。
- `sg2-*.png`：语义分组阶段 2 真浏览器验收，存于 `23-screenshots/`。`sg2-groups-collapsed-<宽度>.png` 为全部折叠的组摘要与幽灵值块（1920、1440、1280、1024 四视口），`sg2-groups-expanded-1440.png` 为展开态组开关，`sg2-groups-nested-1440.png` 为嵌套子组折叠，`sg2-audit-1440.png` 为审计面板；`sg2-groups-collapsed-1024-gray.png` 与 `sg2-groups-collapsed-1024-print.png` 为灰度与打印复核。
- `sg3-*.png`：语义分组阶段 3 真浏览器验收，存于 `23-screenshots/`。`sg3-message-list-1440.png` 为消息列表与校验，`sg3-segment-expanded-1440.png` 与 `sg3-segment-card-1440.png` 为展开态段带与段卡片，`sg3-segment-collapsed-<宽度>.png` 为折叠态段带与跨段边（1920、1440、1280、1024），`sg3-segment-collapsed-1024-gray.png` 与 `-print.png` 为灰度与打印复核。
- `sg4-*.png`：语义分组阶段 4 真浏览器验收，存于 `23-screenshots/`。`sg4-guide-1440.png` 为样例导读，`sg4-concept-1440.png` 与 `sg4-legend-concept-1440.png` 为组摘要与图例概念抽屉，`sg4-verify-<宽度>.png` 为查询三行与覆盖摘要（1920、1440、1280、1024），`sg4-verify-1024-gray.png` 与 `-print.png` 为灰度与打印复核。
- `sg5-*.png`：语义分组阶段 5 真浏览器验收，存于 `23-screenshots/`。`sg5-goals-<宽度>.png` 为三类会话目标构建器与目标清单（1920、1440、1280、1024），`sg5-verify-1440.png` 为声明/会话目标来源区分与覆盖摘要，`sg5-attribution-1440.png` 为列表级反例归因。
- `20-screenshots/`、`21-screenshots/`、`22-screenshots/` 与 `23-screenshots/` 分别记录整改前、整改后、结项后补丁与语义分组阶段 0/2/3/4/5，不混用。

## 阅读顺序

1. `gui-test-report.md`，了解首轮测试发现的问题与证据。
2. `gui-test-remediation.md`，核对第一轮整改的判定与实施记录。
3. `gui-test-remediation-2.md`，核对第二轮整改的判定与实施记录，第 10 节为全量回归，第 13 节为结项后补丁。
4. `22-screenshots/`，核对结项后补丁与合并前复核的浏览器证据。
5. `23-screenshots/`，核对语义分组阶段 0 原型的折叠、展开、嵌套、段边界与拒绝路径，阶段 2 的组摘要/幽灵值块/审计面板，阶段 3 的消息列表/段带/跨段边，阶段 4 的样例导读/概念抽屉/查询三行/覆盖摘要，以及阶段 5 的会话目标/来源区分/反例归因；`sg0-*` 至 `sg5-*` 分别对应各阶段验收。

## 验收基线

- 第一轮整改结项：45 个测试文件、387 项测试通过。
- 第二轮整改结项：49 个测试文件、438 项测试通过，`pnpm -r typecheck` 与 `pnpm build` 通过。
- 结项后补丁（ticket 26/27）：51 个测试文件、444 项测试通过，`pnpm -r typecheck` 与 `pnpm build` 通过。
- 语义分组阶段 1：52 个测试文件、466 项测试通过；阶段 2：53 个测试文件、477 项测试通过（471 通过 + 6 跳过）；阶段 3：55 个测试文件、498 项测试通过（492 通过 + 6 跳过）；阶段 4：56 个测试文件、509 项测试通过（503 通过 + 6 跳过）；阶段 5：60 个测试文件、528 项测试通过（522 通过 + 6 跳过），`pnpm -r typecheck` 与 `pnpm -r run build` 通过。
- 第二轮全量回归：7 个样本在 1920×1080、1440×813、1280×720、1024×768 四种视口下全部装载成功，控制台无 duplicate key、无未捕获异常、无 favicon 404。
