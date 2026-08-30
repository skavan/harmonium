# tools/adb — the repo's own adb

`remotes/pull-keymapper.bat` / `remotes/push-keymapper.bat` look here first, so a
fresh clone works with zero setup. Drop in these three files from any
scrcpy or Android platform-tools folder (they are Apache-2.0
licensed and redistributable):

    adb.exe
    AdbWinApi.dll
    AdbWinUsbApi.dll

Commit them. If this folder is empty the scripts fall back to an adb
on PATH.
