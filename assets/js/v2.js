// Shared behavior for the experimental (v2) site: mobile nav, liquid-glass nav
// indicator, AJAX page routing (nav/footer persist, #page-content swaps), blog
// filter/search, reading progress, gallery load-more.
(function () {
  var PAGES = ['index.html', 'about.html', 'portfolio.html', 'gallery.html', 'blog.html', 'blog-post.html'];
  var TRANSITION_MS = 220;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var activePageKey = document.body.dataset.page || '';
  var navigating = false;

  // ---------- Firebase: Analytics (compat) + Firestore Lite (module) ----------
  // Config lives in assets/js/firebase-config.js (window.FIREBASE_CONFIG) — see
  // that file's comments for setup steps. Everything below no-ops safely if the
  // config is still blank or a script failed to load (e.g. an ad blocker).
  //
  // Firestore itself is handled by assets/js/firestore-lite.js (a separate
  // `type="module"` script — Lite is only published as an ES module) via
  // window.__firestoreLite, not the compat SDK: the full Firestore client
  // always opens a persistent "Listen" WebChannel for its offline cache even
  // for plain get()/set() calls, and that long-lived streaming connection is
  // exactly what ad-block privacy lists target. This site never needs
  // realtime listeners, so Lite's plain one-shot HTTPS requests sidestep the
  // whole problem instead of fighting it.
  var fbAnalytics = null;

  function initFirebase() {
    if (fbAnalytics) return; // already initialized
    if (typeof firebase === 'undefined') return; // SDK blocked/failed to load
    var config = window.FIREBASE_CONFIG;
    if (!config || !config.apiKey || !config.projectId || !config.measurementId) return;
    try {
      var app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(config);
      fbAnalytics = firebase.analytics(app);
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

  // Reads back the live views/downloads totals via Firestore Lite (see the
  // note above initFirebase for why it's Lite and not the compat SDK). A
  // "view" means a photo was actually opened (see recordGalleryView, called
  // from openLightbox) — landing on the gallery index doesn't count on its
  // own, only opening one of the photos does.
  function initGalleryStats(root) {
    var viewsEl = root.querySelector('#gallery-views');
    var downloadsEl = root.querySelector('#gallery-downloads');
    if (!viewsEl || !downloadsEl || !window.__firestoreLite) return;

    var render = function (data) {
      data = data || {};
      viewsEl.textContent = (data.views || 0).toLocaleString() + ' views';
      downloadsEl.textContent = (data.downloads || 0).toLocaleString() + ' downloads';
    };

    window.__firestoreLite.getGalleryStats().then(render).catch(function () { /* leave the "—" placeholders */ });
  }

  // Called once per photo-open (from openLightbox) — every click counts, no
  // once-per-session cap, since each open is a distinct, deliberate view of
  // that photo rather than an incidental page load.
  window.recordGalleryView = function () {
    if (!window.__firestoreLite) return;
    window.__firestoreLite.incrementGalleryViews().then(function () {
      // Refresh the on-page counter too, in case the lightbox is still open
      // over the gallery grid, so the number doesn't look stale.
      return window.__firestoreLite.getGalleryStats();
    }).then(function (data) {
      var viewsEl = document.getElementById('gallery-views');
      if (viewsEl && data) viewsEl.textContent = (data.views || 0).toLocaleString() + ' views';
    }).catch(function () { /* ignore */ });
  };

  window.recordGalleryDownload = function () {
    if (!window.__firestoreLite) return;
    window.__firestoreLite.incrementGalleryDownloads();
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
    // Guards against a second, independent instance of this whole state
    // machine (page/loading/exhausted/observer) getting attached to the same
    // grid — which would make two competing fetch sequences fight over the
    // same button's text and hidden state, with one able to look "stuck" if
    // the other's fetch takes longer.
    if (grid.dataset.galleryBound) return;
    grid.dataset.galleryBound = '1';

    var PAGE_SIZE = 8;
    var page = 1;
    var loading = false;
    var exhausted = false;
    var observer = null;

    var appendPhotos = function (photos) {
      photos.forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', p.alt_description || 'Open photo');

        // loading="lazy" means the browser itself won't fetch the image
        // bytes until the item is near the viewport — combined with paging
        // the API calls below, nothing (metadata or pixels) for a photo the
        // visitor hasn't scrolled to yet gets pulled over the network.
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
    };

    var setButtonState = function () {
      if (!loadMoreBtn) return;
      if (exhausted) { loadMoreBtn.hidden = true; return; }
      loadMoreBtn.hidden = false;
      loadMoreBtn.disabled = loading;
      loadMoreBtn.textContent = loading ? 'Loading…' : 'More photographs ↓';
    };

    var loadNextPage = function () {
      if (loading || exhausted) return;
      loading = true;
      setButtonState();

      // AbortController timeout: a hung request (dropped connection, a
      // blocker that stalls rather than rejects, etc.) must not leave the
      // button reading "Loading…" forever with no way out.
      var controller = ('AbortController' in window) ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;

      fetch('https://api.unsplash.com/users/' + encodeURIComponent(UNSPLASH_CONFIG.username) +
        '/photos?per_page=' + PAGE_SIZE + '&page=' + page + '&order_by=latest', {
        headers: { Authorization: 'Client-ID ' + UNSPLASH_CONFIG.accessKey },
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) { if (!res.ok) throw new Error('Unsplash gallery request failed'); return res.json(); })
        .then(function (photos) {
          clearTimeout(timeoutId);
          if (page === 1) grid.innerHTML = ''; // clear the fallback placeholders once real data arrives
          appendPhotos(photos);
          page += 1;
          if (!photos.length || photos.length < PAGE_SIZE) {
            exhausted = true;
            if (observer) observer.disconnect();
          }
          loading = false;
          setButtonState();
        })
        .catch(function () {
          clearTimeout(timeoutId);
          loading = false;
          // Don't keep retrying a broken config/offline state on every
          // scroll tick; leave whatever's already rendered (placeholders,
          // if this was the very first page).
          exhausted = true;
          setButtonState();
        });
    };

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadNextPage);

      // Auto-load the next page once the button scrolls near the viewport,
      // so browsing feels like infinite scroll; the button stays visible as
      // a keyboard-accessible manual trigger and as the fallback for
      // browsers without IntersectionObserver.
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) loadNextPage();
          });
        }, { rootMargin: '600px' });
        observer.observe(loadMoreBtn);
      }
    }

    loadNextPage();

    var lb = root.querySelector('#lightbox');
    if (lb && !lb.dataset.bound) {
      lb.dataset.bound = '1';
      var closeBtn = lb.querySelector('#lightbox-close');
      var backdrop = lb.querySelector('#lightbox-backdrop');
      if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
      if (backdrop) backdrop.addEventListener('click', closeLightbox);
    }
  }

  // Most of these photos never got a real title (alt_description/description
  // both null) — the Unsplash *list* endpoint doesn't include location data
  // at all, only the single-photo detail endpoint does, so an untitled photo
  // fetches its own detail once (cached per photo id) to show "shot in
  // <location>" instead of a bare "Untitled".
  function fetchPhotoLocation(photoId) {
    var cacheKey = 'unsplash-location:' + photoId;
    var cached = null;
    try { cached = sessionStorage.getItem(cacheKey); } catch (e) { /* ignore */ }
    if (cached !== null) return Promise.resolve(cached || null); // cached '' = "checked, no location"

    return fetch('https://api.unsplash.com/photos/' + photoId, {
      headers: { Authorization: 'Client-ID ' + UNSPLASH_CONFIG.accessKey }
    })
      .then(function (res) { if (!res.ok) throw new Error('photo detail request failed'); return res.json(); })
      .then(function (data) {
        var name = (data && data.location && data.location.name) || '';
        try { sessionStorage.setItem(cacheKey, name); } catch (e) { /* ignore */ }
        return name || null;
      })
      .catch(function () { return null; });
  }

  function openLightbox(photo) {
    var lb = document.getElementById('lightbox');
    if (!lb) return;

    if (window.recordGalleryView) window.recordGalleryView();

    var img = document.getElementById('lightbox-img');
    img.src = photo.urls.regular;
    img.alt = photo.alt_description || '';

    var titleEl = document.getElementById('lightbox-title');
    var hasTitle = !!(photo.alt_description || photo.description);
    titleEl.textContent = hasTitle ? (photo.alt_description || photo.description) : '—';
    document.getElementById('lightbox-desc').textContent =
      (photo.description && photo.description !== photo.alt_description) ? photo.description : '';
    document.getElementById('lightbox-dims').textContent = photo.width + ' × ' + photo.height;
    document.getElementById('lightbox-date').textContent = photo.created_at
      ? new Date(photo.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    document.getElementById('lightbox-likes').textContent = (photo.likes || 0).toLocaleString();

    if (!hasTitle) {
      fetchPhotoLocation(photo.id).then(function (locationName) {
        // Bail if the lightbox has since moved on to a different photo.
        if (document.getElementById('lightbox-img').src !== photo.urls.regular) return;
        titleEl.textContent = locationName || 'Untitled';
      });
    }

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
    // Two rAFs: the first lets the browser paint the [hidden]-removed state,
    // the second then adds the class that actually triggers the transition —
    // adding it in the same frame as un-hiding would just skip straight to
    // the end state with no visible animation.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { lb.classList.add('open'); });
    });
  }

  function closeLightbox() {
    var lb = document.getElementById('lightbox');
    if (!lb || lb.hidden) return;
    document.body.style.overflow = '';
    lb.classList.remove('open');
    var finish = function () {
      lb.hidden = true;
      lb.removeEventListener('transitionend', finish);
    };
    lb.addEventListener('transitionend', finish);
    // Fallback in case transitionend never fires (reduced motion, etc.).
    setTimeout(function () { if (!lb.hidden) finish(); }, 350);
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
