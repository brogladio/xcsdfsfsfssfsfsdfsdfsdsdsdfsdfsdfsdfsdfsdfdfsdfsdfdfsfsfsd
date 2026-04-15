// ── Firebase Configuration ────────────────────────────────────────────────────
// HOW TO SET UP REAL GOOGLE SIGN-IN:
//
// 1. Go to https://console.firebase.google.com and create a project
// 2. Click "Authentication" → "Sign-in method" → enable "Google"
// 3. Click "Project Settings" (gear icon) → "Your apps" → add a Web app
// 4. Copy the firebaseConfig values shown and paste them below
// 5. Add your site domain to: Authentication → Settings → Authorized domains
// 6. Add these two script tags to your HTML <head> BEFORE auth.js:
//
//    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
//    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
//    <script src="firebase-config.js"></script>
//
// ─────────────────────────────────────────────────────────────────────────────

window.FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

// Initialize Firebase (only if real config is set)
if (window.FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && typeof firebase !== "undefined") {
  firebase.initializeApp(window.FIREBASE_CONFIG);
}
