// Shared behavior for the experimental (v2) site: mobile nav, blog filter/search, reading progress.
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const close = document.querySelector('.nav-close');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.add('open'));
  }
  if (close && links) {
    close.addEventListener('click', () => links.classList.remove('open'));
  }

  // Blog index: category pills + live search
  const pills = document.querySelectorAll('.pill[data-filter]');
  const searchInput = document.querySelector('.search-input');
  const rows = document.querySelectorAll('.blog-row[data-category]');
  if (pills.length && rows.length) {
    let activeCategory = 'all';

    function applyFilters() {
      const q = (searchInput?.value || '').trim().toLowerCase();
      rows.forEach(row => {
        const cat = row.dataset.category;
        const text = row.textContent.toLowerCase();
        const matchesCategory = activeCategory === 'all' || cat === activeCategory;
        const matchesSearch = !q || text.includes(q);
        row.style.display = (matchesCategory && matchesSearch) ? '' : 'none';
      });
    }

    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeCategory = pill.dataset.filter;
        applyFilters();
      });
    });
    searchInput?.addEventListener('input', applyFilters);
  }

  // Blog post: reading progress bar
  const progress = document.querySelector('.reading-progress');
  if (progress) {
    const update = () => {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      progress.style.width = pct + '%';
    };
    document.addEventListener('scroll', update, { passive: true });
    update();
  }

  // Gallery: placeholder "load more" — replace with a real Unsplash fetch later
  const loadMoreBtn = document.querySelector('.load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.textContent = 'Wire this up to the Unsplash API — see comment in gallery.html';
    });
  }
});
