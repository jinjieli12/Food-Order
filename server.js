// Simple restaurant ordering chatbot server
// Run: npm install && npm start -> http://localhost:8000

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(session({
  secret: 'dev-secret-change-me',
  resave: false,
  saveUninitialized: true,
}));

// --- Demo Menu ---
const MENU = [
  { id: 'burger-classic', name: 'Classic Burger', price: 8.99, category: 'Burgers' },
  { id: 'burger-cheese', name: 'Cheeseburger', price: 9.99, category: 'Burgers' },
  { id: 'burger-veggie', name: 'Veggie Burger', price: 9.49, category: 'Burgers' },

  { id: 'pizza-margherita', name: 'Margherita Pizza', price: 12.5, category: 'Pizza' },
  { id: 'pizza-pepperoni', name: 'Pepperoni Pizza', price: 13.5, category: 'Pizza' },
  { id: 'pizza-bbq', name: 'BBQ Chicken Pizza', price: 14.0, category: 'Pizza' },

  { id: 'salad-garden', name: 'Garden Salad', price: 7.5, category: 'Salads' },
  { id: 'salad-caesar', name: 'Caesar Salad', price: 8.0, category: 'Salads' },

  { id: 'drink-cola', name: 'Cola', price: 2.5, category: 'Drinks' },
  { id: 'drink-lemonade', name: 'Lemonade', price: 2.75, category: 'Drinks' },
  { id: 'drink-icedtea', name: 'Iced Tea', price: 2.75, category: 'Drinks' }
];

// --- Helpers ---
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(s) { return normalize(s).split(' ').filter(Boolean); }

function findBestMenuMatch(text) {
  const q = normalize(text);
  const tokens = words(q);
  let best = null;
  let bestScore = 0;

  for (const item of MENU) {
    const name = normalize(item.name);
    let score = 0;

    // token match scoring
    for (const t of tokens) {
      if (!t) continue;
      if (name.includes(t)) score += 2;
      else if (t.length >= 4 && name.includes(t.slice(0, t.length - 1))) score += 1; // light fuzz
    }

    // category boost
    for (const t of tokens) {
      if (normalize(item.category).includes(t)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  // require a minimal score
  if (bestScore >= 2) return best;
  return null;
}

function parseQuantity(text) {
  const map = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, a:1, an:1 };
  const m = normalize(text).match(/\b(\d+)\b/);
  if (m) return Math.max(1, parseInt(m[1], 10));
  for (const [k,v] of Object.entries(map)) {
    if (new RegExp(`\\b${k}\\b`).test(normalize(text))) return v;
  }
  return 1;
}

function ensureCart(req) {
  if (!req.session.cart) req.session.cart = []; // [{id, name, price, qty}]
  return req.session.cart;
}

function addToCart(cart, item, qty) {
  const existing = cart.find(i => i.id === item.id);
  if (existing) existing.qty += qty;
  else cart.push({ id: item.id, name: item.name, price: item.price, qty });
}

function removeFromCart(cart, item, qty=null) {
  const idx = cart.findIndex(i => i.id === item.id);
  if (idx === -1) return 0;
  if (qty === null || cart[idx].qty <= qty) {
    const removedQty = cart[idx].qty;
    cart.splice(idx,1);
    return removedQty;
  } else {
    cart[idx].qty -= qty;
    return qty;
  }
}

function cartTotals(cart) {
  const subtotal = cart.reduce((s,i) => s + i.price*i.qty, 0);
  const tax = +(subtotal * 0.08875).toFixed(2); // NYC-ish tax for demo
  const total = +(subtotal + tax).toFixed(2);
  return { subtotal:+subtotal.toFixed(2), tax, total };
}

function groupMenuByCategory() {
  const byCat = {};
  for (const item of MENU) {
    byCat[item.category] = byCat[item.category] || [];
    byCat[item.category].push(item);
  }
  return byCat;
}

// --- Routes ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/menu', (req, res) => {
  res.json({ menu: MENU, categories: groupMenuByCategory() });
});

app.get('/api/cart', (req, res) => {
  const cart = ensureCart(req);
  res.json({ cart, totals: cartTotals(cart) });
});

app.post('/api/chat', (req, res) => {
  const msg = (req.body && req.body.message) ? String(req.body.message) : '';
  const cart = ensureCart(req);
  const low = normalize(msg);

  const suggestions = [];

  function reply(text) {
    return res.json({ reply: text, cart, totals: cartTotals(cart), suggestions });
  }

  // Greetings
  if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(low)) {
    suggestions.push('Show menu', 'Recommend something', 'What\'s in my cart?');
    return reply("Hi! I'm your ordering assistant. Want to see the menu or get a recommendation?");
  }

  // Show menu
  if (/(show|see|open).*(menu)|\bmenu\b/.test(low)) {
    const byCat = groupMenuByCategory();
    suggestions.push('Order 1 Margherita Pizza', 'Order 2 Cheeseburger', 'Recommend a combo');
    const lines = Object.entries(byCat).map(([cat, items]) => {
      const tops = items.slice(0,3).map(i => `${i.name} ($${i.price.toFixed(2)})`).join(', ');
      return `• ${cat}: ${tops}`;
    }).join('\n');
    return reply("Here's a quick look at our menu:\n" + lines + "\n\nTell me what you'd like. For example: “Order 2 Cheeseburgers”");
  }

  // Recommendations
  if (/recommend|suggest|what.*good|best seller|popular/.test(low)) {
    suggestions.push('Order 1 Pepperoni Pizza', 'Order 1 Classic Burger + Cola', 'Show salads');
    return reply("Our most popular choices are Pepperoni Pizza and the Classic Burger. Thirsty? Cola pairs nicely!");
  }

  // Add to cart
  if (/\b(order|add|get|i want|i'll have|give me|i would like)\b/.test(low)) {
    const qty = parseQuantity(low);
    const item = findBestMenuMatch(low);
    if (!item) {
      suggestions.push('Show menu');
      return reply("I couldn't tell which item you want. Try “Order 1 Margherita Pizza” or ask me to show the menu.");
    }
    addToCart(cart, item, qty);
    const { total } = cartTotals(cart);
    suggestions.push('Checkout', 'Add a drink', 'What\'s in my cart?');
    return reply(`Added ${qty} × ${item.name}. Current total is $${total.toFixed(2)}. Anything else?`);
  }

  // Remove from cart
  if (/\b(remove|delete|take.*off|no (?:longer )?want)\b/.test(low)) {
    const qty = /\ball\b/.test(low) ? null : parseQuantity(low);
    const item = findBestMenuMatch(low);
    if (!item) {
      suggestions.push('What\'s in my cart?');
      return reply("Which item should I remove? e.g., “Remove 1 Cola” or “Remove all pizzas”");
    }
    const removed = removeFromCart(cart, item, qty);
    if (removed === 0) {
      suggestions.push('Show menu');
      return reply(`I didn't find ${item.name} in your cart.`);
    }
    const { total } = cartTotals(cart);
    return reply(`Removed ${qty===null?'all':removed} × ${item.name}. New total: $${total.toFixed(2)}.`);
  }

  // Show cart
  if (/(cart|basket|my order|what (do i|is) (have|in)).*/.test(low)) {
    if (cart.length === 0) {
      suggestions.push('Show menu');
      return reply("Your cart is empty. Want me to show the menu?");
    }
    const lines = cart.map(i => `• ${i.qty} × ${i.name} — $${(i.price*i.qty).toFixed(2)}`).join('\n');
    const { subtotal, tax, total } = cartTotals(cart);
    suggestions.push('Checkout', 'Remove an item');
    return reply(`Here’s your cart:\n${lines}\nSubtotal: $${subtotal.toFixed(2)}\nTax: $${tax.toFixed(2)}\nTotal: $${total.toFixed(2)}`);
  }

  // Checkout
  if (/(checkout|place order|pay|complete|submit)/.test(low)) {
    if (cart.length === 0) {
      suggestions.push('Show menu');
      return reply("Your cart is empty. Add something first?");
    }
    const orderId = 'ORD-' + Math.random().toString(36).slice(2,8).toUpperCase();
    req.session.lastOrder = { id: orderId, items: cart, placedAt: Date.now() };
    req.session.cart = [];
    suggestions.push('Track my order');
    return reply(`Order placed! Your order number is ${orderId}. You'll receive it in about 20–30 minutes. Anything else?`);
  }

  // Track order
  if (/track|where.*order|status/.test(low)) {
    const last = req.session.lastOrder;
    if (!last) {
      suggestions.push('Show menu');
      return reply("I don't see a recent order. Would you like to start one?");
    }
    const mins = Math.max(5, 25 - Math.floor((Date.now()-last.placedAt)/60000));
    return reply(`Order ${last.id} is being prepared. ETA ~${mins} minutes.`);
  }

  // Show category quickly
  const category = ['burger','pizza','salad','drink'].find(c => low.includes(c));
  if (category) {
    const catName = {'burger':'Burgers', 'pizza':'Pizza', 'salad':'Salads','drink':'Drinks'}[category];
    const items = MENU.filter(i => i.category === catName).map(i => `• ${i.name} ($${i.price.toFixed(2)})`).join('\n');
    suggestions.push(`Order 1 ${MENU.find(i => i.category===catName).name}`);
    return reply(`${catName} options:\n${items}`);
  }

  // Help
  if (/help|how.*(work|order)|what.*can.*you.*do/.test(low)) {
    suggestions.push('Show menu', 'Order 1 Margherita Pizza', 'What\'s in my cart?');
    return reply("Try messages like: “Show menu”, “Order 2 cheeseburgers and a cola”, “Remove 1 cola”, “Checkout”, or “Track my order”.");
  }

  // Fallback
  suggestions.push('Show menu', 'Help');
  return reply("Sorry, I didn't get that. You can say “Show menu” or “Recommend something”.");
});

// Fallback route for SPA-ish behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
