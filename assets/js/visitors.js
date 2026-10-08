// Shows "N visitors today" from the Cloudflare analytics Worker.
// Hides itself silently if the Worker is unreachable.
(function () {
    var VISITORS_URL = "https://portfolio-visitors.REPLACE_ME.workers.dev";
    var el = document.getElementById("v2-visitors");
    if (!el || VISITORS_URL.indexOf("REPLACE_ME") !== -1) return;

    fetch(VISITORS_URL)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (d) {
            if (typeof d.uniques !== "number") return;
            el.textContent = d.uniques.toLocaleString() + (d.uniques === 1 ? " visitor today" : " visitors today");
            el.hidden = false;
        })
        .catch(function () {});
})();
