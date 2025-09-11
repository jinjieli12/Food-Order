async function fetchJSON(url, opts={}) {
  const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }}, opts));
  if (!res.ok) throw new Error('Network error');
  return await res.json();
}

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('chatInput');
const formEl = document.getElementById('chatForm');
const cartEl = document.getElementById('cart');
const suggestionsEl = document.getElementById('suggestions');
const checkoutBtn = document.getElementById('checkoutBtn');

function addMessage(text, who='bot') {
  const row = document.createElement('div');
  row.className = `row ${who}`;
  const bubble = document.getElementById('msgTemplate').content.firstElementChild.cloneNode(true);
  bubble.textContent = text;
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderCart({cart, totals}) {
  cartEl.innerHTML = '';
  if (!cart || cart.length === 0) {
    cartEl.innerHTML = '<div class="muted">Your cart is empty.</div>';
    return;
  }
  cart.forEach(i => {
    const line = document.createElement('div');
    line.className = 'cart-line';
    line.innerHTML = `<span>${i.qty} × ${i.name}</span><span>$${(i.price*i.qty).toFixed(2)}</span>`;
    cartEl.appendChild(line);
  });
  const tot = document.createElement('div');
  tot.className = 'cart-total';
  tot.innerHTML = `<div>Subtotal: $${totals.subtotal.toFixed(2)}</div>
  <div>Tax: $${totals.tax.toFixed(2)}</div>
  <div>Total: $${totals.total.toFixed(2)}</div>`;
  cartEl.appendChild(tot);
}

function renderSuggestions(list=[]) {
  suggestionsEl.innerHTML = '';
  list.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = s;
    chip.addEventListener('click', () => {
      inputEl.value = s;
      formEl.dispatchEvent(new Event('submit', {cancelable: true}));
    });
    suggestionsEl.appendChild(chip);
  });
}

async function sendMessage(text) {
  addMessage(text, 'user');
  inputEl.value = '';
  try {
    const data = await fetchJSON('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text })
    });
    addMessage(data.reply, 'bot');
    renderCart(data);
    renderSuggestions(data.suggestions || []);
  } catch (e) {
    addMessage('Oops, something went wrong. Please try again.', 'bot');
  }
}

formEl.addEventListener('submit', e => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  sendMessage(text);
});

checkoutBtn.addEventListener('click', () => {
  sendMessage('Checkout');
});

async function boot() {
  addMessage("Hi! I'm Bistro Bot. Type 'show menu' or try: Order 1 Margherita Pizza.", 'bot');
  const data = await fetchJSON('/api/cart');
  renderCart(data);
}
boot();
