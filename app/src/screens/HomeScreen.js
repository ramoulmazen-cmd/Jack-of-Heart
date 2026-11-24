import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Backdrop } from '../components/Backdrop';
import { Glow } from '../components/Effects';
import { LiveJackCard } from '../components/LiveJackCard';
import { PhotoSheet } from '../components/PhotoSheet';
import { Sheet } from '../components/Sheet';
import { color, font } from '../theme';
import { Button, ErrorText, Field, PencilMark, Screen, useAction } from '../ui';

const servedByGame = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.port !== '8081';

export default function HomeScreen({ game }) {
  const [name, setName] = useState(game.savedName || '');
  const [code, setCode] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const { busy, error, run } = useAction();
  const hasName = name.trim().length > 0;

  useEffect(() => {
    if (game.savedName && !name) setName(game.savedName);
  }, [game.savedName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen scroll backdrop={<Backdrop />}>
      <View style={styles.hero}>
        <View style={styles.jack}>
          <Glow size={300} tint={color.red} strength={1.2} />
          <LiveJackCard size={132} entrance tilt="-6deg" />
        </View>
        <Text style={styles.title}>Jack of Hearts</Text>
      </View>

      {game.notice ? (
        <Pressable onPress={game.clearNotice} style={styles.notice}>
          <Text style={styles.noticeText}>{game.notice}</Text>
        </Pressable>
      ) : null}

      <View style={styles.identity}>
        <Pressable
          role="button"
          aria-label={game.photo ? 'Change your photo' : 'Add your photo'}
          onPress={() => setPhotoOpen(true)}
          style={({ pressed }) => [styles.photo, pressed && styles.pressed]}
        >
          <Avatar player={{ name: name.trim() || '?' }} uri={game.photo} size={68} you />
          <View style={styles.cameraBadge}>
            {game.photo ? <PencilMark size={14} /> : <Text style={styles.cameraText}>+</Text>}
          </View>
        </Pressable>
        <View style={styles.nameField}>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            maxLength={16}
            autoCorrect={false}
            returnKeyType="done"
            aria-label="Your name"
          />
        </View>
      </View>

      <Button title="Create a room" disabled={!hasName} busy={busy} onPress={() => run(() => game.create(name))} />

      <View style={styles.joinRow}>
        <View style={styles.codeField}>
          <Field
            value={code}
            onChangeText={(value) => setCode(value.replace(/[^a-z]/gi, '').toUpperCase())}
            placeholder="CODE"
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.codeInput}
            aria-label="Room code"
          />
        </View>
        <View style={styles.joinButton}>
          <Button
            title="Join"
            kind="secondary"
            disabled={!hasName || code.length !== 4}
            busy={busy}
            onPress={() => run(() => game.join(code, name))}
          />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>

      {servedByGame ? null : (
        <Pressable onPress={() => setServerOpen(true)} hitSlop={10} style={styles.serverLink}>
          <Text style={styles.serverText} numberOfLines={1}>
            Server {game.serverUrl.replace(/^https?:\/\//, '')}
          </Text>
        </Pressable>
      )}

      <PhotoSheet
        visible={photoOpen}
        onClose={() => setPhotoOpen(false)}
        name={name}
        current={game.photo}
        onSave={game.setPhoto}
      />
      <Sheet visible={serverOpen} onClose={() => setServerOpen(false)} title="Game server">
        <Field
          value={game.serverUrl}
          onChangeText={game.setServerUrl}
          placeholder="http://192.168.1.10:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          aria-label="Game server address"
        />
        <Text style={styles.serverHelp}>The address `npm start` printed, on the device running the game.</Text>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 22 },
  jack: { width: 200, height: 210, alignItems: 'center', justifyContent: 'center' },
  title: {
    fontFamily: font.stencil,
    color: color.chalk,
    fontSize: 54,
    lineHeight: 58,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 4,
  },
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: color.alarm,
    backgroundColor: color.wallRaised,
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
  },
  noticeText: { color: color.chalk, fontSize: 15, lineHeight: 21 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  photo: { width: 68, height: 68 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  cameraBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.wall,
  },
  cameraText: { color: color.ink, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  nameField: { flex: 1 },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12 },
  codeField: { flex: 1 },
  codeInput: { fontFamily: font.stencil, fontSize: 26, letterSpacing: 8, paddingVertical: 10, textAlign: 'center' },
  joinButton: { width: 112 },
  serverLink: { alignSelf: 'center', marginTop: 26, paddingVertical: 6 },
  serverText: { color: color.faded, fontSize: 13 },
  serverHelp: { color: color.faded, fontSize: 14, lineHeight: 20, marginTop: 10 },
});
