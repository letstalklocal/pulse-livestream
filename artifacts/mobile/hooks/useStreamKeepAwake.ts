import { useEffect, useId } from "react";
import { AppState } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { startStreamAwakeLease } from "@/utils/streamAwakeLease";

export function useStreamKeepAwake() {
  const id = useId();
  useEffect(() => startStreamAwakeLease({
    tag: `pulse-stream:${id}`,
    activate: activateKeepAwakeAsync,
    deactivate: deactivateKeepAwake,
    isForeground: () => AppState.currentState == null || AppState.currentState === "active",
    subscribe: refresh => {
      const subscription = AppState.addEventListener("change", state => {
        if (state === "active") refresh();
      });
      return () => subscription.remove();
    },
    reportError: error => console.warn("[Stream keep awake]", error),
  }), [id]);
}
