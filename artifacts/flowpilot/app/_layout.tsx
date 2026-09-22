import { Linking } from 'react-native';
import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { startRoute } from '@/lib/settings';
import { useColors } from '@/hooks/useColors';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { FlowProvider } from '@/context/FlowContext';
import { DataRecovery } from '@/components/DataRecovery';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colors = useColors();
  const { settings } = useSettings();
  const navigation = useRootNavigationState(), pathname = usePathname(), started = useRef(false);
  useEffect(() => {
    if (!navigation?.key || started.current) return;
    const route = startRoute(settings.startScreen, pathname);
    if (!route) { started.current = true; return; }
    let active = true;
    void Linking.getInitialURL().then((url) => {
      if (!active) return;
      started.current = true;
      if (!url) router.replace(route);
    }).catch(() => { if (active) started.current = true; });
    return () => { active = false; };
  }, [navigation?.key, pathname, settings.startScreen]);
  return (
    <>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerBackTitle: 'Back', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <DataRecovery><SettingsProvider><FlowProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </FlowProvider></SettingsProvider></DataRecovery>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
