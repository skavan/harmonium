# Reply — "can I bookmark a subpage directly?"

Paste to the forum thread.

---

Yes — you asked for it, so it's in v0.85.7.

The address is the hash form: `https://<ha>:8123/local/harmonium/main/index.html#page=living_room` (`?page=living_room` happens to work too, but the `#page=` form is the documented one). The page id is the one shown in the Studio — and you don't have to build the link by hand: open the page in the Studio and there's a click-to-copy `browser:` link right under its Name.

Two properties worth knowing: it's a jump, not a pin — the link opens that page for that load only, so a bookmark per room works in any browser without changing what your remotes or kiosks do; and it composes with the other address parts (`#page=living_room&device=<profile>` is a kiosk that boots straight to the living room).

Update to v0.85.7 when it lands and your browser shortcut will just work.
