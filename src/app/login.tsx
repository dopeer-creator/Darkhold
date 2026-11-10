import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/store';
import { PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/** Your own account, so your library is backed up and follows you to a new phone. */
export default function Login() {
  const { session } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (session) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setMessage('');
    const creds = { email: email.trim(), password };
    const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds);
    setBusy(false);
    if (error) return setMessage(error.message);
    if (mode === 'up' && !data.session) {
      setMode('in');
      setMessage('Account created. Open the confirmation email, tap the link, then sign in here.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }} behavior="padding">
        <Text style={s.brand}>Darkhold</Text>
        <Text style={[T.small, { marginBottom: 12 }]}>Your comic library. {mode === 'in' ? 'Sign in to pick up where you left off.' : 'Create your account.'}</Text>
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.faint} autoCapitalize="none" autoComplete="email" keyboardType="email-address" style={s.input} accessibilityLabel="Email" />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.faint} secureTextEntry autoComplete={mode === 'in' ? 'password' : 'new-password'} style={s.input} accessibilityLabel="Password" />
        {message ? <Text style={[T.small, { color: C.indie }]}>{message}</Text> : null}
        <PrimaryButton label={busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} disabled={busy || !email || password.length < 6} />
        <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(''); }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={T.small}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
        </Pressable>
        <View />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  brand: { fontFamily: F.condBold, fontSize: 44, letterSpacing: 2, textTransform: 'uppercase', color: C.text },
  input: { height: 52, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 16, paddingHorizontal: 16 },
});
