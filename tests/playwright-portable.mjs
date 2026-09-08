import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function findChromium() {
  const configured = process.env.HARMONIUM_CHROMIUM_PATH;
  if (configured && existsSync(configured)) return configured;

  const playwrightRoot = process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (playwrightRoot && existsSync(playwrightRoot)) {
    const installs = readdirSync(playwrightRoot)
      .filter(name => /^chromium-\d+$/.test(name))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const install of installs) {
      const executable = join(playwrightRoot, install, 'chrome-win64', 'chrome.exe');
      if (existsSync(executable)) return executable;
    }
  }

  return null;
}

const launch = chromium.launch.bind(chromium);
chromium.launch = function (options = {}) {
  if (options.executablePath && !existsSync(options.executablePath)) {
    const executablePath = findChromium();
    if (executablePath) options = { ...options, executablePath };
  }
  return launch(options);
};