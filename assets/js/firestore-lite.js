// Firestore Lite: a REST-only Firestore client with no realtime listener, no
// persistent "Listen" stream, no offline cache — just plain one-shot HTTPS
// requests. The full Firestore SDK (used for the compat build elsewhere on
// this site) always opens a long-lived WebChannel "Listen/channel" connection
// in the background for its offline cache, even for code that only ever
// calls get()/set() — and that persistent, long-session-id streaming
// connection is exactly the shape ad-block privacy lists target, which is
// what was breaking the gallery counters. This site never needs realtime
// listeners, so Lite is the actually-correct tool here, not a workaround.
//
// Exposes window.__firestoreLite for the classic (non-module) v2.js to call,
// since this needs `type="module"` for the SDK's ES module imports but the
// rest of the site intentionally stays on plain scripts.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js";

var db = null;

function ensureDb() {
  if (db) return db;
  var config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.projectId) return null;
  try {
    var app = getApps().length ? getApps()[0] : initializeApp(config);
    db = getFirestore(app);
  } catch (e) { /* keep the site working even if this throws */ }
  return db;
}

window.__firestoreLite = {
  getGalleryStats: function () {
    var d = ensureDb();
    if (!d) return Promise.resolve(null);
    return getDoc(doc(d, 'stats', 'gallery'))
      .then(function (snap) { return snap.exists() ? snap.data() : { views: 0, downloads: 0 }; })
      .catch(function () { return null; });
  },
  incrementGalleryViews: function () {
    var d = ensureDb();
    if (!d) return Promise.resolve();
    return setDoc(doc(d, 'stats', 'gallery'), { views: increment(1) }, { merge: true })
      .catch(function () { /* ignore */ });
  },
  incrementGalleryDownloads: function () {
    var d = ensureDb();
    if (!d) return Promise.resolve();
    return setDoc(doc(d, 'stats', 'gallery'), { downloads: increment(1) }, { merge: true })
      .catch(function () { /* ignore */ });
  },
  getPostStats: function (slug) {
    var d = ensureDb();
    if (!d || !slug) return Promise.resolve(null);
    return getDoc(doc(d, 'blogStats', slug))
      .then(function (snap) { return snap.exists() ? snap.data() : { views: 0 }; })
      .catch(function () { return null; });
  },
  incrementPostViews: function (slug) {
    var d = ensureDb();
    if (!d || !slug) return Promise.resolve();
    return setDoc(doc(d, 'blogStats', slug), { views: increment(1) }, { merge: true })
      .catch(function () { /* ignore */ });
  }
};
