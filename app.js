(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat('pt-BR');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const favorites = new Set();
  const dialogTriggers = new WeakMap();
  const grid = $('#inventory-grid');
  let cars = [];
  let category = 'all';
  let visibleCount = 6;
  let lastDialogTrigger = null;

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const numeric = value => {
    if (typeof value === 'number') return value;
    const cleaned = String(value ?? '').replace(/[^\d.,]/g, '');
    return Number(cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, '')) || 0;
  };
  const imagePath = car => `assets/car-${car.id}.jpg`;
  const carCategory = car => {
    if (car.category) return normalize(car.category);
    const name = normalize(`${car.name} ${car.version}`);
    return /t-cross|tcross|nivus|tracker|creta|compass|renegade|kicks|hr-v|hrv|wr-v|wrv|ecosport|duster|captur|tiggo|ix35|sportage|tucson|2008|3008|pulse|fastback|\bq[23578]\b|suv/.test(name) ? 'suv' : 'hatch';
  };

  function openDialog(dialog, trigger) {
    if (!dialog) return;
    lastDialogTrigger = trigger || document.activeElement;
    if (dialog.open) return;
    dialogTriggers.set(dialog, lastDialogTrigger);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('dialog-open');
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      restoreDialogFocus(dialog);
    }
  }

  function restoreDialogFocus(dialog) {
    // The previous modal's close event can arrive after a new modal has opened.
    if ($('dialog[open]')) return;
    document.body.classList.remove('dialog-open');
    const trigger = dialogTriggers.get(dialog);
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  }

  function showContact(label, trigger) {
    const title = $('#contact-title');
    if (title) title.textContent = label || 'Vamos encontrar seu próximo carro?';
    const activeDialog = $('dialog[open]');
    const returnTarget = activeDialog ? dialogTriggers.get(activeDialog) : trigger;
    if (activeDialog) closeDialog(activeDialog);
    openDialog($('#contact-dialog'), returnTarget);
  }

  function card(car) {
    const id = escapeHTML(car.id);
    const title = `${car.brand || ''} ${car.name || ''}`.trim();
    const selected = favorites.has(String(car.id));
    const price = numeric(car.price);
    return `<article class="vehicle-card" data-reveal>
      <div class="vehicle-visual">
        <img src="${imagePath(car)}" alt="${escapeHTML(title)}" loading="lazy" decoding="async" width="720" height="500">
        <span class="vehicle-tag">${carCategory(car) === 'suv' ? 'SUV' : 'Selecionado'}</span>
        <button class="vehicle-favorite${selected ? ' is-active' : ''}" type="button" data-favorite="${id}" aria-pressed="${selected}" aria-label="${selected ? 'Remover' : 'Adicionar'} ${escapeHTML(title)} ${selected ? 'dos' : 'aos'} favoritos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button>
      </div>
      <div class="vehicle-body">
        <p class="vehicle-brand">${escapeHTML(car.brand)}</p>
        <h3 class="vehicle-name">${escapeHTML(car.name)}</h3>
        <p class="vehicle-version">${escapeHTML(car.version)}</p>
        <div class="vehicle-specs"><span>${escapeHTML(car.year)}</span><span>${number.format(numeric(car.km))} km</span></div>
        <div class="vehicle-bottom"><div><span class="price-label">Seu próximo capítulo por</span><p class="vehicle-price">${price ? money.format(price) : 'Consulte'}</p></div><button class="vehicle-open" type="button" data-vehicle="${id}" aria-label="Ver detalhes de ${escapeHTML(title)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
      </div>
    </article>`;
  }

  let observer = null;
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    try {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
      }), { threshold: 0.08 });
      document.documentElement.classList.add('reveal-ready');
    } catch {
      document.documentElement.classList.remove('reveal-ready');
    }
  }

  function revealElements(root = document) {
    $$('[data-reveal]', root).forEach(element => {
      if (observer) {
        try { observer.observe(element); }
        catch {
          observer.disconnect();
          observer = null;
          document.documentElement.classList.remove('reveal-ready');
          element.classList.add('is-visible');
        }
      }
      else element.classList.add('is-visible');
    });
  }

  function render() {
    if (!grid) return;
    const query = normalize($('#search-input')?.value).trim();
    const brand = $('#brand-select')?.value || 'all';
    const price = numeric($('#price-select')?.value) || Infinity;
    const filtered = cars.filter(car => {
      const searchable = normalize(`${car.brand} ${car.name} ${car.version} ${car.year}`);
      return (category === 'all' || carCategory(car) === category)
        && (!query || query.split(/\s+/).every(word => searchable.includes(word)))
        && (brand === 'all' || brand === '' || normalize(car.brand) === normalize(brand))
        && numeric(car.price) <= price;
    });
    const count = $('#result-count');
    if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'veículo selecionado' : 'veículos selecionados'}`;
    grid.innerHTML = filtered.length
      ? filtered.slice(0, visibleCount).map(card).join('')
      : '<div class="inventory-empty"><span aria-hidden="true">↗</span><h3>Seu próximo carro pode estar a uma busca de distância.</h3><p>Tente outra marca, modelo ou faixa de preço.</p><button type="button" class="button button-dark" data-reset-filters>Limpar filtros</button></div>';
    const loadMore = $('#load-more');
    if (loadMore) loadMore.hidden = filtered.length <= visibleCount;
    revealElements(grid);
  }

  function showVehicle(id, trigger) {
    const car = cars.find(item => String(item.id) === String(id));
    const detail = $('#vehicle-detail');
    if (!car || !detail) return;
    detail.innerHTML = `<img class="detail-image" src="${imagePath(car)}" alt="${escapeHTML(`${car.brand} ${car.name}`)}"><div class="detail-body"><p class="vehicle-brand">${escapeHTML(car.brand)}</p><h2 id="vehicle-dialog-title">${escapeHTML(car.name)}</h2><p class="vehicle-version">${escapeHTML(car.version)}</p><div class="detail-specs"><span><small>Ano / modelo</small>${escapeHTML(car.year)}</span><span><small>Quilometragem</small>${number.format(numeric(car.km))} km</span></div><p class="vehicle-price">${numeric(car.price) ? money.format(numeric(car.price)) : 'Consulte o valor'}</p><button type="button" class="button button-red" data-demo="Tenho interesse neste ${escapeHTML(car.name)}">Tenho interesse <span aria-hidden="true">↗</span></button><p class="demo-note">Prévia de apresentação. Valores e disponibilidade sujeitos à confirmação pela loja.</p></div>`;
    openDialog($('#vehicle-dialog'), trigger);
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.hasAttribute('data-demo')) {
      event.preventDefault();
      showContact(target.dataset.demo, target);
    }
    if (target.hasAttribute('data-close-dialog')) closeDialog(target.closest('dialog'));
    if (target.hasAttribute('data-vehicle')) showVehicle(target.dataset.vehicle, target);
    if (target.hasAttribute('data-favorite')) {
      const id = target.dataset.favorite;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      const selected = favorites.has(id);
      target.setAttribute('aria-pressed', String(selected));
      target.classList.toggle('is-active', selected);
      const car = cars.find(item => String(item.id) === id);
      if (car) target.setAttribute('aria-label', `${selected ? 'Remover' : 'Adicionar'} ${car.brand} ${car.name} ${selected ? 'dos' : 'aos'} favoritos`);
    }
    if (target.hasAttribute('data-category')) {
      category = target.dataset.category;
      $$('[data-category]').forEach(button => {
        const active = button === target;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      visibleCount = 6;
      render();
    }
    if (target.hasAttribute('data-reset-filters')) {
      if ($('#search-input')) $('#search-input').value = '';
      if ($('#brand-select')) $('#brand-select').value = 'all';
      if ($('#price-select')) $('#price-select').selectedIndex = 0;
      category = 'all';
      $$('[data-category]').forEach(button => {
        const active = button.dataset.category === 'all';
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      visibleCount = 6;
      render();
    }
  });

  ['search-input', 'brand-select', 'price-select'].forEach(id => {
    const element = document.getElementById(id);
    element?.addEventListener(id === 'search-input' ? 'input' : 'change', () => {
      visibleCount = 6;
      render();
    });
  });
  $('#load-more')?.addEventListener('click', () => {
    visibleCount += 6;
    render();
  });

  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      restoreDialogFocus(dialog);
    });
  });

  const menuToggle = $('#menu-toggle');
  const nav = $('#primary-nav');
  function closeMenu() {
    menuToggle?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('is-open');
  }
  menuToggle?.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(expanded));
    nav?.classList.toggle('is-open', expanded);
  });
  nav?.addEventListener('click', event => {
    if (event.target.closest('a, button')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });

  const header = $('#site-header');
  if (header) {
    let scrollScheduled = false;
    const updateHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
      scrollScheduled = false;
    };
    window.addEventListener('scroll', () => {
      if (!scrollScheduled) {
        scrollScheduled = true;
        requestAnimationFrame(updateHeader);
      }
    }, { passive: true });
    updateHeader();
  }

  revealElements();
  if (grid) fetch('cars.json')
    .then(response => {
      if (!response.ok) throw new Error('Inventory unavailable');
      return response.json();
    })
    .then(data => {
      cars = (Array.isArray(data) ? data : (data.cars || [])).map(car => {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = car.version || '';
        return { ...car, version: decoder.value };
      });
      const brandSelect = $('#brand-select');
      if (brandSelect) {
        const selected = brandSelect.value;
        brandSelect.innerHTML = '<option value="all">Todas as marcas</option>' + [...new Set(cars.map(car => car.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(brand => `<option value="${escapeHTML(brand)}">${escapeHTML(brand)}</option>`).join('');
        if ([...brandSelect.options].some(option => option.value === selected)) brandSelect.value = selected;
      }
      render();
    })
    .catch(() => {
      grid.innerHTML = '<div class="inventory-empty"><h3>A vitrine está a um passo de aparecer.</h3><p>Abra este projeto pelo Live Server para carregar os veículos e explorar a proposta.</p></div>';
      if ($('#result-count')) $('#result-count').textContent = 'Vitrine indisponível';
      if ($('#load-more')) $('#load-more').hidden = true;
    });
})();
