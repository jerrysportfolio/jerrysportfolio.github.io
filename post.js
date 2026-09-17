document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(location.search);
  var slug = params.get('slug');
  var loadingEl = document.getElementById('post-loading');
  var contentEl = document.getElementById('post-content');

  if (!slug || !window.__firestoreLite) {
    loadingEl.textContent = 'Post not found.';
    return;
  }

  var TAG_LABELS = { misc: 'Misc', tech: 'Tech', music: 'Music', life: 'Life', literature: 'Literature' };

  function formatPostDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  window.__firestoreLite.getPost(slug).then(function (post) {
    if (!post || !post.published) {
      loadingEl.textContent = 'Post not found.';
      return;
    }

    document.title = post.title + ' — Jerry Hu';
    document.getElementById('post-date').textContent = formatPostDate(post.date);
    document.getElementById('post-tag').textContent = TAG_LABELS[post.tag] || post.tag || 'Misc';
    document.getElementById('post-title').textContent = post.title;
    document.getElementById('post-body').innerHTML = window.renderPostMarkdown(post.markdown || '');

    var gallery = document.getElementById('post-gallery');
    (post.images || []).forEach(function (url, i) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = post.title + ' photo ' + (i + 1);
      gallery.appendChild(img);
    });

    loadingEl.hidden = true;
    contentEl.hidden = false;

    // The rest of the page (nav, lightbox chrome, image-click binding) was
    // already set up by v2.js's own DOMContentLoaded handler, which ran
    // before this fetch resolved — re-run just the bits that depend on
    // content that didn't exist yet.
    if (window.__reinitPostBehaviors) window.__reinitPostBehaviors(document);

    window.__firestoreLite.incrementPostViews(slug);
    window.__firestoreLite.logPageViewEvent('post', slug);
  }).catch(function () {
    loadingEl.textContent = 'Couldn\'t load this post right now.';
  });
});
