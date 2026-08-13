"""Constants for the Harmonium integration."""

DOMAIN = "harmonium"
STORAGE_KEY = "harmonium.config"
STORAGE_VERSION = 1

# Where the remotes read their compiled configs from (relative to
# /config). OUT OF THE PROTOTYPE NAMESPACE (v0.38): /local/harmonium.
# MAIN deploys config.json + the engine at the root; every other
# workspace gets config.<ws>.json PLUS a tiny entry stub at
# <ws>/index.html — the PATH is the workspace's address
# (/local/harmonium/deck/), identity in the URL, nothing pinned.
DEPLOY_DIR = "www/harmonium"
DEPLOY_PATH = "www/harmonium/config.json"

# The old prototype home. A redirect stub lives there so remotes
# provisioned with the old start URL keep booting forever.
LEGACY_DIR = "www/remote-proto"

# Studio panel
PANEL_URL_PATH = "harmonium-studio"
STATIC_URL = "/harmonium-static"
