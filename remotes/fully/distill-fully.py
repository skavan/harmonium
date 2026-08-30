#!/usr/bin/env python3
"""Distill a raw Fully Kiosk export into the device-neutral canonical.

Drops the three device-specific keys so importing the canonical never
touches a remote's own start URL, kiosk PIN, or remote-admin password.
pull-fully offers to run this after a pull; you can also run it by hand:

  python distill-fully.py <raw-export.json> <canonical-out.json>
"""
import json
import sys

DEVICE_KEYS = ("startURL", "kioskPinEnc", "remoteAdminPasswordEnc")


def main():
    if len(sys.argv) != 3:
        print("usage: python distill-fully.py <raw-export.json> <canonical-out.json>")
        return 1
    raw, out = sys.argv[1], sys.argv[2]
    d = json.load(open(raw, encoding="utf-8"))
    removed = [k for k in DEVICE_KEYS if k in d]
    for k in removed:
        del d[k]
    open(out, "w", encoding="utf-8").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
    print("  wrote " + out + "  (omitted: " + (", ".join(removed) if removed else "none") + ")")
    return 0


if __name__ == "__main__":
    sys.exit(main())
