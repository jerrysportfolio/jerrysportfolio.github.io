// Shared across every admin page except index.html (the login page itself):
// gates the page behind sign-in, and wires the sign-out button. This is a
// UX guard only — the real security boundary is the Firestore/Storage rules
// checking the signed-in user's email, not anything in this file.
var ADMIN_EMAIL = 'work.jerrywu@gmail.com';

function waitForAdminLibs(callback) {
  if (window.__authLite && window.__firestoreLite) { callback(); return; }
  setTimeout(function () { waitForAdminLibs(callback); }, 30);
}

// Resolves with the signed-in admin user, or redirects to the login page and
// never resolves (so callers can just chain off this without an else branch).
function requireAdmin() {
  return new Promise(function (resolve) {
    waitForAdminLibs(function () {
      var settled = false;
      window.__authLite.onChange(function (user) {
        if (settled) return;
        if (user && user.email === ADMIN_EMAIL) {
          settled = true;
          resolve(user);
        } else if (user) {
          // Signed in, but not the admin account — sign out and bounce.
          window.__authLite.signOut().finally(function () { location.href = 'index.html'; });
        } else {
          location.href = 'index.html';
        }
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  var signOutBtn = document.getElementById('sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function () {
      waitForAdminLibs(function () {
        window.__authLite.signOut().finally(function () { location.href = 'index.html'; });
      });
    });
  }
});
