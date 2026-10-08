import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { colors, radius, space, type } from '@/theme';

import { Txt } from './ui';

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, hint, style, ...rest }, ref) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Txt variant="captionStrong" color={colors.inkSoft}>
          {label}
        </Txt>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkMute}
        accessibilityLabel={label}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...rest}
      />
      {error ? (
        <Txt variant="caption" color={colors.danger}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" color={colors.inkMute}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    ...type.body,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: 'transparent',
    outlineStyle: 'none',
  } as never,
});
