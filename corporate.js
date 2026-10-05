(() => {
  const menu = document.getElementById('corpMenu');
  const nav = document.getElementById('corpMobileNav');
  const closeMenu = () => {
    menu?.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('open');
    nav?.setAttribute('aria-hidden', 'true');
  };
  menu?.addEventListener('click', () => {
    const open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('open', open);
    nav?.setAttribute('aria-hidden', String(!open));
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  const contactModal = document.getElementById('corpContactModal');
  const contactDialog = contactModal?.querySelector('.corp-contact-dialog');
  const openContactModal = () => {
    if (!contactModal) return;
    closeMenu();
    contactModal.hidden = false;
    document.body.classList.add('corp-contact-open');
    window.setTimeout(() => contactDialog?.focus(), 0);
  };
  const closeContactModal = () => {
    if (!contactModal) return;
    contactModal.hidden = true;
    document.body.classList.remove('corp-contact-open');
  };
  document.querySelectorAll('[data-contact-open]').forEach(button => button.addEventListener('click', openContactModal));
  contactModal?.querySelectorAll('[data-contact-close]').forEach(button => button.addEventListener('click', closeContactModal));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && contactModal && !contactModal.hidden) closeContactModal(); });

  document.getElementById('corpYear').textContent = String(new Date().getFullYear());
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
  } else {
    items.forEach((item) => item.classList.add('is-visible'));
  }
})();


document.querySelectorAll('.corp-depot-trigger').forEach(trigger => {
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const nav = trigger.closest('.corp-depot-nav');
    const open = nav?.classList.toggle('open');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.corp-depot-nav')) document.querySelectorAll('.corp-depot-nav.open').forEach(n => n.classList.remove('open'));
});
