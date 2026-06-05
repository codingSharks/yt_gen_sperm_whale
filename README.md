Generative VJ Cyber Dashboard

Minimal single-file React/Tailwind app for realtime audio-reactive visuals.

Features:
- 3-band audio analyzer (BASS/MID/HIGH)
- Canvas-based visual engine with FX rack
- Logo upload and IndexedDB caching
- SoundCloud import (metadata + optional cover import with preference)
- Two DOM marquees as tickers and safe HUD zones

Run locally:
Open `nil_yt_visual_generator_pro.html` in your browser (double-click or serve over a static server).

Notes:
- SoundCloud playback requires either an embeddable player or CORS-enabled stream; the app stores the SoundCloud link and metadata but does not stream directly.
- Preferences stored in `localStorage` under `scCoverPref`.

Repo: git@github.com:codingSharks/yt_gen_sperm_whale.git
