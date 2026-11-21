import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

/** A QR code drawn with plain views (one per run of dark squares), so it works on phones and the web alike. */
export function JoinQR({ url, size = 220 }) {
  const { runs, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const found = [];
    for (let r = 0; r < n; r += 1) {
      let start = -1;
      for (let c = 0; c <= n; c += 1) {
        const dark = c < n && qr.isDark(r, c);
        if (dark && start === -1) start = c;
        if (!dark && start !== -1) {
          found.push({ r, c: start, len: c - start });
          start = -1;
        }
      }
    }
    return { runs: found, count: n };
  }, [url]);
  const quiet = 3;
  const cell = Math.floor(size / (count + quiet * 2));
  const total = cell * (count + quiet * 2);
  return (
    <View
      aria-label={`QR code for ${url}`}
      style={{ width: total, height: total, backgroundColor: '#FFFFFF', borderRadius: 12, alignSelf: 'center' }}
    >
      {runs.map(({ r, c, len }) => (
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: (c + quiet) * cell,
            top: (r + quiet) * cell,
            width: len * cell,
            height: cell,
            backgroundColor: '#0C090A',
          }}
        />
      ))}
    </View>
  );
}
