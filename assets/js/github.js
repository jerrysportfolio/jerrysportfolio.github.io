// GitHub card (homepage): contribution heatmap for the last year, one column per week, scrollable sideways.
// Data: public contributions API (no token needed). The card hides itself if it's unreachable.
// Exposes window.initGithubMap(root) so the AJAX router can re-run it after a swap.
(function () {
    var USER = "AccessRetrieved";
    var URL = "https://github-contributions-api.jogruber.de/v4/" + USER + "?y=last";
    var NS = "http://www.w3.org/2000/svg";
    var DAYS = 365, CELL = 11, GAP = 3, LABEL = 20, MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], LEVELS = [0.1, 0.3, 0.5, 0.75, 1];
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

    function render(card, all) {
        var days = all.slice(-DAYS);
        var first = new Date(days[0].date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
        var cols = Math.ceil((first + days.length) / 7);
        var step = CELL + GAP;
        var W = cols * step - GAP, H = LABEL + 7 * step - GAP;
        var s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 " + W + " " + H);
        s.setAttribute("width", W); // natural size; the .g-map wrapper scrolls horizontally
        s.setAttribute("height", H);
        s.setAttribute("role", "img");
        var total = 0, lastMonth = -1, lastLabelX = -99;
        days.forEach(function (d, i) {
            var col = Math.floor((first + i) / 7), row = (first + i) % 7;
            total += d.count;
            var r = document.createElementNS(NS, "rect");
            r.setAttribute("x", col * step);
            r.setAttribute("y", LABEL + row * step);
            r.setAttribute("width", CELL);
            r.setAttribute("height", CELL);
            r.setAttribute("rx", 2.5);
            r.setAttribute("class", "g-cell");
            r.setAttribute("fill-opacity", LEVELS[d.level] || LEVELS[0]);
            var t = document.createElementNS(NS, "title");
            t.textContent = d.count + " contribution" + (d.count === 1 ? "" : "s") + " on " + d.date;
            r.appendChild(t);
            s.appendChild(r);
            // Month label above the first week column that starts a new month.
            var m = parseInt(d.date.slice(5, 7), 10);
            if (row === 0 && m !== lastMonth) {
                lastMonth = m;
                if (col * step - lastLabelX >= 40) { // skip labels that would overlap
                    lastLabelX = col * step;
                    var l = document.createElementNS(NS, "text");
                    l.setAttribute("x", col * step);
                    l.setAttribute("y", 12);
                    l.setAttribute("class", "g-month");
                    l.textContent = MONTHS[m - 1];
                    s.appendChild(l);
                }
            }
        });
        s.setAttribute("aria-label", total + " GitHub contributions in the last year");
        var map = card.querySelector(".g-map");
        map.textContent = "";
        map.appendChild(s);
        map.scrollLeft = map.scrollWidth; // start on the most recent weeks
        enableDrag(map);
        card.querySelector(".g-total").textContent = total.toLocaleString();
        card.classList.add("ready");
    }

    // Touchpad swipes, touch and the scrollbar scroll natively; this adds click-and-drag for a mouse.
    function enableDrag(el) {
        if (el._dragBound) return;
        el._dragBound = true;
        var down = false, startX = 0, startLeft = 0;
        el.addEventListener("pointerdown", function (e) {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            down = true; startX = e.clientX; startLeft = el.scrollLeft;
            el.classList.add("dragging");
        });
        window.addEventListener("pointermove", function (e) {
            if (down) el.scrollLeft = startLeft - (e.clientX - startX);
        });
        window.addEventListener("pointerup", function () {
            down = false; el.classList.remove("dragging");
        });
    }

    window.initGithubMap = function (root) {
        var card = (root || document).querySelector("#github-card");
        if (!card) return;
        load().then(function (days) { render(card, days); }, function () { card.classList.add("failed"); });
    };

    window.initGithubMap(document);
})();
