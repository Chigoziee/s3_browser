// Cross-platform Electron launcher that clears ELECTRON_RUN_AS_NODE
// (VS Code sets this env var, which breaks the Electron main process API if inherited)
const { spawn } = require('child_process');
const electronPath = require('electron'); // returns binary path in Node context

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const proc = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env,
  cwd: __dirname,
  windowsHide: false,
});

proc.on('close', (code) => process.exit(code ?? 0));
proc.on('error', (err) => { console.error(err); process.exit(1); });
