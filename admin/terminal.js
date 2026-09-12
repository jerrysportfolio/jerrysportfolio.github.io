document.addEventListener('DOMContentLoaded', function () {
  var logEl = document.getElementById('terminal-log');
  var promptEl = document.getElementById('terminal-prompt');
  var typedEl = document.getElementById('terminal-typed');
  var inputEl = document.getElementById('terminal-input');
  var bodyInner = document.getElementById('terminal-body-inner');
  var windowEl = document.querySelector('.terminal-window');

  var stage = 'email'; // 'email' | 'password' | 'busy'
  var email = '';

  function appendLine(text, className) {
    var line = document.createElement('div');
    line.className = 'terminal-line' + (className ? ' ' + className : '');
    line.textContent = text;
    logEl.appendChild(line);
  }

  function focusInput() { if (!inputEl.disabled) inputEl.focus(); }
  bodyInner.addEventListener('click', focusInput);

  // Traffic lights: red closes back to the public site, green maximizes
  // (toggles), yellow is inert — same as a real terminal's minimize doing
  // nothing useful in a browser tab.
  document.getElementById('terminal-dot-close').addEventListener('click', function () {
    location.href = '../index.html';
  });
  document.getElementById('terminal-dot-maximize').addEventListener('click', function () {
    windowEl.classList.toggle('terminal-maximized');
    document.body.classList.toggle('terminal-maximized');
  });
  focusInput();

  function setStage(next) {
    stage = next;
    typedEl.textContent = '';
    inputEl.value = '';
    if (stage === 'email') {
      promptEl.textContent = "jerry@iamjerryhu's email:";
      inputEl.type = 'email';
      inputEl.autocomplete = 'username';
      inputEl.disabled = false;
      focusInput();
    } else if (stage === 'password') {
      promptEl.textContent = 'jerry@iamjerryhu\'s password:';
      inputEl.type = 'password';
      inputEl.autocomplete = 'current-password';
      inputEl.disabled = false;
      focusInput();
    } else {
      inputEl.disabled = true;
    }
  }

  // Email is echoed as it's typed; password never is — stays fully hidden,
  // matching a real terminal password prompt rather than dot-masking.
  inputEl.addEventListener('input', function () {
    if (stage === 'email') typedEl.textContent = inputEl.value;
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (stage === 'email') {
      var value = inputEl.value.trim();
      if (!value) return;
      email = value;
      appendLine("jerry@iamjerryhu's email: " + email);
      setStage('password');
    } else if (stage === 'password') {
      var password = inputEl.value;
      if (!password) return;
      appendLine('password:');
      attemptSignIn(password);
    }
  });

  function attemptSignIn(password) {
    setStage('busy');
    appendLine('authenticating…', 'terminal-dim');
    window.__authLite.signInWithEmail(email, password).then(function () {
      appendLine('access granted.', 'terminal-ok');
      document.body.classList.add('terminal-access-granted');
      setTimeout(function () { location.href = 'dashboard.html'; }, 480);
    }).catch(function () {
      appendLine('authentication failed.', 'terminal-error');
      windowEl.classList.add('terminal-shake');
      setTimeout(function () { windowEl.classList.remove('terminal-shake'); }, 350);
      email = '';
      setStage('email');
    });
  }

  // Already signed in as the admin? skip straight to the dashboard.
  var checked = false;
  (function waitForAuth() {
    if (!window.__authLite) { setTimeout(waitForAuth, 30); return; }
    window.__authLite.onChange(function (user) {
      if (checked) return;
      checked = true;
      if (user) location.href = 'dashboard.html';
    });
  })();
});
