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
  - current learning progress,
  - verified example status,
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
- Treat `README.md` as a living study index, not a static project blurb.
- When the user finishes a meaningful learning milestone, updates verification results, or changes the recommended learning order, reflect that in `README.md`.
- When updating `README.md`, prefer:
  - recording what has already been studied,
  - summarizing what each completed model taught,
  - noting important `RESULT` outcomes when they were actually verified,
  - adjusting the next-step study plan.

## Command Workflow

Useful local commands:

```bash
eval "$(opam env)"
proverif proverif-docs/hello.pv
proverif proverif-docs/hello_ext.pv
proverif proverif-docs/hello_var.pv
proverif proverif-docs/ex_handshake.pv
proverif proverif-docs/ex_handshake_annotated.pv
proverif proverif-docs/ex_handshake_annotated_fixed.pv
```

Because ProVerif is commonly installed through `opam`, do not assume it is already on `PATH` in every shell session.
Before concluding that `proverif` is unavailable, check whether it becomes available after loading the `opam` environment.

Recommended verification flow in `bash`/`zsh`:

```bash
eval "$(opam env)"
which proverif
proverif path/to/file.pv
```

Recommended verification flow in `fish`:

```fish
eval (opam env)
which proverif
proverif path/to/file.pv
```

When validating a new or edited model:

1. load the `opam` environment when needed,
2. run `which proverif` if command availability is uncertain,
3. run `proverif path/to/file.pv`,
4. inspect `RESULT` lines,
5. if a query fails, determine whether it is:
   - a real attack,
   - an intended teaching example,
   - or a modeling mistake.

If `proverif` is not found in the current shell but exists at a path such as `~/.opam/default/bin/proverif`, do not report verification as impossible until after trying `eval "$(opam env)"` or the shell-appropriate equivalent.

When reporting verification results in this repository:

1. distinguish clearly between:
   - results re-run in the current session,
   - results copied from earlier notes,
   - and results not yet re-verified;
2. preserve pedagogically important failing queries instead of implying they should all be fixed;
3. update `README.md` when the verified-study status has materially changed.

## README Maintenance

`README.md` should evolve alongside the study progress.

Agents should update `README.md` when any of the following happens:

1. one or more official example models have been studied,
2. a new annotated `.pv` file is added,
3. the next recommended learning sequence changes,
4. previously unverified examples are actually re-run and their `RESULT` summaries become worth recording.

When updating `README.md`, prefer additive maintenance over broad rewriting unless the document structure has clearly become outdated.

A good README update in this repository usually includes:

1. what was learned,
2. which files were involved,
3. what property or query each file demonstrates,
4. what the next step should be.

Do not add claimed verification summaries to `README.md` unless they were actually checked or explicitly marked as unverified.

## ProVerif Execution Notes

The repository is often used in WSL or Linux environments where ProVerif is installed via `opam`.

Practical rule for agents:

1. first try the command in the current shell if reasonable,
2. if `proverif` is missing, load the `opam` environment,
3. only then conclude that verification could not be run.

This avoids false negatives caused by a shell session whose `PATH` does not yet include `~/.opam/default/bin`.

If shell examples differ by shell:

- use `eval "$(opam env)"` for `bash`/`zsh`,
- use `eval (opam env)` for `fish`.

When documenting commands for users, prefer examples that are robust in a fresh shell session.

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
- Do not claim `proverif` is unavailable without first checking whether the `opam` environment simply has not been loaded.
- Do not leave `README.md` stale after a substantial learning milestone or verified progress update.

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
