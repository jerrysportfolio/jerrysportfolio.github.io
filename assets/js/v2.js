// Shared behavior for the experimental (v2) site: mobile nav, liquid-glass nav
// indicator, AJAX page routing (nav/footer persist, #page-content swaps), blog
// filter/search, reading progress, gallery load-more.
(function () {
  var PAGES = ['index.html', 'about.html', 'portfolio.html', 'gallery.html', 'blog.html', 'blog-post.html'];
  var TRANSITION_MS = 220;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var activePageKey = document.body.dataset.page || '';
  var navigating = false;

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

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('v2-year').textContent = new Date().getFullYear();
    initChrome();
    initNavIndicator();
    initPageBehaviors(document);
  });
})();
