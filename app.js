import { family } from './lib/family.js';
const $ = selector => document.querySelector(selector);
const names = Object.fromEntries(family.map(p => [p.id, p.name]));
const query = new URLSearchParams(location.search).get('person');
let selected = names[query] ? query : null;
let openingEnvelope = false;
let curated = [], submitted = [], loading = true, loadError = false;
let pending = null;
const receipts = new Map();
try { for (const [key, value] of Object.entries(JSON.parse(localStorage.getItem('gift-receipts') || '{}'))) receipts.set(key, value); } catch {}
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const revealed = new Set();
const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    revealElement(entry.target);
  }
}, { threshold: 0, rootMargin: '0px 0px -12px 0px' }) : null;
function revealElement(element) {
  element.classList.add('is-revealed');
  if (element.dataset.revealKey) revealed.add(element.dataset.revealKey);
  revealObserver?.unobserve(element);
}
function watchReveal(element, index = 0, key) {
  if (key) element.dataset.revealKey = key;
  if (!revealObserver || reducedMotion.matches || (key && revealed.has(key))) return;
  element.style.setProperty('--reveal-delay', (index % 3) * 65 + 'ms');
  element.classList.add('scroll-reveal');
  revealObserver.observe(element);
}
function releaseReveals(container) {
  container.querySelectorAll('.scroll-reveal').forEach(element => revealObserver?.unobserve(element));
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) document.querySelectorAll('.scroll-reveal').forEach(revealElement);
});
document.addEventListener('focusin', event => {
  const element = event.target.closest('.scroll-reveal');
  if (element) revealElement(element);
});
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function allGifts() { return [...curated, ...submitted]; }
function selectPerson(id) {
  selected = id;
  const url = new URL(location.href);
  url.searchParams.set('person', id);
  url.hash = 'wishlist';
  history.replaceState(null, '', url);
  render();
  $('#wishlist').classList.remove('letter-opening');
  void $('#wishlist').offsetWidth;
  $('#wishlist').classList.add('letter-opening');
  $('#wishlist').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  $('#list-title').focus({ preventScroll: true });
}
function renderPeople() {
  const target = $('#people');
  // Retain focus when background refreshes update counts.
  const focused = document.activeElement?.dataset.person;
  releaseReveals(target);
  target.replaceChildren();
  for (const [index, person] of family.entries()) {
    const count = allGifts().filter(g => g.person === person.id).length;
    const button = node('button', 'person-button');
    button.type = 'button'; button.dataset.person = person.id;
    button.setAttribute('aria-label', 'Open ' + person.name + '’s wishlist, ' + count + (count === 1 ? ' wish' : ' wishes'));
    button.setAttribute('aria-pressed', String(selected === person.id));
    const flap = node('span', 'envelope-flap'); flap.setAttribute('aria-hidden', 'true'); button.append(flap);
    const slip = node('span', 'envelope-slip', 'CHRISTMAS WISHES'); slip.setAttribute('aria-hidden', 'true'); button.append(slip);
    {
      const initials = person.name.split(' ').map(s => s[0]).join('');
      const icon = node('span', 'person-initial', initials); icon.setAttribute('aria-hidden', 'true'); button.append(icon);
    }
    button.append(node('span', 'envelope-to', 'A letter from'), node('strong', '', person.name), node('small', '', count + (count === 1 ? ' wish inside' : ' wishes inside')));
    const seal = node('span', 'envelope-seal', '✧'); seal.setAttribute('aria-hidden', 'true'); button.append(seal);
    button.addEventListener('click', async () => {
      if (openingEnvelope) return;
      openingEnvelope = true;
      button.classList.add('envelope-opening');
      if (!reducedMotion.matches) await new Promise(resolve => setTimeout(resolve, 480));
      selectPerson(person.id);
      openingEnvelope = false;
    });
    target.append(button);
    watchReveal(button, index, 'person-' + person.id);
  }
  if (focused) target.querySelector('[data-person="' + focused + '"]')?.focus({ preventScroll: true });
}
function card(gift) {
  const el = node('article', 'gift-card');
  const image = node('div', 'gift-card__image');
  if (gift.image) {
    const img = node('img'); img.src = '/' + gift.image; img.alt = gift.title; img.loading = 'lazy'; image.append(img);
  } else {
    const placeholder = node('div', 'gift-placeholder');
    placeholder.innerHTML = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" aria-hidden="true"><path d="M10 28h44v27H10zM7 19h50v10H7zM32 19v36"/><path d="M32 19C12 19 14 3 24 8c5 3 8 11 8 11Zm0 0C52 19 50 3 40 8c-5 3-8 11-8 11Z"/></svg>';
    placeholder.append(node('small', '', gift.url ? new URL(gift.url).hostname.replace(/^www\./, '') : 'Still deciding'));
    image.append(placeholder);
  }
  const body = node('div', 'gift-card__body'), top = node('div', 'gift-card__top');
  top.append(node('span', 'category', names[gift.person]), node('span', 'price', gift.price == null ? (gift.priceLabel || 'Check price') : money.format(gift.price)));
  body.append(top, node('h3', '', gift.title));
  if (gift.notes) body.append(node('p', '', gift.notes));
  if (gift.warning) body.append(node('div', 'notice', gift.warning));
  if (gift.url) {
    const a = node('a', 'item-link', 'View item ↗'); a.href = gift.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'View ' + gift.title); body.append(a);
  } else body.append(node('span', 'card-note', 'Please wait for the exact pick.'));
  if (receipts.has(gift.id)) {
    const remove = node('button', 'remove-gift', 'Remove my submission'); remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!confirm('Remove this gift from the shared wishlist?')) return;
      remove.disabled = true;
      try {
        await api('DELETE', { person: gift.person, id: gift.id, receipt: receipts.get(gift.id) });
        submitted = submitted.filter(g => g.id !== gift.id); render();
        $('#load-status').textContent = 'Gift removed.';
      } catch (e) { $('#load-status').textContent = e.message; remove.disabled = false; }
    });
    body.append(remove);
  }
  el.append(image, body); return el;
}
function render() {
  renderPeople();
  $('#wishlist').hidden = !selected;
  $('#list-title').textContent = names[selected] || 'Your family';
  $('#letter-signature').textContent = names[selected] || '';
  const gifts = allGifts().filter(g => g.person === selected);
  const descending = $('#sort').value === 'price-desc';
  gifts.sort((a, b) => {
    if (a.price == null) return b.price == null ? 0 : 1;
    if (b.price == null) return -1;
    return descending ? b.price - a.price : a.price - b.price;
  });
  releaseReveals($('#gift-list'));
  $('#gift-list').replaceChildren(...gifts.map((gift, index) => {
    const element = card(gift);
    watchReveal(element, index, 'gift-' + gift.person + '-' + gift.id);
    return element;
  }));
  $('#empty-state').hidden = gifts.length > 0 || loading || loadError;
}
async function api(method = 'GET', body) {
  const response = await fetch('/api/gifts', { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
  let result;
  try { result = await response.json(); } catch { throw new Error('Unable to load the shared list. Please try again.'); }
  if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
  return result;
}
async function refresh() {
  $('#refresh').disabled = true;
  try {
    const result = await api(); submitted = result.gifts; loadError = false;
    $('#load-status').textContent = 'Shared lists are up to date.';
    $('#load-status').classList.remove('error');
  } catch (e) {
    loadError = true;
    $('#load-status').textContent = e.message + ' Showing any gifts already loaded.';
    $('#load-status').classList.add('error');
  } finally { loading = false; $('#refresh').disabled = false; render(); }
}
for (const person of family) $('#person').append(new Option(person.name, person.id));
for (const button of document.querySelectorAll('[data-add]')) button.addEventListener('click', () => {
  if (!$('#title').value) $('#person').value = selected || '';
  $('#gift-dialog').showModal();
});
$('#close-dialog').addEventListener('click', () => $('#gift-dialog').close());
$('#gift-dialog').addEventListener('click', e => { if (e.target === $('#gift-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
$('#gift-form').addEventListener('input', () => { pending = null; });
$('#gift-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fields = Object.fromEntries(new FormData(e.target));
  if (!pending) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    pending = { ...fields, id: crypto.randomUUID(), receipt: [...bytes].map(x => x.toString(16).padStart(2, '0')).join('') };
  }
  $('#save-gift').disabled = true; $('#save-gift').textContent = 'Saving…';
  $('#form-status').textContent = ''; $('#form-status').classList.remove('error');
  try {
    const result = await api('POST', pending);
    receipts.set(result.gift.id, pending.receipt);
    try { localStorage.setItem('gift-receipts', JSON.stringify(Object.fromEntries(receipts))); } catch {}
    submitted = [...submitted.filter(g => g.id !== result.gift.id), result.gift];
    selected = result.gift.person;
    $('#gift-form').reset(); pending = null; $('#gift-dialog').close();
    selectPerson(selected); $('#load-status').textContent = 'Added! This gift is now visible to everyone.';
  } catch (e) { $('#form-status').textContent = e.message; $('#form-status').classList.add('error'); }
  finally { $('#save-gift').disabled = false; $('#save-gift').textContent = 'Add to wishlist'; }
});
$('#sort').addEventListener('change', render);
$('#refresh').addEventListener('click', refresh);
$('#back-mailroom').addEventListener('click', () => {
  const previous = selected;
  selected = null;
  history.replaceState(null, '', location.pathname + '#family');
  render();
  $('#family').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  document.querySelector('[data-person="' + previous + '"]')?.focus({ preventScroll: true });
});
$('#share-list').addEventListener('click', async () => {
  const url = new URL(location.pathname, location.origin);
  if (selected) { url.searchParams.set('person', selected); url.hash = 'wishlist'; }
  try {
    await navigator.clipboard.writeText(url.href);
    $('#share-status').textContent = 'Link copied.';
  } catch {
    $('#share-status').textContent = 'Couldn’t copy automatically. Copy the link from your browser’s address bar.';
  }
});
try {
  const response = await fetch('/data/curated.json'); if (!response.ok) throw new Error();
  curated = await response.json();
} catch { $('#load-status').textContent = 'Some original gifts could not load. Please refresh.'; }
document.querySelectorAll('.section-heading, footer > p, footer > small, .christmas-secret').forEach((element, index) => watchReveal(element, index));
render();
if (selected && location.hash === '#wishlist') $('#wishlist').scrollIntoView({ behavior: 'instant', block: 'start' });
await refresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#gift-dialog').open) refresh(); });
