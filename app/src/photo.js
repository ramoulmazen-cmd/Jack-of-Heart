import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const SIDE = 256;

/**
 * Take a photo with the camera or pick one from the phone, and turn it into a small square
 * JPEG (256 px, about 15-30 KB) as a data URL, ready to send to the game server.
 * Returns null if the player backs out.
 */
export async function pickPhoto(source) {
  if (Platform.OS !== 'web') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(source === 'camera' ? 'Camera access is off. Allow it in Settings.' : 'Photo access is off. Allow it in Settings.');
    }
  }
  const options = {
    mediaTypes: ['images'],
    allowsEditing: Platform.OS !== 'web', // the phone's own crop screen; the web gets a centre crop
    aspect: [1, 1],
    quality: 0.85,
    cameraType: ImagePicker.CameraType.front,
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  return toSquareJpeg(result.assets[0].uri);
}

async function toSquareJpeg(uri) {
  const { width, height } = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(width, height);
  const context = ImageManipulator.manipulate(uri);
  if (width !== height) {
    context.crop({
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });
  }
  context.resize({ width: SIDE, height: SIDE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.72, format: SaveFormat.JPEG });
  return `data:image/jpeg;base64,${saved.base64}`;
}
