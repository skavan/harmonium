/* AUTOMAGIC ROUTING HEAL fence (2026-09-02 GO — "If its an activity,
   shouldn't start and stop just be automagic? Always?"). The runner
   owns routing now (test-set-activity-start §7 fences that half);
   this fence pins the Studio heal: untouched generated sequences
   drop their old routing steps and re-sign; an EDITED sequence is
   never silently rewritten; hand-made sequences are never touched.
   Direct import — stocklib is pure, no browser needed. */
import { healGeneratedRouting } from '../studio-src/src/lib/stocklib.js';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const routing = { alias: 'Set activity state',
  action: 'harmonium.set_activity', data: { activity: 'x' } };
const clear = { alias: "Clear the room's routing — ONLY if this activity still owns it",
  if: [{ condition: 'state', entity_id: 'select.harmonium_r_activity', state: 'x' }],
  then: [{ action: 'harmonium.set_activity', data: { activity: 'off', room: 'r' } }] };
const work = { action: 'media_player.turn_on', data: {} };
const mk = (acts) => ({ actions: JSON.parse(JSON.stringify(acts)),
  generated_sig: JSON.stringify(acts) });

const cfg = { sequences: {
  s1: mk([routing, work]),                       /* untouched start */
  s2: mk([clear, work]),                         /* untouched stop */
  s3: { actions: [routing, work, { action: 'cover.open_cover' }],
    generated_sig: JSON.stringify([routing, work]) },  /* EDITED */
  s4: { actions: [work], name: 'hand-made' },    /* no sig at all */
  s5: mk([work]),                                /* already clean */
} };
const s5sig = cfg.sequences.s5.generated_sig;
healGeneratedRouting(cfg);

ck('untouched start drops its routing step',
  cfg.sequences.s1.actions.length === 1 &&
  cfg.sequences.s1.actions[0].action === 'media_player.turn_on');
ck('the stripped sequence is re-signed (stays "untouched")',
  cfg.sequences.s1.generated_sig === JSON.stringify(cfg.sequences.s1.actions));
ck('untouched stop drops the guarded clear chunk',
  cfg.sequences.s2.actions.length === 1);
ck('an EDITED sequence is never silently rewritten',
  cfg.sequences.s3.actions.length === 3 &&
  cfg.sequences.s3.actions[0].alias === 'Set activity state');
ck('a hand-made sequence (no sig) is never touched',
  cfg.sequences.s4.actions.length === 1);
ck('an already-clean sequence keeps its signature byte-identical',
  cfg.sequences.s5.generated_sig === s5sig);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
