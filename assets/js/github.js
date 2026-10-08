// GitHub card (homepage): contribution heatmap for the last 22 weeks.
// Data: public contributions API (no token needed). The card hides itself if it's unreachable.
// Exposes window.initGithubMap(root) so the AJAX router can re-run it after a swap.
(function () {
    var USER = "AccessRetrieved";
    var URL = "https://github-contributions-api.jogruber.de/v4/" + USER + "?y=last";
    var NS = "http://www.w3.org/2000/svg";
    var WEEKS = 22, CELL = 11, GAP = 3, LEVELS = [0.1, 0.3, 0.5, 0.75, 1];
    var cache = null;

    function load() {
        if (!cache) {
            cache = fetch(URL)
                .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
                .then(function (d) { return Array.isArray(d.contributions) && d.contributions.length ? d.contributions : Promise.reject(); });
            cache.catch(function () { cache = null; });
        }
        return cache;
    }

    function render(card, days) {
        var first = new Date(days[0].date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
        var cols = Math.ceil((first + days.length) / 7);
        var start = Math.max(0, cols - WEEKS);
        var W = WEEKS * (CELL + GAP) - GAP, H = 7 * (CELL + GAP) - GAP;
        var s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 " + W + " " + H);
        s.setAttribute("role", "img");
        var total = 0;
        days.forEach(function (d, i) {
            var col = Math.floor((first + i) / 7) - start;
            if (col < 0) return;
            total += d.count;
            var r = document.createElementNS(NS, "rect");
            r.setAttribute("x", col * (CELL + GAP));
            r.setAttribute("y", ((first + i) % 7) * (CELL + GAP));
            r.setAttribute("width", CELL);
            r.setAttribute("height", CELL);
            r.setAttribute("rx", 2.5);
            r.setAttribute("class", "g-cell");
            r.setAttribute("fill-opacity", LEVELS[d.level] || LEVELS[0]);
            var t = document.createElementNS(NS, "title");
            t.textContent = d.count + " contribution" + (d.count === 1 ? "" : "s") + " on " + d.date;
            r.appendChild(t);
            s.appendChild(r);
        });
        s.setAttribute("aria-label", total + " GitHub contributions in the last " + WEEKS + " weeks");
        var map = card.querySelector(".g-map");
        map.textContent = "";
        map.appendChild(s);
        card.querySelector(".g-total").textContent = total.toLocaleString();
        card.classList.add("ready");
    }

    window.initGithubMap = function (root) {
        var card = (root || document).querySelector("#github-card");
        if (!card) return;
        load().then(function (days) { render(card, days); }, function () { card.classList.add("failed"); });
    };

    window.initGithubMap(document);
})();
