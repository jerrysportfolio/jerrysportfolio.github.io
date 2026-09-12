// Liquid-glass replacements for window.alert/confirm/prompt, used throughout
// the admin dashboard so every popup matches the site's design instead of
// looking like a bare browser dialog. Each returns a Promise:
//   glassAlert(message)              -> Promise<true>            (resolves on dismiss)
//   glassConfirm(message)            -> Promise<boolean>
//   glassPrompt(message, default?)   -> Promise<string|null>     (null = cancelled)
(function () {
  var backdrop, messageEl, inputWrap, inputEl, actionsEl;

  function ensureDom() {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'glass-dialog-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML =
      '<div class="glass-dialog" role="alertdialog" aria-modal="true">' +
      '<p class="glass-dialog-message"></p>' +
      '<div class="glass-dialog-input-wrap" hidden><input type="text" class="glass-dialog-input"></div>' +
      '<div class="glass-dialog-actions"></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    messageEl = backdrop.querySelector('.glass-dialog-message');
    inputWrap = backdrop.querySelector('.glass-dialog-input-wrap');
    inputEl = backdrop.querySelector('.glass-dialog-input');
    actionsEl = backdrop.querySelector('.glass-dialog-actions');
    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop) backdrop.dataset.mousedownOnBackdrop = '1';
    });
  }

  // opts: {message, withInput, defaultValue, buttons: [{label, value, primary, danger}]}
  function open(opts) {
    ensureDom();
    return new Promise(function (resolve) {
      messageEl.textContent = opts.message;
      inputWrap.hidden = !opts.withInput;
      inputEl.value = opts.defaultValue || '';
      actionsEl.innerHTML = '';

      var closed = false;
      function close(value) {
        if (closed) return;
        closed = true;
        backdrop.classList.remove('open');
        document.removeEventListener('keydown', onKeydown);
        setTimeout(function () { backdrop.hidden = true; }, 200);
        resolve(value);
      }

      opts.buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn' + (b.primary ? ' btn-primary' : '') + (b.danger ? ' btn-danger' : '');
        btn.textContent = b.label;
        btn.addEventListener('click', function () {
          close(opts.withInput && b.primary ? inputEl.value : b.value);
        });
        actionsEl.appendChild(btn);
      });

      function onKeydown(e) {
        if (e.key === 'Escape') close(opts.withInput ? null : (opts.buttons.length > 1 ? false : true));
        if (e.key === 'Enter' && opts.withInput) close(inputEl.value);
      }
      document.addEventListener('keydown', onKeydown);
      backdrop.addEventListener('click', function onBackdropClick(e) {
        if (e.target !== backdrop) return;
        backdrop.removeEventListener('click', onBackdropClick);
        close(opts.withInput ? null : (opts.buttons.length > 1 ? false : true));
      });

      backdrop.hidden = false;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { backdrop.classList.add('open'); });
      });
      if (opts.withInput) { inputEl.focus(); inputEl.select(); }
      else if (actionsEl.lastChild) actionsEl.lastChild.focus();
    });
  }

  window.glassAlert = function (message) {
    return open({ message: message, withInput: false, buttons: [{ label: 'OK', value: true, primary: true }] });
  };
  window.glassConfirm = function (message, opts) {
    opts = opts || {};
    return open({
      message: message, withInput: false, buttons: [
        { label: opts.cancelLabel || 'Cancel', value: false },
        { label: opts.okLabel || 'OK', value: true, primary: !opts.danger, danger: !!opts.danger }
      ]
    });
  };
  window.glassPrompt = function (message, defaultValue) {
    return open({
      message: message, withInput: true, defaultValue: defaultValue, buttons: [
        { label: 'Cancel', value: null },
        { label: 'OK', value: true, primary: true }
      ]
    });
  };
})();
