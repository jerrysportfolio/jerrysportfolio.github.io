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
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, increment,
  collection, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js";

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
  },

  // ---------- blog posts (public site reads published only; admin dashboard
  // reads/writes everything, gated by Firestore rules on the signed-in
  // user's email, not by anything client-side) ----------
  listPublishedPosts: function () {
    var d = ensureDb();
    if (!d) return Promise.resolve([]);
    var q = query(collection(d, 'posts'), where('published', '==', true), orderBy('date', 'desc'));
    return getDocs(q)
      .then(function (snap) { return snap.docs.map(function (s) { return Object.assign({ slug: s.id }, s.data()); }); })
      .catch(function () { return []; });
  },
  listAllPosts: function () {
    var d = ensureDb();
    if (!d) return Promise.resolve([]);
    var q = query(collection(d, 'posts'), orderBy('date', 'desc'));
    return getDocs(q)
      .then(function (snap) { return snap.docs.map(function (s) { return Object.assign({ slug: s.id }, s.data()); }); });
  },
  getPost: function (slug) {
    var d = ensureDb();
    if (!d || !slug) return Promise.resolve(null);
    return getDoc(doc(d, 'posts', slug))
      .then(function (snap) { return snap.exists() ? Object.assign({ slug: snap.id }, snap.data()) : null; });
  },
  postExists: function (slug) {
    var d = ensureDb();
    if (!d || !slug) return Promise.resolve(false);
    return getDoc(doc(d, 'posts', slug)).then(function (snap) { return snap.exists(); });
  },
  savePost: function (slug, data) {
    var d = ensureDb();
    if (!d || !slug) return Promise.reject(new Error('Firestore not configured'));
    return setDoc(doc(d, 'posts', slug), data);
  },
  // Take a post down (or bring it back) without touching its content — the
  // dashboard's per-row Publish/Unpublish action, distinct from Delete.
  setPostPublished: function (slug, published) {
    var d = ensureDb();
    if (!d || !slug) return Promise.reject(new Error('Firestore not configured'));
    return setDoc(doc(d, 'posts', slug), { published: !!published }, { merge: true });
  },
  deletePost: function (slug) {
    var d = ensureDb();
    if (!d || !slug) return Promise.reject(new Error('Firestore not configured'));
    return deleteDoc(doc(d, 'posts', slug));
  },

  // ---------- site-wide page-view events (dashboard traffic charts) ----------
  // One doc per visit: {page, slug?, referrerHost, date: 'YYYY-MM-DD', createdAt}.
  // `page` is a page key ('home','projects','gallery','blog','post'); `slug`
  // is only set for page:'post'. Write-only from the public site's
  // perspective — rules block reading these back except as the admin.
  logPageViewEvent: function (page, slug) {
    var d = ensureDb();
    if (!d || !page) return Promise.resolve();
    var referrerHost = 'direct';
    try {
      if (document.referrer) {
        var refUrl = new URL(document.referrer);
        if (refUrl.hostname && refUrl.hostname !== location.hostname) referrerHost = refUrl.hostname;
      }
    } catch (e) { /* keep 'direct' */ }
    var now = new Date();
    var data = {
      page: page,
      referrerHost: referrerHost,
      date: now.toISOString().slice(0, 10),
      createdAt: now.toISOString()
    };
    if (slug) data.slug = slug;
    return addDoc(collection(d, 'pageViews'), data).catch(function () { /* ignore */ });
  },
  // sinceDate: 'YYYY-MM-DD' (inclusive). Admin-only per rules.
  getPageViewEvents: function (sinceDate) {
    var d = ensureDb();
    if (!d) return Promise.resolve([]);
    var q = query(collection(d, 'pageViews'), where('date', '>=', sinceDate), orderBy('date', 'asc'));
    return getDocs(q)
      .then(function (snap) { return snap.docs.map(function (s) { return s.data(); }); })
      .catch(function () { return []; });
  }
};
