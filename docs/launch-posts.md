# Launch posts — copy/paste

Repo: https://github.com/xreader/ai-session-manager

---

## GitHub "About" (repo description)
> Local, zero-dependency dashboard to find, overview and manage all your Claude Code sessions — list, timeline & kanban. Read-only, runs on localhost.

**Topics:** `claude` `claude-code` `anthropic` `ai` `llm` `dashboard` `kanban` `gantt` `developer-tools` `nodejs` `productivity` `cli`

---

## Hacker News — Show HN

**Title:**
Show HN: Find and manage the Claude Code sessions you forgot you left running

**Body:**
I use Claude Code across a lot of projects, and I kept losing track of my sessions — I'd start one in some folder, get interrupted, and forget it was still running. There was no single place to see everything I had going.

So I built a small local dashboard for it. It reads Claude Code's local data in `~/.claude` (read-only) and shows every session three ways:

- a **list + detail** view (grouped by project, with each session's goal, latest state, prompt history and pasted screenshots),
- a **timeline / Gantt** on one absolute time axis so you can see *when* things ran, and
- a **kanban board** to organize them.

It also shows live status (which sessions are actually still running, via a process check), lets you resume a session in a new terminal, open its folder, and add notes.

Details that mattered to me:
- 100% local — it's a plain Node HTTP server on localhost, nothing leaves the machine.
- Zero dependencies — one `server.js`, one `index.html`. Easy to read and hack.
- Read-only on Claude's files; my own data (columns/notes) goes in a separate sidecar file.
- Config-first: theme, columns, language (en/de), terminal command — all in a settings file driven by a schema.

Roadmap is to support other AI coding assistants too (pluggable session providers), full-text search across transcripts, and an optional git-status badge per session folder.

It's MIT-licensed. Feedback and PRs very welcome — especially on what other tools/agents I should support next.

https://github.com/xreader/ai-session-manager

---

## Reddit — r/ClaudeAI (and r/ClaudeCode)

**Title:**
I kept forgetting which Claude Code sessions I had running — so I built a dashboard for all of them

**Body:**
If you use Claude Code across many projects, you probably know the feeling: you start a session in some folder, get pulled away, and later have no idea what you had running or where.

I made a small **local web app** that reads Claude Code's `~/.claude` data (read-only) and gives you one overview of every session:

- 🟢 **Live status** — which sessions are actually still running vs. idle vs. closed
- ☰ **List + detail** — grouped by project, with each session's goal, latest state, full prompt history and pasted screenshots
- ⧗ **Timeline** — an absolute time axis showing when each session ran
- ▦ **Board** — a kanban to organize them
- ▶ **Resume** a forgotten session in a new terminal, 📂 open its folder, 📝 add notes

It's **100% local** (Node server on localhost, nothing uploaded), **zero dependencies**, read-only on Claude's files, light/dark theme, English/German. MIT-licensed.

Repo + screenshots: https://github.com/xreader/ai-session-manager

Would love feedback — and ideas for which other AI coding tools I should support next. PRs welcome!

---

## Reddit — r/selfhosted / r/commandline (more technical tone)

**Title:**
A zero-dependency local dashboard for Claude Code sessions (list / timeline / kanban)

**Body:**
Small self-hosted tool I built for my own workflow: it reads Claude Code's local session data in `~/.claude` (read-only) and serves a dashboard on `localhost:4317`.

- One `server.js` + one `index.html`, **no npm install, no dependencies** (Node 18+).
- Views: list+detail, Gantt-style timeline, kanban board.
- Live "is it still running?" check, resume in a configurable terminal (PowerShell/cmd/wt, Terminal/iTerm, gnome-terminal/konsole/xterm), open folder, notes.
- Config-first (settings schema), i18n via drop-in JSON files, light/dark.
- Nothing leaves the machine; writes only to its own sidecar/config files.

MIT. https://github.com/xreader/ai-session-manager

---

## X / Twitter

I kept forgetting which Claude Code sessions I had running across my projects…

so I built a tiny local dashboard for all of them: live status, a timeline of when each ran, and a kanban board. 100% local, zero dependencies, MIT.

#ClaudeCode #ClaudeAI

https://github.com/xreader/ai-session-manager
