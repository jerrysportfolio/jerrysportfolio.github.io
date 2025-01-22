document.addEventListener('DOMContentLoaded', function () {
    function isMobileDevice() {
        return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
    }

    if (isMobileDevice()) {
        document.getElementById('projects').innerHTML = `
        <div class="container grid grid-cols-12 gap-8">
            <div class="col-span-12 md:col-span-6">
                <!-- Project card -->
                <a href="https://github.com/AccessRetrieved/codegpt" class="block relative mb-16 mt=40">
                    <img class="relative -z-10" src="assets/img/CodeGPT.jpeg" alt="">
                    <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                        <h3 class="text-lg lg:text-xl font-medium">CodeGPT (2025)</h3>
                        <p>Hacks for Hackers, Major Leagues Hacking</p>
                    </div>
                </a>
                <!-- Project card -->
                <a href="https://github.com/AccessRetrieved/medlinks" class="block relative mb-16">
                    <img class="relative -z-10" src="assets/img/medlinks.jpeg" alt="">
                    <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                        <h3 class="text-lg lg:text-xl font-medium">Medlinks (2025)</h3>
                        <p>nwHacks, nwPlus + Major Leagues Hacking</p>
                    </div>
                </a>
                <!-- Project card -->
                <a href="https://constellationhub.org" class="block relative mb-16">
                    <img class="relative -z-10" src="assets/img/constellation.jpg" alt="">
                    <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                        <h3 class="text-lg lg:text-xl font-medium">Constellation Networking (2023 - Present)</h3>
                    </div>
                </a>
                <!-- Project card -->
                <a href="https://gptnotes.iamjerryhu.org" class="block relative mb-16">
                    <img class="relative -z-10" src="assets/img/gptnotes.jpg" alt="">
                    <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                        <h3 class="text-lg lg:text-xl font-medium">GPTNotes (2022 - 2023)</h3>
                    </div>
                </a>
                <!-- Project card -->
                <a href="" class="block relative mb-16">
                    <img class="relative -z-10" src="assets/img/postman.jpg" alt="">
                    <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                        <h3 class="text-lg lg:text-xl font-medium">App Postman (2021)</h3>
                    </div>
                </a>
                <!-- Project card -->
                <a href="https://accessretrieved.github.io/Music/" class="block relative">
                    <img class="relative -z-10" src="assets/img/oh-my-music.jpg" alt="">
                    <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                        <h3 class="text-lg lg:text-xl font-medium">Oh My Music (2020)</h3>
                    </div>
                </a>
            </div>
            <div class="col-span-12 md:col-span-6">
                <div class="flex">
                    <a class="flex items-center font-medium ml-auto mt-auto" href="https://github.com/AccessRetrieved">
                        See all works
                        <svg class="ml-4" width="11" height="18" viewBox="0 0 11 18" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" clip-rule="evenodd"
                                d="M7.29289 9.00008L0 1.70718L1.41421 0.292969L10.1213 9.00008L1.41421 17.7072L0 16.293L7.29289 9.00008Z"
                                fill="black" />
                        </svg>
                    </a>
                </div>
            </div>
        </div>`;
    } else {
        document.getElementById('projects').innerHTML = `
        <div class="container grid grid-cols-12 gap-8">
    <div class="col-span-12 md:col-span-6">
        <!-- Project card -->
        <a href="https://github.com/AccessRetrieved/codegpt" class="block relative mb-16">
            <img class="relative -z-10" src="assets/img/CodeGPT.jpeg" alt="">
            <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                <h3 class="text-lg lg:text-xl font-medium">CodeGPT (2025)</h3>
                <p>Hacks for Hackers, Major Leagues Hacking</p>
            </div>
        </a>
        <!-- Project card -->
        <a href="https://constellationhub.org" class="block relative mb-16">
            <img class="relative -z-10" src="assets/img/constellation.jpg" alt="">
            <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                <h3 class="text-lg lg:text-xl font-medium">Constellation Networking (2023 - Present)</h3>
            </div>
        </a>
        <!-- Project card -->
        <a href="" class="block relative mb-16">
            <img class="relative -z-10" src="assets/img/postman.jpg" alt="">
            <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                <h3 class="text-lg lg:text-xl font-medium">App Postman (2021)</h3>
            </div>
        </a>
    </div>
    <div class="col-span-12 md:col-span-6">
        <!-- Project card -->
        <a href="https://github.com/AccessRetrieved/medlinks" class="block relative mb-16 mt-40">
            <img class="relative -z-10" src="assets/img/medlinks.jpeg" alt="">
            <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                <h3 class="text-lg lg:text-xl font-medium">Medlinks (2025)</h3>
                <p>nwHacks, nwPlus + Major Leagues Hacking</p>
            </div>
        </a>
        <!-- Project card -->
        <a href="https://gptnotes.iamjerryhu.org" class="block relative mb-16">
            <img class="relative -z-10" src="assets/img/gptnotes.jpg" alt="">
            <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                <h3 class="text-lg lg:text-xl font-medium">GPTNotes (2022 - 2023)</h3>
            </div>
        </a>
        <!-- Project card -->
        <a href="https://accessretrieved.github.io/Music/" class="block relative mb-16">
            <img class="relative -z-10" src="assets/img/oh-my-music.jpg" alt="">
            <div class="bg-white w-10/12 pt-4 pr-4 -mt-28">
                <h3 class="text-lg lg:text-xl font-medium">Oh My Music (2020)</h3>
            </div>
        </a>
        <div class="flex">
            <a class="flex items-center font-medium ml-auto mt-auto" href="https://github.com/AccessRetrieved">
                See all works
                <svg class="ml-4" width="11" height="18" viewBox="0 0 11 18" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd"
                        d="M7.29289 9.00008L0 1.70718L1.41421 0.292969L10.1213 9.00008L1.41421 17.7072L0 16.293L7.29289 9.00008Z"
                        fill="black" />
                </svg>
            </a>
        </div>
    </div>
</div>`;

        document.getElementById('cursor').style.display = 'block';
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
    }
});