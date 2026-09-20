# Build FlowPilot as an Android APK

This source includes the generated `android/` native project. It is not published
to Google Play and does not require publishing.

## Requirements

- Android Studio with the Android SDK and SDK Platform installed
- JDK 17
- Node.js and pnpm
- An Android emulator or USB-connected Android device

## Install JavaScript dependencies

From the extracted project root:

```bash
pnpm install
```

## Open in Android Studio

Open this folder in Android Studio:

```text
artifacts/flowpilot/android
```

Wait for Gradle sync to finish. If Android Studio asks for an SDK location,
select the Android SDK managed by Android Studio.

## Create a debug APK

In Android Studio:

1. Select **Build**.
2. Select **Build Bundle(s) / APK(s)**.
3. Select **Build APK(s)**.

The APK will be created at:

```text
artifacts/flowpilot/android/app/build/outputs/apk/debug/app-debug.apk
```

You can install that APK directly on an Android device.

## Create an installable signed APK

For a release APK, select:

**Build → Generate Signed App Bundle or APK → APK**

Choose or create a keystore, select the `release` variant, and finish the
wizard. Keep the keystore and passwords safe; they are required for future
updates to the same Android app.

The configured application id is `com.gulabani.app`.

## Notes

- This is a local APK build only. No deployment or Google Play publishing is
  involved.
- The app stores its project data locally on the device with AsyncStorage.
- Notification reminders require allowing notification permission on the device.