import { useEffect, useRef, type ComponentRef } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';

/**
 * A scrolling page that keeps what you type above the keyboard. Android draws edge to edge, so the
 * screen no longer shrinks for the keyboard by itself: this pads the bottom by the keyboard's height
 * and scrolls the box you're typing in into view.
 */
export function KeyboardScroll({ children, onScroll, ...props }: ScrollViewProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const y = useRef(0);

  useEffect(() => {
    const bringIntoView = (keyboardTop: number) => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input || !scroll.current) return;
      input.measureInWindow((_x, top, _w, height) => {
        const overlap = top + height + 24 - keyboardTop;
        if (overlap > 0) scroll.current?.scrollTo({ y: y.current + overlap, animated: true });
      });
    };
    // Once when the keyboard opens, and again after the padding has settled.
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      bringIntoView(e.endCoordinates.screenY);
      setTimeout(() => bringIntoView(e.endCoordinates.screenY), 120);
    });
    return () => show.remove();
  }, []);

  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} {...props} onScroll={track}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
