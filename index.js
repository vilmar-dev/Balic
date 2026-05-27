//  web app's Firebase configuration
 // Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCfqNBAV7lgA9vYRxBvwxF5EGMZeqjrXgY",
  authDomain: "loss-and-found-2c8e4.firebaseapp.com",
  projectId: "loss-and-found-2c8e4",
  storageBucket: "loss-and-found-2c8e4.firebasestorage.app",
  messagingSenderId: "462518955057",
  appId: "1:462518955057:web:fa9ba229a3ed6ff594f910",
  measurementId: "G-VN46LWFM7J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// ============================================================
// FIREBASE INIT
// ============================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const COLLECTION = "lostfound_items";

// ============================================================
// STATE
// ============================================================
let items      = [];   // live copy from Firestore
let adminMode  = false;
let formType   = 'lost';
let editingId  = null;
const MAX_IMAGE_SIZE_BYTES = 700 * 1024; // 700 KB safe limit for Firestore data URLs

// ============================================================
// POSTER TOKEN — identifies the browser that posted an item
// ============================================================
function getMyTokens() {
  try {
    return JSON.parse(localStorage.getItem('balik_my_tokens') || '[]');
  } catch { return []; }
}

function saveMyToken(token) {
  const tokens = getMyTokens();
  if (!tokens.includes(token)) {
    tokens.push(token);
    localStorage.setItem('balik_my_tokens', JSON.stringify(tokens));
  }
}

function isMyItem(item) {
  if (!item.posterToken) return false;
  return getMyTokens().includes(item.posterToken);
}

function generateToken() {
  return 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ============================================================
// UTILITIES
// ============================================================
function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// REAL-TIME LISTENER — updates all devices instantly
// ============================================================
function startRealtimeListener() {
  showLoadingState();

  db.collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      hideLoadingState();
      renderAll();
    }, err => {
      console.error("Firestore error:", err);
      showError("Could not connect to database. Check your Firebase config.");
    });
}

function showLoadingState() {
  ['browse-grid','lost-grid','found-grid','claimed-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--gray-400);">
        <div style="font-size:32px; margin-bottom:10px;">⏳</div>
        <p style="font-weight:600;">Loading items...</p>
      </div>`;
  });
}

function hideLoadingState() {
  // renderAll() replaces the loading placeholders
}

function showError(msg) {
  ['browse-grid','lost-grid','found-grid','claimed-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px; color:#b91c1c;">
        <div style="font-size:32px; margin-bottom:10px;">⚠️</div>
        <p style="font-weight:600;">${msg}</p>
        <p style="font-size:12px; margin-top:8px;">Open index.html and fill in your Firebase config values.</p>
      </div>`;
  });
}

// ============================================================
// FIRESTORE CRUD
// ============================================================
async function addItem(data) {
  try {
    await db.collection(COLLECTION).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.error("Add failed:", e);
    if (e.message && e.message.includes('image') && e.message.includes('longer')) {
      toast('Image data is too large for Firestore. Choose a smaller photo or remove it.', 'error');
    } else {
      toast("Failed to save. Check your Firebase config.", "error");
    }
    return false;
  }
}

async function updateItem(id, data) {
  try {
    await db.collection(COLLECTION).doc(id).update(data);
    return true;
  } catch (e) {
    console.error("Update failed:", e);
    toast("Update failed.", "error");
    return false;
  }
}

// ============================================================
// NAVIGATION
// ============================================================
const pageTitles = {
  browse: 'Browse Items',
  lost:   'Lost Items',
  found:  'Found Items',
  claimed:'Claimed Items',
  admin:  'Admin Panel'
};

function showPage(page, btn) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[page] || 'Portal';
  renderAll();
}

// ============================================================
// STATS
// ============================================================
function updateStats() {
  const active      = items.filter(i => i.status !== 'removed');
  const lostCount   = active.filter(i => i.type === 'lost'  && i.status !== 'claimed').length;
  const foundCount  = active.filter(i => i.type === 'found' && i.status !== 'claimed').length;
  const claimedCount = active.filter(i => i.status === 'claimed').length;
  document.getElementById('stat-total').textContent   = active.length;
  document.getElementById('stat-lost').textContent    = lostCount;
  document.getElementById('stat-found').textContent   = foundCount;
  document.getElementById('stat-claimed').textContent = claimedCount;
  document.getElementById('itemCount').textContent    = active.length;
}

// ============================================================
// RENDER CARDS
// ============================================================
function renderCards(page) {
  let filtered = items.filter(i => i.status !== 'removed');
  const gridId  = page + '-grid';
  const emptyId = page + '-empty';

  if (page === 'claimed') {
    filtered = filtered.filter(i => i.status === 'claimed');
  } else if (page === 'lost') {
    filtered = filtered.filter(i => i.type === 'lost' && i.status !== 'claimed');
    const q = document.getElementById('searchLost')?.value.toLowerCase() || '';
    if (q) filtered = filtered.filter(i => (i.name + i.location + i.desc).toLowerCase().includes(q));
  } else if (page === 'found') {
    filtered = filtered.filter(i => i.type === 'found' && i.status !== 'claimed');
    const q = document.getElementById('searchFound')?.value.toLowerCase() || '';
    if (q) filtered = filtered.filter(i => (i.name + i.location + i.desc).toLowerCase().includes(q));
  } else if (page === 'browse') {
    const q     = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const t     = document.getElementById('filterType')?.value || 'all';
    const dateF = document.getElementById('filterDate')?.value || 'all';
    if (q) filtered = filtered.filter(i => (i.name + i.location + i.desc + i.contact).toLowerCase().includes(q));
    if (t !== 'all') filtered = filtered.filter(i => i.type === t);
    if (dateF !== 'all') {
      const now = new Date(); now.setHours(0, 0, 0, 0);
      filtered = filtered.filter(i => {
        const d = new Date(i.date + 'T00:00:00');
        if (dateF === 'today') return d >= now;
        if (dateF === 'week')  { const w = new Date(now); w.setDate(w.getDate() - 7);  return d >= w; }
        if (dateF === 'month') { const m = new Date(now); m.setDate(m.getDate() - 30); return d >= m; }
        return true;
      });
    }
  }

  // Sort: newest first (Firestore Timestamps or ms numbers)
  filtered.sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
    return tb - ta;
  });

  const grid  = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
  } else {
    if (empty) empty.style.display = 'none';
    grid.innerHTML = filtered.map(i => cardHTML(i)).join('');
  }
}

function cardHTML(item) {
  const tagClass  = item.status === 'claimed' ? 'tag-claimed' : (item.type === 'lost' ? 'tag-lost' : 'tag-found');
  const tagLabel  = item.status === 'claimed' ? '🏷️ Claimed'  : (item.type === 'lost' ? '😟 Lost'   : '✅ Found');

  const imageSection = item.image
    ? `<div class="card-image"><img src="${item.image}" alt="${escHtml(item.name)}"/></div>`
    : `<div class="card-image">${item.type === 'lost' ? '😟' : '✅'}</div>`;

  const verifiedBadge = item.status === 'verified'
    ? `<span class="verified-badge">✔ Verified</span>` : '';

  // ── REVISED: Only poster or admin can claim ──
  const claimBtn = (item.status !== 'claimed' && (adminMode || isMyItem(item)))
    ? `<button class="btn btn-outline btn-sm" onclick="claimItem('${item.id}')">🏷️ Claim</button>` : '';

  const adminBtns = adminMode && item.status !== 'removed' ? `
    ${item.status !== 'verified' ? `<button class="btn btn-success btn-sm" onclick="verifyItem('${item.id}')">✔ Verify</button>` : ''}
    <button class="btn btn-danger btn-sm" onclick="removeItem('${item.id}')">🗑 Remove</button>
  ` : '';

  return `<div class="item-card" id="card-${item.id}">
    ${imageSection}
    ${verifiedBadge}
    <div class="card-body">
      <span class="card-tag ${tagClass}">${tagLabel}</span>
      <div class="card-title">${escHtml(item.name)}</div>
      <div class="card-meta">
        <div class="card-meta-row"><span>📍</span>${escHtml(item.location)}</div>
        <div class="card-meta-row"><span>📅</span>${formatDate(item.date)}</div>
        ${item.desc ? `<div class="card-meta-row"><span>📝</span>${escHtml(item.desc).substring(0, 80)}${item.desc.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      <div class="card-contact">👤 ${escHtml(item.contactName)} · ${escHtml(item.contact)}</div>
      <div class="card-actions">
        <button class="btn btn-outline btn-sm" onclick="showDetail('${item.id}')">👁 View Details</button>
        ${claimBtn}
        ${adminBtns}
      </div>
    </div>
  </div>`;
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  updateStats();
  renderCards('browse');
  renderCards('lost');
  renderCards('found');
  renderCards('claimed');
  renderAdmin();
}

// ============================================================
// POST MODAL
// ============================================================
function openPostModal(type) {
  editingId = null;
  setFormType(type || 'lost');
  document.getElementById('f-name').value         = '';
  document.getElementById('f-location').value     = '';
  document.getElementById('f-date').value         = today(0);
  document.getElementById('f-desc').value         = '';
  document.getElementById('f-contact-name').value = '';
  document.getElementById('f-contact').value      = '';
  document.getElementById('f-image').value        = '';
  document.getElementById('f-image-preview').style.display = 'none';
  document.getElementById('postModalTitle').textContent    = 'Post an Item';
  openModal('postModal');
}

function setFormType(type) {
  formType = type;
  document.querySelectorAll('.type-option').forEach(b => b.classList.remove('active'));
  document.getElementById('typeBtn-' + type).classList.add('active');
}

function previewImage(input) {
  const file = input.files[0];
  const imgPreview = document.getElementById('f-image-preview');
  if (!file) {
    imgPreview.style.display = 'none';
    imgPreview.src = '';
    return;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    toast('Image is too large. Please choose a file under 700 KB.', 'error');
    input.value = '';
    imgPreview.style.display = 'none';
    imgPreview.src = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    imgPreview.src   = e.target.result;
    imgPreview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function submitPost() {
  const name        = document.getElementById('f-name').value.trim();
  const location    = document.getElementById('f-location').value.trim();
  const date        = document.getElementById('f-date').value;
  const desc        = document.getElementById('f-desc').value.trim();
  const contactName = document.getElementById('f-contact-name').value.trim();
  const contact     = document.getElementById('f-contact').value.trim();
  const imgPreview  = document.getElementById('f-image-preview');
  const imageInput   = document.getElementById('f-image');
  const imageData    = imgPreview.style.display !== 'none' ? imgPreview.src : '';
  const imageFile    = imageInput.files[0];

  if (!name || !location || !date || !contactName || !contact) {
    toast('Please fill in all required fields.', 'error');
    return;
  }
  if (imageFile && imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    toast('Image is too large. Please choose a file under 700 KB.', 'error');
    return;
  }

  // Disable button while saving
  const submitBtn = document.querySelector('#postModal .btn-primary');
  submitBtn.textContent = '⏳ Saving...';
  submitBtn.disabled = true;

  // ── REVISED: generate a posterToken and save it to localStorage ──
  const posterToken = generateToken();
  const data = { type: formType, name, location, date, desc, contactName, contact, image: imageData, status: 'pending', posterToken };

  let ok;
  if (editingId) {
    ok = await updateItem(editingId, data);
    if (ok) toast('Item updated!', 'success');
  } else {
    ok = await addItem(data);
    if (ok) {
      saveMyToken(posterToken);
      toast('Post submitted! It\'s now visible to everyone.', 'success');
    }
  }

  submitBtn.textContent = '🚀 Submit Post';
  submitBtn.disabled = false;

  if (ok) closeModal('postModal');
}

// ============================================================
// DETAIL MODAL
// ============================================================
function showDetail(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const tagClass = item.status === 'claimed' ? 'tag-claimed' : (item.type === 'lost' ? 'tag-lost' : 'tag-found');
  const tagLabel = item.status === 'claimed' ? '🏷️ Claimed'  : (item.type === 'lost' ? '😟 Lost'   : '✅ Found');

  document.getElementById('detailModalTitle').textContent = item.name;
  document.getElementById('detailModalBody').innerHTML = `
    ${item.image ? `<img src="${item.image}" class="detail-image" alt="${escHtml(item.name)}"/>` : ''}
    <span class="card-tag ${tagClass}" style="margin-bottom:16px; display:inline-flex;">${tagLabel}</span>
    ${item.status === 'verified' ? `<span class="verified-badge" style="position:static; margin-left:8px; display:inline-flex; vertical-align:middle;">✔ Verified</span>` : ''}
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Item Name</div><div class="detail-value">${escHtml(item.name)}</div></div>
      <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</div></div>
      <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">📍 ${escHtml(item.location)}</div></div>
      <div class="detail-item"><div class="detail-label">Date</div><div class="detail-value">📅 ${formatDate(item.date)}</div></div>
      <div class="detail-item"><div class="detail-label">Contact Name</div><div class="detail-value">👤 ${escHtml(item.contactName)}</div></div>
      <div class="detail-item"><div class="detail-label">Contact Info</div><div class="detail-value">${escHtml(item.contact)}</div></div>
    </div>
    ${item.desc ? `<div style="background:var(--blue-50); border-radius:var(--radius-sm); padding:12px 14px; font-size:14px; color:var(--gray-700);"><strong>Description:</strong><br/>${escHtml(item.desc)}</div>` : ''}
  `;

  let footerBtns = `<button class="btn btn-outline" onclick="closeModal('detailModal')">Close</button>`;
  // ── REVISED: Only poster or admin can claim ──
  if (item.status !== 'claimed' && (adminMode || isMyItem(item))) {
    footerBtns += `<button class="btn btn-primary" onclick="claimItem('${item.id}'); closeModal('detailModal');">🏷️ Mark as Claimed</button>`;
  }
  if (adminMode && item.status !== 'removed') {
    if (item.status !== 'verified') {
      footerBtns += `<button class="btn btn-success" onclick="verifyItem('${item.id}'); closeModal('detailModal');">✔ Verify</button>`;
    }
    footerBtns += `<button class="btn btn-danger" onclick="removeItem('${item.id}'); closeModal('detailModal');">🗑 Remove Post</button>`;
  }
  document.getElementById('detailModalFooter').innerHTML = footerBtns;
  openModal('detailModal');
}

// ============================================================
// ITEM ACTIONS (write to Firestore → listener updates all devices)
// ============================================================
async function claimItem(id) {
  const item = items.find(i => i.id === id);
  if (!item || item.status === 'claimed') return;
  const ok = await updateItem(id, { status: 'claimed' });
  if (ok) toast(`"${item.name}" marked as claimed!`, 'success');
}

async function verifyItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const ok = await updateItem(id, { status: 'verified' });
  if (ok) toast(`"${item.name}" has been verified.`, 'success');
}

async function removeItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Remove "${item.name}"? This will hide it from public view.`)) return;
  const ok = await updateItem(id, { status: 'removed' });
  if (ok) toast('Post removed.', 'error');
}

// ============================================================
// ADMIN CREDENTIALS — change these to your own
// ============================================================
const ADMIN_EMAIL    = "******";   // ← change this
const ADMIN_PASSWORD = "******";                // ← change this

// ============================================================
// ADMIN PANEL
// ============================================================

// Called when the "Admin Mode" button is clicked
function toggleAdminMode() {
  if (adminMode) {
    // Already logged in → log out
    adminLogout();
  } else {
    // Not logged in → show login modal
    openAdminLogin();
  }
}

function openAdminLogin() {
  document.getElementById('admin-email-input').value    = '';
  document.getElementById('admin-password-input').value = '';
  document.getElementById('admin-login-error').style.display = 'none';
  openModal('adminLoginModal');
  // Auto-focus the email field
  setTimeout(() => document.getElementById('admin-email-input').focus(), 120);
}

function submitAdminLogin() {
  const email    = document.getElementById('admin-email-input').value.trim();
  const password = document.getElementById('admin-password-input').value;
  const errorEl  = document.getElementById('admin-login-error');

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    adminMode = true;
    closeModal('adminLoginModal');

    // Update button UI
    const toggle = document.getElementById('adminToggle');
    const label  = document.getElementById('adminToggleLabel');
    toggle.classList.add('active');
    label.textContent = 'Admin ON';

    // Show admin panel content
    document.getElementById('admin-lock').style.display    = 'none';
    document.getElementById('admin-content').style.display = 'block';

    toast('Welcome, Admin! You are now logged in.', 'success');
    renderAll();
  } else {
    // Wrong credentials — shake the modal and show error
    errorEl.style.display = 'block';
    errorEl.textContent   = '❌ Incorrect email or password.';
    document.getElementById('adminLoginModal')
      .querySelector('.modal').classList.add('shake');
    setTimeout(() =>
      document.getElementById('adminLoginModal')
        .querySelector('.modal').classList.remove('shake'), 500);
  }
}

function adminLogout() {
  adminMode = false;
  const toggle = document.getElementById('adminToggle');
  const label  = document.getElementById('adminToggleLabel');
  toggle.classList.remove('active');
  label.textContent = 'Admin Mode';
  document.getElementById('admin-lock').style.display    = 'block';
  document.getElementById('admin-content').style.display = 'none';
  toast('Logged out of admin mode.', 'info');
  renderAll();
}

// Allow pressing Enter in the login form
function adminLoginKeydown(e) {
  if (e.key === 'Enter') submitAdminLogin();
}

function togglePasswordVisibility() {
  const input = document.getElementById('admin-password-input');
  const btn   = document.getElementById('togglePwBtn');
  if (input.type === 'password') {
    input.type   = 'text';
    btn.textContent = '🙈';
  } else {
    input.type   = 'password';
    btn.textContent = '👁';
  }
}

function renderAdmin() {
  const tbody      = document.getElementById('adminTableBody');
  const adminEmpty = document.getElementById('admin-empty');
  if (!tbody) return;

  const pending  = items.filter(i => i.status === 'pending').length;
  const verified = items.filter(i => i.status === 'verified').length;
  const removed  = items.filter(i => i.status === 'removed').length;
  document.getElementById('admin-pending').textContent  = pending;
  document.getElementById('admin-verified').textContent = verified;
  document.getElementById('admin-removed').textContent  = removed;

  const rows = [...items].sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
    return tb - ta;
  });

  if (rows.length === 0) {
    tbody.innerHTML = '';
    if (adminEmpty) adminEmpty.style.display = 'block';
    return;
  }
  if (adminEmpty) adminEmpty.style.display = 'none';

  tbody.innerHTML = rows.map(item => {
    const statusPill = {
      pending:  `<span class="status-pill status-pending">⏳ Pending</span>`,
      verified: `<span class="status-pill status-verified">✔ Verified</span>`,
      claimed:  `<span class="status-pill status-verified">🏷️ Claimed</span>`,
      removed:  `<span class="status-pill status-removed">✕ Removed</span>`
    }[item.status] || '';

    const typeTag = item.type === 'lost'
      ? `<span class="card-tag tag-lost"  style="font-size:10px;">Lost</span>`
      : `<span class="card-tag tag-found" style="font-size:10px;">Found</span>`;

    const actions = item.status !== 'removed' ? `
      ${item.status === 'pending'  ? `<button class="btn btn-success btn-sm" onclick="verifyItem('${item.id}')">✔</button>` : ''}
      ${item.status !== 'claimed'  ? `<button class="btn btn-outline btn-sm" onclick="claimItem('${item.id}')">🏷️</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="removeItem('${item.id}')">🗑</button>
    ` : `<span style="color:var(--gray-400); font-size:12px;">Removed</span>`;

    return `<tr>
      <td><strong>${escHtml(item.name)}</strong></td>
      <td>${typeTag}</td>
      <td>${escHtml(item.location)}</td>
      <td>${formatDate(item.date)}</td>
      <td>${escHtml(item.contact)}</td>
      <td>${statusPill}</td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">${actions}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); });
});

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ============================================================
// SIDEBAR TOGGLE (mobile)
// ============================================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (window.innerWidth <= 700) closeSidebar(); });
});

// ============================================================
// INIT — start listening to Firestore
// ============================================================
startRealtimeListener();
