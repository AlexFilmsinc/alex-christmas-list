import { family } from './lib/family.js';
const $ = selector => document.querySelector(selector);
const names = Object.fromEntries(family.map(p => [p.id, p.name]));
const query = new URLSearchParams(location.search).get('person');
let selected = names[query] ? query : 'all';
let curated = [], submitted = [], loading = true, loadError = false;
let pending = null;
const receipts = new Map();
try { for (const [key, value] of Object.entries(JSON.parse(localStorage.getItem('gift-receipts') || '{}'))) receipts.set(key, value); } catch {}
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
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
  if (id === 'all') url.searchParams.delete('person'); else url.searchParams.set('person', id);
  url.hash = 'wishlist';
  history.replaceState(null, '', url);
  render();
  $('#wishlist').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderPeople() {
  const target = $('#people');
  // Retain focus when background refreshes update counts.
  const focused = document.activeElement?.dataset.person;
  target.replaceChildren();
  for (const person of [{ id: 'all', name: 'Everyone' }, ...family]) {
    const count = allGifts().filter(g => person.id === 'all' || g.person === person.id).length;
    const button = node('button', 'person-button' + (person.id === 'all' ? ' person-button--all' : ''));
    button.type = 'button'; button.dataset.person = person.id;
    button.setAttribute('aria-pressed', String(selected === person.id));
    if (person.id !== 'all') {
      const initials = person.name.split(' ').map(s => s[0]).join('');
      const icon = node('span', 'person-initial', initials); icon.setAttribute('aria-hidden', 'true'); button.append(icon);
    }
    button.append(node('strong', '', person.name), node('small', '', count + (count === 1 ? ' idea' : ' ideas')));
    button.addEventListener('click', () => selectPerson(person.id));
    target.append(button);
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
  $('#list-title').textContent = selected === 'all' ? 'Everyone’s ideas' : names[selected] + '’s wishlist';
  const gifts = allGifts().filter(g => selected === 'all' || g.person === selected);
  const descending = $('#sort').value === 'price-desc';
  gifts.sort((a, b) => {
    if (a.price == null) return b.price == null ? 0 : 1;
    if (b.price == null) return -1;
    return descending ? b.price - a.price : a.price - b.price;
  });
  $('#gift-list').replaceChildren(...gifts.map(card));
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
  if (!$('#title').value) $('#person').value = selected === 'all' ? '' : selected;
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
$('#share-list').addEventListener('click', async () => {
  const url = new URL(location.pathname, location.origin);
  if (selected !== 'all') { url.searchParams.set('person', selected); url.hash = 'wishlist'; }
  const title = selected === 'all' ? 'Our Family Christmas Wishlist' : names[selected] + '’s Christmas Wishlist';
  try {
    if (navigator.share) await navigator.share({ title, text: 'A little inspiration for Christmas.', url: url.href });
    else { await navigator.clipboard.writeText(url.href); $('#share-status').textContent = 'Wishlist link copied—ready to send to the family.'; }
  } catch (error) {
    if (error.name !== 'AbortError') $('#share-status').textContent = 'Copy the link from your browser’s address bar to share this wishlist.';
  }
});
$('#export').addEventListener('click', async () => {
  $('#export').disabled = true;
  try {
    const latest = await api();
    const data = { exportedAt: new Date().toISOString(), family, gifts: [...curated, ...latest.gifts] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = 'family-wishlists.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#export-status').textContent = 'Downloaded. You can share this file with Codex to review everyone’s ideas.';
  } catch (e) { $('#export-status').textContent = e.message; }
  finally { $('#export').disabled = false; }
});
try {
  const response = await fetch('/data/curated.json'); if (!response.ok) throw new Error();
  curated = await response.json();
} catch { $('#load-status').textContent = 'Some original gifts could not load. Please refresh.'; }
render();
await refresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#gift-dialog').open) refresh(); });
