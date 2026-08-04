import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { ExclamationCircleIcon } from 'react-native-heroicons/outline';

const INK = '#111';
const FOCUS = '#1F4E8C';
const DISABLED_BORDER = '#C7C7C7';
const DISABLED_BG = '#F2F2F2';
const DISABLED_TEXT = '#9A9A9A';
const ERROR = '#D0342C';

interface InputFieldProps extends TextInputProps {
  error?: string;
  disabled?: boolean;
}

// GRRUNCH DS input-field (node 245-606), native states: Enabled / Pressed /
// Focus / Disabled / Error.
//
// Pressed here means "the user has tapped in and is editing" -- TextInput's
// onFocus is the native equivalent of a touch-driven press, so that's what
// drives it. The DS's Focus state is explicitly documented as accessibility-
// only (button hollow-btn doc, node 4008-160: "used when navigating with
// keyboard, game controller, or accessibility indicator") -- React Native
// has no reliable way to detect that a TextInput was focused via VoiceOver/
// TalkBack/switch control specifically rather than a tap, so this doesn't
// attempt to distinguish them at runtime. The `focus` style is kept defined
// for reference but isn't wired to anything; flag if real accessibility-
// focus detection turns out to matter.
export function InputField({ error, disabled, style, onFocus, onBlur, ...props }: InputFieldProps) {
  const [pressed, setPressed] = useState(false);

  function handleFocus(e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) {
    setPressed(true);
    onFocus?.(e);
  }

  function handleBlur(e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) {
    setPressed(false);
    onBlur?.(e);
  }

  const stateStyle = disabled ? styles.disabled : error ? styles.error : pressed ? styles.pressed : null;

  const showPressedShadow = pressed && !disabled && !error;

  return (
    <View>
      <View style={styles.wrap}>
        {showPressedShadow && <View pointerEvents="none" style={styles.pressedShadow} />}
        <TextInput
          {...props}
          editable={!disabled}
          style={[styles.input, stateStyle, disabled && styles.inputTextDisabled, style]}
          placeholderTextColor={disabled ? DISABLED_TEXT : '#999'}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {error && <ExclamationCircleIcon size={18} color={ERROR} style={styles.errorIcon} />}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: {
    // Explicit position keeps this a "positioned" element on web -- without
    // it the raw <input> renders position:static, which CSS always paints
    // BELOW any positioned sibling (like pressedShadow) regardless of DOM
    // order, no matter what z-index says.
    position: 'relative',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    outlineStyle: 'none',
  },
  pressed: { borderWidth: 2, borderColor: INK },
  // Renders as an actual offset shape (not a native shadow) so the DS's flat
  // "box-shadow: -1px 1px 0 0 #000" reads identically on iOS, Android, and
  // web -- RN's native shadow props can't produce a hard, blur-free offset
  // on Android (elevation has no directional/offset control).
  pressedShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 28,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  focus: { borderWidth: 2, borderColor: FOCUS },
  disabled: { backgroundColor: DISABLED_BG, borderColor: DISABLED_BORDER },
  inputTextDisabled: { color: DISABLED_TEXT },
  error: { borderColor: ERROR, paddingRight: 44 },
  errorIcon: { position: 'absolute', right: 20 },
  errorText: { color: ERROR, fontSize: 13, marginTop: 6, marginLeft: 4 },
});
