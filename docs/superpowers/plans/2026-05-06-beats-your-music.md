# Beats Your Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost React and Express app that converts uploaded music files to a user-selected BPM, defaulting to 180 BPM.

**Architecture:** Vite serves the React UI and proxies `/api` requests to an Express server. The server uploads audio, decodes PCM with bundled FFmpeg, estimates BPM with `music-tempo`, converts tempo with FFmpeg `atempo`, and exposes the converted file for download.

**Tech Stack:** React 19, Vite, Express, Multer, ffmpeg-static, music-tempo, Vitest, Supertest.

---

## Files

- `package.json`: scripts and dependencies.
- `index.html`: Vite entry document.
- `src/main.jsx`: React app bootstrap.
- `src/App.jsx`: converter UI and client API workflow.
- `src/App.css`: full visual system and responsive styles.
- `server/index.js`: Express app and API routes.
- `server/audio-utils.js`: BPM validation, tempo factor, atempo chain, storage paths.
- `server/storage/.gitkeep`: temp storage placeholder.
- `tests/audio-utils.test.js`: unit tests.
- `tests/api.test.js`: generated click-track API smoke test.

## Tasks

- [ ] Scaffold package files and install dependencies.
- [ ] Add server audio utilities and unit tests.
- [ ] Add Express upload/analyze/convert/download routes.
- [ ] Add React converter UI with default target BPM 180.
- [ ] Style the app as a premium dark running console with accessible states.
- [ ] Verify with unit tests, API smoke test, build, and browser interaction.
- [ ] Dispatch final technical critic and customer critic agents, then fix any objective gaps.

