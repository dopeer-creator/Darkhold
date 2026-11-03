import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { migrate } from '@/store/db';
import { StoreProvider } from '@/store/store';
import { C } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.text } };

export default function RootLayout() {
  const [loaded] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  return (
    <ThemeProvider value={theme}>
      <SQLiteProvider databaseName="darkhold.db" onInit={migrate}>
        <StoreProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="collection/[id]" />
            <Stack.Screen name="add" options={{ presentation: 'transparentModal', animation: 'fade' }} />
            <Stack.Screen name="new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="add-issues" options={{ presentation: 'modal' }} />
            <Stack.Screen name="link" options={{ presentation: 'modal' }} />
            <Stack.Screen name="login" />
          </Stack>
        </StoreProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
