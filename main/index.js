/**
 * OmniGene Studio — Electron main process
 *
 * Responsibilities:
 *   1. Start the PyInstaller-compiled backend (packaged) or venv python (dev).
 *   2. Poll the /api/health endpoint until the backend is ready.
 *   3. Show a lightweight splash screen while waiting so the user sees progress.
 *   4. Load the React frontend into the main BrowserWindow.
 *   5. Tear down the backend cleanly when the window is closed.
 *
 * DevTools are NEVER opened automatically.  To open them during development:
 *   View → Toggle Developer Tools (Ctrl+Shift+I) or pass --devtools CLI flag.
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const { spawn, execSync } = require('child_process');

let mainWindow   = null;
let splashWindow = null;
let pyProc       = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the path to a file that lives in extraResources.
 * electron-builder copies extraResources to:
 *   <install>\resources\<to-value>
 * process.resourcesPath points at that <install>\resources folder.
 */
function resourcePath(...segments) {
  return path.join(process.resourcesPath, ...segments);
}

/**
 * Resolve a path that is relative to the repo root in dev mode,
 * or to resourcesPath in packaged mode.
 */
function resolveData(...segments) {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', ...segments);
  }
  return resourcePath(...segments);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function getLogPath() {
  // In packaged mode write the log next to the exe so it is easy to find.
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'omnigene-studio.log');
  }
  return path.join(__dirname, '..', 'omnigene-studio.log');
}

let logStream = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  if (logStream) logStream.write(line);
}

function initLog() {
  try {
    logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });
    log('=== OmniGene Studio starting ===');
  } catch (e) {
    // Non-fatal — just proceed without file logging.
  }
}

// ---------------------------------------------------------------------------
// Backend management
// ---------------------------------------------------------------------------

function getBackendConfig() {
  if (!app.isPackaged) {
    // Development: run app.py directly via the venv python
    const venvPy = path.join(__dirname, '../backend/.venv/Scripts/python.exe');
    const cmd    = fs.existsSync(venvPy) ? venvPy : 'python';
    return {
      cmd,
      args: [path.join(__dirname, '../backend/app.py')],
      cwd:  path.join(__dirname, '../backend')
    };
  }

  // Production: run the PyInstaller single-file exe
  const exePath = resourcePath('dist-backend', 'backend_server.exe');
  return {
    cmd:  exePath,
    args: [],
    // Set CWD to resources so relative dataset paths resolve correctly inside the exe
    cwd:  process.resourcesPath
  };
}

function killOrphanedBackends() {
  if (process.platform !== 'win32') return;
  try {
    execSync('taskkill /f /im backend_server.exe 2>nul', { stdio: 'ignore' });
  } catch (_) {
    // No orphan running — that is fine.
  }
}

function startBackend() {
  killOrphanedBackends();

  const { cmd, args, cwd } = getBackendConfig();
  log(`Starting backend: ${cmd} ${args.join(' ')} (cwd: ${cwd})`);

  if (app.isPackaged && !fs.existsSync(cmd)) {
    log(`ERROR: backend_server.exe not found at ${cmd}`);
    return;
  }

  pyProc = spawn(cmd, args, {
    cwd,
    windowsHide: true,  // never show a console window
    shell: false
  });

  pyProc.stdout?.on('data', d => log(`[backend] ${d.toString().trimEnd()}`));
  pyProc.stderr?.on('data', d => log(`[backend:err] ${d.toString().trimEnd()}`));
  pyProc.on('error', err => log(`[backend:spawn-error] ${err.message}`));
  pyProc.on('close', code => log(`[backend] process exited with code ${code}`));
}

function killBackend() {
  if (!pyProc) return;
  log('Stopping backend...');
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pyProc.pid), '/f', '/t'], { shell: false });
  } else {
    pyProc.kill('SIGKILL');
  }
  pyProc = null;
}

// ---------------------------------------------------------------------------
// Backend readiness polling
// ---------------------------------------------------------------------------

const BACKEND_URL    = 'http://127.0.0.1:8000/api/health';
const POLL_INTERVAL  = 400;   // ms between retries
const POLL_TIMEOUT   = 30000; // ms total before giving up

function waitForBackend() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT;

    function attempt() {
      http.get(BACKEND_URL, res => {
        if (res.statusCode === 200) {
          log('Backend is ready.');
          resolve();
        } else {
          retry();
        }
        res.resume(); // drain response
      }).on('error', retry);
    }

    function retry() {
      if (Date.now() >= deadline) {
        reject(new Error('Backend did not start within 30 seconds.'));
      } else {
        setTimeout(attempt, POLL_INTERVAL);
      }
    }

    attempt();
  });
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 280,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#080B11',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  // Inline HTML splash — no external file needed
  const splashHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    background:#080B11;color:#e2e8f0;
    font-family:'Segoe UI',system-ui,sans-serif;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    height:100vh;gap:22px;
    -webkit-app-region:drag;user-select:none;
  }
  .logo{display:flex;align-items:center;gap:14px}
  .badge{
    background:#0d1f1a;border-radius:12px;
    width:52px;height:52px;display:flex;
    align-items:center;justify-content:center;
    font-size:18px;font-weight:900;color:#3ddc84;
    letter-spacing:0.5px;
  }
  .wordmark{line-height:1.15}
  .wordmark h1{font-size:20px;font-weight:900;letter-spacing:4px;color:#f1f5f9}
  .wordmark h1 span{color:#3ddc84}
  .wordmark p{font-size:10px;color:#64748b;letter-spacing:3px;margin-top:3px}
  .bar-wrap{width:300px;height:4px;background:#1e293b;border-radius:2px;overflow:hidden}
  .bar{height:100%;width:0%;background:#3ddc84;border-radius:2px;
       animation:grow 25s linear forwards}
  @keyframes grow{to{width:90%}}
  .status{font-size:11px;color:#475569;letter-spacing:1px}
</style>
</head>
<body>
  <div class="logo">
    <div class="badge">OGS</div>
    <div class="wordmark">
      <h1>OMNI <span>GENE</span> STUDIO</h1>
      <p>V1.0 &nbsp;·&nbsp; STARTING UP</p>
    </div>
  </div>
  <div class="bar-wrap"><div class="bar"></div></div>
  <div class="status">Initialising scientific backend…</div>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:     1440,
    height:    900,
    minWidth:  1200,
    minHeight: 800,
    show:      false, // reveal only after content has loaded
    title:     'OmniGene Studio',
    icon:      resolveData('public', 'ogs-logo.svg'),
    backgroundColor: '#080B11',
    webPreferences: {
      preload:        path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity:    false // allows file:// renderer to call http://127.0.0.1 backend
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Open external links (target="_blank") in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // Pipe renderer console messages to the log file (errors, warnings only)
  mainWindow.webContents.on('console-message', (_ev, level, message, line, src) => {
    if (level >= 2) { // 2 = warning, 3 = error
      log(`[renderer:${level === 3 ? 'error' : 'warn'}] ${message}  (${src}:${line})`);
    }
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window smoothly once the page has fully painted
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
    // DevTools are NEVER opened automatically.
    // To open them: View → Toggle Developer Tools, or Ctrl+Shift+I.
    if (process.argv.includes('--devtools')) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('ready', async () => {
  initLog();
  createSplash();
  startBackend();

  try {
    await waitForBackend();
  } catch (err) {
    log(`WARNING: ${err.message} — opening app anyway with degraded connectivity.`);
  }

  createMainWindow();
});

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});

// Belt-and-suspenders cleanup
process.on('exit',   killBackend);
process.on('SIGINT', () => { killBackend(); process.exit(0); });
