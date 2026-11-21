import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/game.js';
import { lanAddresses, usableAddress } from '../src/network.js';
import { PHOTO_MAX_BYTES, decodePhoto } from '../src/photos.js';

const withHeader = (header, size = 3000) => {
  const bytes = Buffer.alloc(size, 7);
  Buffer.from(header).copy(bytes);
  return bytes;
};
const JPEG = withHeader([0xff, 0xd8, 0xff, 0xe0]);
const PNG = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = withHeader([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
const url = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`;

test('photos: JPEG, PNG and WebP go through untouched', () => {
  for (const [type, bytes] of [
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
  ]) {
    const photo = decodePhoto(url(type, bytes));
    assert.equal(photo.type, type);
    assert.deepEqual(photo.bytes, bytes);
  }
});

test('photos: anything that is not really a small image is refused', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const refused = [
    42,
    null,
    'hello',
    url('image/svg+xml', svg),
    url('text/html', Buffer.from('<html>hi</html>')),
    url('image/png', JPEG), // the label says PNG, the bytes say JPEG
    url('image/jpeg', svg),
    url('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])), // too short to be a picture
    url('image/jpeg', withHeader([0xff, 0xd8, 0xff], PHOTO_MAX_BYTES + 1)),
    `${url('image/jpeg', JPEG)}"><script>`,
  ];
  for (const value of refused) assert.throws(() => decodePhoto(value), { code: 'BAD_PHOTO' }, String(value).slice(0, 40));
});

test('a mugshot can be set, replaced and removed; the state only carries a version number', () => {
  const game = new Game('PICS');
  const sara = game.addPlayer('Sara');
  const amine = game.addPlayer('Amine');
  const photoIn = (viewer, who) => game.viewFor(viewer.id).players.find((p) => p.id === who.id).photo;
  assert.equal(photoIn(amine, sara), 0, 'no photo yet');
  game.setPhoto(sara.id, url('image/jpeg', JPEG));
  const first = photoIn(amine, sara);
  assert.ok(first > 0);
  assert.deepEqual(game.photoOf(sara.id).bytes, JPEG);
  game.setPhoto(sara.id, url('image/png', PNG));
  assert.ok(photoIn(amine, sara) > first, 'a new photo gets a new version, so phones reload it');
  assert.equal(game.photoOf(sara.id).type, 'image/png');
  assert.ok(!JSON.stringify(game.viewFor(amine.id)).includes(PNG.toString('base64').slice(0, 40)), 'no image bytes in the state');
  game.setPhoto(sara.id, null);
  assert.equal(photoIn(amine, sara), 0);
  assert.equal(game.photoOf(sara.id), null);
  assert.throws(() => game.setPhoto(sara.id, 'nope'), { code: 'BAD_PHOTO' });
  assert.throws(() => game.setPhoto('nobody', url('image/jpeg', JPEG)), { code: 'NOT_IN_ROOM' });
  game.addPlayer('Lina');
  game.start(game.hostId);
  game.setPhoto(amine.id, url('image/jpeg', JPEG)); // you can change it mid-game too
  assert.ok(photoIn(sara, amine) > 0);
});

test('network: Android refusing to list interfaces is not a crash, and virtual adapters go last', () => {
  const android = () => {
    throw new Error('A system error occurred: uv_interface_addresses returned Unknown system error 13');
  };
  assert.deepEqual(lanAddresses(android), []);
  const pc = () => ({
    'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
    'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    'Wi-Fi': [
      { address: 'fe80::1', family: 'IPv6', internal: false },
      { address: '192.168.1.23', family: 'IPv4', internal: false },
    ],
    'vEthernet (WSL)': [{ address: '172.20.80.1', family: 'IPv4', internal: false }],
  });
  const found = lanAddresses(pc);
  assert.equal(found[0], '192.168.1.23', 'the real Wi-Fi comes first');
  assert.deepEqual([...found].sort(), ['172.20.80.1', '192.168.1.23', '192.168.56.1'], 'loopback and IPv6 left out');
  assert.equal(usableAddress('::ffff:192.168.43.1'), '192.168.43.1');
  assert.equal(usableAddress('127.0.0.1'), null);
  assert.equal(usableAddress('::1'), null);
  assert.equal(usableAddress(undefined), null);
});
