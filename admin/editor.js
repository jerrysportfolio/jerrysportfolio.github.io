document.addEventListener('DOMContentLoaded', function () {
  requireAdmin().then(function () {
    initEditor();
  });
});

function slugify(s) {
  return (s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function initEditor() {
  var params = new URLSearchParams(location.search);
  var editingSlug = params.get('slug');
  var isEditMode = !!editingSlug;

  var titleEl = document.getElementById('title');
  var slugEl = document.getElementById('slug');
  var dateEl = document.getElementById('date');
  var dekEl = document.getElementById('dek');
  var publishedEl = document.getElementById('published');
  var markdownEl = document.getElementById('markdown');
  var previewEl = document.getElementById('preview');
  var imageListEl = document.getElementById('image-list');
  var saveBtn = document.getElementById('save-btn');
  var deleteBtn = document.getElementById('delete-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var saveStatus = document.getElementById('save-status');
  var heading = document.getElementById('editor-heading');

  var images = []; // array of {url}
  var slugManuallyEdited = false;
  var existingCreatedAt = null;
  var isDirty = false;
  var isSaving = false;
  var postExistsRemotely = isEditMode; // becomes true after the first successful save of a new post
  var suppressDirty = true; // true while we're populating fields programmatically (initial load)

  function markDirty() {
    if (suppressDirty) return;
    isDirty = true;
    setStatus('Unsaved changes', 'dirty');
  }

  function setStatus(text, kind) {
    saveStatus.textContent = text;
    saveStatus.className = 'save-status' + (kind ? ' save-status-' + kind : '');
  }

  // ---------- tag glass-dropdown ----------
  var tagInput = document.getElementById('tag');
  var tagTrigger = document.getElementById('tag-trigger');
  var tagMenu = document.getElementById('tag-menu');
  function setTag(value, label) {
    tagInput.value = value;
    tagTrigger.textContent = label;
    tagMenu.querySelectorAll('li').forEach(function (li) {
      li.classList.toggle('active', li.dataset.value === value);
    });
  }
  tagTrigger.addEventListener('click', function (e) {
    e.stopPropagation();
    tagMenu.hidden = !tagMenu.hidden;
  });
  tagMenu.querySelectorAll('li').forEach(function (li) {
    li.addEventListener('click', function () {
      setTag(li.dataset.value, li.textContent);
      tagMenu.hidden = true;
      markDirty();
    });
  });
  document.addEventListener('click', function () { tagMenu.hidden = true; });

  // ---------- live preview ----------
  var previewTimer = null;
  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      previewEl.innerHTML = window.renderPostMarkdown(markdownEl.value);
    }, 150);
  }
  markdownEl.addEventListener('input', function () { renderPreview(); markDirty(); });

  // Keep the preview pane's height matched to the textarea's, including
  // when the user drags the textarea's native resize handle — so the two
  // stay visually in sync, and the preview scrolls its own content instead
  // of the whole page growing to fit a long post.
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      previewEl.style.height = markdownEl.offsetHeight + 'px';
    }).observe(markdownEl);
  }
  titleEl.addEventListener('input', markDirty);
  slugEl.addEventListener('input', markDirty);
  dateEl.addEventListener('input', markDirty);
  dekEl.addEventListener('input', markDirty);
  publishedEl.addEventListener('change', markDirty);

  // ---------- image list (drag to reorder — first image is the cover) ----------
  var dragFromIndex = null;

  function renderImageList() {
    imageListEl.innerHTML = '';
    images.forEach(function (img, idx) {
      var item = document.createElement('div');
      item.className = 'image-list-item';
      item.draggable = true;
      item.dataset.index = idx;
      item.innerHTML = '<img src="' + img.url + '" alt="">' +
        (idx === 0 ? '<span class="image-list-cover-badge">Cover</span>' : '') +
        '<button type="button" aria-label="Remove image">✕</button>';
      item.querySelector('button').addEventListener('click', function () {
        images.splice(idx, 1);
        renderImageList();
        markDirty();
      });

      item.addEventListener('dragstart', function (e) {
        dragFromIndex = idx;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch (err) { /* Firefox needs this set */ }
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('dragging');
        imageListEl.querySelectorAll('.image-list-item').forEach(function (el) { el.classList.remove('drag-over'); });
        dragFromIndex = null;
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', function () { item.classList.remove('drag-over'); });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (dragFromIndex === null || dragFromIndex === idx) return;
        var moved = images.splice(dragFromIndex, 1)[0];
        images.splice(idx, 0, moved);
        renderImageList();
        markDirty();
      });

      imageListEl.appendChild(item);
    });
  }

  var fileInput = document.getElementById('image-file-input');
  var pendingInsertInline = false;
  function triggerUpload(insertInline) {
    pendingInsertInline = insertInline;
    fileInput.value = '';
    fileInput.click();
  }
  document.getElementById('upload-image-btn').addEventListener('click', function () { triggerUpload(false); });
  document.getElementById('add-image-url-btn').addEventListener('click', function () {
    glassPrompt('Image URL or path (e.g. assets/img/blogs/my-post/1.jpeg):').then(function (url) {
      if (!url) return;
      images.push({ url: url.trim() });
      renderImageList();
      markDirty();
    });
  });
  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    setStatus('Uploading image…');
    window.__storageLite.uploadBlogImage(file).then(function (url) {
      images.push({ url: url });
      renderImageList();
      markDirty();
      if (pendingInsertInline) insertAtCursor('![' + file.name.replace(/\.[a-z0-9]+$/i, '') + '](' + url + ')\n');
    }).catch(function () {
      setStatus('Image upload failed.', 'error');
    });
  });

  // ---------- toolbar ----------
  function insertAtCursor(text) {
    var start = markdownEl.selectionStart, end = markdownEl.selectionEnd;
    var value = markdownEl.value;
    markdownEl.value = value.slice(0, start) + text + value.slice(end);
    var pos = start + text.length;
    markdownEl.focus();
    markdownEl.setSelectionRange(pos, pos);
    renderPreview();
  }

  function wrapSelection(before, after) {
    after = after == null ? before : after;
    var start = markdownEl.selectionStart, end = markdownEl.selectionEnd;
    var value = markdownEl.value;
    var selected = value.slice(start, end);
    markdownEl.value = value.slice(0, start) + before + selected + after + value.slice(end);
    markdownEl.focus();
    markdownEl.setSelectionRange(start + before.length, start + before.length + selected.length);
    renderPreview();
  }

  function prefixLines(prefix) {
    var start = markdownEl.selectionStart, end = markdownEl.selectionEnd;
    var value = markdownEl.value;
    var selected = value.slice(start, end) || 'Text';
    var prefixed = selected.split('\n').map(function (line) { return prefix + line; }).join('\n');
    markdownEl.value = value.slice(0, start) + prefixed + value.slice(end);
    markdownEl.focus();
    markdownEl.setSelectionRange(start, start + prefixed.length);
    renderPreview();
  }

  function nextFootnoteNumber() {
    var matches = markdownEl.value.match(/\[\^(\d+)\]/g) || [];
    var max = 0;
    matches.forEach(function (m) {
      var n = parseInt(m.replace(/\D/g, ''), 10);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function insertBlock(block, selectFrom, selectLen) {
    var start = markdownEl.selectionStart, end = markdownEl.selectionEnd;
    var value = markdownEl.value;
    markdownEl.value = value.slice(0, start) + block + value.slice(end);
    markdownEl.focus();
    var from = start + (selectFrom || 0);
    markdownEl.setSelectionRange(from, from + (selectLen || 0));
    renderPreview();
  }

  var TOOLBAR_ACTIONS = {
    bold: function () { wrapSelection('**'); },
    italic: function () { wrapSelection('*'); },
    underline: function () { wrapSelection('<u>', '</u>'); },
    strike: function () { wrapSelection('~~'); },
    quote: function () { prefixLines('> '); },
    callout: function () {
      var selected = markdownEl.value.slice(markdownEl.selectionStart, markdownEl.selectionEnd) || 'Callout text';
      insertBlock('> [!NOTE]\n> ' + selected.split('\n').join('\n> ') + '\n');
    },
    code: function () { wrapSelection('`'); },
    codeblock: function () {
      var selected = markdownEl.value.slice(markdownEl.selectionStart, markdownEl.selectionEnd) || 'code here';
      insertBlock('```\n' + selected + '\n```\n', 4, selected.length);
    },
    link: function () {
      var selected = markdownEl.value.slice(markdownEl.selectionStart, markdownEl.selectionEnd) || 'link text';
      glassPrompt('Link URL:', 'https://').then(function (url) {
        if (!url) return;
        var text = '[' + selected + '](' + url + ')';
        insertBlock(text, 1, selected.length);
      });
    },
    footnote: function () {
      var n = nextFootnoteNumber();
      insertAtCursor('[^' + n + ']');
      markdownEl.value += '\n\n[^' + n + ']: ';
      markdownEl.focus();
      markdownEl.setSelectionRange(markdownEl.value.length, markdownEl.value.length);
      renderPreview();
    },
    youtube: function () {
      glassPrompt('YouTube video URL or ID:').then(function (url) {
        if (!url) return;
        insertAtCursor('\n[[youtube:' + url.trim() + ']]\n');
      });
    },
    linkedin: function () {
      glassPrompt('LinkedIn post URL (from the post\'s "Embed this post" menu, or just paste the share link):').then(function (url) {
        if (!url) return;
        insertAtCursor('\n[[linkedin:' + url.trim() + ']]\n');
      });
    },
    'toolbar-image': function () { triggerUpload(true); }
  };

  // Every action below ends by calling markdownEl.focus(), which some
  // browsers treat as "scroll this element into view" — on a long post
  // that visibly yanks the pane down to wherever the caret landed instead
  // of leaving the reader's current scroll position alone. Pin scrollTop
  // across the call (sync + a rAF safety net for anything that scrolls on
  // the next frame) so clicking a toolbar button never moves the viewport.
  function runToolbarAction(action) {
    var scrollTop = markdownEl.scrollTop;
    action();
    markdownEl.scrollTop = scrollTop;
    requestAnimationFrame(function () { markdownEl.scrollTop = scrollTop; });
  }

  document.getElementById('editor-toolbar').addEventListener('click', function (e) {
    var btn = e.target.closest('.toolbar-btn');
    if (!btn) return;
    var action = TOOLBAR_ACTIONS[btn.dataset.cmd];
    if (action) { pushUndo(); runToolbarAction(action); }
  });

  // ---------- undo/redo + keyboard shortcuts (Cmd on Mac, Ctrl on Windows/Linux) ----------
  // Toolbar actions and shortcuts below all mutate markdownEl.value directly
  // (see wrapSelection/insertBlock/etc. above), which resets the browser's
  // native per-keystroke undo history — so undo/redo here is a small stack
  // of our own instead of relying on the browser's Cmd/Ctrl+Z.
  var undoStack = [];
  var redoStack = [];
  var typingBurstTimer = null;

  function snapshotState() {
    return { value: markdownEl.value, start: markdownEl.selectionStart, end: markdownEl.selectionEnd };
  }
  function pushUndo() {
    undoStack.push(snapshotState());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  function restoreState(state) {
    markdownEl.value = state.value;
    markdownEl.focus();
    markdownEl.setSelectionRange(state.start, state.end);
    renderPreview();
  }
  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push(snapshotState());
    restoreState(undoStack.pop());
  }
  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(snapshotState());
    restoreState(redoStack.pop());
  }

  markdownEl.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (!mod) {
      // Plain typing: snapshot once at the start of a burst (before this
      // keystroke lands), so a whole word/sentence undoes in one step
      // instead of one undo per character.
      if (typingBurstTimer === null) pushUndo();
      clearTimeout(typingBurstTimer);
      typingBurstTimer = setTimeout(function () { typingBurstTimer = null; }, 700);
      return;
    }
    var key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); doRedo(); return; }
    if (key === 'b') { e.preventDefault(); pushUndo(); runToolbarAction(TOOLBAR_ACTIONS.bold); return; }
    if (key === 'i') { e.preventDefault(); pushUndo(); runToolbarAction(TOOLBAR_ACTIONS.italic); return; }
    if (key === 'u') { e.preventDefault(); pushUndo(); runToolbarAction(TOOLBAR_ACTIONS.underline); return; }
  });

  // ---------- slug auto-suggest ----------
  titleEl.addEventListener('input', function () {
    if (!isEditMode && !slugManuallyEdited) slugEl.value = slugify(titleEl.value);
  });
  slugEl.addEventListener('input', function () { slugManuallyEdited = true; });

  // ---------- load existing post (edit mode) ----------
  if (isEditMode) {
    heading.textContent = 'Edit post';
    slugEl.disabled = true;
    deleteBtn.hidden = false;
    window.__firestoreLite.getPost(editingSlug).then(function (post) {
      if (!post) { glassAlert('Post not found.').then(function () { location.href = 'dashboard.html'; }); return; }
      titleEl.value = post.title || '';
      slugEl.value = post.slug;
      dateEl.value = post.date || '';
      dekEl.value = post.dek || '';
      publishedEl.checked = !!post.published;
      markdownEl.value = post.markdown || '';
      existingCreatedAt = post.createdAt || null;
      images = (post.images || []).map(function (url) { return { url: url }; });
      var tagLabel = { misc: 'Misc', tech: 'Tech', music: 'Music', life: 'Life', literature: 'Literature' }[post.tag] || post.tag || 'Misc';
      setTag(post.tag || 'misc', tagLabel);
      renderImageList();
      renderPreview();
      setStatus('All changes saved');
      suppressDirty = false;
    });
  } else {
    setTag('misc', 'Misc');
    dateEl.value = new Date().toISOString().slice(0, 10);
    setStatus('Not yet saved');
    suppressDirty = false;
  }

  // ---------- save (shared by the Save button, autosave, and the leave-guard) ----------
  var currentSlug = editingSlug; // locked in once a new post has been saved for the first time

  function validationError() {
    if (!titleEl.value.trim()) return 'Title is required.';
    if (!(currentSlug || slugEl.value || titleEl.value).trim()) return 'Slug is required.';
    if (!markdownEl.value.trim()) return 'Post body is required.';
    return null;
  }

  // opts.silent: skip alerts and the new-slug overwrite confirm (used by
  // autosave — a silent autosave should never interrupt with a dialog).
  // opts.navigateAway: where to go after a successful save, if anywhere.
  function performSave(opts) {
    opts = opts || {};
    var err = validationError();
    if (err) {
      if (!opts.silent) glassAlert(err);
      return Promise.reject(new Error(err));
    }
    var slug = currentSlug || slugify(slugEl.value || titleEl.value);

    var data = {
      title: titleEl.value.trim(),
      tag: tagInput.value,
      date: dateEl.value,
      dek: dekEl.value.trim(),
      published: publishedEl.checked,
      images: images.map(function (i) { return i.url; }),
      markdown: markdownEl.value,
      updatedAt: new Date().toISOString()
    };

    var proceed = postExistsRemotely || opts.silent
      ? Promise.resolve(true)
      : window.__firestoreLite.postExists(slug).then(function (exists) {
        if (!exists) return true;
        return glassConfirm('A post with slug "' + slug + '" already exists. Overwrite it?', { okLabel: 'Overwrite' });
      });

    isSaving = true;
    saveBtn.disabled = true;
    setStatus('Saving…', 'saving');

    return proceed.then(function (ok) {
      if (!ok) { isSaving = false; saveBtn.disabled = false; setStatus('Unsaved changes', 'dirty'); return Promise.reject(new Error('cancelled')); }
      data.createdAt = postExistsRemotely ? (existingCreatedAt || data.updatedAt) : data.updatedAt;
      return window.__firestoreLite.savePost(slug, data).then(function () {
        currentSlug = slug;
        postExistsRemotely = true;
        existingCreatedAt = data.createdAt;
        slugEl.disabled = true;
        deleteBtn.hidden = false;
        isDirty = false;
        isSaving = false;
        saveBtn.disabled = false;
        setStatus(opts.silent ? 'Autosaved just now' : 'All changes saved', 'saved');
        if (opts.navigateAway) location.href = opts.navigateAway;
      });
    }).catch(function (err2) {
      isSaving = false;
      saveBtn.disabled = false;
      if (err2.message !== 'cancelled') {
        setStatus('Save failed — check the console.', 'error');
        console.error(err2);
      }
      throw err2;
    });
  }

  // ---------- autosave ----------
  // Every 5s, if there's something to save and nothing's in flight. Skipped
  // entirely if the post doesn't yet have a title+body (nothing meaningful
  // to autosave), same bar as manual save's own validation.
  setInterval(function () {
    if (isDirty && !isSaving && !validationError()) performSave({ silent: true });
  }, 5000);

  // ---------- leaving the page with unsaved changes ----------
  // "Save and leave" / "Discard and leave" / "Stay" via two chained glass
  // confirms — consistent with the rest of this editor's dialog-based UX.
  function confirmLeave(destination) {
    if (!isDirty) { location.href = destination; return; }
    glassConfirm('You have unsaved changes. Save before leaving?', { okLabel: 'Save' }).then(function (saveFirst) {
      if (saveFirst) {
        performSave({}).then(function () { location.href = destination; }).catch(function () { /* stay so they can fix/retry */ });
        return;
      }
      return glassConfirm('Discard unsaved changes and leave?', { okLabel: 'Discard', danger: true }).then(function (discard) {
        if (discard) location.href = destination;
      });
    });
  }

  window.addEventListener('beforeunload', function (e) {
    if (!isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- save / delete / cancel ----------
  var backLink = document.querySelector('.admin-topbar-actions a.contact-link');
  if (backLink) {
    backLink.addEventListener('click', function (e) {
      e.preventDefault();
      confirmLeave(backLink.getAttribute('href'));
    });
  }

  cancelBtn.addEventListener('click', function () { confirmLeave('dashboard.html'); });

  saveBtn.addEventListener('click', function () {
    performSave({ navigateAway: 'dashboard.html' }).catch(function () { /* error already shown */ });
  });

  deleteBtn.addEventListener('click', function () {
    glassConfirm('Delete "' + (titleEl.value || currentSlug) + '"? This cannot be undone.', { okLabel: 'Delete', danger: true }).then(function (ok) {
      if (!ok) return;
      deleteBtn.disabled = true;
      window.__firestoreLite.deletePost(currentSlug).then(function () {
        isDirty = false; // it's gone; don't let beforeunload/back-link second-guess this
        location.href = 'dashboard.html';
      }).catch(function () {
        deleteBtn.disabled = false;
        glassAlert('Delete failed.');
      });
    });
  });
}
