# Reply draft — "Back works but Home is not working" (post-0.85.7)

---

That's almost certainly the Key Mapper step from the 0.85.7 update. That release changed which keys the physical buttons send (it's the ⚠ Breaking changes section in the [release notes](https://github.com/skavan/harmonium/blob/main/docs/releases/release-notes-v0.85.7.md)) — the config side updates itself, but the Key Mapper app on the remote keeps its old mapping until you restore the new one. Back happens to survive with the old mapping; Home doesn't, which matches what you're seeing.

The fix: on the remote, open Key Mapper → ⋮ → Restore, and pick the `key_mapper.zip` for your remote from the release. Details and the file are in the release notes.

To confirm that's what it is (takes 30 seconds): in the Studio, open your home page and turn on the Key debug switch, then press Home on the remote. If the debug card on the remote shows `(unmapped)` next to the key, it's the mapping — restore the backup and it will show `F1 → home` (Astrion) and the button comes back. Turn the switch off when done.

One other thing to know: if you were on a TV page when you tried it — since 0.85.7, a tap of Home on a TV page goes to the TV itself (the TV's home screen), not the remote's. Hold Home always goes to the remote's home page. If Home works on your music or room pages but not on the TV page, that's this, working as designed.

Which remote are you on (Astrion or RS90), and did the debug card show unmapped? If it's neither of these, send me what the card prints for Home and I'll dig in.
