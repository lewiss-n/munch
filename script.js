(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mobile navigation
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNav');

  const closeMenu = () => {
    mobileNav?.classList.remove('open');
    mobileNav?.setAttribute('aria-hidden', 'true');
    menuToggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  menuToggle?.addEventListener('click', () => {
    const willOpen = !mobileNav.classList.contains('open');
    mobileNav.classList.toggle('open', willOpen);
    mobileNav.setAttribute('aria-hidden', String(!willOpen));
    menuToggle.setAttribute('aria-expanded', String(willOpen));
    document.body.classList.toggle('nav-open', willOpen);
  });

  mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  // Hero typewriter
  const typewriter = document.getElementById('typewriter');
  const words = ['JOY.', 'CRUNCH.', 'CREAM.', 'CHOCOLATE.'];

  if (typewriter && !reducedMotion) {
    let wordIndex = 0;
    let charIndex = words[0].length;
    let deleting = true;

    const tick = () => {
      const word = words[wordIndex];

      if (deleting) {
        charIndex -= 1;
        typewriter.textContent = word.slice(0, Math.max(0, charIndex));
        if (charIndex <= 0) {
          deleting = false;
          wordIndex = (wordIndex + 1) % words.length;
          setTimeout(tick, 260);
          return;
        }
        setTimeout(tick, 55);
      } else {
        const nextWord = words[wordIndex];
        charIndex += 1;
        typewriter.textContent = nextWord.slice(0, charIndex);
        if (charIndex >= nextWord.length) {
          deleting = true;
          setTimeout(tick, 1450);
          return;
        }
        setTimeout(tick, 82);
      }
    };

    setTimeout(tick, 1300);
  }

  // Entrance reveals
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -30px 0px' });

    reveals.forEach((el, index) => {
      el.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
      observer.observe(el);
    });
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  // Biscuit parallax: additive offsets are applied through CSS translate.
  const stage = document.getElementById('biscuitStage');
  if (stage && window.matchMedia('(pointer:fine)').matches && !reducedMotion) {
    const biscuits = [...stage.querySelectorAll('[data-depth]')];

    stage.addEventListener('pointermove', (event) => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      biscuits.forEach((biscuit) => {
        const depth = Number(biscuit.dataset.depth || 10);
        biscuit.style.translate = `${x * depth}px ${y * depth}px`;
      });
    });

    stage.addEventListener('pointerleave', () => {
      biscuits.forEach((biscuit) => { biscuit.style.translate = '0 0'; });
    });
  }

  // Mood-card feedback
  const toast = document.getElementById('toast');
  let toastTimer;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  document.querySelectorAll('.mood-card').forEach((card) => {
    card.addEventListener('click', () => showToast(card.dataset.toast || 'Excellent crunch choice.'));
  });


  // Product catalogue filters + pagination
  const catalogueFilters = [...document.querySelectorAll('.catalogue-filter')];
  const productCards = [...document.querySelectorAll('.product-card')];
  const catalogueStatus = document.getElementById('catalogueStatus');
  const cataloguePagination = document.getElementById('cataloguePagination');
  const cataloguePages = document.getElementById('cataloguePages');
  const cataloguePrev = document.getElementById('cataloguePrev');
  const catalogueNext = document.getElementById('catalogueNext');
  const productGrid = document.getElementById('productGrid');
  const catalogueEmpty = document.getElementById('catalogueEmpty');
  const catalogueSectionLabels = Object.fromEntries(
    catalogueFilters.map((button) => [
      button.dataset.filter || '',
      button.dataset.label || button.textContent.trim()
    ])
  );

  let activeCatalogueFilter = catalogueFilters[0]?.dataset.filter || 'biscuits';
  let currentCataloguePage = 1;
  const getCataloguePageSize = () => window.matchMedia('(max-width: 760px)').matches ? 4 : 6;
  let cataloguePageSize = getCataloguePageSize();

  const getFilteredProducts = () => productCards.filter((card) => {
    const categories = (card.dataset.category || '').split(/\s+/).filter(Boolean);
    return categories.includes(activeCatalogueFilter);
  });

  const updatePaginationButtons = (totalPages) => {
    if (!cataloguePages || !cataloguePagination) return;

    cataloguePages.replaceChildren();
    cataloguePagination.hidden = totalPages <= 1;

    for (let page = 1; page <= totalPages; page += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pagination-page';
      button.textContent = String(page);
      button.setAttribute('aria-label', `Go to catalogue page ${page}`);
      if (page === currentCataloguePage) {
        button.classList.add('is-active');
        button.setAttribute('aria-current', 'page');
      }
      button.addEventListener('click', () => {
        currentCataloguePage = page;
        renderCatalogue(true);
      });
      cataloguePages.appendChild(button);
    }

    if (cataloguePrev) cataloguePrev.disabled = currentCataloguePage <= 1;
    if (catalogueNext) catalogueNext.disabled = currentCataloguePage >= totalPages;
  };

  const renderCatalogue = (scrollToGrid = false) => {
    const matches = getFilteredProducts();
    const totalPages = Math.max(1, Math.ceil(matches.length / cataloguePageSize));
    currentCataloguePage = Math.min(Math.max(currentCataloguePage, 1), totalPages);

    const firstIndex = (currentCataloguePage - 1) * cataloguePageSize;
    const lastIndex = Math.min(firstIndex + cataloguePageSize, matches.length);
    const visibleCards = new Set(matches.slice(firstIndex, lastIndex));

    productCards.forEach((card) => {
      const show = visibleCards.has(card);
      card.classList.toggle('is-hidden', !show);
      if (show) card.classList.add('is-visible');
    });

    updatePaginationButtons(totalPages);

    const sectionLabel = catalogueSectionLabels[activeCatalogueFilter] || activeCatalogueFilter;

    if (catalogueEmpty) {
      const isEmpty = matches.length === 0;
      catalogueEmpty.hidden = !isEmpty;
      if (isEmpty) catalogueEmpty.textContent = `No ${sectionLabel.toLowerCase()} products have been added to the catalogue yet.`;
    }

    if (catalogueStatus) {
      if (matches.length === 0) {
        catalogueStatus.textContent = `No products found in ${sectionLabel}.`;
      } else {
        catalogueStatus.textContent = `Showing ${sectionLabel} ${firstIndex + 1}–${lastIndex} of ${matches.length} — page ${currentCataloguePage} of ${totalPages}.`;
      }
    }

    if (scrollToGrid && productGrid) {
      productGrid.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  };

  catalogueFilters.forEach((filterButton) => {
    filterButton.addEventListener('click', () => {
      activeCatalogueFilter = filterButton.dataset.filter || 'biscuits';
      currentCataloguePage = 1;

      catalogueFilters.forEach((button) => {
        const active = button === filterButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      renderCatalogue(false);
    });
  });

  cataloguePrev?.addEventListener('click', () => {
    if (currentCataloguePage <= 1) return;
    currentCataloguePage -= 1;
    renderCatalogue(true);
  });

  catalogueNext?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredProducts().length / cataloguePageSize));
    if (currentCataloguePage >= totalPages) return;
    currentCataloguePage += 1;
    renderCatalogue(true);
  });

  let paginationResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(paginationResizeTimer);
    paginationResizeTimer = setTimeout(() => {
      const nextPageSize = getCataloguePageSize();
      if (nextPageSize !== cataloguePageSize) {
        cataloguePageSize = nextPageSize;
        currentCataloguePage = 1;
        renderCatalogue(false);
      }
    }, 120);
  });

  renderCatalogue(false);

  // Snack lottery: every catalogue card has an equal probability of becoming the winner.
  const snackWheel = document.getElementById('snackWheel');
  const snackWheelCandidates = document.getElementById('snackWheelCandidates');
  const snackSpin = document.getElementById('snackSpin');
  const snackWheelStatus = document.getElementById('snackWheelStatus');
  const snackModal = document.getElementById('snackModal');
  const snackModalDialog = document.getElementById('snackModalDialog');
  const snackModalClose = document.getElementById('snackModalClose');
  const snackResultImage = document.getElementById('snackResultImage');
  const snackResultKicker = document.getElementById('snackResultKicker');
  const snackResultName = document.getElementById('snackResultName');
  const snackResultPack = document.getElementById('snackResultPack');
  const snackViewProduct = document.getElementById('snackViewProduct');
  const snackSpinAgain = document.getElementById('snackSpinAgain');
  const snackConfetti = document.getElementById('snackConfetti');

  // Fully saturated carnival palette — no pastels or off-whites, so every wedge reads bright.
  const snackPalette = ['#ffe600', '#ff4b12', '#00b2ff', '#ff2b86', '#4cd914', '#9333ff'];
  const snackSegmentCount = Math.min(12, productCards.length);
  let snackCandidates = [];
  let snackWinner = null;
  let snackRotation = 0;
  let snackIsSpinning = false;

  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const productDataFromCard = (card) => ({
    card,
    name: card.querySelector('.product-info h3')?.textContent.trim() || 'Manji snack',
    pack: card.querySelector('.product-info > span')?.textContent.trim() || '',
    category: (card.dataset.category || 'biscuits').split(/\s+/)[0],
    categoryLabel: card.querySelector('.product-category')?.textContent.trim() || 'BISCUITS',
    image: card.querySelector('.product-media img')?.getAttribute('src') || '',
    alt: card.querySelector('.product-media img')?.getAttribute('alt') || ''
  });

  const paintSnackWheel = () => {
    if (!snackWheel || !snackWheelCandidates || !snackSegmentCount) return;

    snackCandidates = shuffle(productCards).slice(0, snackSegmentCount).map(productDataFromCard);
    const segmentSize = 360 / snackSegmentCount;
    const colorStops = snackCandidates.map((_, index) => {
      const start = index * segmentSize;
      const end = (index + 1) * segmentSize;
      const color = snackPalette[index % snackPalette.length];
      return `${color} ${start}deg ${end - 1.35}deg, #17195f ${end - 1.35}deg ${end}deg`;
    });
    snackWheel.style.background = `conic-gradient(from -${segmentSize / 2}deg, ${colorStops.join(', ')})`;
    snackWheelCandidates.replaceChildren();

    snackCandidates.forEach((product, index) => {
      const angle = index * segmentSize;
      const slot = document.createElement('span');
      slot.className = 'snack-wheel-slot';
      slot.style.setProperty('--slot-angle', `${angle}deg`);
      slot.title = `${product.name}${product.pack ? ` — ${product.pack}` : ''}`;

      const image = document.createElement('img');
      image.src = product.image;
      image.alt = '';
      image.decoding = 'async';
      slot.appendChild(image);
      snackWheelCandidates.appendChild(slot);
    });
  };

  const burstSnackConfetti = () => {
    if (!snackConfetti || reducedMotion) return;
    snackConfetti.replaceChildren();
    const pieces = 58;
    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('i');
      piece.style.setProperty('--x', `${4 + Math.random() * 92}%`);
      piece.style.setProperty('--drift', `${-180 + Math.random() * 360}px`);
      piece.style.setProperty('--fall', `${420 + Math.random() * 220}px`);
      piece.style.setProperty('--spin', `${360 + Math.random() * 900}deg`);
      piece.style.setProperty('--delay', `${Math.random() * 0.18}s`);
      piece.style.setProperty('--duration', `${0.85 + Math.random() * 0.7}s`);
      piece.style.setProperty('--confetti', snackPalette[i % snackPalette.length]);
      snackConfetti.appendChild(piece);
    }
    snackConfetti.classList.remove('is-bursting');
    // Force a reflow so consecutive spins restart the animation.
    void snackConfetti.offsetWidth;
    snackConfetti.classList.add('is-bursting');
    window.setTimeout(() => snackConfetti?.classList.remove('is-bursting'), 1800);
  };

  const closeSnackModal = ({ returnFocus = true } = {}) => {
    if (!snackModal || snackModal.hidden) return;
    snackModal.classList.remove('is-open');
    document.body.classList.remove('snack-modal-open');
    const finish = () => {
      snackModal.hidden = true;
      snackConfetti?.classList.remove('is-bursting');
      if (returnFocus) snackSpin?.focus();
    };
    if (reducedMotion) finish();
    else window.setTimeout(finish, 260);
  };

  const openSnackModal = (winner) => {
    if (!snackModal) return;
    if (snackResultImage) {
      snackResultImage.src = winner.image;
      snackResultImage.alt = winner.alt || `${winner.name} pack`;
    }
    if (snackResultKicker) snackResultKicker.textContent = `THE WHEEL SAYS · ${winner.categoryLabel}`;
    if (snackResultName) snackResultName.textContent = winner.name;
    if (snackResultPack) snackResultPack.textContent = winner.pack ? `${winner.pack} · This is your sign.` : 'This is your sign.';
    snackModal.hidden = false;
    document.body.classList.add('snack-modal-open');
    requestAnimationFrame(() => {
      snackModal.classList.add('is-open');
      snackModalClose?.focus({ preventScroll: true });
      burstSnackConfetti();
    });
  };

  const revealSnackWinner = (winner) => {
    snackWinner = winner;
    if (snackWheelStatus) snackWheelStatus.textContent = `Snack fate picked ${winner.name}${winner.pack ? `, ${winner.pack}` : ''}. Spin again if you dare.`;
    openSnackModal(winner);
  };

  const spinSnackWheel = () => {
    if (!snackWheel || !snackSpin || snackIsSpinning || productCards.length === 0) return;
    snackIsSpinning = true;
    snackSpin.disabled = true;
    snackSpin.classList.add('is-spinning');
    snackWheel.setAttribute('aria-busy', 'true');
    if (snackWheelStatus) snackWheelStatus.textContent = 'Shuffling every pack… snack fate is spinning.';

    // Each spin draws a fresh, unique set of contenders from the complete catalogue.
    paintSnackWheel();
    const winnerIndex = Math.floor(Math.random() * snackCandidates.length);
    const winner = snackCandidates[winnerIndex];
    const segmentSize = 360 / snackSegmentCount;
    const currentNorm = ((snackRotation % 360) + 360) % 360;
    const targetNorm = (360 - winnerIndex * segmentSize) % 360;
    const alignmentDelta = (targetNorm - currentNorm + 360) % 360;
    const extraTurns = 5 + Math.floor(Math.random() * 3);
    snackRotation += extraTurns * 360 + alignmentDelta;

    if (reducedMotion) {
      snackWheel.style.transition = 'none';
      snackWheel.style.transform = `rotate(${snackRotation}deg)`;
    } else {
      snackWheel.style.transition = 'transform 4.8s cubic-bezier(.12,.76,.08,1)';
      snackWheel.style.transform = `rotate(${snackRotation}deg)`;
    }

    const finishDelay = reducedMotion ? 180 : 4900;
    window.setTimeout(() => {
      revealSnackWinner(winner);
      snackIsSpinning = false;
      snackSpin.disabled = false;
      snackSpin.classList.remove('is-spinning');
      snackWheel.removeAttribute('aria-busy');
      snackSpin.querySelector('strong').textContent = 'SPIN AGAIN';
    }, finishDelay);
  };

  snackSpin?.addEventListener('click', spinSnackWheel);
  snackModalClose?.addEventListener('click', () => closeSnackModal());
  snackModal?.querySelector('[data-snack-modal-close]')?.addEventListener('click', () => closeSnackModal());
  snackSpinAgain?.addEventListener('click', () => {
    closeSnackModal({ returnFocus: false });
    window.setTimeout(spinSnackWheel, reducedMotion ? 20 : 285);
  });

  snackViewProduct?.addEventListener('click', () => {
    if (!snackWinner?.card) return;
    closeSnackModal({ returnFocus: false });
    activeCatalogueFilter = snackWinner.category;
    currentCataloguePage = 1;

    catalogueFilters.forEach((button) => {
      const active = button.dataset.filter === activeCatalogueFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const matches = getFilteredProducts();
    const winnerIndex = matches.indexOf(snackWinner.card);
    if (winnerIndex >= 0) currentCataloguePage = Math.floor(winnerIndex / cataloguePageSize) + 1;
    renderCatalogue(false);

    window.setTimeout(() => {
      snackWinner.card.classList.add('snack-picked');
      snackWinner.card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      window.setTimeout(() => snackWinner?.card.classList.remove('snack-picked'), 2200);
    }, reducedMotion ? 30 : 300);
  });

  paintSnackWheel();


  // Chat
  const chatFab = document.getElementById('chatFab');
  const chatPanel = document.getElementById('chatPanel');
  const chatClose = document.getElementById('chatClose');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatBody = document.getElementById('chatBody');

  const productKnowledge = {
    digestive: 'Digestive options include The Real Digestive Kadogo in 4-piece packs and 36 × 4-piece cartons, plus Chocolate Digestive 150g.',
    duos: 'Duos Original brings chocolate biscuit and a milky cream centre together, with 30g and 60g packs in the catalogue.',
    sesamix: 'Sesamix is a savoury sesame cracker with a crisp, toasty snap, available here in 33g, 33g carton and 150g formats.',
    almond: 'Pure Butter Almond Cookies are rich, buttery and made for a slower tea break.',
    cashew: 'For cashew, the catalogue has Butter Cashew Cookies 450g and Treat Cashew Biscuits 240g — both rich and nutty.',
    'choco chip': 'Choco Chip Cookies are a classic cookie-style pick with chocolate chips.',
    bourbon: 'Bourbon Chocolate Cream is a deeper chocolate-and-cream choice.',
    'choco fingers': 'Choco Fingers are a more indulgent chocolate-coated biscuit option.',
    'choco digestive': 'Choco Digestive brings chocolate to the familiar digestive style.',
    chox: 'Manji Chox is a bold chocolate-flavoured biscuit option.',
    assorted: 'The catalogue includes Assorted Biscuits, the Assorted Budget Pack and Assorted Creams.',
    baring: 'Baring Biscuits are available in classic family and smaller pack formats in the catalogue.',
    'big family': 'Big Family is a crisp, shareable classic biscuit pack.',
    'cake snack': 'Cake Snack Orange & Choco is the soft baked-snack option in the catalogue.',
    'banana wafer': 'Banana Wafers are light, crisp and fruity.',
    'chocolate wafer': 'Chocolate Wafers are light and crisp; the catalogue also includes Swiss Chocolate Wafer 30g.',
    'cream crackers': 'Cream Crackers 160g are a crisp, savoury tea-time option.',
    'dinner crackers': 'Dinner Crackers are listed in a 200g sugar-free box.',
    'orange cream': 'Orange Cream brings a bright citrus cream filling to a crisp biscuit, with 78g and 160g packs in the catalogue.',
    'vanilla cream': 'Vanilla Cream 78g is a light, creamy vanilla-filled biscuit.',
    'strawberry cream': 'Strawberry Cream is available in 78g and 160g packs, with a fruity cream filling and sweet berry note.',
    'treat chocolate': 'Treat Chocolate Biscuits come in a 240g box for a rich chocolate biscuit crunch.',
    'treat butter': 'Treat Butter Biscuits come in a 240g box with a buttery, classic profile.',
    'so nice': 'So Nice Coconut Biscuits are available as a 100g pack and a 1kg tin.',
    'strawberry wafer': 'Strawberry Wafers are light, crisp and fruity.',
    'sugar free': 'The catalogue includes a Sugar Free range spanning crackers and other assorted packs.',
    'swiss': 'Swiss Chocolate Wafer is listed in a 30g outer carton.',
    'tea biscuits': 'Tea Biscuits 100g are a simple, classic tea-time crunch.',
    shortbread: 'Shortbread Biscuits are listed in a 200g box.',
    shortcake: 'Shortcake Biscuits are available in 100g, 1kg jar, 1kg tin and 2.25kg carton formats.',
    'pineapple cream': 'Pineapple Cream Biscuits are listed in a 160g pack with a fruity cream filling.',
    'orange wafer': 'Orange Wafers add a bright citrus option to the wafer range.',
    'marie classic': 'Marie Classic is listed as a 75g pack and a 36 × 75g outer carton.',
    marie: 'Marie Biscuits are listed in a 200g box and a 1kg budget pack.',
    'merry milk': 'Merry Milk Biscuits are listed as an outer carton containing 72 four-piece packs.',
    milkstar: 'Milkstar Milk Biscuits are listed as a 40g four-piece pack plus its outer carton.',
    'morning breeze': 'Morning Breeze is a 300g variety pack with a mix of classic biscuit styles.',
    'nice coconut': 'Nice Coconut Biscuits are listed in 200g, 1kg budget pack and 2.25kg carton formats.',
    glucose: 'Glucose Biscuits are listed in 4-piece, 35g, 100g and 200g packs plus a 72 × 4-piece outer carton.',
    gingernut: 'Gingernut Biscuits are listed in a 70g pack and a 60-piece outer carton.',
    'ginger classic': 'Ginger Classic Biscuits are listed in a 75g pack with ginger and honey.',
    'ginger cookies': 'Ginger Cookies are listed in a 500g box.',
    'ginger snaps': 'Ginger Snaps are listed in 200g, 1kg jar and 1kg tin formats.',
    'cream biscuits': 'The cream biscuit range includes assorted, chocolate, orange, vanilla, strawberry and other cream-filled favourites.'
  };

  const addChatMessage = (text, type = 'bot') => {
    const row = document.createElement('div');
    row.className = `chat-msg ${type}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    chatBody?.appendChild(row);
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    return row;
  };

  const botReply = (message) => {
    const q = message.toLowerCase().replace(/[’']/g, "'");

    for (const [key, value] of Object.entries(productKnowledge)) {
      if (q.includes(key)) return value;
    }

    if (/^(hi|hey|hello|jambo|sasa)\b/.test(q)) return 'Jambo 👋 Tell me your mood: tea-time, creamy, chocolatey, savoury, cookies or wafers.';
    if (q.includes('tea') || q.includes('chai') || q.includes('breakfast')) return 'For tea, start classic with Digestive, Marie or Milkstar. Want variety? Morning Breeze mixes several biscuit styles. Want savoury? Go Sesamix.';
    if (q.includes('chocolate') || q.includes('chocolatey') || q.includes('choco')) return 'Chocolate mood? Try Bourbon, Manji Chox, Choco Chip Cookies, Chocolate Wafers, Treat Chocolate or Swiss Chocolate Wafer.';
    if (q.includes('cream') || q.includes('creamy') || q.includes('filled')) return 'Creamy mood? Explore Assorted Creams, Chocolate Cream, Orange Cream, Vanilla Cream, Strawberry Cream or Pineapple Cream — with additional 160g cream packs in the catalogue.';
    if (q.includes('savoury') || q.includes('savory') || q.includes('sesame') || q.includes('cracker')) return 'For savoury crunch, try Cream Crackers or Sesamix.';
    if (q.includes('cookie')) return 'Cookie mood? Look for Pure Butter Almond, Butter Cashew or Choco Chip Cookies.';
    if (q.includes('wafer')) return 'Wafer mood? Choose Banana, Orange, Strawberry, Chocolate or Swiss Chocolate Wafer — all light and crisp in different flavour directions.';
    if (q.includes('recommend') || q.includes('choose') || q.includes('try') || q.includes('best') || q.includes('pick')) return 'Give me one word — creamy, chocolatey, savoury, cookie, wafer or tea-time — and I’ll point you somewhere tasty.';
    if (q.includes('1954') || q.includes('history') || q.includes('story') || q.includes('heritage')) return 'Manji’s story began in Kenya in 1954. For over 70 years, the brand has been part of tea breaks, lunchboxes, celebrations and family traditions.';
    if (q.includes('kenya') || q.includes('kenyan') || q.includes('east africa')) return 'Manji is proudly Kenyan, with roots dating back to 1954 and a growing footprint across East Africa.';
    if (q.includes('diamond') || q.includes('quality') || q.includes('standard') || q.includes('safe')) return 'Manji highlights the Diamond Mark of Quality, carefully selected ingredients, modern manufacturing and rigorous food-safety standards.';
    if (q.includes('100') || q.includes('sku') || q.includes('range') || q.includes('products')) return 'Manji’s wider portfolio includes 100+ SKUs across biscuits and baked snacks.';
    if (q.includes('ingredient') || q.includes('allergen') || q.includes('nutrition')) return 'For ingredient, allergen or nutrition details, use the information printed on the specific pack or contact Manji directly.';
    if (q.includes('price') || q.includes('buy') || q.includes('shop') || q.includes('store') || q.includes('stock')) return 'This site does not show live prices or stock. Contact Manji at info@manji.co.ke or +254 722 203 626.';
    if (q.includes('contact') || q.includes('email') || q.includes('phone')) return 'You can reach Manji at info@manji.co.ke or +254 722 203 626.';

    return 'I can help with biscuit moods, tea-time picks, chocolatey choices, the Manji story, quality and contact details. Try “What should I have with tea?”';
  };

  const sendChat = (message) => {
    const text = message.trim();
    if (!text) return;
    addChatMessage(text, 'user');
    chatInput.value = '';

    const typing = addChatMessage('', 'bot');
    typing.querySelector('.chat-bubble').innerHTML = '<span class="typing" aria-label="Manji is typing"><i></i><i></i><i></i></span>';
    setTimeout(() => {
      typing.remove();
      addChatMessage(botReply(text), 'bot');
    }, 420);
  };

  const openChat = () => {
    chatPanel?.classList.add('open');
    chatPanel?.setAttribute('aria-hidden', 'false');
    chatFab?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('chat-open');
    setTimeout(() => chatInput?.focus(), 140);
  };

  const closeChat = () => {
    chatPanel?.classList.remove('open');
    chatPanel?.setAttribute('aria-hidden', 'true');
    chatFab?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('chat-open');
    chatFab?.focus();
  };

  chatFab?.addEventListener('click', () => chatPanel?.classList.contains('open') ? closeChat() : openChat());
  chatClose?.addEventListener('click', closeChat);
  chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendChat(chatInput?.value || '');
  });
  document.querySelectorAll('.chat-chip').forEach((chip) => {
    chip.addEventListener('click', () => sendChat(chip.dataset.question || chip.textContent || ''));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (snackModal && !snackModal.hidden) closeSnackModal();
      if (chatPanel?.classList.contains('open')) closeChat();
      if (mobileNav?.classList.contains('open')) closeMenu();
    }
  });

  // Bestseller shortcuts: send the shopper straight to that exact pack in the catalogue.
  const findProductCardByImage = (filename) => productCards.find((card) => {
    const src = card.querySelector('.product-media img')?.getAttribute('src') || '';
    return src.endsWith(filename);
  }) || null;

  const jumpToCatalogueCard = (card) => {
    if (!card) return;

    activeCatalogueFilter = (card.dataset.category || 'biscuits').split(/\s+/)[0];
    currentCataloguePage = 1;

    catalogueFilters.forEach((button) => {
      const active = button.dataset.filter === activeCatalogueFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const matches = getFilteredProducts();
    const index = matches.indexOf(card);
    if (index >= 0) currentCataloguePage = Math.floor(index / cataloguePageSize) + 1;
    renderCatalogue(false);

    window.setTimeout(() => {
      card.classList.add('snack-picked');
      card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      window.setTimeout(() => card.classList.remove('snack-picked'), 2200);
    }, reducedMotion ? 30 : 140);
  };

  document.querySelectorAll('[data-bestseller-jump]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      jumpToCatalogueCard(findProductCardByImage(trigger.dataset.bestsellerJump || ''));
    });
  });


  // Cookie cursor: a bitten biscuit follows the mouse and sheds crumbs on click.
  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    const cookieCursor = document.createElement('div');
    cookieCursor.className = 'cookie-cursor';
    cookieCursor.setAttribute('aria-hidden', 'true');
    cookieCursor.innerHTML = [
      '<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" focusable="false">',
      '<defs>',
      '<mask id="manjiCookieBite">',
      '<rect fill="#fff" height="44" width="44" x="0" y="0"/>',
      '<circle cx="37" cy="7.5" fill="#000" r="10"/>',
      '</mask>',
      '<clipPath id="manjiCookieBody">',
      '<circle cx="22" cy="22" r="15.4"/>',
      '</clipPath>',
      '</defs>',
      '<g mask="url(#manjiCookieBite)">',
      '<circle cx="22" cy="22" fill="#d99b52" r="15.4" stroke="#7c4a1c" stroke-width="2.4"/>',
      '<path d="M13.4 14.6a11.6 11.6 0 0 1 6.6-4.1" fill="none" stroke="rgba(255,255,255,.55)" stroke-linecap="round" stroke-width="2.1"/>',
      '<circle cx="16.2" cy="18" fill="#5b3212" r="2.7"/>',
      '<circle cx="25.8" cy="16.9" fill="#5b3212" r="2"/>',
      '<circle cx="19.6" cy="27.4" fill="#5b3212" r="2.4"/>',
      '<circle cx="28.2" cy="26" fill="#5b3212" r="1.9"/>',
      '<circle cx="12.9" cy="25.4" fill="#5b3212" r="1.6"/>',
      '</g>',
      '<g clip-path="url(#manjiCookieBody)">',
      '<circle cx="37" cy="7.5" fill="none" r="10" stroke="#7c4a1c" stroke-width="2.4"/>',
      '</g>',
      '</svg>'
    ].join('');

    const crumbLayer = document.createElement('div');
    crumbLayer.className = 'cookie-crumbs';
    crumbLayer.setAttribute('aria-hidden', 'true');

    document.body.append(cookieCursor, crumbLayer);
    document.body.classList.add('cookie-cursor-on');

    const hotSelector = 'a,button,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])';
    const textSelector = 'input,textarea,[contenteditable="true"]';
    const crumbTones = ['#c8843d', '#a9662a', '#e0aa63', '#5b3212', '#7d4a1c'];

    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let renderX = pointerX;
    let renderY = pointerY;
    let tilt = 0;
    let scaleNow = 1;
    let isHot = false;
    let isPressed = false;
    let hasMoved = false;
    let lastHoverTarget = null;
    let lastFrame = 0;

    // Frame-rate independent easing: the same visual damping on 60Hz and 144Hz.
    const damp = (rate, step) => (reducedMotion ? 1 : 1 - Math.pow(1 - rate, step));

    let hoverDirty = false;

    const setHoverState = (target) => {
      lastHoverTarget = target;
      const overText = !!target?.closest(textSelector);
      isHot = !overText && !!target?.closest(hotSelector);
      cookieCursor.classList.toggle('is-hidden', overText);
    };

    // Scrolling, filtering and modals can swap what sits under a stationary
    // cursor, so re-read the element under the pointer instead of waiting
    // for the next pointermove.
    const markHoverDirty = () => { hoverDirty = true; };
    window.addEventListener('scroll', markHoverDirty, { passive: true });
    window.addEventListener('resize', markHoverDirty, { passive: true });

    document.addEventListener('pointermove', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      pointerX = event.clientX;
      pointerY = event.clientY;

      if (!hasMoved) {
        hasMoved = true;
        renderX = pointerX;
        renderY = pointerY;
        cookieCursor.classList.add('is-ready');
      }

      // closest() is only recomputed when the element under the pointer actually
      // changes, so long drags across one element stay cheap.
      const target = event.target instanceof Element ? event.target : null;
      if (target !== lastHoverTarget) setHoverState(target);
      hoverDirty = false;

      cookieCursor.classList.remove('is-out');
    }, { passive: true });

    const spawnCrumbs = (originX, originY) => {
      if (reducedMotion) return;
      const count = 7 + Math.floor(Math.random() * 5);

      for (let i = 0; i < count; i += 1) {
        const crumb = document.createElement('i');
        crumb.className = 'cookie-crumb';
        crumb.style.setProperty('--x', `${originX.toFixed(1)}px`);
        crumb.style.setProperty('--y', `${originY.toFixed(1)}px`);
        crumb.style.setProperty('--dx', `${-72 + Math.random() * 144}px`);
        crumb.style.setProperty('--rise', `${-(24 + Math.random() * 32)}px`);
        crumb.style.setProperty('--fall', `${54 + Math.random() * 52}px`);
        crumb.style.setProperty('--spin', `${-340 + Math.random() * 680}deg`);
        crumb.style.setProperty('--dur', `${(0.62 + Math.random() * 0.36).toFixed(2)}s`);
        crumb.style.setProperty('--size', `${(3 + Math.random() * 4).toFixed(1)}px`);
        crumb.style.setProperty('--radius', Math.random() > 0.45 ? '50%' : '2px');
        crumb.style.setProperty('--tone', crumbTones[Math.floor(Math.random() * crumbTones.length)]);
        crumb.appendChild(document.createElement('b'));
        crumb.addEventListener('animationend', () => crumb.remove(), { once: true });
        crumbLayer.appendChild(crumb);
      }

      // Safety valve in case a tab is backgrounded mid-animation and events never fire.
      while (crumbLayer.childElementCount > 120) crumbLayer.firstElementChild?.remove();
    };

    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      isPressed = true;
      // Crumbs erupt from where the cookie is drawn, not where the raw pointer is,
      // so the burst always lines up with the biscuit even mid-movement.
      spawnCrumbs(renderX, renderY);
    }, { passive: true });

    const releasePress = () => { isPressed = false; hoverDirty = true; };
    document.addEventListener('pointerup', releasePress, { passive: true });
    document.addEventListener('pointercancel', releasePress, { passive: true });
    window.addEventListener('blur', () => {
      releasePress();
      cookieCursor.classList.add('is-out');
    });

    document.documentElement.addEventListener('mouseleave', () => cookieCursor.classList.add('is-out'));
    document.documentElement.addEventListener('mouseenter', (event) => {
      // Snap on re-entry so the cookie never sweeps across the whole viewport.
      pointerX = renderX = event.clientX;
      pointerY = renderY = event.clientY;
      cookieCursor.classList.remove('is-out');
    });

    const followPointer = (now) => {
      const step = lastFrame ? Math.min(3, (now - lastFrame) / 16.667) : 1;
      lastFrame = now;

      if (hoverDirty && hasMoved) {
        hoverDirty = false;
        const under = document.elementFromPoint(pointerX, pointerY);
        if (under !== lastHoverTarget) setHoverState(under);
      }

      const deltaX = pointerX - renderX;
      const deltaY = pointerY - renderY;
      const positionEase = damp(0.55, step);
      renderX += deltaX * positionEase;
      renderY += deltaY * positionEase;

      // Lean into the direction of travel, driven by the distance still to cover.
      // The multiplier is tuned against the follow rate above: tighten one and
      // the lean flattens out, so they move together.
      const targetTilt = Math.max(-12, Math.min(12, deltaX * 0.9));
      tilt += (targetTilt - tilt) * damp(0.16, step);

      // One target, one spring: hover grow and press squash can never fight.
      const targetScale = (isHot ? 1.18 : 1) * (isPressed ? 0.82 : 1);
      scaleNow += (targetScale - scaleNow) * damp(0.24, step);

      cookieCursor.style.transform =
        `translate3d(${renderX.toFixed(2)}px, ${renderY.toFixed(2)}px, 0) ` +
        `translate(-50%, -50%) rotate(${tilt.toFixed(2)}deg) scale(${scaleNow.toFixed(4)})`;

      window.requestAnimationFrame(followPointer);
    };

    window.requestAnimationFrame(followPointer);
  }


  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
