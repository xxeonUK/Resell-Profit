const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const EMPTY_DATA = { version: 1, items: [] };

// All data lives in one JSON file in the user's AppData folder, e.g.
// C:\Users\<name>\AppData\Roaming\Resell Profit\data.json
function dataFile() {
  return path.join(app.getPath('userData'), 'data.json');
}

function readJson(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.items)) throw new Error('Unexpected data format');
  return parsed;
}

function loadData() {
  const file = dataFile();
  if (!fs.existsSync(file)) return EMPTY_DATA;
  try {
    return readJson(file);
  } catch {
    // Keep the unreadable file so nothing is lost, then fall back to the last good backup.
    fs.copyFileSync(file, `${file}.unreadable-${Date.now()}`);
    try {
      return readJson(`${file}.bak`);
    } catch {
      return EMPTY_DATA;
    }
  }
}

function saveData(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('Refusing to save unexpected data');
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write to a temporary file first so a crash mid-save can't corrupt the real one.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(tmp, file);
}

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_event, data) => saveData(data));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c0a12',
    title: 'Resell Profit',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// The app never connects to the internet, so block any attempt to navigate away
// or open new windows.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
