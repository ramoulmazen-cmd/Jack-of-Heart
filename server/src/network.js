import { networkInterfaces } from 'node:os';

// Adapters that exist on the computer but aren't the Wi-Fi your friends are on.
const VIRTUAL = /virtual|vbox|vmware|vethernet|hyper-v|wsl|docker|^br-|^veth|tailscale|zerotier|utun|loopback/i;

/**
 * This device's IPv4 addresses on the local network, the likeliest Wi-Fi/hotspot one first.
 *
 * Recent Android versions block the system call behind os.networkInterfaces() for apps
 * like Termux, and Node then throws ("uv_interface_addresses returned Unknown system error 13").
 * The game must still start, so a failure just means "unknown": the server learns its
 * address later, from the first phone that reaches it over the network.
 */
export function lanAddresses(getInterfaces = networkInterfaces) {
  let interfaces;
  try {
    interfaces = getInterfaces();
  } catch {
    return [];
  }
  const found = [];
  for (const [name, entries] of Object.entries(interfaces ?? {})) {
    for (const a of entries ?? []) {
      if (!a || a.internal || !(a.family === 'IPv4' || a.family === 4)) continue;
      found.push({ address: a.address, score: score(name, a.address) });
    }
  }
  return found.sort((x, y) => y.score - x.score).map((x) => x.address);
}

function score(name, address) {
  let s = 0;
  if (VIRTUAL.test(name)) s -= 10;
  if (address.startsWith('192.168.')) s += 3;
  else if (address.startsWith('10.')) s += 2;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) s += 1;
  else if (address.startsWith('169.254.')) s -= 5; // no network assigned an address
  return s;
}

/** '::ffff:192.168.1.5' → '192.168.1.5'; loopback and anything else unusable → null. */
export function usableAddress(raw) {
  if (typeof raw !== 'string') return null;
  const address = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address) || address.startsWith('127.')) return null;
  return address;
}
