import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pickPhoto } from '../photo';
import { color } from '../theme';
import { Button, ErrorText } from '../ui';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';

/**
 * Your mugshot: take one or pick one, see it in the circle, keep it or try again.
 * `onSave(dataUrl)` keeps it; `onSave(null)` removes it.
 */
export function PhotoSheet({ visible, onClose, name, current, onSave }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setDraft(null);
      setError(null);
    }
  }, [visible]);

  const take = async (source) => {
    setBusy(true);
    setError(null);
    try {
      const photo = await pickPhoto(source);
      if (photo) setDraft(photo);
    } catch (err) {
      setError(err.message || 'That photo could not be used.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (value) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const shown = draft ?? current ?? null;
  const footer = draft ? (
    <>
      <Button title="Use this photo" busy={busy} onPress={() => save(draft)} />
      <Button title="Try again" kind="quiet" onPress={() => setDraft(null)} />
    </>
  ) : (
    <>
      <View style={styles.row}>
        <View style={styles.half}>
          <Button title="Camera" busy={busy} onPress={() => take('camera')} />
        </View>
        <View style={styles.half}>
          <Button title="Gallery" kind="secondary" busy={busy} onPress={() => take('library')} />
        </View>
      </View>
      {current ? <Button title="Remove photo" kind="quiet" onPress={() => save(null)} /> : null}
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Your photo" footer={footer}>
      <View style={styles.preview}>
        <Avatar player={{ name: name || '?' }} uri={shown} size={168} you />
        <Text style={styles.hint}>{draft ? 'Looking good?' : 'Everyone sees it next to your name.'}</Text>
      </View>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: 14, paddingVertical: 12 },
  hint: { color: color.faded, fontSize: 15, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
