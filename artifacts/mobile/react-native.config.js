module.exports = {
  dependencies: {
    // Agora RTM 2.2.6 packages an older libaosl.so that replaces the newer
    // copy required by Agora RTC 4.5.4 and prevents the camera engine loading.
    // DMs continue to use the database-backed polling path on Android.
    "agora-react-native-rtm": {
      platforms: {
        android: null,
      },
    },
  },
};