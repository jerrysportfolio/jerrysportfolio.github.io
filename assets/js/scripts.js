document.addEventListener('DOMContentLoaded', function () {
    const mobileMenuTrigger = document.getElementById('mobile_menu_trigger');
    const mobileMenuClose = document.querySelector('#mobile_menu_close');
    const mobileMenu = document.querySelector('#mobile_menu');

    // Check if elements exist before adding event listeners
    if (mobileMenuTrigger && mobileMenuClose && mobileMenu) {
        // Open mobile menu
        mobileMenuTrigger.addEventListener('click', function () {
            mobileMenu.classList.remove('translate-x-full');
            mobileMenu.classList.add('translate-x-0');
        });

        // Close mobile menu
        mobileMenuClose.addEventListener('click', function () {
            mobileMenu.classList.add('translate-x-full');
            mobileMenu.classList.remove('translate-x-0');
        });
    } else {
        console.error('Menu elements not found in the DOM');
    }
});
