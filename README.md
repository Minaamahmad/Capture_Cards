<div align="center">

# 🂡 Capture Cards

**A multiplayer card game where you race to capture cards in real time — against friends, not bots.**

![Capture Cards deck](./public/deck.png)

</div>

---

## Why I built this

I wanted to actually *feel* real-time multiplayer instead of just reading about it — the state syncing, the socket handshakes, the little UI touches that make a browser tab feel like a card table. Capture Cards is that project. It's the classic Cassino card game, rebuilt from scratch with a casino-style table, a first-person card fan, and live play over WebSockets.

## What it does

- Play Cassino live with friends — no refresh, no lag between moves
- Casino-style table UI with a first-person hand layout
- Real-time game state sync via Socket.IO
- Smooth card animations powered by Framer Motion

## Built with

`Next.js 16` · `React 19` · `TypeScript` · `Socket.IO` · `Tailwind CSS` · `Framer Motion`

## Getting started

\`\`\`bash
git clone https://github.com/Minaamahmad/game.git
cd game
npm install
npm run dev
\`\`\`

Open \`http://localhost:3000\` and start a table.

## Status

Actively in progress — game engine and socket handling are stable, UI polish and a React Native port are underway.

---

<div align="center">
<sub>Built by <a href="https://github.com/Minaamahmad">Min</a></sub>
</div>
