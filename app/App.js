import { BigShouldersStencil_800ExtraBold } from '@expo-google-fonts/big-shoulders-stencil/800ExtraBold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Root from './src/Root';
import { color, font } from './src/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ [font.stencil]: BigShouldersStencil_800ExtraBold });

  return (
    <SafeAreaProvider style={styles.app}>
      <StatusBar style="light" />
      {fontsLoaded || fontError ? <Root /> : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: color.wall },
});
