/* MEDIA tile — now-playing card (art hero variant with `art: true`);
   tap play/pauses; sub = state · title. */
WIDGETS.media = {
    /* Now Playing tile. Plain by default; "art": true upgrades the body
       to an artwork hero — thumb (entity_picture), title/artist/album,
       and a live progress meter. One shared 1s ticker interpolates
       position from media_position_updated_at while playing (HA only
       sends media_position on state changes) — it touches ONLY visible
       art heroes, never triggers a full re-render. */
    sub: e => {
      const s = st(e), src = s.a.source ? " · " + s.a.source : "";
      return cap(s.s) + src;
    },
    isOn: e => ["playing", "on", "paused"].includes(st(e).s),
    detailable: true,
    select: e => callService("media_player", "media_play_pause", null, e),
    body: t => t.art ? `<div class="npwrap">
      <img class="npimg hidden" alt="">
      <div class="npmeta">
        <div class="npt"></div>
        <div class="npa"></div>
        <div class="npb"></div>
      </div>
    </div>
    <div class="meter npprog hidden"><i></i></div>`
      : `<div class="meter hidden"><i></i></div>`,
    wire: (el, t) => {
      if (!t.art) return;
      el.classList.add("art");
      const img = el.querySelector(".npimg");
      img.addEventListener("error", () => img.classList.add("hidden"));
    },
    render: (el, e, t) => {
      if (!t.art) return;
      const s = st(e);
      el.dataset.eid = e || "";
      /* label mirrors state — "Now Playing" only while it IS */
      const lbl = el.querySelector(".lbl");
      if (lbl) lbl.textContent =
        s.s === "playing" ? (t.label || "Now Playing") : cap(s.s);
      /* ARTWORK AS BACKGROUND (Suresh): a dimmed full-tile wash —
         metadata keeps the whole width instead of scrunching */
      const img = el.querySelector(".npimg");
      const pic = s.a.entity_picture;
      if (pic && ACTIVE(s.s)) {
        if (el.dataset.bg !== pic) {
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
        el.dataset.bg = ""; el.style.backgroundImage = "";
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
  document.querySelectorAll(".tile.wgt-media.art").forEach(el => {
    const s = st(el.dataset.eid);
    if (s.s === "playing") npProgress(el, s);
  });
}, 1000);
