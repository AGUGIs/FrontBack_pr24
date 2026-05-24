/**
 * Открывает вкладку браузера после старта CRA.
 * Передаётся URL первым аргументом (стандарт Create React App).
 */
const { exec } = require('child_process');
const path = require('path');

const url = process.argv[2] || 'https://localhost:3001';

function open(urlToOpen) {
  const platform = process.platform;

  if (platform === 'win32') {
  const chromePaths = [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);

    const chrome = chromePaths.find((p) => {
      try {
        return require('fs').existsSync(p);
      } catch {
        return false;
      }
    });

    const cmd = chrome
      ? `"${chrome}" "${urlToOpen}"`
      : `start "" "${urlToOpen}"`;

    exec(cmd, { shell: true });
    return;
  }

  if (platform === 'darwin') {
    exec(`open "${urlToOpen}"`);
    return;
  }

  exec(`xdg-open "${urlToOpen}"`);
}

open(url);
