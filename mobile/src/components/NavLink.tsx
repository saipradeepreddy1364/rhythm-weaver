import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import React, { forwardRef } from "react";

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}

export const NavLink = forwardRef<any, NavLinkProps>(
  ({ to, children, onPress, style, ...props }, ref) => {
    return (
      <TouchableOpacity delayPressIn={0} ref={ref} onPress={onPress} style={[styles.link, style]} activeOpacity={0.7} {...props}>
        {typeof children === "string" ? (
          <Text style={styles.text}>{children}</Text>
        ) : (
          children
        )}
      </TouchableOpacity>
    );
  }
);

NavLink.displayName = "NavLink";

const styles = StyleSheet.create({
  link: {
    paddingVertical: 8,
  },
  text: {
    color: "#1DB954",
    fontSize: 14,
  },
});
