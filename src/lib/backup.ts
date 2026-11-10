import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Saves a text file where the reader chooses: on a phone, a folder picked in the system file manager
 * (Downloads, Drive…); on the web, a normal download. Returns false when the reader cancels.
 */
export async function saveTextFile(name: string, text: string, mimeType = 'application/json'): Promise<boolean> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  if (!folder) return false;
  const file = folder.createFile(name, mimeType);
  await file.write(text);
  return true;
}

/** Lets the reader pick a text file (a backup) and returns what's in it, or null when they cancel. */
export async function pickTextFile(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
      input.click();
    });
  }
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
  if (picked.canceled) return null;
  return picked.result.text();
}
