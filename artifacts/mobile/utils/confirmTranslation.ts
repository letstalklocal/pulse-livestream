import { Alert } from "react-native";

export function confirmTranslation(automatic: boolean): Promise<boolean> {
  return new Promise(resolve => Alert.alert(
    automatic ? "Translate incoming messages?" : "Translate this message?",
    "Message text is sent to Google Cloud Translation. The original stays unchanged.",
    [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Translate", onPress: () => resolve(true) }],
    { cancelable: true, onDismiss: () => resolve(false) },
  ));
}
