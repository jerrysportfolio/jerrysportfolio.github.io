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
(function () {
  function extractYouTubeId(idOrUrl) {
    var s = (idOrUrl || '').trim();
    var m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{6,}$/.test(s)) return s; // already a bare video id
    return null;
  }

  function preprocess(md) {
    return md.replace(/\[\[youtube:([^\]]+)\]\]/g, function (whole, idOrUrl) {
      var id = extractYouTubeId(idOrUrl);
      if (!id) return whole;
      return '<div class="post-embed post-embed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/' +
        id + '" title="YouTube video" frameborder="0" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
        'allowfullscreen loading="lazy"></iframe></div>';
    });
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
