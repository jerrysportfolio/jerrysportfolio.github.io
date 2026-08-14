function isMobileDevice() {
  return (
    typeof window.orientation !== "undefined" ||
    navigator.userAgent.indexOf("IEMobile") !== -1
  );
}

function initCustomCursor(options = {}) {
  const { intro = false } = options;

  if (isMobileDevice()) return null;

  document.getElementById("cursor-injection").innerHTML += `
        <div id="cursor">
        <div class="cursor-circle circle-big">
            <svg height="30" width="30">
                <circle cx="15" cy="15" r="12" stroke-width="0"></circle>
            </svg>
        </div>
        <div class="cursor-circle circle-small">
            <svg height="10" width="10">
                <circle cx="5" cy="5" r="4" stroke-width="0"></circle>
            </svg>
        </div>
    </div>`;

  const cursor = document.getElementById("cursor");
  const cursorBallBig = document.querySelector(".circle-big");
  const cursorBallSmall = document.querySelector(".circle-small");

  let posS = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let posB = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let mouse = { x: posS.x, y: posS.y };
  const speed = 0.1;
  let fpms = 60 / 1000;

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
  });

  const xSetBallSmall = gsap.quickSetter(cursorBallSmall, "x", "px");
  const ySetBallSmall = gsap.quickSetter(cursorBallSmall, "y", "px");
  const xSetBallBig = gsap.quickSetter(cursorBallBig, "x", "px");
  const ySetBallBig = gsap.quickSetter(cursorBallBig, "y", "px");

  gsap.ticker.add((time, deltaTime) => {
    let delta = deltaTime * fpms;
    let dt = 1.0 - Math.pow(1.0 - speed, delta);

    posS.x += mouse.x - posS.x;
    posS.y += mouse.y - posS.y;
    posB.x += (mouse.x - posB.x) * dt;
    posB.y += (mouse.y - posB.y) * dt;
    xSetBallSmall(posS.x);
    ySetBallSmall(posS.y);
    xSetBallBig(posB.x);
    ySetBallBig(posB.y);
  });

  if (intro) {
    // Cover the whole screen, then burst down to its resting size.
    const coverScale = (Math.max(window.innerWidth, window.innerHeight) * 1.5) / 30;
    gsap.fromTo(
      cursorBallBig,
      { scale: coverScale },
      { scale: 1, duration: 0.8, ease: "power4.out" }
    );
  }

  function spawnClickRipple(x, y) {
    const ripple = document.createElement("div");
    ripple.className = "cursor-ripple";
    cursor.appendChild(ripple);
    gsap.set(ripple, { x, y });
    gsap.fromTo(
      ripple,
      { scale: 0, opacity: 0.6 },
      {
        scale: 3,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
        onComplete: () => ripple.remove(),
      }
    );
  }

  window.addEventListener("mousedown", () => {
    gsap.to(cursorBallSmall, { scale: 0.6, duration: 0.2, ease: "power2.out" });
    gsap.to(cursorBallBig, { scale: 0.85, duration: 0.3, ease: "power2.out" });
  });

  window.addEventListener("mouseup", (e) => {
    gsap.to(cursorBallSmall, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });
    gsap.to(cursorBallBig, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.4)" });
    spawnClickRipple(e.x, e.y);
  });

  return { cursor, cursorBallBig, cursorBallSmall };
}
