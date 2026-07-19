# Focus Field — Chrome Web Store listing

## Single purpose
Help users stay focused in the browser by blocking user-chosen distracting sites during timed focus sessions (and optionally always-on), with a calm blocked page. Optional local webcam timelapse records only during a focus session the user starts.

## Short description
Block distracting sites during Pomodoro focus (or always-on). Optional local webcam timelapse. Your list & timers stay on-device.

## Detailed description

Focus Field keeps you in deep work.

**Block**
• Add sites you don’t want during focus (e.g. twitter.com, youtube.com)
• While a focus session runs — or with Always-on — those hosts redirect to a calm Focus Field page
• Edit your list anytime

**Timer**
• Pomodoro-style focus and break minutes
• Badge shows minutes left
• Sessions completed counter

**Optional timelapse**
• Turn on “record webcam timelapse”
• A small window opens for camera permission
• Frames are taken only during focus, on your machine
• Download a WebM when the session ends
• Camera never runs in the background after you close the window

**Privacy**
• No account
• No Focus Field servers
• Blocklist + timers in chrome.storage.local
• Webcam frames never leave your device
• Policy: https://ayaanrustagi.github.io/focus-field/privacy.html

## Category
Productivity

## Permission justifications

| Permission | Why |
|------------|-----|
| **storage** | Save blocklist, timer lengths, always-on, session state, timelapse prefs. |
| **alarms** | Tick the Pomodoro timer while Chrome is open. |
| **tabs** | Update badge; support focus workflow. |
| **windows** | Open/focus the optional timelapse window. |
| **declarativeNetRequest** + **declarativeNetRequestWithHostAccess** | Redirect user-listed hosts to the in-extension blocked page while focus or always-on is active. |
| **host_permissions (`<all_urls>`)** | Required so blocking rules can apply to whatever hosts the user puts on their list (any site they choose to block). |

No remote code. No tracking SDKs. Blocking only applies when the user enables focus or always-on.

## Privacy policy URL
https://ayaanrustagi.github.io/focus-field/privacy.html

## Homepage
https://ayaanrustagi.github.io/focus-field/

## Reviewer notes
declarativeNetRequest rules are built dynamically from the user’s blocklist and removed when idle (unless always-on). Webcam access is only requested in the timelapse page the user opens; optional feature.
