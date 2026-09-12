// Firebase Auth for the admin dashboard only (never loaded on public pages).
// Email/password today; signInWithGoogle is stubbed in so adding a "Sign in
// with Google" button later is just wiring a click handler to it — the
// Firestore/Storage rules already check request.auth.token.email regardless
// of which provider produced the token, so no rules changes would be needed.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

var auth = null;

function ensureAuth() {
  if (auth) return auth;
  var config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey) return null;
  try {
    var app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
  } catch (e) { /* keep the page working even if this throws */ }
  return auth;
}

window.__authLite = {
  onChange: function (callback) {
    var a = ensureAuth();
    if (!a) { callback(null); return function () {}; }
    return onAuthStateChanged(a, callback);
  },
  signInWithEmail: function (email, password) {
    var a = ensureAuth();
    if (!a) return Promise.reject(new Error('Auth not configured'));
    return signInWithEmailAndPassword(a, email, password);
  },
  // Not wired to any UI yet — see file header.
  signInWithGoogle: function () {
    var a = ensureAuth();
    if (!a) return Promise.reject(new Error('Auth not configured'));
    return signInWithPopup(a, new GoogleAuthProvider());
  },
  signOut: function () {
    var a = ensureAuth();
    if (!a) return Promise.resolve();
    return signOut(a);
  }
};
