// Firebase project config.
//
// 1. Go to https://console.firebase.google.com -> Add project (Analytics can
//    stay enabled during setup, it's free on the Spark plan).
// 2. Project settings (gear icon) -> General -> "Your apps" -> Add app -> Web (</>).
// 3. Copy the firebaseConfig object it gives you into FIREBASE_CONFIG below.
// 4. Build > Firestore Database -> Create database (production mode is fine;
//    the security rules in firestore.rules lock it down anyway).
// 5. Deploy firestore.rules — either via the Firebase CLI
//    (`firebase deploy --only firestore:rules`) or by pasting its contents
//    into Console -> Firestore Database -> Rules -> Publish.
//
// This object is safe to ship in client-side JS (it's an identifier, not a
// secret) — Firestore Security Rules are what actually protect your data,
// not hiding this file. See firestore.rules for the rules this site expects.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA32ZIt65nwDCe5BLZUfs0VFcjtAWU7IWc',
  authDomain: 'personalwebsite-24508.firebaseapp.com',
  projectId: 'personalwebsite-24508',
  storageBucket: 'personalwebsite-24508.firebasestorage.app',
  messagingSenderId: '403763119285',
  appId: '1:403763119285:web:2492d5789b21f03fc0aafc',
  measurementId: 'G-33P7GTRJFE'
};
