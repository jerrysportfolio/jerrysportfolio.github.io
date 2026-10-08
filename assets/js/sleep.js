// Sleep card (About page): bar chart of hours slept for the last 7 nights, pushed from
// Apple Health by an iOS Shortcut to the Worker's /sleep endpoint (see worker/README.md).
// The card stays hidden if there's no data. Exposes window.initSleepChart(root) for the AJAX router.
(function () {
    var SLEEP_URL = "https://portfolio-visitors.work-jerrywu.workers.dev/sleep";
    var NS = "http://www.w3.org/2000/svg";
    var W = 252, H = 120, PT = 16, PB = 18, BAR = 22, GOAL = 8;
    var cache = null;

    // GET JSON with up to 3 attempts (timeout + backoff), so one slow or dropped request doesn't hide the card.
    function fetchRetry(url, attempt) {
        attempt = attempt || 0;
        var ctl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
        return fetch(url, ctl ? { signal: ctl.signal } : undefined)
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .finally(function () { clearTimeout(timer); })
            .catch(function () {
                if (attempt >= 2) return Promise.reject();
                return new Promise(function (res) { setTimeout(res, 600 * Math.pow(2, attempt)); })
                    .then(function () { return fetchRetry(url, attempt + 1); });
            });
    }

    function load() {
        if (!cache) {
            cache = fetchRetry(SLEEP_URL)
                .then(function (d) {
                    var ok = Array.isArray(d.nights) && d.nights.some(function (n) { return n.hours != null; });
                    return ok ? d.nights : Promise.reject();
                });
            cache.catch(function () { cache = null; });
        }
        return cache;
    }

    function el(tag, attrs) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    }

    function fmt(h) {
        var m = Math.round(h * 60);
        return Math.floor(m / 60) + "h " + ("0" + (m % 60)).slice(-2) + "m";
    }

    function render(card, nights) {
        var vals = nights.filter(function (n) { return n.hours != null; });
        var avg = vals.reduce(function (a, n) { return a + n.hours; }, 0) / vals.length;
        var max = Math.max(GOAL + 1, Math.ceil(Math.max.apply(null, vals.map(function (n) { return n.hours; }))));
        var y = function (h) { return PT + (1 - h / max) * (H - PT - PB); };
        var step = W / nights.length;

        var s = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
            "aria-label": "Hours slept per night over the last 7 nights, average " + fmt(avg) + "." });
        s.appendChild(el("line", { x1: 0, x2: W, y1: y(GOAL), y2: y(GOAL), class: "s-goal" }));
        nights.forEach(function (n, i) {
            var cx = step * i + step / 2;
            var day = new Date(n.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });
            var t = el("text", { x: cx, y: H - 4, class: "s-day", "text-anchor": "middle" });
            t.textContent = day;
            s.appendChild(t);
            if (n.hours == null) return;
            var top = y(n.hours);
            var bar = el("rect", { x: cx - BAR / 2, y: top, width: BAR, height: H - PB - top, rx: 4, class: "s-bar" });
            var tip = el("title", {});
            tip.textContent = fmt(n.hours) + " on " + n.date;
            bar.appendChild(tip);
            s.appendChild(bar);
            var v = el("text", { x: cx, y: top - 4, class: "s-val", "text-anchor": "middle" });
            v.textContent = n.hours.toFixed(1);
            s.appendChild(v);
        });
        var chart = card.querySelector(".s-chart");
        chart.textContent = "";
        chart.appendChild(s);
        card.querySelector(".s-avg").textContent = avg.toFixed(1) + "h";
        card.classList.add("ready");
    }

    window.initSleepChart = function (root) {
        var card = (root || document).querySelector("#sleep-card");
        if (!card) return;
        load().then(function (n) { render(card, n); }, function () { card.classList.add("failed"); });
    };

    window.initSleepChart(document);
})();
