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
/* GROUP VOLUME FROM THE PAD (2026-08-20 field round 4 — "On
   Speaker Group page, dpad and Ch Up Dn do nothing"): a focused
   grouping card answers ◀/▶ with the same preserve-the-offsets
   group nudge the slider does — every volume-LINKED joined member
   moves by one step, relative trim intact. Member-row walking from
   the pad is a 0.84.2 design question; rows stay touch for now. */
function grpVolKey(e, t, d) {
  const m0 = e || grpMaster(t);
  if (!m0) return;
  const listed = new Set([m0, ...(t.entities || [])]);
  const members = (st(m0).a.group_members || [m0])
    .filter(m => listed.has(m) && (m === m0 || !GRP_VOL_UNLINKED.has(m)));
  members.forEach(m => {
    const cur = S.states.get(m);
    const v = cur && cur.a ? cur.a.volume_level : null;
    if (v == null) return;
    const nv = Math.max(0, Math.min(1, Math.round((v + d * 0.05) * 100) / 100));
    cur.a.volume_level = nv;
    callService("media_player", "volume_set", { volume_level: nv }, m);
  });
}
WIDGETS.grouping = {
    /* nothing to offer without a master and at least one OTHER
       candidate speaker */
    hidden: (e, t) => {
      const m0 = e || grpMaster(t);
      return !m0 || !(t.entities || []).filter(m => m !== m0).length;
    },
    keys: {
      left:  (e, t) => grpVolKey(e, t, -1),
      right: (e, t) => grpVolKey(e, t, +1),
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
        wireSlider(rs, rApply, "h");   // intent-gated: vertical swipes scroll
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
      wireSlider(sl, apply, "h");   // intent-gated: vertical swipes scroll
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
/* ================================================================
   THE SPEAKER-GROUP PAGE AS TILES (2026-08-20 — Suresh, screenshots
   in hand: "Each row should behave as a tile. Dpad navigates the
   tiles, as does ChUp and ChDn. OK on the parent player, does
   nothing. OK on an ungrouped player toggles its group status. Left
   and Right DPad … impact the active tile's volume (including group
   volume which should have the same layout as the others). On group
   Volume we should have an unlink all icon"). The spkgrp: screen
   stopped rendering one mega-card: it generates ONE TILE PER MEMBER
   (grpmember) plus a Group Volume tile (grpvol) — real tiles, so
   the focus walk, the tile gap, and the nav-mode grammar all come
   free. The inline card on the music controller is untouched.
   VOL/Mute hardware keys deliberately stay at the ACTIVITY level
   (his ruling — the ARC lesson holds); ◀▶ are the per-row keys.
   ================================================================ */
function grpmMaster(t) {
  return grpMaster({ entity: t.group_master, entities: t.entities });
}
function grpmJoined(t, m) {
  const e = grpmMaster(t);
  return m === e || (st(e).a.group_members || []).indexOf(m) >= 0;
}
/* join/unjoin one member against the master — optimistic, shared by
   the OK press and the title-line link button */
function grpmToggle(e, t) {
  const m0 = grpmMaster(t);
  if (!e || e === m0) { flashBar("Group master"); return; }
  const g = st(m0).a.group_members || [];
  const joined = g.indexOf(e) >= 0;
  const cur = S.states.get(m0);
  if (cur && cur.a) {
    const gm = (cur.a.group_members || [m0]).slice();
    if (joined) gm.splice(gm.indexOf(e), 1);
    else gm.push(e);
    cur.a.group_members = gm;
  }
  if (joined) callService("media_player", "unjoin", null, e);
  else callService("media_player", "join", { group_members: [e] }, m0);
  flashBar(joined ? "Ungrouped" : "Grouped");
}
/* one member row: name · [−][track with % inside][+] · link badge */
WIDGETS.grpmember = {
  nav: "value",
  isOn: (e, t) => grpmJoined(t, e),
  inlineSub: true,
  sub: (e, t) => e === grpmMaster(t) ? "master"
    : grpmJoined(t, e) ? "grouped" : "",
  keys: {
    left: (e) => {
      volNudgeOpt(e, "down");
      callService("media_player", "volume_down", null, e);
    },
    right: (e) => {
      volNudgeOpt(e, "up");
      callService("media_player", "volume_up", null, e);
    },
  },
  /* OK: master → nothing (its level is the activity's own volume);
     member → join/unjoin toggle — shared with the title-line link
     button so touch and OK are the same muscle */
  select: (e, t) => grpmToggle(e, t),
  /* THE MEGA-CARD'S LAYOUT, PER TILE (his screenshots, round 77
     patch 2: "We used to have the volume and link button… That's
     the layout we want. A proper volume bar with -/+"): the
     volume-link and join-link buttons ride the TITLE line
     (absolute, top-right), and the volume row below is a pure
     [−][fat track with % inside][+] at full width. */
  body: () => `<div class="grpbtns">
      <button class="dpbtn gvlink" title="Group volume moves this player"><span class="material-symbols-outlined">volume_up</span></button>
      <button class="dpbtn gjoin" title="Group / ungroup this player (OK does this too)"><span class="material-symbols-outlined">link</span></button>
    </div><div class="volrow">
      <button class="dpbtn" data-vol="down"><span class="material-symbols-outlined">remove</span></button>
      <div class="sldr inrow"><i></i><span class="rslpct">–</span></div>
      <button class="dpbtn" data-vol="up"><span class="material-symbols-outlined">add</span></button>
    </div>`,
  wire: (el, t) => {
    const m = resolveEntity(t.entity);
    wireTaps(el, "vol", d => {
      volNudgeOpt(m, d);
      renderStates();
      callService("media_player", "volume_" + d, null, m);
    });
    /* join/unjoin (touch) — the same toggle OK runs */
    const jb = el.querySelector(".gjoin");
    if (jb) jb.addEventListener("click", ev => {
      ev.stopPropagation();
      grpmToggle(m, t);
      renderStates();
    });
    /* volume-link toggle (touch, joined rows): local trim choice */
    const vb = el.querySelector(".gvlink");
    if (vb) vb.addEventListener("click", ev => {
      ev.stopPropagation();
      if (GRP_VOL_UNLINKED.has(m)) GRP_VOL_UNLINKED.delete(m);
      else GRP_VOL_UNLINKED.add(m);
      renderStates();
    });
    const sl = el.querySelector(".sldr");
    if (!sl) return;
    const apply = (ev, final) => {
      const r = sl.getBoundingClientRect();
      let f = (ev.clientX - r.left) / r.width;
      f = Math.max(0, Math.min(1, f));
      sl.firstElementChild.style.width = Math.round(f * 100) + "%";
      const pc = sl.querySelector(".rslpct");
      if (pc) pc.textContent = Math.round(f * 100) + "%";
      const cur = S.states.get(m);
      if (cur && cur.a) cur.a.volume_level = Math.round(f * 100) / 100;
      const now = Date.now();
      if ((final || now - (sl._t || 0) > 150) && f !== sl._lastF) {
        sl._t = now; sl._lastF = f;
        renderStates();
        callService("media_player", "volume_set",
          { volume_level: Math.round(f * 100) / 100 }, m);
      }
    };
    wireSlider(sl, apply, "h");
  },
  render: (el, e, t) => {
    if (!e) return;
    /* the tile was labeled at generation from whatever state existed;
       upgrade to the live friendly_name the moment it arrives */
    const fn = st(e).a.friendly_name;
    const lb = el.querySelector(".lbl");
    if (fn && lb && lb.textContent !== fn) lb.textContent = fn;
    const joined = grpmJoined(t, e);
    const master = e === grpmMaster(t);
    const l = volHeld(e, st(e).a.volume_level);
    const sl = el.querySelector(".sldr");
    if (sl && !sl._drag) {
      sl.firstElementChild.style.width = Math.round((l || 0) * 100) + "%";
      const pc = sl.querySelector(".rslpct");
      if (pc) pc.textContent = l != null ? pct(l) : "–";
      sl.classList.toggle("muted", !!st(e).a.is_volume_muted);
    }
    const bts = el.querySelector(".grpbtns");
    if (bts) bts.style.display = master ? "none" : "";
    const jb = el.querySelector(".gjoin");
    if (jb) {
      jb.classList.toggle("on", joined);
      jb.querySelector(".material-symbols-outlined").textContent =
        joined ? "link" : "add_link";
    }
    const vb = el.querySelector(".gvlink");
    if (vb) {
      vb.style.display = joined && !master ? "" : "none";
      const vlinked = !GRP_VOL_UNLINKED.has(e);
      vb.classList.toggle("vloose", !vlinked);
      vb.querySelector(".material-symbols-outlined").textContent =
        vlinked ? "volume_up" : "volume_mute";
      vb.title = vlinked ? "Group volume moves this player"
        : "Volume unlinked — group volume leaves this player alone";
    }
  }
};
/* the GROUP VOLUME tile — same layout as a member row, moves every
   volume-linked joined member preserving offsets; OK = UNLINK ALL */
WIDGETS.grpvol = {
  nav: "value",
  hidden: (e, t) => {
    const m0 = grpmMaster(t);
    return !m0 || (st(m0).a.group_members || []).length < 2;
  },
  isOn: (e, t) => {
    const m0 = grpmMaster(t);
    return !!m0 && (st(m0).a.group_members || []).length > 1;
  },
  keys: {
    left:  (e, t) => grpVolKey(grpmMaster(t), t, -1),
    right: (e, t) => grpVolKey(grpmMaster(t), t, +1),
  },
  /* OK = unlink all (his call): every joined non-master member
     leaves the group; optimistic, then per-member unjoin */
  select: (e, t) => {
    const m0 = grpmMaster(t);
    if (!m0) return;
    const listed = new Set(t.entities || []);
    const gone = (st(m0).a.group_members || [])
      .filter(m => m !== m0 && listed.has(m));
    if (!gone.length) return;
    const cur = S.states.get(m0);
    if (cur && cur.a) cur.a.group_members = [m0];
    gone.forEach(m => callService("media_player", "unjoin", null, m));
    flashBar("Ungrouped " + gone.length +
      (gone.length === 1 ? " player" : " players"));
  },
  body: () => `<div class="grpbtns">
      <button class="dpbtn gunlink" title="Ungroup all players (OK does this too)"><span class="material-symbols-outlined">link_off</span></button>
    </div><div class="volrow">
      <button class="dpbtn" data-gv="down"><span class="material-symbols-outlined">remove</span></button>
      <div class="sldr inrow"><i></i><span class="rslpct">–</span></div>
      <button class="dpbtn" data-gv="up"><span class="material-symbols-outlined">add</span></button>
    </div>`,
  wire: (el, t) => {
    wireTaps(el, "gv", d =>
      grpVolKey(grpmMaster(t), t, d === "up" ? +1 : -1) || renderStates());
    const ub = el.querySelector(".gunlink");
    if (ub) ub.addEventListener("click", ev => {
      ev.stopPropagation();
      WIDGETS.grpvol.select(null, t);
      renderStates();
    });
    const sl = el.querySelector(".sldr");
    if (!sl) return;
    /* drag → target level; every linked member moves by the same
       delta (offsets survive) — the mega-card's contract, tile-ized */
    const apply = (ev, final) => {
      const r = sl.getBoundingClientRect();
      let f = (ev.clientX - r.left) / r.width;
      f = Math.max(0, Math.min(1, f));
      sl.firstElementChild.style.width = Math.round(f * 100) + "%";
      const now = Date.now();
      if (!(final || now - (sl._t || 0) > 150) || f === sl._lastF) return;
      sl._t = now; sl._lastF = f;
      const m0 = grpmMaster(t);
      const listed = new Set([m0, ...(t.entities || [])]);
      const grp = (st(m0).a.group_members || [m0])
        .filter(m => listed.has(m) && (m === m0 || !GRP_VOL_UNLINKED.has(m)));
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
    wireSlider(sl, apply, "h");
  },
  render: (el, e, t) => {
    const m0 = grpmMaster(t);
    if (!m0) return;
    const listed = new Set([m0, ...(t.entities || [])]);
    const linked = (st(m0).a.group_members || [m0])
      .filter(m => listed.has(m) && (m === m0 || !GRP_VOL_UNLINKED.has(m)));
    const lv = linked.map(m => st(m).a.volume_level || 0);
    const avg = lv.reduce((a, b) => a + b, 0) / (lv.length || 1);
    const sl = el.querySelector(".sldr");
    if (sl && !sl._drag) {
      sl.firstElementChild.style.width = Math.round(avg * 100) + "%";
      const pc = sl.querySelector(".rslpct");
      if (pc) pc.textContent = pct(avg);
    }
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
