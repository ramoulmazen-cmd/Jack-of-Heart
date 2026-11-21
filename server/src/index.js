import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './app.js';
import { lanAddresses } from './network.js';

const port = Number(process.env.PORT) || 3000;
// 0.0.0.0: every network this device is on, so other phones can connect, not only this one.
const host = process.env.HOST || '0.0.0.0';

// The ready-built browser version of the game. The server hands it to every phone.
const webDir = fileURLToPath(new URL('../../app/dist', import.meta.url));
const { httpServer } = createGameServer({ webDir, lanAddresses });

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Is the game already running?`);
    console.error(
      process.platform === 'win32'
        ? 'Close it, or start on another port: $env:PORT=3001; npm start   (in cmd: set PORT=3001&& npm start)'
        : 'Close it, or start on another port: PORT=3001 npm start',
    );
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

httpServer.listen(port, host, () => {
  const others = lanAddresses();
  console.log('');
  console.log('  Jack of Hearts is running.');
  console.log('');
  console.log(`  On this device:  http://localhost:${port}`);
  if (others.length) {
    console.log(`  Other phones:    http://${others[0]}:${port}`);
    for (const address of others.slice(1)) console.log(`                   http://${address}:${port}`);
  } else {
    console.log(`  Other phones:    http://<this device's Wi-Fi address>:${port}`);
    console.log('                   On a hotspot, that address is the "Gateway" or "Router"');
    console.log("                   in a friend's Wi-Fi details. The lobby shows it once one phone joins.");
  }
  if (!existsSync(webDir)) {
    console.log('');
    console.log('  The browser version is missing (app/dist). Build it with:');
    console.log('    cd app && npx expo export --platform web');
  }
  console.log('');
  console.log('  Stop the server with Ctrl+C.');
  console.log('');
});
