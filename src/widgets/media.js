/* MEDIA tile — now-playing card; tap play/pauses. THREE renderers
   (v0.83.7 — Suresh: "lets come up with 3 renderers"): default card,
   style:"slim" one-liner, style:"art" hero (legacy art:true). */
/* style resolution (v0.83.7 follow-up — Suresh: "Hero tile seems the
   same as Standard": on the stock MUSIC controller the surface tile
   says art:true, so "Standard" WAS the hero). "plain" exists to say
   "the flat card, even if the surface tile is art:true"; "" defers
   to the tile. The Studio's Auto option writes nothing at all. */
/* v0.83.7 round 2 ("We lost the original display, bring it back! But
   this new one should be the default!"): "art" = the RIGHT-PANEL hero
   (default for art:true); "wash" = the original full-bleed — dimmed
   artwork under the whole card, 64px thumb beside the text. */
const npMode = t => t.style
  ? (t.style === "plain" ? "" : t.style)
  : (t && t.art ? "art" : "");
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
      const src = s.a.source ? "\n" + s.a.source : "";
      return cap(s.s) + src;
    },
    isOn: e => ["playing", "on", "paused"].includes(st(e).s),
    detailable: true,
    select: e => callService("media_player", "media_play_pause", null, e),
    body: t => {
      const m = npMode(t);
      if (m === "art" || m === "wash") return `<div class="npwrap">
      <img class="npimg hidden" alt="">
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
      if (m !== "art" && m !== "wash") return;
      el.classList.add(m === "wash" ? "wash" : "art");
      const img = el.querySelector(".npimg");
      img.addEventListener("error", () => img.classList.add("hidden"));
    },
    render: (el, e, t) => {
      if (npMode(t) === "slim") {
        const s = st(e);
        const pend = npPending(e, s);
        const line = pend
          ? (pend.label ? "Queuing “" + pend.label + "”…" : "Queuing…")
          : (s.a.media_title
            ? s.a.media_title + (s.a.media_artist ? " — " + s.a.media_artist : "")
            : cap(s.s));
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
      if (npMode(t) !== "art" && npMode(t) !== "wash") return;
      const s = st(e);
      el.dataset.eid = e || "";
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
      if (pic && ACTIVE(s.s)) {
        if (wash && el.dataset.bg !== pic) {
          el.dataset.bg = pic;
          el.style.backgroundImage =
            `linear-gradient(rgba(13,15,18,.78), rgba(13,15,18,.78)), url('${pic}')`;
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
        }
        if (img.dataset.src !== pic) {
          img.dataset.src = pic; img.src = pic;
          img.classList.remove("hidden");
        }
      } else {
        if (wash) { el.dataset.bg = ""; el.style.backgroundImage = ""; }
        img.classList.add("hidden"); img.dataset.src = "";
      }
      el.querySelector(".npt").textContent = s.a.media_title || cap(s.s);
      el.querySelector(".npa").textContent =
        s.a.media_artist || s.a.media_series_title || "";
      el.querySelector(".npb").textContent =
        s.a.media_album_name || s.a.app_name || s.a.source || "";
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

function npProgress(el, s) {
  const bar = el.querySelector(".npprog");
  if (!bar) return;
  const d = s.a.media_duration;
  if (!d) { bar.classList.add("hidden"); return; }
  let p = s.a.media_position || 0;
  if (s.s === "playing" && s.a.media_position_updated_at)
    p += (Date.now() - Date.parse(s.a.media_position_updated_at)) / 1000;
  bar.classList.remove("hidden");
  bar.firstElementChild.style.width =
    Math.max(0, Math.min(100, Math.round(p / d * 100))) + "%";
}
setInterval(() => {
  document.querySelectorAll(".tile.wgt-media.art, .tile.wgt-media.wash").forEach(el => {
    const s = st(el.dataset.eid);
    if (s.s === "playing") npProgress(el, s);
  });
}, 1000);
