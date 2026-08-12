/* ================================================================
   ROUTING & PROVENANCE — how an id reaches the cast player

   The routing model (design-library-ui.md §5, v0.70): every playable
   id is classified native / bridged / fallback / none against the
   CAST player — sources declare, the player decides. This file also
   owns the two provenance readers (system + service badges) and the
   category-name folding shared by the amalgam and the index.

   Pure functions only — no state, no DOM. Trivially testable.
   ================================================================ */
/* MA → SONOS (v0.66 — Suresh: "The sonos player is the target!").
   MA hands back `spotify--<instance>://track/<id>`; the tail is a real
   Spotify base-62 id, so a canonical `spotify:track:<id>` falls out —
   and HA's Sonos integration checks `share_link.is_share_link(media_id)`
   BEFORE any media_type branch, so Sonos takes it as-is. Verified
   against SoCo's SpotifyShare regex,
       spotify.*[:/](album|episode|playlist|show|track)[:/](\w+)
   which is also why ARTIST is absent below: Sonos cannot share-link an
   artist. Those (and MA's own `library://…`) fall back to the MA
   player, which can always play its own ids. */
const SPOTIFY_SHARE_KINDS = { album: 1, episode: 1, playlist: 1, show: 1, track: 1 };
function brSpotifyUri(id) {
  if (typeof id !== "string") return null;
  let m = /^spotify[^:]*:\/\/([a-z]+)\/([A-Za-z0-9]+)/.exec(id);   /* MA */
  if (!m) m = /^spotify:([a-z]+):([A-Za-z0-9]+)/.exec(id);            /* canonical */
  if (!m) m = /open\.spotify\.com\/([a-z]+)\/([A-Za-z0-9]+)/.exec(id);  /* share URL */
  if (!m || !SPOTIFY_SHARE_KINDS[m[1]]) return null;
  return "spotify:" + m[1] + ":" + m[2];
}

/* ================================================================
   ROUTING (v0.70 — design-library-ui.md §5, "THE CAST PLAYER
   DECIDES"). What you can usefully search is bounded by what the
   cast player can actually PLAY — a result that cannot reach the
   speaker is not a result. So every playable id is classified by how
   it reaches the cast player:

     native    the cast player plays this id directly
     bridged   a known conversion applies (MA spotify--…://x/<id>
               → spotify:x:<id>, which Sonos share-links — v0.66)
     fallback  only playable by handing off to ANOTHER entity, which
               EVICTS the cast player's queue — the real Sonos queue
               disappears and the Sonos app shows a single MA stream
     none      cannot be played here at all — never offered

   native and bridged render normally; fallback is MARKED on the tile
   and its play is a deliberate two-step (barConfirm), never a silent
   hand-off; none is suppressed in mkItems.

   SOURCES DECLARE, THE PLAYER DECIDES: an item may carry its own
   `_route` (the seam a new source — the phase-3 Sonos index — stamps
   at production time); otherwise the rule below covers today's two
   sources. The tree's ids come from the cast player itself, so they
   are native by construction (viaMa unset); search ids come from the
   engine's player and are judged one by one. */
function brRoute(c, mp, viaMa) {
  if (c && c._route) return c._route;
  if (!viaMa || viaMa === mp) return "native";
  if (brSpotifyUri(c.media_content_id)) return "bridged";
  return "fallback";
}

/* SOURCE OF AN ID (v0.71.2 — Suresh: "a small badge on the tile
   showing the source"). The provenance brRoute keys on, made visible
   — derived from the uri scheme, rendered as a tiny bottom-right
   label by the chassis (`src`). Null means no badge: an id whose
   scheme says nothing useful stays unlabelled rather than guessed. */
/* PROVENANCE IS TWO FACTS (v0.73.2 — Suresh: "we need to split this
   into two badges. 1) the base provider: sonos or ma… 2) the tile
   provider: deezer, spotify etc").

   The SYSTEM — which id-space owns this item, i.e. which door the
   play goes through — a two-letter mini badge, bottom right:
   SO (Sonos: FV:/SQ:/A:/x-file-cifs), MA (library:// and every MA
   provider-instance uri, spotify--Xy:// included), HA
   (media-source://). */
function brSysOf(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith("library://") || /^[a-z0-9]+--/.test(id)) return "ma";
  if (/^(x-file-cifs|x-rincon|x-sonos|FV:|SQ:|A:|S:)/.test(id)) return "so";
  if (id.startsWith("media-source://")) return "ha";
  return null;
}
/* The SERVICE — where the content actually lives — top right. Two
   honest signals, in order of trust: MA's provider-instance prefix
   (`deezer--Xy://…` names it outright), then the artwork CDN (a
   Sonos favourite or library:// item wearing Deezer's artwork came
   from Deezer). No guess otherwise. */
function brSvcOf(id, img) {
  if (typeof id === "string") {
    const m = /^([a-z0-9]+)--/.exec(id);
    if (m && m[1] !== "filesystem") return m[1];
    if (/^spotify:|open\.spotify\.com/.test(id)) return "spotify";
  }
  const t = typeof img === "string" ? img : "";
  if (/scdn\.co|spotifycdn/.test(t)) return "spotify";
  if (/dzcdn\.net/.test(t)) return "deezer";
  if (/tidal\.com/.test(t)) return "tidal";
  if (/ytimg\.|music\.youtube/.test(t)) return "youtube";
  if (/mzstatic\.com/.test(t)) return "apple";
  return null;
}

/* category-name folding, shared by the amalgam (v0.72) and the
   index (v0.73): "Radio Stations" and "Radio" are the same shelf */
function brFoldCat(s) {
  s = String(s || "").toLowerCase().trim();
  if (/^radio|station/.test(s)) return "radio";
  if (/playlist/.test(s)) return "playlists";
  if (/track|song/.test(s)) return "tracks";
  if (/^contributing|artist/.test(s)) return "artists";
  if (/album/.test(s)) return "albums";
  if (/genre/.test(s)) return "genres";
  if (/composer/.test(s)) return "composers";
  return s;
}

