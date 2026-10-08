// Shared behavior for the experimental (v2) site: mobile nav, liquid-glass nav
// indicator, AJAX page routing (nav/footer persist, #page-content swaps), blog
// filter/search, reading progress, gallery load-more.
(function () {
  var PAGES = ['index.html', 'about.html', 'projects.html', 'gallery.html', 'blog.html'];
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
  function logPageView(pageKey, pathOverride) {
    if (!fbAnalytics) return;
    try {
      fbAnalytics.logEvent('page_view', {
        page_path: pathOverride || ('/' + (pageKey === 'home' ? '' : (pageKey ? pageKey + '.html' : ''))),
        page_title: document.title
      });
    } catch (e) { /* ignore */ }
  }

  // ---------- visitor profile: device/OS (sync, UA-sniffed) + country (async,
  // geo-IP lookup) — feeds the dashboard's Devices/OS/Countries breakdowns ----------
  var deviceMetaCache = null;
  function getDeviceMeta() {
    if (deviceMetaCache) return deviceMetaCache;
    var ua = navigator.userAgent || '';
    // iPadOS 13+ reports a plain Macintosh UA; the touch-point check below is
    // the standard way to tell it apart from an actual Mac.
    var isIpadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    var isTablet = isIpadOS || /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    var isMobile = !isTablet && /Mobi|iPhone|Android.*Mobile|Windows Phone/i.test(ua);
    var deviceType = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');

    var os = 'Other';
    if (isIpadOS) os = 'iOS';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    deviceMetaCache = { deviceType: deviceType, os: os };
    return deviceMetaCache;
  }

  // One geo-IP lookup per tab, cached in sessionStorage (same pattern as the
  // Unsplash integration) so repeat page views/route changes don't re-fetch.
  var countryPromise = null;
  function getVisitorCountry() {
    if (countryPromise) return countryPromise;
    try {
      var cached = sessionStorage.getItem('visitorCountryV1');
      if (cached) { countryPromise = Promise.resolve(cached); return countryPromise; }
    } catch (e) { /* ignore */ }
    countryPromise = fetch('https://ipapi.co/json/').then(function (res) {
      if (!res.ok) throw new Error('geo lookup failed');
      return res.json();
    }).then(function (data) {
      return (data && (data.country_name || data.ip)) || 'Unknown';
    }).catch(function () {
      // ipapi.co blocked/rate-limited (its demo tier is capped) — fall back to
      // a plain IP-only lookup so the visit is still identifiable, just by
      // address instead of country name.
      return fetch('https://api.ipify.org?format=json')
        .then(function (res) { return res.json(); })
        .then(function (data) { return (data && data.ip) || 'Unknown'; })
        .catch(function () { return 'Unknown'; });
    }).then(function (result) {
      try { sessionStorage.setItem('visitorCountryV1', result); } catch (e) { /* ignore */ }
      return result;
    });
    return countryPromise;
  }

  // ---------- page-view logging + time-on-page ----------
  // One Firestore pageViews doc per page shown (full load or AJAX route swap).
  // currentPageView tracks the doc just logged so its duration can be filled in
  // once the visitor leaves it (a new page view starts, the tab is hidden, or
  // the tab/window closes) — see finalizeCurrentPageView.
  var currentPageView = null;

  function finalizeCurrentPageView() {
    if (!currentPageView || !window.__firestoreLite) { currentPageView = null; return; }
    var seconds = Math.round((Date.now() - currentPageView.start) / 1000);
    window.__firestoreLite.updatePageViewDuration(currentPageView.id, seconds);
    currentPageView = null;
  }

  function recordPageView(pageKey, slug) {
    finalizeCurrentPageView();
    if (!window.__firestoreLite) return;
    var meta = getDeviceMeta();
    getVisitorCountry().then(function (country) {
      var fullMeta = { country: country, deviceType: meta.deviceType, os: meta.os };
      return window.__firestoreLite.logPageViewEvent(pageKey, slug, fullMeta);
    }).then(function (id) {
      if (id) currentPageView = { id: id, start: Date.now() };
    });
  }
  window.__recordPageView = recordPageView;

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') finalizeCurrentPageView();
  });
  window.addEventListener('pagehide', finalizeCurrentPageView);

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
  // Demo apps are capped at 50 requests/hour; the localStorage cache below
  // means that is at most a couple of requests per half-day, not per page view.
  var UNSPLASH_CONFIG = {
    accessKey: 'uJbarXLse8w2nE694yShEtjsQGM0uefOtQeSZ4oksgI',
    username: 'iamjerryhu'
  };

  // "Has the visitor been here in the last 3 hours?" Every page view (full load or
  // route swap) stamps site-last-visit; the hero polaroid prints when this returns
  // true (no recorded visit, or the last one was over 3 hours ago) even if its
  // image is already cached. The inline <head> script in index.html reads the
  // same key for the first page load, before this file has stamped it.
  var VISIT_KEY = 'site-last-visit';
  var STALE_VISIT_MS = 3 * 60 * 60 * 1000;
  function consumeVisit() {
    var now = Date.now(), last = 0;
    try {
      last = Number(localStorage.getItem(VISIT_KEY)) || 0;
      localStorage.setItem(VISIT_KEY, String(now));
    } catch (e) { /* ignore */ }
    return !last || (now - last) > STALE_VISIT_MS;
  }

  // Kept in sync with the inline <head> script in index.html, which preloads
  // today's photo before this file even runs.
  var HERO_CACHE_KEY = 'unsplash-hero:v4:' + UNSPLASH_CONFIG.username;

  function initUnsplashHero(root, staleVisit) {
    var img = root.querySelector('#hero-photo');
    var credit = root.querySelector('#hero-credit');
    var creditLink = root.querySelector('#hero-credit-photographer');
    if (!img || !credit || !creditLink) return;
    if (!UNSPLASH_CONFIG.accessKey || !UNSPLASH_CONFIG.username) return;

    var card = img.closest('.cell-hero');
    var polaroid = card && card.querySelector('.polaroid');
    if (!card || !polaroid) return;

    // Half-day slot key (UTC date + a/b for 00-12h / 12-24h), not a rolling
    // TTL — the photo changes at fixed boundaries, twice a day, and holds
    // steady in between. Kept in sync with the inline script in index.html.
    var now = new Date();
    var slot = now.toISOString().slice(0, 10) + (now.getUTCHours() < 12 ? 'a' : 'b');

    var readCache = function () {
      try { return JSON.parse(localStorage.getItem(HERO_CACHE_KEY) || 'null'); } catch (e) { return null; }
    };
    var writeCache = function (photo) {
      try { localStorage.setItem(HERO_CACHE_KEY, JSON.stringify(photo)); } catch (e) { /* ignore */ }
    };
    // Ask Unsplash's image CDN for a 720px-wide rendition (a fraction of the
    // bytes of the 1080px "regular" one). The polaroid film takes on the
    // photo's own aspect ratio, so no square crop here.
    var toPhoto = function (p) {
      var raw = p.urls.raw;
      return {
        id: p.id,
        url: raw + (raw.indexOf('?') > -1 ? '&' : '?') + 'w=720&q=75&fm=jpg',
        alt: p.alt_description || '',
        credit: p.user.name,
        creditUrl: p.user.links.html + '?utm_source=jerry-hu-portfolio&utm_medium=referral'
      };
    };
    // order_by=latest&per_page=1 always returned the exact same photo forever
    // — pull a batch of recent uploads and pick at random instead.
    var fetchList = function () {
      return fetch('https://api.unsplash.com/users/' + encodeURIComponent(UNSPLASH_CONFIG.username) + '/photos?order_by=latest&per_page=30', {
        headers: { Authorization: 'Client-ID ' + UNSPLASH_CONFIG.accessKey }
      }).then(function (res) { if (!res.ok) throw new Error('Unsplash request failed'); return res.json(); });
    };
    var warm = function (url) { var i = new Image(); i.src = url; };

    // ---- what the card shows while waiting ----
    // If the photo is ready almost immediately (cached), show the polaroid
    // straight away. Otherwise, after a short grace period, a polaroid camera
    // "processes" the shot until the bytes arrive, then the print feeds out.
    var CAMERA_DELAY_MS = 150;   // grace period before the camera appears
    var CAMERA_MIN_MS = 600;     // once it appears, let it read as intentional
    var camTimer = null, waitingSince = 0, settled = false;

    // Film shape follows the photo (clamped so extreme panoramas/strips stay sane;
    // object-fit:cover crops the remainder). CSS reads --ar on the card.
    var setRatio = function () {
      if (!img.naturalWidth || !img.naturalHeight) return;
      var ar = Math.min(1.6, Math.max(0.66, img.naturalWidth / img.naturalHeight));
      card.style.setProperty('--ar', ar.toFixed(4));
    };
    var showDirect = function () {
      card.classList.remove('waiting');
      card.classList.add('printed');
      credit.hidden = false;
    };
    var armCamera = function () {
      if (reduceMotion) return;
      camTimer = setTimeout(function () {
        camTimer = null;
        if (settled || card.classList.contains('waiting')) return;
        waitingSince = Date.now();
        card.dataset.waitSince = waitingSince;
        card.classList.add('waiting');
      }, CAMERA_DELAY_MS);
    };
    var print = function (noCamera) {
      card.classList.remove('waiting');
      if (noCamera) card.classList.add('no-camera');
      card.classList.add('printing');
      polaroid.addEventListener('animationend', function onEnd(e) {
        if (e.target !== polaroid) return;
        polaroid.removeEventListener('animationend', onEnd);
        card.classList.remove('printing', 'no-camera');
        card.classList.add('printed');
        credit.hidden = false;
      });
    };
    var onReady = function () {
      if (settled) return;
      settled = true;
      if (camTimer) { clearTimeout(camTimer); camTimer = null; }
      setRatio();
      if (current) topUp(current);
      // The inline script in index.html may have started the camera before this file ran.
      if (reduceMotion) { showDirect(); return; }
      if (!card.classList.contains('waiting')) {
        // Instant (cached) image: print only if it's been over 3 hours since the last visit.
        if (staleVisit) print(true); else showDirect();
        return;
      }
      var since = Number(card.dataset.waitSince) || waitingSince;
      setTimeout(function () { print(false); }, Math.max(0, CAMERA_MIN_MS - (Date.now() - since)));
    };
    var onFail = function () {
      settled = true;
      if (camTimer) { clearTimeout(camTimer); camTimer = null; }
      card.classList.remove('waiting');
    };

    var current = null;
    var apply = function (photo) {
      current = photo;
      creditLink.href = photo.creditUrl;
      creditLink.textContent = photo.credit;
      img.alt = photo.alt || '';
      img.addEventListener('load', onReady, { once: true });
      img.addEventListener('error', onFail, { once: true });
      // The inline script in index.html may already have started this exact
      // request; don't restart it.
      if (img.getAttribute('src') !== photo.url) img.src = photo.url;
      if (img.complete && img.naturalWidth) onReady();
    };

    // Make sure the next slot's pick is chosen, saved, and warmed in the
    // browser cache, so the first visit after the photo rolls over is instant.
    var topUp = function (photo) {
      if (photo.next) { warm(photo.next.url); return; }
      fetchList().then(function (list) {
        var others = (list || []).filter(function (p) { return p.id !== photo.id; });
        if (!others.length) return;
        photo.next = toPhoto(others[Math.floor(Math.random() * others.length)]);
        writeCache(photo);
        warm(photo.next.url);
      }).catch(function () { /* best effort */ });
    };

    var cached = readCache();
    var photo = null;
    if (cached && cached.slot === slot) {
      photo = cached;
    } else if (cached && cached.next) {
      photo = Object.assign({}, cached.next, { slot: slot });
      writeCache(photo);
    }
    if (photo) {
      // The inline script in index.html already owns this card (it started the
      // very same download before this file ran): just keep tomorrow's pick warm.
      if (card.dataset.heroInline && img.getAttribute('src') === photo.url) {
        settled = true;
        topUp(photo);
        return;
      }
      // Already cached: if the image is ready right away (browser-cached) the
      // polaroid just appears; if it's slow, the camera covers the wait and
      // the print follows, exactly like a first visit.
      armCamera();
      apply(photo);
      return;
    }

    // Nothing cached: this is the only case that gets the camera + print.
    armCamera();
    fetchList()
      .then(function (data) {
        if (!data || !data.length) throw new Error('no photos');
        var picked = data[Math.floor(Math.random() * data.length)];
        var todays = toPhoto(picked);
        todays.slot = slot;
        writeCache(todays);
        apply(todays);
      })
      .catch(onFail);
  }

  // ---------- hero polaroid: tap to play with it ----------
  // Once the photo has printed (card gets .printed), each tap plays the next
  // effect (lift -> shake -> flip) and swings the tilt to the other side.
  function initPolaroidTap(root) {
    var pol = root.querySelector('#hero-polaroid');
    var card = pol && pol.closest('.cell-hero');
    if (!pol || !card) return;
    var FX = ['lift', 'shake', 'flip', 'spin', 'swing', 'drop', 'pop', 'flipx'];
    var ALL = ['tap-fx'].concat(FX.map(function (f) { return 'fx-' + f; }));
    var n = 0, bag = [], last = null;
    // Shuffle-bag: every effect plays once in random order before any repeats,
    // and the first of a new round never repeats the previous round's last.
    var nextFx = function () {
      if (!bag.length) {
        bag = FX.slice();
        for (var i = bag.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t;
        }
        if (bag[bag.length - 1] === last) { var k = bag.length - 1; bag[k] = bag[0]; bag[0] = last; }
      }
      last = bag.pop();
      return last;
    };
    var fire = function () {
      if (!card.classList.contains('printed')) return;
      var from = parseFloat(getComputedStyle(pol).getPropertyValue('--tilt')) || -2;
      pol.style.setProperty('--tilt-from', from + 'deg');
      pol.style.setProperty('--tilt', (n % 2 === 0 ? 2.4 : -2.2) + 'deg');
      if (reduceMotion) { n++; return; }
      ALL.forEach(function (c) { pol.classList.remove(c); });
      void pol.offsetWidth; // restart the animation if it is already playing
      pol.classList.add('tap-fx', 'fx-' + nextFx());
      n++;
    };
    pol.addEventListener('click', fire);
    pol.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
    pol.addEventListener('animationend', function (e) {
      if (e.target !== pol) return;
      ALL.forEach(function (c) { pol.classList.remove(c); });
    });
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

    // Fixed page size (Unsplash's max) so offset pagination stays consistent;
    // only the first three grid rows render up front, the rest wait in `pending`
    // behind the button.
    var PAGE_SIZE = 30;
    var revealAll = false;
    // Every fetched photo is in the DOM; until "More photographs" is clicked,
    // items past the third grid row are hidden. Re-run on resize so the cut
    // always lands on a row boundary for the current column count.
    var applyLimit = function () {
      var items = grid.querySelectorAll('.gallery-item');
      var cols = Math.max(getComputedStyle(grid).gridTemplateColumns.split(' ').length, 1);
      var limit = revealAll ? items.length : cols * 3;
      for (var i = 0; i < items.length; i++) items[i].hidden = i >= limit;
      if (loadMoreBtn) setButtonState();
    };
    var hasHidden = function () {
      return !!grid.querySelector('.gallery-item[hidden]');
    };
    var page = 1;
    var loading = false;
    var exhausted = false;
    var observer = null;
    // Unsplash's page-number pagination is offset-based against a live,
    // latest-sorted list — querying pages back-to-back with no pacing
    // (loadAllRemaining, below) can catch a photo shifting across a page
    // boundary between requests and return it twice. Track ids already
    // rendered and skip repeats regardless of why the API sent one again.
    var seenIds = {};

    var appendPhotos = function (photos) {
      photos.forEach(function (p) {
        if (seenIds[p.id]) return;
        seenIds[p.id] = true;

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

    var loadingAll = false;

    var setButtonState = function () {
      if (!loadMoreBtn) return;
      loadMoreBtn.hidden = revealAll ? exhausted : (exhausted && !hasHidden());
      loadMoreBtn.disabled = loading;
      loadMoreBtn.textContent = loading ? (loadingAll ? 'Loading all photographs…' : 'Loading…') : 'More photographs ↓';
    };

    // Returns a promise so loadAllRemaining (below) can chain pages without
    // the button text flickering "More photographs" between each fetch.
    var loadNextPage = function () {
      if (loading || exhausted) return Promise.resolve();
      loading = true;
      setButtonState();

      // AbortController timeout: a hung request (dropped connection, a
      // blocker that stalls rather than rejects, etc.) must not leave the
      // button reading "Loading…" forever with no way out.
      var controller = ('AbortController' in window) ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;

      return fetch('https://api.unsplash.com/users/' + encodeURIComponent(UNSPLASH_CONFIG.username) +
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
          }
          loading = false;
          applyLimit();
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

    // The button's own click loads every remaining page in one go — the
    // point of clicking it at all is to stop having to click it again.
    // No scroll-triggered auto-load: only the first three rows show until then.
    var loadAllRemaining = function () {
      revealAll = true;
      applyLimit();
      if (exhausted) { setButtonState(); return; }
      loadingAll = true;
      loadNextPage().then(function () {
        if (!exhausted) return loadAllRemaining();
        loadingAll = false;
      });
    };

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadAllRemaining);
    }

    window.addEventListener('resize', applyLimit);
    loadNextPage();
  }

  // Binds the lightbox's close button/backdrop wherever #lightbox is present
  // (gallery grid or a blog post's photo gallery) — independent of whichever
  // feature actually calls openLightbox().
  function initLightboxChrome(root) {
    var lb = root.querySelector('#lightbox');
    if (!lb || lb.dataset.bound) return;
    lb.dataset.bound = '1';
    var closeBtn = lb.querySelector('#lightbox-close');
    var backdrop = lb.querySelector('#lightbox-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (backdrop) backdrop.addEventListener('click', closeLightbox);
  }

  // ---------- blog post inline photos open in the same lightbox as the gallery ----------
  function initPostImageLightbox(root) {
    var imgs = root.querySelectorAll('.post-gallery img, article.markdown-body > img');
    if (!imgs.length) return;
    imgs.forEach(function (img) {
      if (img.dataset.lightboxBound) return;
      img.dataset.lightboxBound = '1';
      img.style.cursor = 'zoom-in';
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      var open = function () {
        openLightbox({
          urls: { regular: img.currentSrc || img.src },
          alt_description: img.alt || null,
          width: img.naturalWidth || null,
          height: img.naturalHeight || null
        });
      };
      img.addEventListener('click', open);
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  // ---------- project cards with no cover photo of their own ----------
  // Fills any <img data-unsplash-random> with a distinct random photo pulled
  // from your Unsplash gallery. On failure (not configured, rate limited,
  // offline) the placeholder images already in the markup stay put.
  function initRandomProjectCovers(root) {
    var imgs = root.querySelectorAll('img[data-unsplash-random]');
    if (!imgs.length) return;
    if (!UNSPLASH_CONFIG.accessKey || !UNSPLASH_CONFIG.username) return;

    fetch('https://api.unsplash.com/users/' + encodeURIComponent(UNSPLASH_CONFIG.username) +
      '/photos?per_page=30&order_by=latest', {
      headers: { Authorization: 'Client-ID ' + UNSPLASH_CONFIG.accessKey }
    })
      .then(function (res) { if (!res.ok) throw new Error('Unsplash request failed'); return res.json(); })
      .then(function (photos) {
        if (!photos || !photos.length) return;
        // Shuffle so each matched image gets a different random photo.
        var pool = photos.slice();
        for (var i = pool.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        imgs.forEach(function (img, idx) {
          var photo = pool[idx % pool.length];
          img.src = photo.urls.regular;
          img.alt = photo.alt_description || '';
        });
      })
      .catch(function () { /* keep the placeholder images */ });
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

  // Shared by the Unsplash gallery and by plain post images (see
  // initPostImageLightbox below) — a "photo" here only strictly needs
  // urls.regular; every other field is optional and its row/behavior is
  // skipped when absent, so a local image with no Unsplash metadata still
  // opens cleanly instead of showing fake dates/likes/downloads.
  function openLightbox(photo) {
    var lb = document.getElementById('lightbox');
    if (!lb) return;

    if (photo.id && window.recordGalleryView) window.recordGalleryView();

    var img = document.getElementById('lightbox-img');
    img.src = photo.urls.regular;
    img.alt = photo.alt_description || '';

    var titleEl = document.getElementById('lightbox-title');
    var hasTitle = !!(photo.alt_description || photo.description);
    titleEl.textContent = hasTitle ? (photo.alt_description || photo.description) : '—';
    document.getElementById('lightbox-desc').textContent =
      (photo.description && photo.description !== photo.alt_description) ? photo.description : '';
    document.getElementById('lightbox-dims').textContent = (photo.width && photo.height)
      ? (photo.width + ' × ' + photo.height) : '—';

    var dateRow = document.getElementById('lightbox-date-row');
    if (dateRow) {
      dateRow.hidden = !photo.created_at;
      if (photo.created_at) {
        document.getElementById('lightbox-date').textContent =
          new Date(photo.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    var likesRow = document.getElementById('lightbox-likes-row');
    if (likesRow) {
      likesRow.hidden = (typeof photo.likes !== 'number');
      if (typeof photo.likes === 'number') {
        document.getElementById('lightbox-likes').textContent = photo.likes.toLocaleString();
      }
    }

    if (photo.id && !hasTitle) {
      fetchPhotoLocation(photo.id).then(function (locationName) {
        // Bail if the lightbox has since moved on to a different photo.
        if (document.getElementById('lightbox-img').src !== photo.urls.regular) return;
        titleEl.textContent = locationName || 'Untitled';
      });
    }

    var dl = document.getElementById('lightbox-download');
    dl.href = (photo.links && photo.links.download) || photo.urls.regular;
    dl.onclick = function () {
      // Required by Unsplash's API guidelines: ping download_location whenever
      // the app triggers an actual download, separate from just displaying it.
      if (photo.links && photo.links.download_location) {
        var sep = photo.links.download_location.indexOf('?') === -1 ? '?' : '&';
        fetch(photo.links.download_location + sep + 'client_id=' + UNSPLASH_CONFIG.accessKey).catch(function () { /* ignore */ });
      }
      if (photo.id && window.recordGalleryDownload) window.recordGalleryDownload();
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
    recordPageView(pageKey);
  }

  // ---------- mobile menu + liquid-glass pointer glow (bind once, nav persists) ----------

  var menuCloser = null;

  function initChrome() {
    var toggle = document.querySelector('.nav-toggle');
    var close = document.querySelector('.nav-close');
    var links = document.querySelector('.nav-links');
    // Opening the menu also freezes the page behind it (html.menu-open sets
    // overflow:hidden in CSS), so it can't be scrolled underneath the overlay.
    var setMenu = function (open) {
      if (!links) return;
      links.classList.toggle('open', open);
      document.documentElement.classList.toggle('menu-open', open);
    };
    menuCloser = function () { setMenu(false); };
    if (toggle && links) toggle.addEventListener('click', function () { setMenu(true); });
    if (close && links) close.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 760) setMenu(false); });

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

  // ---------- blog index: posts loaded live from Firestore ----------
  function formatPostDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  var TAG_LABELS = { misc: 'Misc', tech: 'Tech', music: 'Music', life: 'Life', literature: 'Literature' };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var TAG_ORDER = ['music', 'tech', 'life', 'literature', 'misc'];

  // Cover-carousel timers for the blog list's multi-image thumbs. Tracked
  // here (rather than left to garbage collection) because the router swaps
  // #page-content via innerHTML on navigation — a setInterval keeps firing
  // against detached nodes forever unless something clears it, so every
  // call into initDynamicBlogList (it runs on every page, not just the
  // blog's) clears whatever the previous page left running first.
  var blogThumbTimers = [];

  // Stale-while-revalidate cache for the post list: renders instantly from
  // whatever was cached last visit while a fresh Firestore fetch runs in the
  // background, then silently re-renders only if the fetch turns up changes
  // (e.g. a new/edited post). Avoids the blank list while waiting on the
  // network round trip that made the blog page feel slow to open.
  var BLOG_POSTS_CACHE_KEY = 'blogPostsCacheV1';

  function readBlogPostsCache() {
    try {
      var parsed = JSON.parse(localStorage.getItem(BLOG_POSTS_CACHE_KEY));
      return (parsed && parsed.posts) || null;
    } catch (e) { return null; }
  }

  function writeBlogPostsCache(posts) {
    try {
      localStorage.setItem(BLOG_POSTS_CACHE_KEY, JSON.stringify({ posts: posts, cachedAt: Date.now() }));
    } catch (e) { /* storage full/unavailable — cache is best-effort */ }
  }

  function initDynamicBlogList(root) {
    var list = root.querySelector('#blog-list');
    if (!list || !window.__firestoreLite) return;
    var pillGroup = root.querySelector('#blog-pill-group');
    var searchInput = root.querySelector('.search-input');

    var cached = readBlogPostsCache();
    if (cached) {
      renderBlogPosts(root, list, pillGroup, searchInput, cached);
    } else {
      list.innerHTML = '<p class="empty-state">Loading…</p>';
    }

    window.__firestoreLite.listPublishedPosts().then(function (posts) {
      writeBlogPostsCache(posts);
      if (cached && JSON.stringify(cached) === JSON.stringify(posts)) return;
      renderBlogPosts(root, list, pillGroup, searchInput, posts);
    }).catch(function () {
      if (!cached) list.innerHTML = '<p class="empty-state">Couldn\'t load posts right now.</p>';
    });
  }

  function renderBlogPosts(root, list, pillGroup, searchInput, posts) {
    blogThumbTimers.forEach(clearInterval);
    blogThumbTimers = [];

    if (!posts.length) {
      list.innerHTML = '<p class="empty-state">No posts yet — check back soon.</p>';
      return;
    }
    list.innerHTML = posts.map(function (post) {
        var tagLabel = TAG_LABELS[post.tag] || post.tag || 'Misc';
        var images = post.images || [];
        var cover = images.map(function (src, i) {
          return '<img src="' + src + '" alt="" class="thumb-slide' + (i === 0 ? ' active' : '') + '">';
        }).join('');
        return '<a class="blog-row" data-category="' + (post.tag || 'misc') + '" href="post.html?slug=' + encodeURIComponent(post.slug) + '">' +
          '<div class="blog-thumb">' + cover + '</div>' +
          '<div class="b-body">' +
          '<div class="b-date">' + formatPostDate(post.date) + '</div>' +
          '<h2>' + escapeHtml(post.title) + '</h2>' +
          '<p>' + escapeHtml(post.dek) + '</p>' +
          '</div>' +
          '<span class="b-tag">' + tagLabel + '</span>' +
          '</a>';
      }).join('');

      // Cover carousel: posts with more than one image cross-fade to the
      // next every few seconds instead of showing a single static photo.
      // Skipped under prefers-reduced-motion, same as the rest of the site.
      if (!reduceMotion) {
        list.querySelectorAll('.blog-thumb').forEach(function (thumb) {
          var slides = thumb.querySelectorAll('.thumb-slide');
          if (slides.length < 2) return;
          var idx = 0;
          blogThumbTimers.push(setInterval(function () {
            slides[idx].classList.remove('active');
            idx = (idx + 1) % slides.length;
            slides[idx].classList.add('active');
          }, 3500));
        });
      }

      // Only show a filter pill for a tag that at least one loaded post
      // actually has — no point offering "Literature" if nothing's tagged
      // that yet. "All" always shows.
      if (pillGroup) {
        var presentTags = TAG_ORDER.filter(function (tag) {
          return posts.some(function (p) { return (p.tag || 'misc') === tag; });
        });
        pillGroup.innerHTML = '<button class="pill active" data-filter="all">All</button>' +
          presentTags.map(function (tag) {
            return '<button class="pill" data-filter="' + tag + '">' + (TAG_LABELS[tag] || tag) + '</button>';
          }).join('');
      }

      var pills = root.querySelectorAll('.pill[data-filter]');
      var activeCategory = 'all';
      var applyFilters = function () {
        var q = (searchInput && searchInput.value || '').trim().toLowerCase();
        root.querySelectorAll('.blog-row[data-category]').forEach(function (row) {
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
      if (searchInput && !searchInput.dataset.blogSearchBound) {
        searchInput.dataset.blogSearchBound = '1';
        searchInput.addEventListener('input', function () { applyFilters(); });
      }
      applyFilters();
  }

  // ---------- per-page behaviors (re-run after every content swap) ----------

  function initPageBehaviors(root) {
    root = root || document;

    initUnsplashHero(root, consumeVisit());
    initPolaroidTap(root);
    initDailyQuote(root);
    initGalleryStats(root);
    initGalleryPhotos(root);
    initRandomProjectCovers(root);
    initLightboxChrome(root);
    initPostImageLightbox(root);
    initResumeTracking(root);
    if (window.initVisitorsChart) window.initVisitorsChart(root);
    initDynamicBlogList(root); // also generates + binds blog's filter pills and search, once posts are known

    // Projects page: live search by name, description, and type (chip)
    var projectSearch = root.querySelector('#project-search');
    var projectCards = root.querySelectorAll('.grid-cards .proj-card');
    if (projectSearch && projectCards.length) {
      projectSearch.addEventListener('input', function () {
        var q = projectSearch.value.trim().toLowerCase();
        projectCards.forEach(function (card) {
          var text = card.textContent.toLowerCase();
          card.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
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
          curMain.className = newMain.className;
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
      if (openNav && menuCloser) menuCloser();
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

  // ---------- Left/Right arrow keys cycle between nav tabs ----------
  // Reuses navigateTo() — the same AJAX page-swap + nav-indicator slide used
  // for a normal click — so this gets identical animation/effects for free.
  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return; // don't hijack browser history shortcuts
    if (isTypingTarget(document.activeElement)) return;
    if (navigating) return;
    var lb = document.getElementById('lightbox');
    if (lb && !lb.hidden) return; // let the lightbox own arrow keys while a photo is open

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[data-page]'));
    if (!tabs.length) return;
    var currentIndex = tabs.findIndex(function (a) { return a.dataset.page === activePageKey; });
    if (currentIndex === -1) return;

    var nextIndex = e.key === 'ArrowRight'
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;
    var nextHref = tabs[nextIndex].getAttribute('href');
    if (!nextHref || PAGES.indexOf(nextHref.split('#')[0].split('?')[0]) === -1) return;

    e.preventDefault();
    navigateTo(nextHref, true);
  });

  // ---------- Down arrow: the hidden door to the dashboard sign-in ----------
  // A real navigation (admin/index.html is a completely different page, not
  // part of the #page-content AJAX system), so instead of reusing
  // navigateTo() this plays a one-way "drop through a trapdoor" transition
  // on the current page — sink/blur/fade, then a darkening overlay — before
  // the actual navigation fires once it's had time to read.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (isTypingTarget(document.activeElement)) return;
    if (navigating) return;
    var lb = document.getElementById('lightbox');
    if (lb && !lb.hidden) return;

    e.preventDefault();
    navigating = true;
    document.body.classList.add('portal-down');
    setTimeout(function () { document.body.classList.add('portal-fade'); }, 120);
    setTimeout(function () { location.href = 'admin/index.html'; }, 520);
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('v2-year').textContent = new Date().getFullYear();
    initFirebase();
    logPageView(activePageKey, location.pathname);
    // Firestore event feeding the dashboard's traffic charts — skipped on
    // post.html, which logs its own more specific {page:'post', slug} event
    // once it knows which post loaded (see post.js); logging both here and
    // there would double-count that single visit.
    if (!/(^|\/)post\.html$/.test(location.pathname)) {
      recordPageView(activePageKey || 'home');
    }
    initChrome();
    initNavIndicator();
    initPageBehaviors(document);
  });

  // post.js (the generic post.html template) fetches its post's content
  // asynchronously, after this file's own DOMContentLoaded pass already ran
  // — this lets it re-trigger the behaviors that depend on content which
  // didn't exist yet (the lightbox-click binding on post-gallery images).
  window.__reinitPostBehaviors = initPageBehaviors;
})();
