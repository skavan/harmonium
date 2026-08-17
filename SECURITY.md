# Security

*Purpose: The trust model — pairing, tokens, what the integration will and will not do — and how to report a vulnerability. Audience: security-minded users and reporters.*

Harmonium's security model, in the order a stranger needs it.

## The trust model

- **The engine is one auditable HTML file** with zero dependencies —
  no framework, no CDN scripts (one webfont from Google Fonts), no
  fetch at boot beyond your own Home Assistant. What you deploy is
  what you can read.
- **The Studio is the admin side.** It runs as an HA panel behind
  HA's own login, and talks to HA with a long-lived access token you
  create; the token is stored only in that browser's localStorage.
- **Remotes are the untrusted side.** They authenticate to HA with
  their own individually-minted tokens (below) and can do exactly
  what the HA user who approved them can do — so approve remotes
  from an account with sensible rights.

## Pairing

A remote never sees a token field. The flow:

1. The remote POSTs an unauthenticated pairing request; the
   integration answers with a short code (`FIG-482` — unambiguous
   alphabet, 19 letters × 5 digits).
2. The code shows big on the remote and in the Studio. A human
   compares them — the same code-match ceremony as Bluetooth.
3. **Approve** (Studio, admin-authenticated) mints a long-lived
   token *named after the device and code* on the approving user's
   account, and hands it to the remote **once**; the pairing session
   burns immediately after.

Guardrails: sessions expire in 5 minutes; at most 5 pending offers;
per-IP rate limiting (5/min) on the unauthenticated endpoint;
one-time token release; deny and cancel both burn the session.

**Un-pairing / revocation** is HA-native: your profile → Security →
delete that remote's token. The remote drops to the pair screen on
its next connection. On-device, ⓘ → *Sign out & re-pair* forgets the
token locally (revoke it in HA too for full de-authorization).

## Engine self-deploy

The integration deploys its bundled engine to `www/harmonium/` and
records a fingerprint stamp of what *it* deployed. It only ever
overwrites a file matching its own stamp — a hand-pushed dev engine
is never silently reverted, and a dev checkout without a bundle
never deploys anything.

## For forkers

- Never commit tokens. `.env.local` (used by some local tooling) is
  gitignored — keep it that way, and if a token ever lands in git
  history, **revoke the token**; deleting the file does not unpublish
  history.
- Your house profiles (`houses/*.cmd`), pulled configs
  (`houses/<id>/`) and `houses/default.txt` are gitignored — they
  describe your home's layout and belong to you.

## Reporting a vulnerability

Open a [GitHub security advisory](https://github.com/skavan/harmonium/security/advisories/new)
(preferred), or an issue marked *security* if it isn't sensitive.
Include the engine version (ⓘ page) and integration version (Studio
header). Beta-stage promise: acknowledged fast, fixed with the same
priority as a broken remote — which is to say, immediately.
