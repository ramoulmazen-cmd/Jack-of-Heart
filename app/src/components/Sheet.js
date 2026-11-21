import { useEffect, useRef } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { native } from '../motion';
import { color, font } from '../theme';

/**
 * A panel that slides up from the bottom: rules, settings, notes, invites, photos, the chat.
 * `onBack` adds a back arrow before the title; `tall` gives it a fixed height (the chat, so it
 * doesn't jump as messages come in); `stickToBottom` keeps the newest content in view.
 */
export function Sheet({ visible, onClose, onBack, title, children, footer, tall = false, stickToBottom = false }) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  const scroller = useRef(null);
  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [visible, rise]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} aria-label="Close" />
        <Animated.View
          style={[
            styles.sheet,
            tall && styles.tall,
            { paddingBottom: insets.bottom + 16 },
            { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }], opacity: rise },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={12} role="button" aria-label="Back" style={styles.back}>
                <Text style={styles.backText}>‹</Text>
              </Pressable>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} role="button" aria-label="Close" style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            ref={scroller}
            style={[styles.body, tall && styles.bodyTall]}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={stickToBottom ? () => scroller.current?.scrollToEnd({ animated: false }) : undefined}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5, 8, 6, 0.6)' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    alignSelf: 'center',
    backgroundColor: color.wallRaised,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: color.wallLine,
    paddingTop: 10,
  },
  tall: { height: '82%' },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: color.wallLine, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 6 },
  back: { width: 32, height: 40, justifyContent: 'center', marginLeft: -6 },
  backText: { color: color.paint, fontSize: 38, lineHeight: 40, fontWeight: '300' },
  title: { flex: 1, fontFamily: font.stencil, fontSize: 30, lineHeight: 34, color: color.chalk },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: color.faded, fontSize: 30, lineHeight: 32 },
  body: { flexGrow: 0 },
  bodyTall: { flexGrow: 1, flexShrink: 1 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
});
