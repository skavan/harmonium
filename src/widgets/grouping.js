/* GROUPING — the speaker-grouping card (v0.83.7, beta-gaps §3 /
   P1 #4). One card on the music controller: the cast's players as
   rows, each with a join/unjoin toggle against the MASTER (the
   activity's media_player), plus a GROUP volume that moves every
   joined member while PRESERVING their relative offsets (the
   mini-media-player lesson: slamming all members to one level is
   never what anyone wants).

   Truth is the standard HA contract: the master's `group_members`
   attribute lists the current group (Sonos native and Music
   Assistant both honor it); joining is media_player.join with the
   master as target, leaving is media_player.unjoin on the member.
   No platform sniffing — a player that doesn't group simply never
   reports members, and its rows read unjoined. */
/* VOLUME LINK (v0.83.7 feedback: "one can link the player(s) and a
   separate toggle should be to link their volume"): joining is about
   PLAYBACK; whether the group slider drags a member's level along is
   a separate, per-member choice. Default = linked. The set holds the
   exceptions (volume-UNLINKED members) and lives client-side only —
   like a pre-link volume trim, it's a session-time control decision,
   not config. Sticky across unjoin/rejoin within the session. The
   master is always volume-linked (its level is the activity's own
   volume band). */
const GRP_VOL_UNLINKED = new Set();
/* INLINE ROWS EXPAND ON TAP (v0.83.7 — "On the inline card we don't
   show volume sliders at all... (2) Click to show them"): tapping a
   member's NAME on the inline card reveals its volume row beneath —
   per member, session-local, so the controller stays compact until a
   level actually needs setting. The spkgrp: screen (sliders: true)
   always shows every row. */
const GRP_EXPANDED = new Set();
/* WHO IS THE MASTER (v0.83.7 Speaker Groups): the activity's
   media_player when there is one — the "receiver is just an amp"
   case joins outdoor players to the RUNNING stream even though the
   stream's owner isn't in the group. On a standalone group screen
   with nothing running, fall back: a member already coordinating a
   group (it heads its own group_members), else the first playing
   member, else the first listed. */
function grpMaster(t) {
  const e = resolveEntity(t.entity);
  if (e) return e;
  const ms = t.entities || [];
  const coord = ms.find(m => {
    const g = st(m).a.group_members || [];
    return g.length > 1 && g[0] === m;
  });
  if (coord) return coord;
  return ms.find(m => ACTIVE(st(m).s)) || ms[0] || null;
}
WIDGETS.grouping = {
    /* nothing to offer without a master and at least one OTHER
       candidate speaker */
    hidden: (e, t) => {
      const m0 = e || grpMaster(t);
      return !m0 || !(t.entities || []).filter(m => m !== m0).length;
    },
    isOn: (e, t) => { const m0 = e || grpMaster(t); return !!m0 && ACTIVE(st(m0).s); },
    inlineSub: true,
    sub: (e, t) => {
      const m0 = e || grpMaster(t);
      if (!m0) return "";
      const g = st(m0).a.group_members || [];
      const n = (t.entities || []).filter(m => m !== m0 && g.indexOf(m) >= 0).length;
      return n ? (n + 1) + " grouped" : "solo";
    },
    body: t => {
      /* every member row carries a VOLUME ROW beneath the name line —
         [−] [fat track with the % riding INSIDE it] [+] (v0.83.7,
         "move the volume % into the volume slider. and add back -
         and + buttons... easier to control on remote surface").
         Always shown on the spkgrp: screen (sliders: true); on the
         inline card it appears when the name is tapped. */
      const rows = (t.entities || []).map(m =>
        `<div class="grpitem" data-item="${m}"><div class="grprow" data-ent="${m}"${(t.labels || {})[m] ? "" : ` data-auto="1"`}>
      <span class="gname">${(t.labels || {})[m] || m.split(".").pop().replace(/_/g, " ")}</span>
      <span class="glvl"></span>
      <button class="dpbtn gvlink" data-vlink="${m}" title="Group volume moves this player"><span class="material-symbols-outlined">volume_up</span></button>
      <button class="dpbtn gjoin" data-grp="${m}"><span class="material-symbols-outlined">link</span></button>
    </div><div class="rslrow" data-row="${m}" style="display:none">
      <button class="dpbtn rvol" data-rd="down"><span class="material-symbols-outlined">remove</span></button>
      <div class="sldr rowsl" data-rsl="${m}"><i></i><span class="rslpct">–</span></div>
      <button class="dpbtn rvol" data-rd="up"><span class="material-symbols-outlined">add</span></button>
    </div></div>`).join("");
      return rows +
        `<div class="grpvol"><div class="gvlabel">Group volume</div><div class="sldr"><i></i></div></div>`;
    },
    wire: (el, t) => {
      const master = () => grpMaster(t);
      const joinedOf = () => {
        const e = master();
        const g = st(e).a.group_members || [];
        /* the group, master included — members list order preserved */
        return [e].concat((t.entities || []).filter(m => m !== e && g.indexOf(m) >= 0));
      };
      wireTaps(el, "grp", m => {
        const e = master();
        if (m === e) return;
        const g = st(e).a.group_members || [];
        const joined = g.indexOf(m) >= 0;
        /* OPTIMISTIC (house style): the row flips now; HA's next
           diff is the truth that keeps or corrects it */
        const cur = S.states.get(e);
        if (cur && cur.a) {
          const gm = (cur.a.group_members || [e]).slice();
          if (joined) gm.splice(gm.indexOf(m), 1);
          else gm.push(m);
          cur.a.group_members = gm;
          renderStates();
        }
        if (joined) callService("media_player", "unjoin", null, m);
        else callService("media_player", "join", { group_members: [m] }, e);
      });
      /* volume link is purely local — flip the set, repaint */
      wireTaps(el, "vlink", m => {
        if (GRP_VOL_UNLINKED.has(m)) GRP_VOL_UNLINKED.delete(m);
        else GRP_VOL_UNLINKED.add(m);
        renderStates();
      });
      /* per-player volume rows: direct volume_set on THAT member —
         join state is irrelevant, that's the point */
      el.querySelectorAll(".sldr.rowsl").forEach(rs => {
        const m = rs.dataset.rsl;
        const pcEl = rs.querySelector(".rslpct");
        const rApply = (ev, final) => {
          const r = rs.getBoundingClientRect();
          let f = (ev.clientX - r.left) / r.width;
          f = Math.max(0, Math.min(1, f));
          rs.firstElementChild.style.width = Math.round(f * 100) + "%";
          if (pcEl) pcEl.textContent = Math.round(f * 100) + "%";
          const cur = S.states.get(m);
          if (cur && cur.a) cur.a.volume_level = Math.round(f * 100) / 100;
          const now = Date.now();
          if ((final || now - (rs._t || 0) > 150) && f !== rs._lastF) {
            rs._t = now; rs._lastF = f;
            renderStates();
            callService("media_player", "volume_set",
              { volume_level: Math.round(f * 100) / 100 }, m);
          }
        };
        rs.addEventListener("click", ev => ev.stopPropagation());
        rs.addEventListener("pointerdown", ev => {
          ev.stopPropagation();
          try { if (rs.setPointerCapture) rs.setPointerCapture(ev.pointerId); }
          catch (x) { /* synthetic events carry no pointer id */ }
          rs._drag = true; rApply(ev, false);
        });
        rs.addEventListener("pointermove", ev => { if (rs._drag) rApply(ev, false); });
        const rEnd = ev => { if (rs._drag) { rs._drag = false; rApply(ev, true); } };
        rs.addEventListener("pointerup", rEnd);
        rs.addEventListener("pointercancel", rEnd);
      });
      /* the row's −/+ — optimistic nudge (house style) + volume_up/down
         at the MEMBER */
      el.querySelectorAll(".rslrow").forEach(rr => {
        const m = rr.dataset.row;
        rr.querySelectorAll(".rvol").forEach(bt => {
          bt.addEventListener("click", ev => {
            ev.stopPropagation();
            const d = bt.dataset.rd;
            const cur = S.states.get(m);
            if (cur && cur.a && cur.a.volume_level != null) {
              cur.a.volume_level = Math.max(0, Math.min(1,
                cur.a.volume_level + (d === "up" ? 0.05 : -0.05)));
              renderStates();
            }
            callService("media_player", "volume_" + d, null, m);
          });
        });
      });
      /* inline card: tapping the NAME reveals/hides that member's
         volume row (spkgrp screens always show them) */
      if (!t.sliders) el.querySelectorAll(".grprow .gname").forEach(gn => {
        gn.addEventListener("click", ev => {
          ev.stopPropagation();
          const m = gn.closest(".grprow").dataset.ent;
          if (GRP_EXPANDED.has(m)) GRP_EXPANDED.delete(m);
          else GRP_EXPANDED.add(m);
          renderStates();
        });
      });
      const sl = el.querySelector(".grpvol .sldr");
      if (!sl) return;
      /* GROUP VOLUME: target level f; every joined member moves by
         the SAME DELTA (f - group average), clamped — offsets
         between speakers survive the ride. Optimistic + throttled +
         final-on-release, the same contract as every slider here. */
      const apply = (ev, final) => {
        const r = sl.getBoundingClientRect();
        let f = (ev.clientX - r.left) / r.width;
        f = Math.max(0, Math.min(1, f));
        sl.firstElementChild.style.width = Math.round(f * 100) + "%";
        const now = Date.now();
        if (!(final || now - (sl._t || 0) > 150) || f === sl._lastF) return;
        sl._t = now; sl._lastF = f;
        /* only the volume-LINKED members ride the slider; an
           unlinked member stays wherever its own trim left it */
        const grp = joinedOf().filter(m =>
          m === master() || !GRP_VOL_UNLINKED.has(m));
        const lv = grp.map(m => {
          const v = st(m).a.volume_level;
          return v == null ? f : v;
        });
        const avg = lv.reduce((a, b) => a + b, 0) / (lv.length || 1);
        const d = f - avg;
        grp.forEach((m, i) => {
          const v = Math.max(0, Math.min(1, Math.round((lv[i] + d) * 100) / 100));
          const cur = S.states.get(m);
          if (cur && cur.a) cur.a.volume_level = v;
          callService("media_player", "volume_set", { volume_level: v }, m);
        });
        renderStates();
      };
      sl.addEventListener("click", ev => ev.stopPropagation());
      sl.addEventListener("pointerdown", ev => {
        ev.stopPropagation();
        try { if (sl.setPointerCapture) sl.setPointerCapture(ev.pointerId); }
        catch (x) { /* synthetic events carry no pointer id */ }
        sl._drag = true; apply(ev, false);
      });
      sl.addEventListener("pointermove", ev => { if (sl._drag) apply(ev, false); });
      const end = ev => { if (sl._drag) { sl._drag = false; apply(ev, true); } };
      sl.addEventListener("pointerup", end);
      sl.addEventListener("pointercancel", end);
    },
    render: (el, e, t) => {
      e = e || grpMaster(t);
      if (!e) return;
      const g = st(e).a.group_members || [];
      let joined = [e];
      el.querySelectorAll(".grprow").forEach(row => {
        const m = row.dataset.ent;
        if (m === e) {
          /* the master's row: hidden on the inline card (its level is
             the volume band), but on a sliders screen it shows as the
             anchor — trim track live, join/vlink moot */
          if (!t.sliders) {
            row.style.display = "none";
            const it = row.parentElement;
            if (it && it.classList.contains("grpitem")) it.style.display = "none";
            return;
          }
          row.classList.add("on", "gmaster");
          const jb = row.querySelector(".gjoin"), vb0 = row.querySelector(".gvlink");
          if (jb) jb.style.display = "none";
          if (vb0) vb0.style.display = "none";
          if (row.dataset.auto) {
            const fn = st(m).a.friendly_name;
            if (fn) { row.querySelector(".gname").textContent = fn; delete row.dataset.auto; }
          }
          /* its % rides inside the visible volume row's track */
          row.querySelector(".glvl").textContent = "";
          return;
        }
        /* a row without a baked device name upgrades to the LIVE
           friendly_name the moment state arrives (loose entities) */
        if (row.dataset.auto) {
          const fn = st(m).a.friendly_name;
          if (fn) { row.querySelector(".gname").textContent = fn; delete row.dataset.auto; }
        }
        /* the master can CHANGE as states arrive (fallback chain) —
           un-anchor a row that held the job in an earlier pass */
        if (row.classList.contains("gmaster")) {
          row.classList.remove("gmaster");
          const jb0 = row.querySelector(".gjoin");
          if (jb0) jb0.style.display = "";
        }
        const on = g.indexOf(m) >= 0;
        if (on) joined.push(m);
        row.classList.toggle("on", on);
        const lv = st(m).a.volume_level;
        /* the volume row (when visible) owns the number — it rides
           inside the track; a collapsed inline row keeps the little
           % beside the name for joined members */
        const vrOpen = t.sliders || GRP_EXPANDED.has(m);
        row.querySelector(".glvl").textContent =
          !vrOpen && on && lv != null ? pct(lv) : "";
        row.querySelector(".gjoin .material-symbols-outlined").textContent =
          on ? "link" : "add_link";
        /* the volume-link toggle only earns pixels on JOINED rows —
           unjoined members aren't touched by the group slider anyway */
        const vb = row.querySelector(".gvlink");
        if (vb) {
          vb.style.display = on ? "" : "none";
          const vlinked = !GRP_VOL_UNLINKED.has(m);
          vb.classList.toggle("vloose", !vlinked);
          vb.querySelector(".material-symbols-outlined").textContent =
            vlinked ? "volume_up" : "volume_mute";
          vb.title = vlinked ? "Group volume moves this player"
            : "Volume unlinked — group volume leaves this player alone";
        }
      });
      /* per-player volume rows: visibility (always on a sliders
         screen; tap-expanded on the inline card) + track/% from HA
         while not dragged */
      el.querySelectorAll(".rslrow").forEach(rr => {
        const m = rr.dataset.row;
        const show = (t.sliders || GRP_EXPANDED.has(m)) && m !== e;
        rr.style.display = show ? "" : "none";
      });
      /* the master's own volume row DOES show on a sliders screen */
      if (t.sliders) {
        const mr = el.querySelector(`.rslrow[data-row="${e}"]`);
        if (mr) mr.style.display = "";
      }
      el.querySelectorAll(".sldr.rowsl").forEach(rs => {
        if (rs._drag) return;
        const l = st(rs.dataset.rsl).a.volume_level;
        rs.firstElementChild.style.width = Math.round((l || 0) * 100) + "%";
        const pc = rs.querySelector(".rslpct");
        if (pc) pc.textContent = l != null ? pct(l) : "–";
      });
      const gv = el.querySelector(".grpvol");
      if (!gv) return;
      /* the group slider earns its pixels only when there IS a group */
      gv.style.display = joined.length > 1 ? "" : "none";
      const sl = gv.querySelector(".sldr");
      if (sl._drag) return;
      /* the track reads the LINKED members' average — it's the set
         the slider actually drives */
      const linked = joined.filter(m => m === e || !GRP_VOL_UNLINKED.has(m));
      const lv = linked.map(m => st(m).a.volume_level || 0);
      const avg = lv.reduce((a, b) => a + b, 0) / (lv.length || 1);
      sl.firstElementChild.style.width = Math.round(avg * 100) + "%";
    }
  };
/* GROUP LAUNCHER (v0.83.7 Speaker Groups — Suresh: "a launcher tile
   that is slim and says something like 5 available. 0 Linked. and a
   tap launches the Speaker Group Card"): the slim half of the pair.
   One line — the group's name and the live count — and select opens
   the generated spkgrp: screen where the real card (with per-player
   trim sliders) lives. Lit when any member is linked to the master. */
WIDGETS.grouplaunch = {
    hidden: (e, t) => (t.entities || []).length < 2,
    /* counts live on the SUB line (tidy-ups: "put the info in the
       state area, not clipping the title") */
    linkedCount: (e, t) => {
      const m0 = e || grpMaster(t);
      if (!m0) return 0;
      const g = st(m0).a.group_members || [];
      return (t.entities || []).filter(m => m !== m0 && g.indexOf(m) >= 0).length;
    },
    sub: (e, t) => (t.entities || []).length + " available · " +
      WIDGETS.grouplaunch.linkedCount(e, t) + " linked",
    isOn: (e, t) => WIDGETS.grouplaunch.linkedCount(e, t) > 0,
    select: (e, t) => { if (t.group) navigate("spkgrp:" + t.group); }
  };
