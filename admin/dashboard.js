document.addEventListener('DOMContentLoaded', function () {
  requireAdmin().then(function () {
    loadStats();
    loadPosts();

    document.getElementById('post-table-body').addEventListener('click', function (e) {
      var deleteBtn = e.target.closest('[data-delete-slug]');
      if (deleteBtn) {
        var slug = deleteBtn.dataset.deleteSlug;
        if (!window.confirm('Delete "' + slug + '"? This cannot be undone.')) return;
        deleteBtn.disabled = true;
        window.__firestoreLite.deletePost(slug).then(function () { loadPosts(); loadStats(); })
          .catch(function () { alert('Delete failed.'); deleteBtn.disabled = false; });
        return;
      }

      var toggleBtn = e.target.closest('[data-toggle-slug]');
      if (toggleBtn) {
        var currentlyPublished = toggleBtn.dataset.currentlyPublished === 'true';
        toggleBtn.disabled = true;
        window.__firestoreLite.setPostPublished(toggleBtn.dataset.toggleSlug, !currentlyPublished)
          .then(function () { loadPosts(); })
          .catch(function () { alert('Failed to update publish status.'); toggleBtn.disabled = false; });
      }
    });
  });
});

function loadStats() {
  window.__firestoreLite.getGalleryStats().then(function (data) {
    data = data || {};
    document.getElementById('stat-gallery-views').textContent = (data.views || 0).toLocaleString();
    document.getElementById('stat-gallery-downloads').textContent = (data.downloads || 0).toLocaleString();
  });
}

function loadPosts() {
  var tbody = document.getElementById('post-table-body');
  window.__firestoreLite.listAllPosts().then(function (posts) {
    document.getElementById('stat-post-count').textContent =
      posts.filter(function (p) { return p.published; }).length;

    if (!posts.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No posts yet — click "New post" to write your first one.</td></tr>';
      document.getElementById('stat-post-views').textContent = '0';
      return;
    }

    tbody.innerHTML = '';
    var totalViews = 0;
    var pending = posts.length;

    posts.forEach(function (post) {
      var tr = document.createElement('tr');
      var statusBadge = post.published
        ? '<span class="badge badge-published">Published</span>'
        : '<span class="badge badge-draft">Draft</span>';
      var tagLabel = { misc: 'Misc', tech: 'Tech', music: 'Music', life: 'Life', literature: 'Literature' }[post.tag] || post.tag || '—';

      tr.innerHTML =
        '<td class="post-title-cell"><a href="editor.html?slug=' + encodeURIComponent(post.slug) + '">' +
        escapeHtml(post.title || post.slug) + '</a></td>' +
        '<td>' + escapeHtml(tagLabel) + '</td>' +
        '<td>' + escapeHtml(post.date || '—') + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td class="post-views">—</td>' +
        '<td><div class="post-row-actions">' +
        '<a class="btn btn-sm" href="editor.html?slug=' + encodeURIComponent(post.slug) + '">Edit</a>' +
        '<button class="btn btn-sm" data-toggle-slug="' + escapeHtml(post.slug) + '" data-currently-published="' + !!post.published + '">' +
        (post.published ? 'Unpublish' : 'Publish') + '</button>' +
        '<button class="btn btn-sm btn-danger" data-delete-slug="' + escapeHtml(post.slug) + '">Delete</button>' +
        '</div></td>';
      tbody.appendChild(tr);

      var viewsCell = tr.querySelector('.post-views');
      window.__firestoreLite.getPostStats(post.slug).then(function (stats) {
        var views = (stats && stats.views) || 0;
        viewsCell.textContent = views.toLocaleString();
        totalViews += views;
        pending -= 1;
        if (pending === 0) document.getElementById('stat-post-views').textContent = totalViews.toLocaleString();
      });
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
