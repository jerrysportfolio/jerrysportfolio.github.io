// Visitors card (homepage): 14-day line + dot chart of unique visitors from the
// Cloudflare analytics Worker. The card hides itself if the Worker is unreachable.
// Exposes window.initVisitorsChart(root) so the AJAX router can re-run it after a swap.
(function () {
    var VISITORS_URL = "https://portfolio-visitors.work-jerrywu.workers.dev";
    var NS = "http://www.w3.org/2000/svg";
    var W = 300, H = 112, PX = 10, PT = 14, PB = 20;
    var cache = null; // one fetch per page load, reused across router swaps

    function load() {
        if (!cache) {
            cache = fetch(VISITORS_URL)
                .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
                .then(function (d) { return Array.isArray(d.days) && d.days.length > 1 ? d.days : Promise.reject(); });
            cache.catch(function () { cache = null; });
        }
        return cache;
    }

    function svg(tag, attrs) {
        var el = document.createElementNS(NS, tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }

    function fmtDate(iso) {
        var d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    }

    function render(card, days) {
        var chart = card.querySelector(".v-chart");
        var tip = card.querySelector(".v-tip");
        var max = Math.max.apply(null, days.map(function (d) { return d.uniques; })) || 1;
        var x = function (i) { return PX + (i * (W - 2 * PX)) / (days.length - 1); };
        var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
        var pts = days.map(function (d, i) { return [x(i), y(d.uniques)]; });
        var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
        var area = line + " L" + pts[pts.length - 1][0] + " " + (H - PB) + " L" + pts[0][0] + " " + (H - PB) + " Z";

        var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
            "aria-label": "Unique visitors per day for the last " + days.length + " days. Today: " + days[days.length - 1].uniques + "." });
        var defs = svg("defs", {});
        var g = svg("linearGradient", { id: "v-fill", x1: 0, y1: 0, x2: 0, y2: 1 });
        g.appendChild(svg("stop", { offset: "0", "stop-color": "#3ddc84", "stop-opacity": ".32" }));
        g.appendChild(svg("stop", { offset: "1", "stop-color": "#3ddc84", "stop-opacity": "0" }));
        defs.appendChild(g);
        s.appendChild(defs);

        s.appendChild(svg("line", { x1: PX, x2: W - PX, y1: H - PB, y2: H - PB, class: "v-base" }));
        s.appendChild(svg("path", { d: area, fill: "url(#v-fill)" }));
        s.appendChild(svg("path", { d: line, class: "v-line", pathLength: 1 }));

        var cross = svg("line", { class: "v-cross", y1: PT - 4, y2: H - PB });
        s.appendChild(cross);
        var dots = pts.map(function (p, i) {
            var last = i === pts.length - 1;
            var c = svg("circle", { cx: p[0], cy: p[1], r: last ? 4 : 3, class: "v-dot" + (last ? " v-dot-now" : "") });
            s.appendChild(c);
            return c;
        });
        var t0 = svg("text", { x: PX, y: H - 5, class: "v-axis" }); t0.textContent = fmtDate(days[0].date);
        var t1 = svg("text", { x: W - PX, y: H - 5, class: "v-axis", "text-anchor": "end" }); t1.textContent = "Today";
        s.appendChild(t0); s.appendChild(t1);

        chart.textContent = "";
        chart.appendChild(s);
        chart.appendChild(tip);

        function show(i) {
            dots.forEach(function (d, j) { d.classList.toggle("on", j === i); });
            cross.setAttribute("x1", pts[i][0]); cross.setAttribute("x2", pts[i][0]);
            cross.classList.add("on");
            tip.innerHTML = "<b>" + days[i].uniques.toLocaleString() + "</b> " + (days[i].uniques === 1 ? "visitor" : "visitors") +
                "<span>" + (i === days.length - 1 ? "Today so far" : fmtDate(days[i].date)) + "</span>";
            tip.hidden = false;
            var box = chart.getBoundingClientRect();
            var px = (pts[i][0] / W) * box.width, py = (pts[i][1] / H) * box.height;
            var tw = tip.offsetWidth;
            tip.style.left = Math.min(Math.max(px - tw / 2, 0), box.width - tw) + "px";
            tip.style.top = Math.max(py - tip.offsetHeight - 10, 0) + "px";
        }
        function hide() {
            dots.forEach(function (d) { d.classList.remove("on"); });
            cross.classList.remove("on");
            tip.hidden = true;
        }
        chart.onpointermove = function (e) {
            var box = chart.getBoundingClientRect();
            var vx = ((e.clientX - box.left) / box.width) * W;
            var best = 0;
            pts.forEach(function (p, i) { if (Math.abs(p[0] - vx) < Math.abs(pts[best][0] - vx)) best = i; });
            show(best);
        };
        chart.onpointerleave = hide;

        // Text alternative for screen readers.
        var table = card.querySelector(".v-table");
        table.innerHTML = "<caption>Unique visitors per day</caption>" +
            days.map(function (d) { return "<tr><th>" + fmtDate(d.date) + "</th><td>" + d.uniques + "</td></tr>"; }).join("");

        card.querySelector(".v-today").textContent = days[days.length - 1].uniques.toLocaleString();
        card.classList.add("ready");
    }

    window.initVisitorsChart = function (root) {
        var card = (root || document).querySelector("#visitors-card");
        if (!card) return;
        load().then(function (days) { render(card, days); }, function () { card.classList.add("failed"); });
    };

    window.initVisitorsChart(document);
})();
