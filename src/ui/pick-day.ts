import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Asks for a day (no later than today). Resolves "YYYY-MM-DD", or null when cancelled. */
export function pickDay(initial: string | null): Promise<string | null> {
  const start = initial ? new Date(`${initial}T12:00:00`) : new Date();
  if (Platform.OS === 'web') {
    // Web preview only: the native picker is Android/iOS.
    const typed = window.prompt('Read on (YYYY-MM-DD)', toDay(start));
    return Promise.resolve(typed && /^\d{4}-\d{2}-\d{2}$/.test(typed) ? typed : null);
  }
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, date) => resolve(event.type === 'set' && date ? toDay(date) : null),
    });
  });
}
