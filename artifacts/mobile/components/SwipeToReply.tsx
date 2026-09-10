import React, { useMemo, useRef } from "react";
import { Animated, PanResponder, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
export function SwipeToReply({ children, onReply, disabled, color }: { children: React.ReactNode; onReply: () => void; disabled?: boolean; color: string }) {
  const offset = useRef(new Animated.Value(0)).current;
  const callback = useRef(onReply); callback.current = onReply;
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !disabled && gesture.dx > 12 && Math.abs(gesture.dy) < 10,
    onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, Math.min(gesture.dx, 80))),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx >= 50) callback.current();
      Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
  }), [disabled, offset]);
  return <View accessibilityActions={disabled ? [] : [{ name: "reply", label: "Reply to message" }]} onAccessibilityAction={event => { if (!disabled && event.nativeEvent.actionName === "reply") callback.current(); }}>
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: 18, top: 8, opacity: offset.interpolate({ inputRange: [0, 50], outputRange: [0, 1], extrapolate: "clamp" }) }}><Ionicons name="arrow-undo" size={20} color={color} /></Animated.View>
    <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: offset }] }}>{children}</Animated.View>
  </View>;
}
