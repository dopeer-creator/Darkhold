import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ComponentRef, RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { getMeta, setMeta } from '@/store/db';

const APP_ID_KEY = 'instagram_app_id';
/** A Facebook app ID: Instagram only opens its story editor straight away for apps that send one. */
export const getInstagramAppId = (db: SQLiteDatabase) => getMeta(db, APP_ID_KEY);
export const setInstagramAppId = (db: SQLiteDatabase, id: string) => setMeta(db, APP_ID_KEY, id.trim());

export const canShareImages = Platform.OS !== 'web';

/** Turns the story card on screen into a 1080 × 1920 picture and returns where it was saved. */
export function captureStory(ref: RefObject<ComponentRef<typeof View> | null>): Promise<string> {
  return captureRef(ref as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
}

/** The phone's share menu (WhatsApp, Instagram, Drive…). */
export async function shareImage(uri: string) {
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your review' });
}

/**
 * Opens Instagram's story editor with the picture already in it. Needs a Facebook app ID (Profile →
 * Instagram stories); without one, or if Instagram won't take it, the share menu opens instead.
 * Returns which one happened.
 */
export async function addToStory(db: SQLiteDatabase, uri: string): Promise<'story' | 'menu'> {
  const appId = await getInstagramAppId(db);
  if (Platform.OS === 'android' && appId) {
    try {
      await IntentLauncher.startActivityAsync('com.instagram.share.ADD_TO_STORY', {
        data: new File(uri).contentUri,
        type: 'image/png',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: lets Instagram open the picture.
        extra: { source_application: appId },
      });
      return 'story';
    } catch {
      // Instagram missing or it refused: fall through to the share menu.
    }
  }
  await shareImage(uri);
  return 'menu';
}
