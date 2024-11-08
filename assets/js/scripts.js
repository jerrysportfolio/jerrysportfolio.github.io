const mobileMenuTrigger = document.querySelector('#mobile_menu_trigger');
const mobileMenuClose = document.querySelector('#mobile_menu_close');
const mobileMenu = document.querySelector('#mobile_menu');

//  Open mobile menu
mobileMenuTrigger.addEventListener('click', function () {
    mobileMenu.classList.remove('translate-x-full');
    mobileMenu.classList.add('translate-x-0');
});

//  Close mobile menu
mobileMenuClose.addEventListener('click', function () {
    mobileMenu.classList.add('translate-x-full');
    mobileMenu.classList.remove('translate-x-0');
});

document.getElementById('send').addEventListener('click', function () {
    name = document.getElementById('name').value;
    email = document.getElementById('email').value;
    subject = document.getElementById('subject').value;
    message = document.getElementById('message').value;

    // draft email
    window.location = `mailto:${email}?subject=${subject}&body=${message}`;
});