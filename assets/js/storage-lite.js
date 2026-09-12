// Firebase Storage upload helper for the admin dashboard (blog post images).
// A plain `type="module"` script like firestore-lite.js — Storage uploads are
// one-shot HTTP requests already, no persistent-connection concern here, this
// just keeps the same "expose a window.__x for classic scripts to call" shape
// as the rest of the site's Firebase glue.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

var storage = null;

function ensureStorage() {
  if (storage) return storage;
  var config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.storageBucket) return null;
  try {
    var app = getApps().length ? getApps()[0] : initializeApp(config);
    storage = getStorage(app);
  } catch (e) { /* keep the site working even if this throws */ }
  return storage;
}

window.__storageLite = {
  // Uploads under blog-images/ (the only path Storage rules allow the admin
  // to write to). Returns the public download URL to embed in a post.
  uploadBlogImage: function (file) {
    var s = ensureStorage();
    if (!s) return Promise.reject(new Error('Storage not configured'));
    var safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '-');
    var path = 'blog-images/' + Date.now() + '-' + safeName;
    var fileRef = ref(s, path);
    return uploadBytes(fileRef, file).then(function () { return getDownloadURL(fileRef); });
  }
};
