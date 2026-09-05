# AGENTS.md

## Purpose

This repository is a workspace for security-protocol work. Two phases:

- ProVerif study is complete. The learning material is archived under `docs/proverif/` (manual transcriptions, per-chapter notes, example models, PDFs). It stays as reference for the protocol knowledge that the upcoming project builds on.
- Next up is a web project for visual modeling of security protocols. Code for it will live in a new top-level directory. Details are being settled; until they are, treat the layout and conventions described below as the ground truth.

The repository is not a production software project. Work here should optimize for:

- correctness of explanations and models,
- clarity of protocol modeling,
- traceable progress,
- minimal accidental complexity.

## Directory Layout

- `README.md` - project overview, index, and navigation.
- `docs/` - study and research material.
  - `docs/proverif/manual/` - `manual-01-*.md` to `manual-10-*.md`, chapter-by-chapter transcription of the official manual (body in English). The reference for ProVerif syntax and semantics.
  - `docs/proverif/note/` - per-chapter study notes in Chinese. `00-framework.md` is the master outline; `01` to `06b` cover the chapters. Written chapter by chapter, each answering one capability question.
  - `docs/proverif/pv/` - example `.pv` models.
  - `docs/proverif/pdf/` - official PDFs (manual, tutorial, survey).
- A future top-level directory will hold the new web project's code.

## Working Principles

1. Preserve correctness of explanations and models.
2. Prefer small, well-explained changes over broad restructuring.
3. Keep examples readable for someone building protocol intuition.
4. Do not introduce unnecessary build systems, frameworks, or automation unless explicitly requested.
5. Always run the `humanizer-zh` skill when writing or editing Chinese text. The skill removes AI writing traces (padded emphasis, formulaic structures, AI vocabulary, em-dash overuse, three-part lists, hollow conclusions). Apply it to every Chinese document in this repository: study notes, README updates, explanations, and chat-style material alike. This is a standing requirement, not a per-task reminder.
6. The old `learning-docs/` and `proverif-docs/` trees are gone. Do not reintroduce those paths; current content lives under `docs/proverif/`.

## Editing the ProVerif archive

### For `.pv` files

- Keep models small and purposeful.
- Favor explicit names over clever abbreviations when readability benefits.
- Add short comments only when they help explain a modeling decision or security property.
- Preserve the distinction between secrecy queries, authentication/correspondence queries, and equivalence queries.
- When creating a variant, prefer a new file over heavily rewriting the original teaching example.

### For Markdown notes and manual files

- Write for someone learning or checking the topic step by step.
- Prefer concrete explanations over dense theory dumps.
- When referencing a `.pv` file, explain what property it demonstrates.
- Reference the manual by `manual-*.md` and section number so it can be looked up.
- Prefer repo-root-relative paths such as `docs/proverif/pv/...` in commands and references.

## Command Workflow

Run models from the repository root:

```bash
eval "$(opam env)"   # bash/zsh; fish uses: eval (opam env)
proverif docs/proverif/pv/hello.pv
proverif docs/proverif/pv/ex_handshake_annotated.pv
proverif docs/proverif/pv/NeedhamSchroederPK-corr-mutual-auth.pv
proverif docs/proverif/pv/hello.pv | grep "RESULT"
```

Because ProVerif is commonly installed through `opam`, it may not be on `PATH` in a fresh shell. Before concluding it is unavailable, run `eval "$(opam env)"` (or the shell-appropriate equivalent) and `which proverif`.

When validating a `.pv` file:

1. load the `opam` environment when needed,
2. run `which proverif` if availability is uncertain,
3. run `proverif <file>`,
4. inspect `RESULT` lines,
5. if a query fails, decide whether it is a real attack, an intended teaching example, or a modeling mistake.

When reporting verification results, distinguish clearly between results re-run in the current session and results not yet re-verified, and preserve pedagogically important failing queries instead of implying they should all be fixed.

## README Maintenance

Update `README.md` when the layout or the next-step plan materially changes, for example when the new web project directory is created or its scope is settled. Prefer additive maintenance over broad rewriting. Do not record verification summaries that were not actually checked unless they are explicitly marked as unverified.

## What To Avoid

- Do not delete or overwrite existing models or notes without a clear reason.
- Do not silently "fix" a protocol model if the flaw is pedagogically important.
- Do not add heavy tooling or formatting churn.
- Do not claim `proverif` is unavailable without first checking the `opam` environment.
- Do not leave `README.md` stale after a substantial change.
- Do not invent conventions for the new project before they are settled; when a question about the web project is genuinely open, surface it instead of guessing.

## If You Are an Agent

Before making changes:

1. read `README.md`,
2. inspect the target file,
3. preserve the layout described above.

When making changes:

1. explain the modeling or security rationale, not just the syntax,
2. prefer additive edits over destructive rewrites,
3. verify changed `.pv` files with ProVerif when feasible,
4. run the `humanizer-zh` skill on every Chinese document produced or edited,
5. report clearly if verification could not be run.
