# AGENTS.md

## Purpose

This repository is a study workspace for:

- foundational cryptography concepts,
- security protocol analysis,
- ProVerif syntax, modeling style, and verification workflow.

The repository is not a production software project. Most work here should optimize for:

- correctness of explanations,
- clarity of protocol models,
- traceable learning progress,
- minimal accidental complexity.

## Primary Contents

- `README.md`
  - project overview,
  - recommended learning order,
  - environment setup notes.
- `proverif-docs/`
  - official manuals and tutorial PDFs,
  - example `.pv` models,
  - handshake, secrecy, equivalence, induction, and Needham-Schroeder examples.

At the current stage, this repository is mainly document- and model-centric. Expect most edits to involve:

- Markdown notes,
- learning plans,
- explanations of protocol behavior,
- new or modified `.pv` examples.

## Working Principles

When contributing in this repository:

1. Preserve the repository's educational focus.
2. Prefer small, well-explained changes over broad restructuring.
3. Keep examples readable for a learner who is building ProVerif intuition.
4. When adding protocol models, include enough surrounding context that the model can be studied independently.
5. Do not introduce unnecessary build systems, frameworks, or automation unless explicitly requested.

## Editing Guidelines

### For `.pv` files

- Keep models small and purposeful.
- Favor explicit names over clever abbreviations when readability benefits.
- Add short comments only when they help explain a modeling decision or security property.
- Preserve the distinction between:
  - secrecy queries,
  - authentication/correspondence queries,
  - equivalence queries.
- When creating a variant of an existing model, prefer adding a new file instead of heavily rewriting the original teaching example.

Recommended pattern for new learning-oriented models:

1. short header comment,
2. cryptographic primitives,
3. free names and secrets,
4. events and queries,
5. role definitions,
6. top-level process.

### For Markdown files

- Write for someone learning the topic step by step.
- Prefer concrete explanations over dense theory dumps.
- When referencing a `.pv` file, explain what property it demonstrates and why it matters.
- Keep command examples copy-pastable.

## Command Workflow

Useful local commands:

```bash
proverif proverif-docs/hello.pv
proverif proverif-docs/hello_ext.pv
proverif proverif-docs/hello_var.pv
proverif proverif-docs/ex_handshake.pv
proverif proverif-docs/ex_handshake_annotated.pv
proverif proverif-docs/ex_handshake_annotated_fixed.pv
```

When validating a new or edited model:

1. run `proverif path/to/file.pv`,
2. inspect `RESULT` lines,
3. if a query fails, determine whether it is:
   - a real attack,
   - an intended teaching example,
   - or a modeling mistake.

## Environment Notes

The repository is commonly used from Linux or WSL. The README currently recommends a Unix-like workflow with `opam` and ProVerif installed locally.

If shell examples differ by shell:

- use `eval "$(opam env)"` for `bash`/`zsh`,
- use `eval (opam env)` for `fish`.

## What To Avoid

- Do not delete or overwrite existing example models without a clear reason.
- Do not silently "fix" a protocol model if the flaw is pedagogically important.
- Do not assume a failing query is a bug; it may be the point of the example.
- Do not add heavy tooling or formatting churn to a study repository.

## Preferred Contribution Style

Good contributions usually look like one of these:

- add a new annotated `.pv` example,
- add a Markdown explanation of an existing example,
- clarify setup instructions for a specific platform,
- compare a vulnerable model with a fixed variant,
- document what a query means and how to read its result.

## If You Are an Agent

Before making changes:

1. read `README.md`,
2. inspect the target `.pv` or Markdown file,
3. preserve the repository's learning-oriented structure.

When making changes:

1. explain the security or modeling rationale, not just the syntax,
2. prefer additive edits over destructive rewrites,
3. verify changed `.pv` files with ProVerif when feasible,
4. report clearly if verification could not be run.
