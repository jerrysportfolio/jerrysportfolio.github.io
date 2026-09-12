// Shared markdown -> sanitized HTML renderer for blog posts. Used by both the
// admin editor's live preview and the public post page, so a post always
// renders identically in both places. Plain classic script (not a module) —
// loaded after the marked/DOMPurify CDN scripts, which is all it depends on.
//
// Two bits of custom syntax on top of standard (GFM-ish) markdown:
//   - Callouts: a blockquote whose first line is `[!TYPE]`, e.g.
//       > [!NOTE]
//       > Some text.
//     renders as a styled callout box instead of a plain blockquote. A
//     blockquote without that marker still renders as a normal blockquote
//     (this is also how "quote/indent" is done from the editor toolbar).
//   - YouTube embeds: `[[youtube:VIDEO_ID_OR_URL]]` on its own line becomes
//     a responsive embedded player.
//   - LinkedIn post embeds: `[[linkedin:POST_URL_OR_ACTIVITY_ID]]` on its own
//     line becomes LinkedIn's official post embed, wrapped in a card that
//     matches the site's other embeds (border, radius, shadow) since the
//     iframe's own content always renders in LinkedIn's fixed light theme.
(function () {
  function extractYouTubeId(idOrUrl) {
    var s = (idOrUrl || '').trim();
    var m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{6,}$/.test(s)) return s; // already a bare video id
    return null;
  }

  // Accepts a full share URL (linkedin.com/posts/name_slug-activity-1234567890123456789-xyz),
  // an embed src (linkedin.com/embed/feed/update/urn:li:activity:1234...),
  // a bare urn (urn:li:activity:1234...), or a bare numeric activity id.
  function extractLinkedInActivityId(idOrUrl) {
    var s = (idOrUrl || '').trim();
    var m = s.match(/activity[:-](\d{6,})/);
    if (m) return m[1];
    if (/^\d{6,}$/.test(s)) return s;
    return null;
  }

  function preprocess(md) {
    md = md.replace(/\[\[youtube:([^\]]+)\]\]/g, function (whole, idOrUrl) {
      var id = extractYouTubeId(idOrUrl);
      if (!id) return whole;
      return '<div class="post-embed post-embed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/' +
        id + '" title="YouTube video" frameborder="0" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
        'allowfullscreen loading="lazy"></iframe></div>';
    });
    md = md.replace(/\[\[linkedin:([^\]]+)\]\]/g, function (whole, idOrUrl) {
      var id = extractLinkedInActivityId(idOrUrl);
      if (!id) return whole;
      return '<div class="post-embed post-embed-linkedin"><iframe src="https://www.linkedin.com/embed/feed/update/urn:li:activity:' +
        id + '" title="LinkedIn post" frameborder="0" allowfullscreen loading="lazy"></iframe></div>';
    });
    return md;
  }

  function buildRenderer() {
    var renderer = new marked.Renderer();
    var CALLOUT_TYPES = { note: 'Note', tip: 'Tip', warning: 'Warning', important: 'Important' };
    renderer.blockquote = function (quote) {
      var m = quote.match(/^\s*<p>\s*\[!(\w+)\]\s*([\s\S]*?)<\/p>([\s\S]*)$/i);
      if (m) {
        var type = m[1].toLowerCase();
        var label = CALLOUT_TYPES[type] || m[1];
        var firstLineRest = m[2];
        var rest = m[3];
        var inner = (firstLineRest ? '<p>' + firstLineRest + '</p>' : '') + rest;
        return '<div class="callout callout-' + type + '"><div class="callout-label">' + label + '</div>' + inner + '</div>';
      }
      return '<blockquote>' + quote + '</blockquote>';
    };
    return renderer;
  }

  var footnotesRegistered = false;
  function ensureFootnotes() {
    if (footnotesRegistered) return;
    if (typeof marked !== 'undefined' && typeof markedFootnote === 'function') {
      marked.use(markedFootnote());
    }
    footnotesRegistered = true;
  }

  // Belt-and-suspenders even though only the admin ever writes post content:
  // only our own embed shortcodes should ever be able to produce an iframe,
  // so drop any that somehow points somewhere else.
  var ALLOWED_IFRAME_HOSTS = ['www.youtube-nocookie.com', 'www.linkedin.com'];
  if (typeof DOMPurify !== 'undefined') {
    DOMPurify.addHook('uponSanitizeElement', function (node, data) {
      if (data.tagName !== 'iframe') return;
      var src = node.getAttribute('src') || '';
      var host;
      try { host = new URL(src, location.href).hostname; } catch (e) { host = ''; }
      if (ALLOWED_IFRAME_HOSTS.indexOf(host) === -1) node.remove();
    });
  }

  window.renderPostMarkdown = function (md) {
    if (typeof marked === 'undefined') return '<p>' + (md || '').replace(/</g, '&lt;') + '</p>';
    ensureFootnotes();
    var html = marked.parse(preprocess(md || ''), { renderer: buildRenderer(), gfm: true, breaks: true });
    if (typeof DOMPurify === 'undefined') return html;
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'loading', 'target']
    });
  };
})();
