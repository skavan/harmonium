@echo off
setlocal

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platforms\android-31\android.jar" (
	echo Android SDK Platform 31 was not found under "%ANDROID_HOME%".
	exit /b 1
)

call "%~dp0gradlew.bat" --project-dir "%~dp0" clean assembleDebug
exit /b %ERRORLEVEL%