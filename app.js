import { family } from './lib/family.js';
const $ = selector => document.querySelector(selector);
const names = Object.fromEntries(family.map(p => [p.id, p.name]));
const query = new URLSearchParams(location.search).get('person');
let selected = names[query] ? query : 'alex';
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
  $('#wishlist').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
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
    button.setAttribute('aria-pressed', String(selected === person.id));
    {
      const initials = person.name.split(' ').map(s => s[0]).join('');
      const icon = node('span', 'person-initial', initials); icon.setAttribute('aria-hidden', 'true'); button.append(icon);
    }
    button.append(node('strong', '', person.name), node('small', '', count + (count === 1 ? ' idea' : ' ideas')));
    button.addEventListener('click', () => selectPerson(person.id));
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
  $('#list-title').textContent = names[selected] + '’s wishlist';
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
for (const person of family) {
  $('#person').append(new Option(person.name, person.id));
  $('#draw-person').append(new Option(person.name, person.id));
}
let revealedRecipient = null, currentPrivateLink = null, currentDrawPerson = null;
let drawComplete = false, drawUnlocked = false, giftsStarted = false;
try { currentPrivateLink = localStorage.getItem('secret-santa-private-link'); } catch {}
function drawLinkDetails(link) {
  try {
    const url = new URL(link);
    return { person: url.searchParams.get('draw'), token: url.searchParams.get('token') };
  } catch { return {}; }
}
function paintDrawStatus(status) {
  if (!status) return;
  drawComplete = status.complete;
  $('#draw-progress-label').textContent = `${status.count} / ${status.total}`;
  $('#draw-progress-bar').style.width = `${Math.round(status.count / status.total * 100)}%`;
  $('#draw-count').textContent = status.complete ? 'Everyone is in — the draw is open.' : `${status.total - status.count} ${status.total - status.count === 1 ? 'person' : 'people'} left to join`;
  $('#draw-email-fields').hidden = status.complete;
  $('#draw-email').required = !status.complete;
  $('.draw-envelope h3').textContent = status.complete ? 'Welcome back' : 'Join the draw';
  $('#open-draw').textContent = status.complete ? 'Open my family page' : 'Join the draw';
}
async function drawRequest(body) {
  const response = await fetch('/api/secret-santa', {
    method: body ? 'POST' : 'GET', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The draw could not be opened. Please try again.');
  return result;
}
function rememberPrivateLink(link) {
  if (!link) return;
  currentPrivateLink = link;
  currentDrawPerson = drawLinkDetails(link).person;
  try { localStorage.setItem('secret-santa-private-link', link); } catch {}
}
function showWaiting(result) {
  rememberPrivateLink(result.personalLink);
  paintDrawStatus(result.status);
  $('#draw-form').hidden = true;
  $('#draw-result').hidden = true;
  $('#draw-waiting').hidden = false;
  $('#waiting-copy').textContent = result.status.mailConfigured
    ? 'Your envelope stays sealed until everyone joins. Your private link will also be emailed when the draw opens.'
    : 'Your envelope stays sealed until everyone joins. Copy your private link and keep it somewhere safe.';
}
function showDrawResult(result) {
  rememberPrivateLink(result.personalLink);
  paintDrawStatus(result.status);
  revealedRecipient = result.recipient.id;
  $('#draw-recipient').textContent = result.recipient.name;
  unlockSite(result.recipient);
}
async function unlockSite(recipient) {
  drawUnlocked = true;
  selected = recipient.id;
  document.body.classList.remove('draw-locked');
  document.body.classList.add('draw-authenticated');
  $('#draw').hidden = true;
  $('#draw-session').hidden = false;
  $('#draw-logout').hidden = false;
  $('#session-recipient').textContent = recipient.name;
  const heroLink = $('.hero__button');
  heroLink.textContent = `View ${recipient.name}’s wishlist ↓`;
  heroLink.href = '#wishlist';
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('person', recipient.id);
  url.hash = 'wishlist';
  history.replaceState(null, '', url);
  await loadGiftContent();
  render();
}
async function copyPrivateLink(button) {
  if (!currentPrivateLink) return;
  try {
    await navigator.clipboard.writeText(currentPrivateLink);
    const original = button.textContent;
    button.textContent = 'Private link copied ✓';
    setTimeout(() => { button.textContent = original; }, 2200);
  } catch { $('#waiting-copy').textContent = 'Copy the private link from your browser’s address bar after opening it.'; }
}
$('#draw-form').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const request = drawComplete ? { action: 'reveal', person: fields.person, code: fields.code } : { action: 'join', ...fields };
  $('#open-draw').disabled = true;
  $('#open-draw').textContent = drawComplete ? 'Logging in…' : 'Saving your spot…';
  $('#draw-status').textContent = '';
  $('#draw-status').classList.remove('error');
  try {
    const result = await drawRequest(request);
    if (result.recipient) showDrawResult(result); else showWaiting(result);
  } catch (error) {
    $('#draw-status').textContent = error.message || 'Your spot could not be saved. Please try again.';
    $('#draw-status').classList.add('error');
  } finally { $('#open-draw').disabled = false; }
});
$('#recipient-list').addEventListener('click', () => { if (revealedRecipient) selectPerson(revealedRecipient); });
$('#session-wishlist').addEventListener('click', () => { if (revealedRecipient) selectPerson(revealedRecipient); });
$('#copy-private-link').addEventListener('click', event => copyPrivateLink(event.currentTarget));
$('#copy-reveal-link').addEventListener('click', event => copyPrivateLink(event.currentTarget));
$('#edit-draw').addEventListener('click', () => {
  $('#draw-waiting').hidden = true;
  $('#draw-form').hidden = false;
  if (currentDrawPerson) $('#draw-person').value = currentDrawPerson;
  $('#draw-code').value = '';
  $('#draw-email').focus();
});
$('#close-draw').addEventListener('click', () => {
  revealedRecipient = null;
  $('#draw-form').reset();
  $('#draw-recipient').textContent = '';
  $('#draw-result').hidden = true;
  $('#draw-waiting').hidden = true;
  $('#draw-form').hidden = false;
  $('#draw-status').textContent = '';
});
async function refreshDrawGate() {
  try {
    const result = await drawRequest();
    paintDrawStatus(result.status);
    const incoming = new URLSearchParams(location.search);
    const linkedPerson = incoming.get('draw');
    const linkedToken = incoming.get('token');
    if (linkedPerson && linkedToken) {
      currentPrivateLink = location.href;
      currentDrawPerson = linkedPerson;
      try { localStorage.setItem('secret-santa-private-link', currentPrivateLink); } catch {}
    }
    const details = linkedPerson && linkedToken ? { person: linkedPerson, token: linkedToken } : drawLinkDetails(currentPrivateLink);
    if (!drawUnlocked && details.person && details.token && ($('#draw-waiting').hidden || result.status.complete)) {
      const reveal = await drawRequest({ action: 'reveal', ...details });
      if (reveal.locked) showWaiting(reveal); else showDrawResult(reveal);
    }
  } catch (error) {
    $('#draw-count').textContent = 'Draw status unavailable';
    if (new URLSearchParams(location.search).has('token')) {
      $('#draw-status').textContent = error.message;
      $('#draw-status').classList.add('error');
    }
  }
}
$('#draw-logout').addEventListener('click', () => {
  drawUnlocked = false;
  revealedRecipient = null;
  currentPrivateLink = null;
  currentDrawPerson = null;
  try { localStorage.removeItem('secret-santa-private-link'); } catch {}
  document.body.classList.remove('draw-authenticated');
  document.body.classList.add('draw-locked');
  $('#draw-session').hidden = true;
  $('#draw-logout').hidden = true;
  $('#draw').hidden = false;
  $('#draw-result').hidden = true;
  $('#draw-waiting').hidden = true;
  $('#draw-form').hidden = false;
  $('#draw-form').reset();
  $('.hero__button').textContent = 'Open your draw ↓';
  $('.hero__button').href = '#draw';
  history.replaceState(null, '', location.pathname + '#draw');
  $('#draw').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
});
for (const button of document.querySelectorAll('[data-add]')) button.addEventListener('click', () => {
  if (!$('#title').value) $('#person').value = selected;
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
  if (query || location.search) { url.searchParams.set('person', selected); url.hash = 'wishlist'; }
  try {
    await navigator.clipboard.writeText(url.href);
    $('#share-status').textContent = 'Link copied.';
  } catch {
    $('#share-status').textContent = 'Couldn’t copy automatically. Copy the link from your browser’s address bar.';
  }
});
async function loadGiftContent() {
  if (giftsStarted) return;
  giftsStarted = true;
  try {
    const response = await fetch('/data/curated.json'); if (!response.ok) throw new Error();
    curated = await response.json();
  } catch { $('#load-status').textContent = 'Some original gifts could not load. Please refresh.'; }
  await refresh();
}
document.querySelectorAll('.draw-copy, .draw-envelope, .section-heading, footer > p, footer > small, .christmas-secret').forEach((element, index) => watchReveal(element, index));
render();
await refreshDrawGate();
setInterval(() => { if (!document.hidden) refreshDrawGate(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#gift-dialog').open) { if (drawUnlocked) refresh(); refreshDrawGate(); } });
