// Shared behavior for the experimental (v2) site: mobile nav, liquid-glass nav
// indicator, AJAX page routing (nav/footer persist, #page-content swaps), blog
// filter/search, reading progress, gallery load-more.
(function () {
  var PAGES = ['index.html', 'about.html', 'portfolio.html', 'gallery.html', 'blog.html', 'blog-post.html'];
  var TRANSITION_MS = 220;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var activePageKey = document.body.dataset.page || '';
  var navigating = false;

  // ---------- Firebase: Analytics + Firestore-backed gallery counters ----------
  // Config lives in assets/js/firebase-config.js (window.FIREBASE_CONFIG) — see
  // that file's comments for setup steps. Everything below no-ops safely if the
  // config is still blank or the SDK failed to load (e.g. an ad blocker).
  var fbAnalytics = null;
  var fbDb = null;

  function initFirebase() {
    if (fbDb || fbAnalytics) return; // already initialized
    if (typeof firebase === 'undefined') return; // SDK blocked/failed to load
    var config = window.FIREBASE_CONFIG;
    if (!config || !config.apiKey || !config.projectId) return; // not configured yet
    try {
      var app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(config);
      fbDb = firebase.firestore(app);
      // Ad blockers / privacy extensions commonly kill Firestore's default
      // streaming (WebChannel) connection outright (ERR_BLOCKED_BY_CLIENT in
      // devtools) and gtag.js's own script tag (ERR_BLOCKED_BY_CONTENT_BLOCKER)
      // — both are the extension refusing the request, not a bug here, and
      // there's no code fix that makes a blocked request succeed. Forcing
      // long-polling instead of streaming does measurably reduce how often
      // this happens, since some blocklists specifically target the
      // streaming endpoint pattern rather than Firestore's domain outright.
      fbDb.settings({ experimentalAutoDetectLongPolling: true, merge: true });
      if (config.measurementId) fbAnalytics = firebase.analytics(app);
    } catch (e) { /* keep the site working even if Firebase throws */ }
  }

  // The compat SDK's firebase.analytics() already logs the very first page_view
  // automatically; every subsequent AJAX route change needs a manual event,
  // since our router never does a real navigation for gtag/GA to observe.
  function logPageView(pageKey) {
    if (!fbAnalytics) return;
    try {
      fbAnalytics.logEvent('page_view', {
        page_path: '/' + (pageKey === 'home' ? '' : (pageKey ? pageKey + '.html' : '')),
        page_title: document.title
      });
    } catch (e) { /* ignore */ }
  }

  // Counts one gallery view per browser session (not per reload/back-nav) and
  // reads back the live views/downloads totals. recordGalleryDownload() is
  // exposed on window for whenever a real download control gets added later.
  function initGalleryStats(root) {
    var viewsEl = root.querySelector('#gallery-views');
    var downloadsEl = root.querySelector('#gallery-downloads');
    if (!viewsEl || !downloadsEl || !fbDb) return;

    var statsRef = fbDb.collection('stats').doc('gallery');
    var alreadyCounted = false;
    try { alreadyCounted = sessionStorage.getItem('gallery-view-counted') === '1'; } catch (e) { /* ignore */ }

    var recordView = alreadyCounted ? Promise.resolve() : statsRef.set(
      { views: firebase.firestore.FieldValue.increment(1) }, { merge: true }
    ).then(function () {
      try { sessionStorage.setItem('gallery-view-counted', '1'); } catch (e) { /* ignore */ }
    }).catch(function () { /* keep dashes on failure */ });

    recordView.then(function () { return statsRef.get(); })
      .then(function (doc) {
        var data = doc.exists ? doc.data() : {};
        viewsEl.textContent = (data.views || 0).toLocaleString() + ' views';
        downloadsEl.textContent = (data.downloads || 0).toLocaleString() + ' downloads';
      })
      .catch(function () { /* leave the "—" placeholders */ });
  }

  window.recordGalleryDownload = function () {
    if (!fbDb) return;
    fbDb.collection('stats').doc('gallery').set(
      { downloads: firebase.firestore.FieldValue.increment(1) }, { merge: true }
    ).catch(function () { /* ignore */ });
  };

  // Answers "how many visits clicked my resume": logs GA4's own recommended
  // `file_download` event (not a made-up name) so it shows up in Analytics'
  // standard File downloads report/funnels rather than needing a custom one.
  // dataset.trackBound guards against double-binding if this page's #resume-
  // link element gets swapped back in via the AJAX router more than once.
  function initResumeTracking(root) {
    var link = root.querySelector('#resume-link');
    if (!link || link.dataset.trackBound) return;
    link.dataset.trackBound = '1';
    link.addEventListener('click', function () {
      if (!fbAnalytics) return;
      try {
        fbAnalytics.logEvent('file_download', {
          file_name: 'resume.pdf',
          file_extension: 'pdf',
          link_text: link.textContent.trim(),
          link_url: link.href
        });
      } catch (e) { /* ignore */ }
    });
  };

  // ---------- home hero photo, pulled from your own Unsplash profile ----------
  // 1. Create an app at https://unsplash.com/developers -> New Application.
  // 2. Paste its "Access Key" below and your Unsplash username.
  // 3. Leave accessKey empty to keep the static placeholder hero image.
  // Demo apps are capped at 50 requests/hour; the sessionStorage cache below
  // means that's one request per browser tab per hour, not per page view.
  var UNSPLASH_CONFIG = {
    accessKey: 'uJbarXLse8w2nE694yShEtjsQGM0uefOtQeSZ4oksgI',
    username: 'iamjerryhu'
  };
  var UNSPLASH_CACHE_MS = 60 * 60 * 1000;

  function initUnsplashHero(root) {
    var img = root.querySelector('#hero-photo');
    var credit = root.querySelector('#hero-credit');
    var creditLink = root.querySelector('#hero-credit-photographer');
    if (!img || !credit || !creditLink) return;
    if (!UNSPLASH_CONFIG.accessKey || !UNSPLASH_CONFIG.username) return;

    var cacheKey = 'unsplash-hero:' + UNSPLASH_CONFIG.username;
    var apply = function (photo) {
      img.src = photo.url;
      img.alt = photo.alt || '';
      creditLink.href = photo.creditUrl;
      creditLink.textContent = photo.credit;
      credit.hidden = false;
    };

    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) { /* ignore */ }
    if (cached && (Date.now() - cached.ts < UNSPLASH_CACHE_MS)) {
      apply(cached);
      return;
    }

    fetch('https://api.unsplash.com/users/' + encodeURIComponent(UNSPLASH_CONFIG.username) + '/photos?order_by=latest&per_page=1', {
      headers: { Authorization: 'Client-ID ' + UNSPLASH_CONFIG.accessKey }
    })
      .then(function (res) { if (!res.ok) throw new Error('Unsplash request failed'); return res.json(); })
      .then(function (data) {
        var p = data && data[0];
        if (!p) return;
        var photo = {
          url: p.urls.regular,
          alt: p.alt_description || '',
          credit: p.user.name,
          creditUrl: p.user.links.html + '?utm_source=jerry-hu-portfolio&utm_medium=referral',
          ts: Date.now()
        };
        try { sessionStorage.setItem(cacheKey, JSON.stringify(photo)); } catch (e) { /* ignore */ }
        apply(photo);
      })
      .catch(function () { /* keep the placeholder hero image */ });
  }

  // ---------- gallery grid, fetched live from your Unsplash photos ----------
  // Reuses UNSPLASH_CONFIG above. Renders your real photos over the fallback
  // placeholder grid already in gallery.html; on failure (not configured, rate
  // limited, offline) the placeholders just stay put. Clicking a real photo
  // opens the lightbox with metadata and a genuine Unsplash download.
  function initGalleryPhotos(root) {
    var grid = root.querySelector('#gallery-grid');
    var loadMoreBtn = root.querySelector('#gallery-load-more');
    if (!grid) return;
    if (!UNSPLASH_CONFIG.accessKey || !UNSPLASH_CONFIG.username) return;

    var cacheKey = 'unsplash-gallery:' + UNSPLASH_CONFIG.username;

    var render = function (photos) {
      if (!photos || !photos.length) return;
      grid.innerHTML = '';
      photos.forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', p.alt_description || 'Open photo');

        var img = document.createElement('img');
        img.src = p.urls.small;
        img.alt = p.alt_description || '';
        img.loading = 'lazy';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        item.appendChild(img);

        var open = function () { openLightbox(p); };
        item.addEventListener('click', open);
        item.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
        grid.appendChild(item);
      });
      // One fetch covers the whole library at this photo count; hide rather
      // than wire up real pagination until there are enough photos to need it.
      if (loadMoreBtn) loadMoreBtn.hidden = true;
    };

    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) { /* ignore */ }
    if (cached && (Date.now() - cached.ts < UNSPLASH_CACHE_MS)) {
      render(cached.photos);
      return;
    }

    fetch('https://api.unsplash.com/users/' + encodeURIComponent(UNSPLASH_CONFIG.username) + '/photos?per_page=30&order_by=latest', {
      headers: { Authorization: 'Client-ID ' + UNSPLASH_CONFIG.accessKey }
    })
      .then(function (res) { if (!res.ok) throw new Error('Unsplash gallery request failed'); return res.json(); })
      .then(function (photos) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ photos: photos, ts: Date.now() })); } catch (e) { /* ignore */ }
        render(photos);
      })
      .catch(function () { /* keep the placeholder grid */ });

    var lb = root.querySelector('#lightbox');
    if (lb && !lb.dataset.bound) {
      lb.dataset.bound = '1';
      var closeBtn = lb.querySelector('#lightbox-close');
      var backdrop = lb.querySelector('#lightbox-backdrop');
      if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
      if (backdrop) backdrop.addEventListener('click', closeLightbox);
    }
  }

  function openLightbox(photo) {
    var lb = document.getElementById('lightbox');
    if (!lb) return;

    var img = document.getElementById('lightbox-img');
    img.src = photo.urls.regular;
    img.alt = photo.alt_description || '';
    document.getElementById('lightbox-title').textContent = photo.alt_description || photo.description || 'Untitled';
    document.getElementById('lightbox-desc').textContent =
      (photo.description && photo.description !== photo.alt_description) ? photo.description : '';
    document.getElementById('lightbox-dims').textContent = photo.width + ' × ' + photo.height;
    document.getElementById('lightbox-date').textContent = photo.created_at
      ? new Date(photo.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    document.getElementById('lightbox-likes').textContent = (photo.likes || 0).toLocaleString();

    var dl = document.getElementById('lightbox-download');
    dl.href = photo.links.download;
    dl.onclick = function () {
      // Required by Unsplash's API guidelines: ping download_location whenever
      // the app triggers an actual download, separate from just displaying it.
      if (photo.links && photo.links.download_location) {
        var sep = photo.links.download_location.indexOf('?') === -1 ? '?' : '&';
        fetch(photo.links.download_location + sep + 'client_id=' + UNSPLASH_CONFIG.accessKey).catch(function () { /* ignore */ });
      }
      if (window.recordGalleryDownload) window.recordGalleryDownload();
    };

    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    var lb = document.getElementById('lightbox');
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    document.body.style.overflow = '';
  }

  // ---------- home hero quote, a random quote cached per calendar day ----------
  // dummyjson.com/quotes/random has open CORS (works straight from the browser,
  // no key needed) but is genuinely random per call, not a synced "quote of the
  // day" — a true daily-for-everyone endpoint (ZenQuotes) exists but blocks
  // browser CORS entirely, so a static site with no backend can't call it
  // directly. Caching the pick in localStorage by today's date gets the same
  // felt effect for each visitor: stable all day, different tomorrow.
  var QUOTE_CACHE_KEY = 'daily-quote';

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function initDailyQuote(root) {
    var el = root.querySelector('#hero-quote');
    if (!el) return;

    var apply = function (q) {
      el.textContent = '“' + q.quote + '” — ' + q.author;
      el.classList.remove('fill-me');
    };

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (cached && cached.day === todayKey()) {
      apply(cached);
      return;
    }

    fetch('https://dummyjson.com/quotes/random')
      .then(function (res) { if (!res.ok) throw new Error('quote request failed'); return res.json(); })
      .then(function (data) {
        if (!data || !data.quote) return;
        var q = { quote: data.quote, author: data.author || 'Unknown', day: todayKey() };
        try { localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(q)); } catch (e) { /* ignore */ }
        apply(q);
      })
      .catch(function () { /* keep the placeholder line */ });
  }

  function currentFile() {
    var name = location.pathname.split('/').pop();
    return name || 'index.html';
  }

  // ---------- nav indicator (hover preview + active-tab slide) ----------

  function moveIndicatorTo(pageKey, animate) {
    var indicator = document.querySelector('.nav-indicator');
    var nav = document.querySelector('.nav-links');
    var link = nav && nav.querySelector('a[data-page="' + pageKey + '"]');
    if (!indicator || !nav || !link) return;
    var x = link.offsetLeft;
    var w = link.offsetWidth;
    if (!animate) indicator.style.transition = 'none';
    indicator.style.transform = 'translateX(' + x + 'px)';
    indicator.style.width = w + 'px';
    indicator.classList.add('positioned');
    if (!animate) {
      // force reflow so the "none" transition actually applies before we
      // hand transitions back for the next (animated) move
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }
  }

  function initNavIndicator() {
    var nav = document.querySelector('.nav-links');
    if (!nav) return;
    var links = nav.querySelectorAll('a[data-page]');
    links.forEach(function (a) {
      a.addEventListener('mouseenter', function () { moveIndicatorTo(a.dataset.page, true); });
      a.addEventListener('focus', function () { moveIndicatorTo(a.dataset.page, true); });
    });
    nav.addEventListener('mouseleave', function () { moveIndicatorTo(activePageKey, true); });

    var place = function (animate) { moveIndicatorTo(activePageKey, animate); };
    place(false);
    window.addEventListener('load', function () { place(false); });
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { place(false); }, 120);
    });
  }

  function setActiveNav(pageKey) {
    activePageKey = pageKey;
    document.querySelectorAll('.nav-links a[data-page]').forEach(function (a) {
      a.classList.toggle('active', a.dataset.page === pageKey);
    });
    moveIndicatorTo(pageKey, true);
    logPageView(pageKey);
  }

  // ---------- mobile menu + liquid-glass pointer glow (bind once, nav persists) ----------

  function initChrome() {
    var toggle = document.querySelector('.nav-toggle');
    var close = document.querySelector('.nav-close');
    var links = document.querySelector('.nav-links');
    if (toggle && links) toggle.addEventListener('click', function () { links.classList.add('open'); });
    if (close && links) close.addEventListener('click', function () { links.classList.remove('open'); });

    var navbar = document.querySelector('.navbar');
    if (navbar && !reduceMotion) {
      navbar.addEventListener('pointermove', function (e) {
        var rect = navbar.getBoundingClientRect();
        navbar.style.setProperty('--glow-x', ((e.clientX - rect.left) / rect.width) * 100 + '%');
        navbar.style.setProperty('--glow-y', ((e.clientY - rect.top) / rect.height) * 100 + '%');
        navbar.classList.add('glow-active');
      });
      navbar.addEventListener('pointerleave', function () { navbar.classList.remove('glow-active'); });
    }

    // Thicken the navbar's glass once content has scrolled up behind it, so
    // nav-item text stays legible against whatever's underneath.
    if (navbar) {
      var updateScrolled = function () {
        navbar.classList.toggle('scrolled', window.scrollY > 8);
      };
      document.addEventListener('scroll', updateScrolled, { passive: true });
      updateScrolled();
    }
  }

  // ---------- per-page behaviors (re-run after every content swap) ----------

  function initPageBehaviors(root) {
    root = root || document;

    initUnsplashHero(root);
    initDailyQuote(root);
    initGalleryStats(root);
    initGalleryPhotos(root);
    initResumeTracking(root);

    // Blog index: category pills + live search
    var pills = root.querySelectorAll('.pill[data-filter]');
    var searchInput = root.querySelector('.search-input');
    var rows = root.querySelectorAll('.blog-row[data-category]');
    if (pills.length && rows.length) {
      var activeCategory = 'all';
      var applyFilters = function () {
        var q = (searchInput && searchInput.value || '').trim().toLowerCase();
        rows.forEach(function (row) {
          var cat = row.dataset.category;
          var text = row.textContent.toLowerCase();
          var matchesCategory = activeCategory === 'all' || cat === activeCategory;
          var matchesSearch = !q || text.includes(q);
          row.style.display = (matchesCategory && matchesSearch) ? '' : 'none';
        });
      };
      pills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          pills.forEach(function (p) { p.classList.remove('active'); });
          pill.classList.add('active');
          activeCategory = pill.dataset.filter;
          applyFilters();
        });
      });
      if (searchInput) searchInput.addEventListener('input', applyFilters);
    }

    // Gallery: placeholder "load more" — replace with a real Unsplash fetch later
    var loadMoreBtn = root.querySelector('.load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        loadMoreBtn.textContent = 'Wire this up to the Unsplash API — see comment in gallery.html';
      });
    }
  }

  // Reading progress bar looks up its element live on every scroll instead of
  // being (re)bound per page, so it survives #page-content swaps with a
  // single persistent listener rather than accumulating one per navigation.
  document.addEventListener('scroll', function () {
    var progress = document.querySelector('.reading-progress');
    if (!progress) return;
    var doc = document.documentElement;
    var scrollTop = doc.scrollTop || document.body.scrollTop;
    var scrollHeight = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
    var pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    progress.style.width = pct + '%';
  }, { passive: true });

  // ---------- router: swap #page-content, keep navbar/footer mounted ----------

  function contentEl() { return document.getElementById('page-content'); }

  function navigateTo(href, push) {
    if (navigating) return;
    var url;
    try { url = new URL(href, location.href); } catch (e) { location.href = href; return; }
    if (url.origin !== location.origin) { location.href = href; return; }

    navigating = true;
    fetch(url.pathname + url.search)
      .then(function (res) { if (!res.ok) throw new Error('fetch failed'); return res.text(); })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        var newMain = doc.getElementById('page-content');
        var curMain = contentEl();
        if (!newMain || !curMain) throw new Error('no #page-content');

        var newPageKey = doc.body.getAttribute('data-page') || '';
        var newTitle = doc.title;

        var finish = function () {
          curMain.innerHTML = newMain.innerHTML;
          document.title = newTitle;
          document.body.setAttribute('data-page', newPageKey);
          setActiveNav(newPageKey);
          initPageBehaviors(curMain);
          window.scrollTo(0, 0);
          requestAnimationFrame(function () { curMain.classList.remove('is-transitioning'); });
          navigating = false;
        };

        if (push) history.pushState({ href: url.pathname }, '', url.pathname + url.hash);

        if (reduceMotion) {
          finish();
        } else {
          curMain.classList.add('is-transitioning');
          setTimeout(finish, TRANSITION_MS);
        }
      })
      .catch(function () {
        navigating = false;
        location.href = href;
      });
  }

  document.addEventListener('click', function (e) {
    // Close the mobile slide-out menu on any tab tap, independent of the
    // routing checks below — otherwise the panel stays open over the newly
    // swapped page.
    var tappedLink = e.target.closest('a');
    if (tappedLink) {
      var openNav = tappedLink.closest('.nav-links.open');
      if (openNav) openNav.classList.remove('open');
    }

    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || /^https?:\/\//.test(href)) return;
    var bare = href.split('#')[0].split('?')[0];
    if (PAGES.indexOf(bare) === -1) return;
    e.preventDefault();
    if (bare === currentFile()) return;
    navigateTo(href, true);
  });

  window.addEventListener('popstate', function () {
    navigateTo(location.pathname + location.search + location.hash, false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('v2-year').textContent = new Date().getFullYear();
    initFirebase();
    logPageView(activePageKey);
    initChrome();
    initNavIndicator();
    initPageBehaviors(document);
  });
})();
