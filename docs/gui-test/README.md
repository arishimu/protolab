# GUI 测试档案

本目录归档 pv-lens 的 GUI 测试报告、两轮整改方案与浏览器验收截图。

## 文档

| 文件 | 内容 | 完成时间 |
|---|---|---|
| `gui-test-report.md` | 首轮 GUI 测试报告，记录问题清单、复现路径与截图证据 | 2026-11-02 |
| `gui-test-remediation.md` | 第一轮整改方案与实施记录，含 P0–P3 共 46 项及 V1–V4 盲区补测 | 2026-11-03 |
| `gui-test-remediation-2.md` | 第二轮整改方案与实施记录，含 R01–R20 共 20 项及第 10 节全量回归 | 2026-11-04 |

## 截图目录

| 目录 | 张数 | 批次 | 引用文档 |
|---|---|---|---|
| `gui-test-screenshots/` | 91 | 首轮测试原始截图 | `gui-test-report.md` |
| `17-screenshots/` | 15 | 第一轮 P1，遮挡与溢出、线型与灰度 | `gui-test-remediation.md` |
| `18-screenshots/` | 9 | 第一轮 P2，交互与布局 | `gui-test-remediation.md` |
| `19-screenshots/` | 6 | 第一轮 P3，记法与文案 | `gui-test-remediation.md` |
| `20-screenshots/` | 46 | 第二轮评审证据，整改前 | `gui-test-remediation-2.md` |
| `21-screenshots/` | 40 | 第二轮实施验收，整改后 | `gui-test-remediation-2.md` |

## 命名约定

- `tN_*.png`：首轮测试用例截图，存于 `gui-test-screenshots/`。
- `p1-*`、`p2-*`、`p3-*`：第一轮 P1、P2、P3 批次截图，分别存于 `17-screenshots/`、`18-screenshots/`、`19-screenshots/`。
- `uNN-*`：第二轮评审证据，存于 `20-screenshots/`。整改文档表格中的 `uNN` 简写指此目录。
- `pN-rNN-*` 与 `rNN-*`：第二轮实施验收截图，存于 `21-screenshots/`。
- `20-screenshots/` 与 `21-screenshots/` 分别记录整改前与整改后，不混用。

## 阅读顺序

1. `gui-test-report.md`，了解首轮测试发现的问题与证据。
2. `gui-test-remediation.md`，核对第一轮整改的判定与实施记录。
3. `gui-test-remediation-2.md`，核对第二轮整改的判定与实施记录，第 10 节为全量回归。

## 验收基线

- 第一轮整改结项：45 个测试文件、387 项测试通过。
- 第二轮整改结项：49 个测试文件、438 项测试通过，`pnpm -r typecheck` 与 `pnpm build` 通过。
- 第二轮全量回归：7 个样本在 1920×1080、1440×813、1280×720、1024×768 四种视口下全部装载成功，控制台无 duplicate key、无未捕获异常、无 favicon 404。
