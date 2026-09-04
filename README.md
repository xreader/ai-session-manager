# 🗂️ Claude Session Manager

> A local, zero‑dependency web dashboard to find, overview and manage **all your Claude Code sessions** across every folder on your machine — including the ones you started and forgot.

![Node](https://img.shields.io/badge/node-%E2%89%A518-43853d)
![dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

Claude Code stores every session centrally under `~/.claude`. Once you work across many
projects, it gets hard to remember **what you started, where, and whether it's still running.**
This tool reads that data (read‑only) and gives you one clean overview — as a **list**, a
**timeline**, or a **kanban board** — with **full‑text search** and **backup** built in.

![Claude Session Manager — board view](docs/board.svg)

> ⚠️ Unofficial community project. Not affiliated with or endorsed by Anthropic.

---

## More views

**List + detail** — all sessions grouped by project, with a rich detail panel:

![List view](docs/list.svg)

**Timeline** — an absolute time axis showing when each session ran, with activity markers:

![Timeline view](docs/timeline.svg)

---

## Why?

- You start a Claude Code session in some project, get interrupted, and **forget it's still running**.
- You can't remember **which folder** a session was in, or **what it was about**.
- You want a bird's‑eye view of **everything you've worked on** and its current state.

Claude Session Manager solves exactly that.

## Features

- 🟢 **Live status** — see which sessions are actually running (🟢), idle (🟡) or closed (⚫), via a real process check.
- ☰ **List + detail** — sessions grouped by project; click for a rich detail panel:
  - 🎯 **Goal** (first prompt) and 📍 **latest state** (last prompt) — an instant summary, no AI call needed.
  - 💬 full **prompt history**, 🖼️ **image gallery** (screenshots pasted into the session), message counts, duration, branch, PID, folder.
- ⧗ **Timeline (Gantt)** — a single absolute time axis (years → months → days) showing **when** each session ran, with prompt markers for activity.
- ▦ **Board (Kanban)** — drag sessions across your own columns to organize your workflow.
- 🔍 **Full‑text search** across **all transcripts** — prompts **and** answers. Find the session by *what was said in it*, with highlighted snippets ranked by relevance.
- 💾 **Backup** (see below) — one‑click git push per project, plus automatic session‑history backup that survives Claude's auto‑cleanup.
- 🎴 **Visual project filter** (tiles) · 🏷️ **status filter chips** · ⌨️ **keyboard navigation** (`/` search, ↑/↓ select, `Esc` clear).
- ▶ **Resume** a forgotten session in a new terminal, 📂 **open its folder**, 📝 add **notes**.
- 🌗 **Light & dark theme**, 🌍 **multi‑language** (English/German included), all configurable.
- 🔌 **Config‑first** — almost everything is driven by a settings schema (a stepping stone toward a plugin system).

## How it works

It reads, **read‑only**, from your local `~/.claude` directory:

| Source | Used for |
|---|---|
| `~/.claude/sessions/<pid>.json` | running sessions (live status) |
| `~/.claude/projects/*/*.jsonl` | transcripts → titles, goal, prompts, images, timing, full‑text search |
| `~/.claude/session-backup/` (own git repo) | backed‑up transcripts → also read to show *archived* (cleaned‑up) sessions |

Your own data (kanban columns, notes) and settings live in separate sidecar files
(`~/.claude/session-manager-state.json`, `session-manager-config.json`).
**The original Claude Code files are never modified.**

## Privacy

- 100% **local**. Nothing is uploaded anywhere — it's a plain Node HTTP server on `localhost`.
- The web UI is only served to your machine (default `http://localhost:4317`).
- Read‑only access to your sessions; writes go only to its own sidecar/config files.

## Backup

The **Backup** tab has two independent parts:

**1. Per‑project git status & push.** For every folder your sessions live in, it shows whether it's
safely backed up — *backed up* ✅, *N unpushed* ⬆, *uncommitted changes* ●, *no remote* ⚠, or *not a
git repo*. One click **pushes** to the project's existing remote (uses your cached git credentials —
no token needed), or **commits & pushes** all changes (with a confirmation).

**2. Session‑history backup.** Claude Code auto‑deletes local transcripts older than
`cleanupPeriodDays` (default **30 days**) — so old conversations, *including the assistant's answers*,
silently disappear. This tool can copy the **full transcripts** into a git repo (incremental, on a
schedule + on start). Backed‑up sessions **stay readable inside the tool even after Claude deletes
them** (shown as *archived*). Set a private `backupRemote` in ⚙ to also push off‑machine.

> Tip: also raise `cleanupPeriodDays` in `~/.claude/settings.json` (e.g. `365`) to keep transcripts
> locally longer — the backup repo is the real off‑disk safety net.

## Requirements

- [Node.js](https://nodejs.org) **18+** (tested on 22). No npm install, **no dependencies**.

## Install & run

```bash
git clone https://github.com/xreader/ai-session-manager.git
cd ai-session-manager
node server.js
```

Then open <http://localhost:4317>.

**Windows:** double‑click `start.bat` (starts the server and opens your browser).
Use `stop.bat` to stop it.

Custom port: `PORT=5000 node server.js` (or set it in the settings).

## Configuration

Open ⚙ in the top‑right. Everything is stored in `~/.claude/session-manager-config.json`.

- **Language**, **theme** (light/dark), **start view**, **auto‑refresh interval**, **server port**
- **Kanban columns** (freely definable)
- **Terminal used for “Resume”** — presets per platform with a live preview:
  - Windows: PowerShell, cmd, Windows Terminal
  - macOS: Terminal.app, iTerm
  - Linux: gnome‑terminal, konsole, xterm
  - …or a **custom command** with `{cwd}` and `{id}` placeholders.
- **Backup**: optional `backupRemote` (git URL for off‑machine push), auto‑backup interval (hours),
  and backup folder.

### Adding a language

Copy `lang/en.json`, translate the values, set `"_name"` (e.g. `"Français"`), save as
`lang/fr.json` — it appears in the language picker automatically. No code changes. PRs welcome!

## Roadmap

- 🧠 **Support more AI assistants**, not just Claude Code — pluggable “session providers” for
  other coding agents/CLIs (e.g. tools that keep local session/transcript data).
- 🔔 **Notifications** for forgotten/idle running sessions.
- 🗜️ **Compressed off‑site backup** (gzip transcripts) so large histories push cleanly to GitHub.
- 📈 **Activity pulse** (GitHub‑style) instead of single dots in the timeline.
- 🧩 **Plugin system** — contribute views, columns, commands and settings via drop‑in modules.

Recently shipped: 🔍 full‑text search · 💾 per‑project git backup + session‑history backup ·
🏷️ status filters · ⌨️ keyboard nav · 🌗 dark mode.

Ideas and feedback welcome — open an issue!

## Contributing

**Pull requests are welcome!** 🎉

- Small, focused PRs are easiest to review.
- New translations are especially appreciated (see “Adding a language”).
- For larger changes, open an issue first to discuss the direction.

The whole app is intentionally tiny and dependency‑free: a single `server.js`, a single
`index.html`, and `lang/*.json`. Easy to read, easy to hack.

## License

[MIT](LICENSE) — do whatever you like, no warranty.
