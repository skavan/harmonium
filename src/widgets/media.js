/* MEDIA tile — now-playing card; tap play/pauses. FOUR renderers
   (v0.83.7 — Suresh: "lets come up with 3 renderers"): default card,
   style:"slim" one-liner, style:"art" hero (legacy art:true), and
   style:"poster" (v0.83.8 — his found-in-the-wild screenshot: "I
   think we build this. With a Bar underneath for the Library"):
   big centered artwork, track text under it, a real progress bar
   with elapsed/total times, and the chassis trailing restyled as a
   full-width bar — NO transport and NO volume, those are bands. */
/* style resolution (v0.83.7 follow-up — Suresh: "Hero tile seems the
   same as Standard": on the stock MUSIC controller the surface tile
   says art:true, so "Standard" WAS the hero). "plain" exists to say
   "the flat card, even if the surface tile is art:true"; "" defers
   to the tile. The Studio's Auto option writes nothing at all. */
/* v0.83.7 round 2 ("We lost the original display, bring it back! But
   this new one should be the default!"): "art" = the RIGHT-PANEL hero
   (default for art:true); "wash" = the original full-bleed — dimmed
   artwork under the whole card, 64px thumb beside the text. */
/* np_default vs style (v0.85.1 — Suresh: "Selecting any other cards
   (Hero - Large etc) does nothing - we're locked out"). A stock tile
   must NOT hardcode `style`: surfDressTile only applies the activity's
   chosen np_style when `!t.style`, so a baked style silently disables
   the picker. `np_default` states the shipped default WITHOUT taking
   the slot, so the activity can always override it. */
const npMode = t => t.style
  ? (t.style === "plain" ? "" : t.style)
  : (t && (t.np_default || (t.art ? "art" : ""))) || "";
WIDGETS.media = {
    /* Default = the plain card. "slim" = one line — a play indicator
       + "Title — Artist" — for controllers where music is background;
       the chassis trailing (library / detail) rides along. "art" =
       the artwork hero: background art, title/artist/album at the
       same font sizes, live progress meter, NO transport and NO
       volume (those are their own bands). One shared 1s ticker
       interpolates position from media_position_updated_at while
       playing (HA only sends media_position on state changes) — it
       touches ONLY visible art heroes, never triggers a re-render.
       The activity picks its style on the Controller tab
       (surface.np_style, applied by surfDressTile). */
    sub: (e, t) => {
      if (npMode(t) === "slim") return "";
      const s = st(e);
      const pend = npPending(e, s);
      if (pend) return "Queuing" +
        (pend.label ? " “" + pend.label + "”" : "") + "…";
      /* the SOURCE gets its own line (v0.83.7 tidy-ups: "Music
         Assistant Queue should sit on its own line") — .sub is
         white-space: pre-line on media tiles */
      const src = s.a.source ? "\n" + appLabel(s.a.source) : "";
      return cap(s.s) + src;
    },
    isOn: e => ["playing", "on", "paused"].includes(st(e).s),
    detailable: true,
    select: e => callService("media_player", "media_play_pause", null, e),
    body: t => {
      const m = npMode(t);
      /* poster: same data slots as the heroes (npt/npa/npb/npimg/
         npprog — render() below is shared verbatim), stacked instead
         of side-by-side, plus the elapsed/total readout under the
         meter. The Library bar is the chassis TRAILING, restyled
         full-width in CSS — no second navigation grammar. */
      if (m === "poster") return `<div class="npposter">
      <div class="npart"><i class="npsq"></i><img class="npimg hidden" alt="">
        <div class="npph hidden"><span class="material-symbols-outlined">music_note</span></div></div>
      <div class="npt"></div>
      <div class="npa"></div>
      <div class="npb"></div>
      <div class="meter npprog hidden"><i></i></div>
      <div class="nptimes hidden"><span class="npel"></span><span class="npdu"></span></div>
    </div>`;
      /* ART HERO, the middle (v0.85): Compact's side-by-side wrap so
         it stays short, plus Large's progress + elapsed/total readout
         and its full-width Library bar (CSS). Sized to leave the
         Volume tile above the fold on a 480x800 remote. */
      if (m === "hero") return `<img class="npimg hidden" alt="">
    <div class="npph hidden"><span class="material-symbols-outlined">music_note</span></div>
    <div class="npwrap">
      <div class="npmeta">
        <div class="npt"></div>
        <div class="npa"></div>
        <div class="npb"></div>
      </div>
    </div>
    <div class="meter npprog hidden"><i></i></div>
    <div class="nptimes hidden"><span class="npel"></span><span class="npdu"></span></div>`;
      if (m === "art" || m === "wash") return `<div class="npwrap">
      <img class="npimg hidden" alt="">
      <div class="npph hidden"><span class="material-symbols-outlined">music_note</span></div>
      <div class="npmeta">
        <div class="npt"></div>
        <div class="npa"></div>
        <div class="npb"></div>
      </div>
    </div>
    <div class="meter npprog hidden"><i></i></div>`;
      if (m === "slim") return `<div class="npslim">
      <span class="material-symbols-outlined npsind">graphic_eq</span>
      <span class="npst"><span class="npstx">–</span></span>
    </div>`;
      return `<div class="meter hidden"><i></i></div>`;
    },
    wire: (el, t) => {
      const m = npMode(t);
      if (m === "slim") { el.classList.add("slim"); return; }
      if (m !== "art" && m !== "wash" && m !== "poster" && m !== "hero") return;
      el.classList.add(m === "wash" ? "wash" : m === "poster" ? "poster"
        : m === "hero" ? "hero" : "art");
      const img = el.querySelector(".npimg");
      img.addEventListener("error", () => {
        img.dataset.bad = "1"; img.classList.add("hidden");
        renderStates();
      });
      /* BLANK-ART DETECTION (v0.85.4 — his: "Some sources/players give
         a blank, black image as their artwork, which looks wonky…
         detect that its an all black image and substitute a
         placeholder"). On load, sample the picture at 8×8 and average
         the luminance; near-black means "not really artwork". A
         cross-origin picture taints the canvas and getImageData
         throws — those are assumed fine (HA-proxied art is
         same-origin, which is the common case). Cached per URL so a
         re-render never resamples. */
      img.addEventListener("load", () => {
        /* keyed on the LOADED src, not dataset.src (v0.85.7 — the
           stuck-art round): a same-URL player re-fetches with a
           per-track bust param, and the cache must judge each
           track's picture — keying on the bare URL froze the first
           verdict forever. */
        const url = img.src || img.dataset.src;
        if (!url) return;
        if (!window.NP_ART_DARK) window.NP_ART_DARK = {};
        const cache = window.NP_ART_DARK;
        if (url in cache) {
          img.dataset.bad = cache[url] ? "1" : "";
          if (cache[url]) renderStates();
          return;
        }
        try {
          const cv = document.createElement("canvas");
          cv.width = 8; cv.height = 8;
          const cx = cv.getContext("2d");
          cx.drawImage(img, 0, 0, 8, 8);
          const d = cx.getImageData(0, 0, 8, 8).data;
          let lum = 0;
          for (let i = 0; i < d.length; i += 4)
            lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          lum /= 64;
          cache[url] = lum < 12;          /* near-black, allowing noise */
        } catch (err) { cache[url] = false; }
        img.dataset.bad = cache[url] ? "1" : "";
        if (cache[url]) renderStates();
      });
    },
    render: (el, e, t) => {
      if (npMode(t) === "slim") {
        const s = st(e);
        const pend = npPending(e, s);
        const line = pend
          ? (pend.label ? "Queuing “" + pend.label + "”…" : "Queuing…")
          : (s.a.media_title
            ? s.a.media_title + (s.a.media_artist ? " — " + s.a.media_artist : "")
            /* v0.85.4 (his TV list, #1): a TV shows no title, so the
               row was a bare "Playing" — the APP is the story there:
               "Playing • YouTube TV". Music with a title is unchanged. */
            : cap(s.s) + ((s.a.app_name || s.a.source)
              ? " • " + appLabel(s.a.app_name || s.a.source) : ""));
        const box = el.querySelector(".npst");
        const tx = el.querySelector(".npstx");
        el.querySelector(".npsind").classList.toggle("live", s.s === "playing");
        if (tx.textContent !== line) {
          tx.textContent = line;
          /* AUTOSCROLL (v0.83.7 follow-up — "Slim 'Now playing' row
             should autoscroll text"): when the line overflows, glide
             it end-to-end and back (CSS marquee, distance in a var);
             measured after layout so scrollWidth is honest */
          requestAnimationFrame(() => {
            const over = tx.scrollWidth - box.clientWidth;
            if (over > 4) {
              tx.style.setProperty("--npshift", "-" + over + "px");
              box.classList.add("scroll");
            } else {
              box.classList.remove("scroll");
              tx.style.removeProperty("--npshift");
            }
          });
        }
        return;
      }
      const mm = npMode(t);
      /* BASIC (v0.85.4 — his spec, verbatim): the LABEL slot carries
         the state ("Now Playing" while playing, "Idle" otherwise); the
         line below carries the TRACK, then the ARTIST — the same facts
         Compact shows, minus the album. An empty queue says so, with
         the source underneath. The chassis wrote its default sub just
         before this runs, so this pass owns both slots. */
      if (mm === "") {
        const s0 = st(e);
        const lbl0 = el.querySelector(".lbl");
        if (lbl0) lbl0.textContent =
          s0.s === "playing" ? (t.label || "Now Playing") : cap(s0.s);
        const sub0 = el.querySelector(".sub");
        if (sub0) {
          const src0 = appLabel(s0.a.app_name || s0.a.source || "");
          /* "On a TV, there is no queue" (v0.85.5): queue language is
             music talk. A tv-class player (or anything reporting an
             app) just says where it is — "YouTube TV". */
          const tvish = s0.a.device_class === "tv" || !!s0.a.app_name;
          sub0.textContent = s0.a.media_title
            ? s0.a.media_title + "\n" +
              (s0.a.media_artist || s0.a.media_series_title || "")
            : tvish ? src0
            : "No items in the queue" + (src0 ? "\n" + src0 : "");
        }
        return;
      }
      if (mm !== "art" && mm !== "wash" && mm !== "poster" && mm !== "hero") return;
      const s = st(e);
      el.dataset.eid = e || "";
      /* the poster's Library bar wants a WORD next to the trailing's
         icon — named after where it actually goes (the music
         library, the apps drawer…), read from the target screen */
      if (mm === "poster" || mm === "hero") {
        const trb = el.querySelector(".trail");
        if (trb && !trb.querySelector(".trlbl")) {
          const trg = trailingOf(t);
          const nav = trg && trg.action && trg.action.navigate;
          const tsc = nav && typeof nav === "string" ? screenOf(nav) : null;
          trb.insertAdjacentHTML("beforeend",
            `<span class="trlbl">${(tsc && tsc.name) || "Library"}</span>`);
        }
      }
      /* QUEUING (v0.73.3): a play is in flight — say so, pulsing,
         instead of sitting on "Idle" while the playlist arrives */
      const pend = npPending(e, s);
      el.classList.toggle("npqueue", !!pend);
      if (pend) {
        const lblq = el.querySelector(".lbl");
        if (lblq) lblq.textContent = "Queuing…";
        el.querySelector(".npt").textContent =
          pend.label ? "Queuing “" + pend.label + "”…" : "Queuing…";
        el.querySelector(".npa").textContent = "";
        el.querySelector(".npb").textContent = "";
        return;
      }
      /* label mirrors state — "Now Playing" only while it IS */
      const lbl = el.querySelector(".lbl");
      if (lbl) lbl.textContent =
        s.s === "playing" ? (t.label || "Now Playing") : cap(s.s);
      /* ARTWORK, two treatments: "art" = the RIGHT PANEL (npimg
         full-height, masked in CSS, words on clean background);
         "wash" = the original — dimmed full-tile background + the
         64px thumb riding beside the text. */
      const img = el.querySelector(".npimg");
      const pic = s.a.entity_picture;
      const wash = npMode(t) === "wash";
      /* KEEP THE ART, DIM IT (v0.85 — Suresh: "When I pause the player
         and it is in idle, all the artwork blanks, but I still see the
         artwork in the player. Best result would be to keep it and dim
         it"). The old rule blanked art the moment the player left
         ACTIVE — but Music Assistant parks a paused Sonos in `idle`
         while still publishing entity_picture, so a pause wiped the
         cover and RESIZED the card. Art now follows the PICTURE, and
         the card only dims: what's on screen stops jumping, and a
         paused player still looks like the thing it is playing. */
      const dimArt = !ACTIVE(s.s);
      el.classList.toggle("npdim", !!pic && dimArt);
      /* THE STUCK-ART LATCHES (v0.85.7 — Suresh: "When I click next
         track on a playlist, sometimes the artwork stops updating").
         Two ways the old gate wedged: (a) a player that serves ONE
         proxy URL whose CONTENT changes per track — src unchanged,
         so the <img> never refetched and the old cover stayed;
         (b) a transient fetch failure right after a track change set
         dataset.bad, which only a NEW url ever cleared — same-url
         players showed the placeholder forever after. The TRACK is
         the honest change signal: when it changes, the bad-latch
         clears and a same-url picture is re-fetched (tiny cache-bust
         param — art changes per track anyway). */
      const trk = (s.a.media_content_id || "") + "|" + (s.a.media_title || "");
      const trkChanged = el.dataset.trk !== trk;
      if (trkChanged) { el.dataset.trk = trk; img.dataset.bad = ""; }
      if (pic) {
        if (wash && (el.dataset.bg !== pic || trkChanged) && !dimArt) {
          el.dataset.bg = pic;
          el.style.backgroundImage =
            `linear-gradient(rgba(13,15,18,.78), rgba(13,15,18,.78)), url('${pic}')`;
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
        }
        if (img.dataset.src !== pic) {
          img.dataset.src = pic; img.src = pic; img.dataset.bad = "";
        } else if (trkChanged) {
          img.src = pic + (pic.indexOf("?") >= 0 ? "&" : "?") + "_hkt=" + Date.now();
        }
      } else {
        if (wash) { el.dataset.bg = ""; el.style.backgroundImage = ""; }
        img.dataset.src = "";
      }
      /* ONE art decision (v0.85.4): the real picture when it exists
         and is not a black slab; otherwise the PLACEHOLDER — a quiet
         icon on the art's own footprint, so the card keeps its shape
         with no artwork at all ("it shouldn't shrink when we're
         missing artwork or in idle"). Icon matches the thing: a TV for
         tv-class players, a note for the rest. */
      /* nptv (v0.85.6): a TV-class card carries a class so CSS can
         size it as a TV — no artist/album/times rows will EVER fill,
         so Large collapses their reserves and runs shorter (his 340px
         ask). device_class + app_name are constant for a player, so
         this can never flip mid-activity and re-introduce the jump. */
      el.classList.toggle("nptv",
        s.a.device_class === "tv" || !!s.a.app_name);
      const showImg = !!pic && img.dataset.bad !== "1";
      img.classList.toggle("hidden", !showImg);
      const ph = el.querySelector(".npph");
      if (ph) {
        ph.classList.toggle("hidden", showImg);
        const ic = ph.querySelector(".material-symbols-outlined");
        if (ic) ic.textContent = s.a.device_class === "tv" ? "tv" : "music_note";
      }
      /* ONE state label, and no source echo (v0.85.1 — his idle
         screenshots: "One 'idle' label on the header Row, and get rid
         of the second Idle… we also show the input source which we
         shouldn't"). The chassis header already says Idle/Playing, so
         npt carries the TITLE only and goes quiet when there isn't
         one. `source` is dropped outright: on a Fire TV it reads
         "Home", on Music Assistant "Music Assistant Queue" — the name
         of a pipe, never of a thing you are watching. */
      /* THE APP IS THE TITLE when there is no title (v0.85.4 — his TV
         list #3/#4: the source was "way too small and dim" and
         "orphaned in the middle"). A TV publishes no media_title, so
         the title row was empty and "YouTube TV" sat in the small
         album line. Promote it: it lands directly under the state
         label, at title size and full brightness — and then it does
         NOT repeat below. */
      const hasTitle = !!s.a.media_title;
      const appSrc = appLabel(s.a.app_name || s.a.source || "");
      /* v0.85.7 (his: "ALL artwork styles should say No items in the
         queue when that is true"): a MUSIC player with an empty queue
         says so in the title row, source below — the same words Basic
         uses. A TV still promotes its app (a TV has no queue). */
      const tvish = s.a.device_class === "tv" || !!s.a.app_name;
      el.querySelector(".npt").textContent =
        s.a.media_title || (tvish ? appSrc : "No items in the queue");
      el.querySelector(".npa").textContent =
        s.a.media_artist || s.a.media_series_title || "";
      /* THE APP IS THE HEADLINE on a TV (v0.85.3 — Suresh: "The most
         important bit of information the app/source is missing
         completely (i.e. You Tube TV)"). Dropping `source` in v0.85.2
         was an overcorrection: it was only ever DUPLICATE because the
         chassis sub echoed it, and that sub is hidden now. A Fire TV
         has no album — "YouTube TV" is the whole story. */
      el.querySelector(".npb").textContent =
        s.a.media_album_name ||
        (hasTitle ? appSrc : (tvish ? "" : appLabel(s.a.source || "")));
      npProgress(el, s);
    }
  };

/* the in-flight play for this entity, if it is still worth showing:
   consumed the moment the player reports playing/buffering, dropped
   after 20s (a failure has already flashed its reason by then) */
function npPending(e, s) {
  const p = S.pendingPlay;
  if (!p || !e || p.e !== e) return null;
  if (s.s === "playing" || s.s === "buffering" ||
      Date.now() - p.at > 20000) { S.pendingPlay = null; return null; }
  return p;
}

/* m:ss under an hour, h:mm:ss over — the shape every player uses */
function npClock(x) {
  x = Math.max(0, Math.round(x));
  const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = x % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) +
    ":" + String(s).padStart(2, "0");
}
function npProgress(el, s) {
  const bar = el.querySelector(".npprog");
  if (!bar) return;
  const tm = el.querySelector(".nptimes");
  const d = s.a.media_duration;
  if (!d) {
    bar.classList.add("hidden");
    if (tm) tm.classList.add("hidden");
    return;
  }
  let p = s.a.media_position || 0;
  if (s.s === "playing" && s.a.media_position_updated_at)
    p += (Date.now() - Date.parse(s.a.media_position_updated_at)) / 1000;
  bar.classList.remove("hidden");
  bar.firstElementChild.style.width =
    Math.max(0, Math.min(100, Math.round(p / d * 100))) + "%";
  /* the poster's 0:36 / 4:19 readout, riding the same interpolation */
  if (tm) {
    tm.classList.remove("hidden");
    tm.querySelector(".npel").textContent = npClock(Math.min(p, d));
    tm.querySelector(".npdu").textContent = npClock(d);
  }
}
setInterval(() => {
  /* .hero joined the list (v0.85.7 — Suresh: "the playbar stops
     updating"): the ticker predates the hero class, so the SHIPPED
     DEFAULT card's progress only moved when a state diff happened
     to arrive — between diffs it sat frozen. */
  document.querySelectorAll(
    ".tile.wgt-media.art, .tile.wgt-media.wash, " +
    ".tile.wgt-media.poster, .tile.wgt-media.hero"
  ).forEach(el => {
    const s = st(el.dataset.eid);
    if (s.s === "playing") npProgress(el, s);
  });
}, 1000);
