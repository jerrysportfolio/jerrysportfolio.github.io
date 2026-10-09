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

// Camera originals are 10+ MB; shrink to at most 2000px on the long edge (JPEG 0.85) before uploading so
// the blog loads fast. Falls back to the untouched file for GIFs/SVGs or if anything goes wrong.
var MAX_EDGE = 2000;
function downscale(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
  return createImageBitmap(file).then(function (bmp) {
    var scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    var png = file.type === 'image/png';
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        var name = file.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg');
        resolve(new File([blob], name, { type: blob.type }));
      }, png ? 'image/png' : 'image/jpeg', 0.85);
    });
  }).catch(function () { return file; });
}

window.__storageLite = {
  // Uploads under blog-images/ (the only path Storage rules allow the admin
  // to write to). Returns the public download URL to embed in a post.
  uploadBlogImage: function (file) {
    var s = ensureStorage();
    if (!s) return Promise.reject(new Error('Storage not configured'));
    return downscale(file).then(function (f) {
      var safeName = f.name.replace(/[^a-zA-Z0-9_.-]/g, '-');
      var path = 'blog-images/' + Date.now() + '-' + safeName;
      var fileRef = ref(s, path);
      return uploadBytes(fileRef, f).then(function () { return getDownloadURL(fileRef); });
    });
  }
};
