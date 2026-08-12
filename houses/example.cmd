rem  Harmonium house profile -- TEMPLATE. Copy me:
rem      copy houses\example.cmd houses\myhouse.cmd
rem  then fill in the four values below and set the default:
rem      echo myhouse> houses\default.txt
rem  Your real profiles are gitignored -- they never leave your
rem  machine. See houses\README.md for the model.
rem
rem  Keep values free of brackets: they get echoed inside cmd
rem  blocks, and a bracket in a value ends the block early.

rem  Must match the marker file www\harmonium\.house on the HA
rem  config share (push.bat <house> init writes it, once).
set "HOUSE_ID=myhouse"

rem  What you call it -- appears in push output only.
set "HOUSE_NAME=My House"

rem  The house's Home Assistant.
set "HA_URL=http://192.168.1.10:8123"

rem  The drive letter the HA config share is mapped to
rem  (\\<ha-ip>\config via Samba). The .house marker -- not the
rem  letter -- is what keeps a stale mapping from pushing to the
rem  wrong house.
set "DST=H:\"
