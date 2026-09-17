document.addEventListener('DOMContentLoaded', function () {
  requireAdmin().then(function () {
    loadStats();
    loadPosts();
    initColumnResize();
    initTrafficSection();

    document.getElementById('post-table-body').addEventListener('click', function (e) {
      var deleteBtn = e.target.closest('[data-delete-slug]');
      if (deleteBtn) {
        var slug = deleteBtn.dataset.deleteSlug;
        glassConfirm('Delete "' + slug + '"? This cannot be undone.', { okLabel: 'Delete', danger: true }).then(function (ok) {
          if (!ok) return;
          deleteBtn.disabled = true;
          window.__firestoreLite.deletePost(slug).then(function () { loadPosts(); loadStats(); })
            .catch(function () { glassAlert('Delete failed.'); deleteBtn.disabled = false; });
        });
        return;
      }

      var toggleBtn = e.target.closest('[data-toggle-slug]');
      if (toggleBtn) {
        var currentlyPublished = toggleBtn.dataset.currentlyPublished === 'true';
        toggleBtn.disabled = true;
        window.__firestoreLite.setPostPublished(toggleBtn.dataset.toggleSlug, !currentlyPublished)
          .then(function () { loadPosts(); })
          .catch(function () { glassAlert('Failed to update publish status.'); toggleBtn.disabled = false; });
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
        '<td class="post-title-cell"><a href="../post.html?slug=' + encodeURIComponent(post.slug) + '" target="_blank" rel="noopener" title="View public post">' +
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

// Drag-to-resize table columns, widths memorized per-column in
// localStorage so they persist across visits. Column widths live on
// <col> elements (table-layout:fixed makes those authoritative), while
// the drag handle sits on the header cell above each column.
function initColumnResize() {
  var table = document.getElementById('post-table');
  if (!table) return;
  var STORAGE_KEY = 'admin-post-table-col-widths';
  var cols = Array.prototype.slice.call(table.querySelectorAll('colgroup col'));

  function loadWidths() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { saved = {}; }
    cols.forEach(function (col) {
      var px = saved[col.dataset.col];
      if (px) col.style.width = px + 'px';
    });
  }

  function saveWidths() {
    var widths = {};
    cols.forEach(function (col) {
      var px = parseFloat(col.style.width);
      if (px) widths[col.dataset.col] = px;
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch (e) { /* ignore */ }
  }

  loadWidths();

  var headers = Array.prototype.slice.call(table.querySelectorAll('thead th'));
  headers.forEach(function (th, index) {
    var handle = th.querySelector('.col-resize-handle');
    var col = cols[index];
    var nextTh = headers[index + 1];
    var nextCol = cols[index + 1];
    if (!handle || !col || !nextTh || !nextCol) return;

    // Resize by trading width with the immediate neighbor only, so the
    // table's total width never changes. The table is width:100% with the
    // other, untouched columns still in their original % units — if only
    // the dragged column's width changed, the browser would have to
    // renegotiate every other column to keep the total at 100%, which is
    // exactly what made this jitter/fight the drag instead of resizing.
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startWidth = th.getBoundingClientRect().width;
      var startNextWidth = nextTh.getBoundingClientRect().width;
      handle.classList.add('resizing');
      handle.setPointerCapture(e.pointerId);

      function onMove(ev) {
        var delta = ev.clientX - startX;
        delta = Math.max(delta, 60 - startWidth); // don't shrink this column below 60px
        delta = Math.min(delta, startNextWidth - 60); // don't shrink the neighbor below 60px
        col.style.width = (startWidth + delta) + 'px';
        nextCol.style.width = (startNextWidth - delta) + 'px';
      }
      function onUp(ev) {
        handle.releasePointerCapture(ev.pointerId);
        handle.classList.remove('resizing');
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        saveWidths();
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  });
}

// ---------- traffic charts (views over time, top pages, sources) ----------
var PAGE_LABELS = { home: 'Home', projects: 'Projects', gallery: 'Gallery', blog: 'Blog index' };
var trafficRangeDays = 7;

function initTrafficSection() {
  var rangeGroup = document.getElementById('traffic-range-group');
  if (!rangeGroup) return;
  var pills = rangeGroup.querySelectorAll('.pill');
  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      trafficRangeDays = parseInt(pill.dataset.days, 10);
      loadTraffic();
    });
  });
  loadTraffic();
}

function dateStrDaysAgo(n) {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function loadTraffic() {
  var chartEl = document.getElementById('traffic-chart');
  var topEl = document.getElementById('traffic-top-posts');
  var sourcesEl = document.getElementById('traffic-sources');
  if (!chartEl || !window.__firestoreLite) return;
  chartEl.innerHTML = '<p class="empty-state">Loading…</p>';

  var sinceDate = dateStrDaysAgo(trafficRangeDays - 1); // inclusive of today
  Promise.all([
    window.__firestoreLite.getPageViewEvents(sinceDate),
    window.__firestoreLite.listAllPosts()
  ]).then(function (results) {
    var events = results[0];
    var posts = results[1];
    var postTitleBySlug = {};
    posts.forEach(function (p) { postTitleBySlug[p.slug] = p.title || p.slug; });

    var days = [];
    for (var i = trafficRangeDays - 1; i >= 0; i--) days.push(dateStrDaysAgo(i));
    var countsByDay = {};
    days.forEach(function (d) { countsByDay[d] = 0; });

    var countsByPage = {};
    var countsBySource = {};
    events.forEach(function (ev) {
      if (Object.prototype.hasOwnProperty.call(countsByDay, ev.date)) countsByDay[ev.date]++;
      var pageKey = ev.page === 'post' ? ('post:' + ev.slug) : ev.page;
      countsByPage[pageKey] = (countsByPage[pageKey] || 0) + 1;
      var source = ev.referrerHost || 'direct';
      countsBySource[source] = (countsBySource[source] || 0) + 1;
    });

    renderTrafficChart(chartEl, days.map(function (d) { return { date: d, count: countsByDay[d] }; }));

    var pageEntries = Object.keys(countsByPage).map(function (key) {
      var label = key.indexOf('post:') === 0
        ? (postTitleBySlug[key.slice(5)] || key.slice(5))
        : (PAGE_LABELS[key] || key);
      return { label: label, count: countsByPage[key] };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
    renderBarList(topEl, pageEntries, 'No page views yet in this range.');

    var sourceEntries = Object.keys(countsBySource).map(function (key) {
      return { label: key, count: countsBySource[key] };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
    renderBarList(sourcesEl, sourceEntries, 'No traffic data yet in this range.');
  }).catch(function () {
    chartEl.innerHTML = '<p class="empty-state">Couldn\'t load traffic data.</p>';
  });
}

function renderBarList(container, entries, emptyMessage) {
  if (!container) return;
  if (!entries.length) { container.innerHTML = '<p class="empty-state">' + emptyMessage + '</p>'; return; }
  var max = Math.max.apply(null, entries.map(function (e) { return e.count; }));
  container.innerHTML = entries.map(function (e) {
    var pct = max ? Math.round((e.count / max) * 100) : 0;
    return '<div class="bar-list-row">' +
      '<span class="bar-list-label" title="' + escapeHtml(e.label) + '">' + escapeHtml(e.label) + '</span>' +
      '<span class="bar-list-track"><span class="bar-list-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="bar-list-value">' + e.count.toLocaleString() + '</span>' +
      '</div>';
  }).join('');
}

// A plain inline SVG bar chart — one hue (the site's own accent), recessive
// gridlines, a native <title> per bar for a hover tooltip. No charting
// library: daily counts over a 7-30 day window is well within what a
// handful of <rect>s can render cleanly.
function renderTrafficChart(container, points) {
  var w = Math.max(320, container.clientWidth || 600);
  var h = 180;
  var padTop = 10, padBottom = 22, padSide = 4;
  var innerW = w - padSide * 2;
  var innerH = h - padTop - padBottom;
  var maxVal = Math.max(1, Math.max.apply(null, points.map(function (p) { return p.count; })));
  var gap = 4;
  var barW = Math.max(2, innerW / points.length - gap);

  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" role="img" aria-label="Page views over time">';
  [0.5, 1].forEach(function (frac) {
    var y = padTop + innerH * (1 - frac);
    svg += '<line x1="' + padSide + '" x2="' + (w - padSide) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" style="stroke:var(--line); stroke-width:1" />';
  });
  points.forEach(function (p, i) {
    var barH = maxVal ? Math.max(1, (p.count / maxVal) * innerH) : 1;
    var x = padSide + i * (barW + gap);
    var y = padTop + innerH - barH;
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) +
      '" rx="2" style="fill:var(--accent)"><title>' + p.date + ': ' + p.count + ' view' + (p.count === 1 ? '' : 's') + '</title></rect>';
  });
  var labelIdxs = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];
  labelIdxs.forEach(function (i) {
    var x = padSide + i * (barW + gap) + barW / 2;
    svg += '<text x="' + x.toFixed(1) + '" y="' + (h - 6) + '" font-size="10" text-anchor="middle" style="fill:var(--ink-faint); font-family:var(--font-code)">' +
      points[i].date.slice(5) + '</text>';
  });
  svg += '</svg>';
  container.innerHTML = svg;
}
