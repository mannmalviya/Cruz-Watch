# CruzWatch — agent instructions

Edge hazard monitoring. `backend/` is the Python detection + agent stack, `web/` is
the Next.js console. `./run.sh` starts everything; `README.md` has the details.

`web/AGENTS.md` applies on top of this file for anything under `web/`. Read it —
that Next.js version has breaking changes from what you likely know.

## Git workflow

The repo is `https://github.com/mannmalviya/Cruz-Watch` (public, `main`).

**Commit as you go.** Land a commit whenever a piece of work is coherent on its
own — a feature, a fix, a refactor. Don't let a session's worth of changes pile up
into one shapeless commit, and don't commit half-working code just to have a commit.

**Ask before pushing.** When a feature is implemented and committed, ask the user
whether to push. Don't push unprompted. If they say yes, push to `main` and give
them the commit line back.

Never `--force` push. If a push is rejected, look at what is on the remote before
doing anything else, then rebase onto it.

This repo is **public**. Before any push, confirm no credentials, keys, or tokens
are in the tracked files. `web/.env.local` is gitignored — keep it that way.

## Commit messages

Subject line: imperative mood, under ~70 chars, says what changed.

Add a body whenever the *why* isn't obvious from the diff — a non-obvious
constraint, a rejected alternative, a bug the change actually fixes. Skip the body
for changes that explain themselves. Never write a body that just restates the
subject in more words.

```
Cut landing page copy to headings and bullets

The prose buried the three primitives. Hero now carries one line; each
section is a heading plus bullets.
```

Don't list every changed file — that's what the diff is for.

## What is deliberately not in git

`web/public/demo/*.mp4` (217 MB) and `backend/clips/*.mp4` are gitignored, as are
the `*.pt` model weights. A fresh clone therefore has **no video** — the dashboard
will render empty feeds until those files are supplied locally.

`web/.vercelignore` exists because of this: the dashboard fetches `/demo/<id>.mp4`
at runtime, so the videos must still upload on `vercel deploy` even though git
ignores them. If you change either ignore file, check the other.
