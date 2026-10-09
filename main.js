/* Shared code: helpers, auth guard, tabs, rooms, booking, enquiries, booking editor.
   Used by ownerdashboard.js, staffdashboard.js and customerview.js. */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toInput = d => { d = d ? new Date(d) : new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromInput = v => (v ? new Date(v).toISOString() : null);
const fmt = d => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const App = { user: null, tab: null, preRoom: null };

function toast(msg, err) {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  box.append(t); setTimeout(() => t.remove(), 3200);
}
async function safe(fn) { try { return await fn(); } catch (e) { console.error(e); toast(e.message || 'Something went wrong', true); } }
function modal(html, cls = '') {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
  bg.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  document.body.append(bg); return $('.modal', bg);
}
const closeModal = () => $('.modal-bg')?.remove();

const slideshow = (imgs, cls = '') => imgs?.length
  ? `<div class="slideshow ${cls}">${imgs.map((u, i) => `<img src="${esc(u)}" loading="lazy" alt="" class="${i ? '' : 'on'}">`).join('')}</div>`
  : `<div class="slideshow empty ${cls}">No photo</div>`;
setInterval(() => $$('.slideshow').forEach(s => {
  const im = $$('img', s); if (im.length < 2) return;
  const i = im.findIndex(x => x.classList.contains('on'));
  im[i].classList.remove('on'); im[(i + 1) % im.length].classList.add('on');
}), 3000);

async function compress(file, max = 1600) { // keeps uploads small (~few hundred KB)
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = bmp.width * s; c.height = bmp.height * s;
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.72));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
// room images -> public URL, guest IDs -> storage path (private bucket)
async function uploadFile(bucket, file, folder) {
  file = await compress(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.name.split('.').pop()}`;
  const { error } = await sb.storage.from(bucket).upload(path, file);
  if (error) throw error;
  return bucket === BUCKET_ROOMS ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : path;
}
async function viewId(path) {
  const { data, error } = await sb.storage.from(BUCKET_IDS).createSignedUrl(path, 120);
  if (error) return toast(error.message, true);
  window.open(data.signedUrl, '_blank');
}

/* ---------- auth guard + tabs ---------- */
async function requireRole(roles) {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const { data: u } = await sb.from('hotel_users').select('*').eq('auth_id', session.user.id).maybeSingle();
    if (u && roles.includes(u.role)) return u;
    await sb.auth.signOut();
  }
  location.href = 'index.html'; return null;
}
async function initDashboard(roles) {
  App.user = await requireRole(roles); if (!App.user) return false;
  $('#hotelName').textContent = HOTEL_NAME; $('#who').textContent = App.user.name || App.user.username;
  $('#logout').onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };
  $$('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  return true;
}
const tabs = {};
function showTab(name) {
  App.tab = name; location.hash = name;
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + name);
  safe(() => tabs[name]());
}
function registerTabs(map) {
  Object.assign(tabs, map); const h = location.hash.slice(1);
  showTab(h in map ? h : Object.keys(map)[0]);
}

/* ---------- rooms ---------- */
async function getRooms() {
  const { data, error } = await sb.from('rooms').select('*'); if (error) throw error;
  return data.sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }));
}
async function renderHome() {
  const rooms = await getRooms();
  $('#roomGrid').innerHTML = rooms.map(r => `<article class="room-card ${r.booked ? 'booked' : 'free'}" data-room="${esc(r.room_no)}">
    ${slideshow(r.room_images)}<div class="rc-body"><h3>Room ${esc(r.room_no)}</h3><span>${esc(r.room_category)}</span><b class="chip">${r.booked ? 'Booked' : 'Available'}</b></div></article>`).join('')
    || '<p class="empty-msg">No rooms yet. Add rooms from the Rooms tab.</p>';
  $$('#roomGrid .room-card').forEach(c => c.onclick = () => {
    if (c.classList.contains('booked')) editBooking(c.dataset.room);
    else { App.preRoom = c.dataset.room; showTab('book'); }
  });
}
async function renderRooms() {
  const rooms = await getRooms(), v = $('#view-rooms');
  v.innerHTML = `<div class="toolbar"><h2>Rooms</h2><button class="btn" id="addRoom">+ Add room</button></div>
  <div class="grid">${rooms.map(r => `<article class="room-card" data-id="${r.id}">${slideshow(r.room_images)}
    <div class="rc-body"><h3>Room ${esc(r.room_no)}</h3><span>${esc(r.room_category)} · ${r.room_images.length} photos</span>
    <button class="btn small danger" data-del="${r.id}">Delete</button></div></article>`).join('')}</div>`;
  $('#addRoom').onclick = () => roomEditor();
  $$('.room-card', v).forEach(c => c.onclick = e => {
    if (e.target.closest('[data-del]')) return;
    roomEditor(rooms.find(r => r.id === c.dataset.id));
  });
  $$('[data-del]', v).forEach(b => b.onclick = () => safe(async () => {
    const r = rooms.find(x => x.id === b.dataset.del);
    if (r.booked) throw new Error('Check out the guests before deleting this room');
    if (!confirm(`Delete room ${r.room_no}?`)) return;
    const { error } = await sb.from('rooms').delete().eq('id', r.id); if (error) throw error;
    toast('Room deleted'); renderRooms();
  }));
}
function roomEditor(room) { // add + view/edit (photos add/remove) in one modal
  const isNew = !room; const imgs = [...(room?.room_images || [])];
  const m = modal(`<h2>${isNew ? 'Add room' : 'Room ' + esc(room.room_no)}</h2>
    <div class="row"><label>Room no<input id="rn" value="${esc(room?.room_no)}" ${room?.booked ? 'disabled' : ''}></label>
    <label>Category<input id="rc" value="${esc(room?.room_category)}" placeholder="Deluxe, Suite…"></label></div>
    <div id="thumbs" class="thumbs"></div>
    <label>Add photos (as many as you like)<input type="file" id="rf" accept="image/*" multiple></label>
    <div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="rs">Save</button></div>`, 'wide');
  const draw = () => {
    $('#thumbs', m).innerHTML = imgs.map((u, i) => `<div class="thumb"><img src="${esc(u)}" alt=""><button data-rm="${i}">×</button></div>`).join('') || '<p class="muted">No photos yet</p>';
    $$('[data-rm]', m).forEach(b => b.onclick = () => { imgs.splice(+b.dataset.rm, 1); draw(); });
  }; draw();
  $('#rs', m).onclick = () => safe(async () => {
    const no = $('#rn', m).value.trim(); if (!no) throw new Error('Room number is required');
    for (const f of $('#rf', m).files) imgs.push(await uploadFile(BUCKET_ROOMS, f, 'rooms'));
    const row = { room_no: no, room_category: $('#rc', m).value.trim(), room_images: imgs };
    const { error } = await (isNew ? sb.from('rooms').insert(row) : sb.from('rooms').update(row).eq('id', room.id));
    if (error) throw error.code === '23505' ? new Error('Room number already exists') : error;
    closeModal(); toast('Room saved'); showTab(App.tab);
  });
}

/* ---------- booking ---------- */
async function renderBook() {
  const rooms = (await getRooms()).filter(r => !r.booked), v = $('#view-book');
  if (!rooms.length) { v.innerHTML = '<p class="empty-msg">No rooms available to book.</p>'; return; }
  v.innerHTML = `<form id="bookForm" class="panel book-grid"><div id="bookShow"></div><div class="stack">
    <h2>Book a room</h2>
    <label>Room<select id="bRoom">${rooms.map(r => `<option value="${esc(r.room_no)}">${esc(r.room_no)}${r.room_category ? ' · ' + esc(r.room_category) : ''}</option>`).join('')}</select></label>
    <div class="row"><label>No. of guests<input type="number" id="bN" min="1" max="10" value="1"></label>
    <label>Room rent (₹) *<input type="number" id="bRent" min="0" step="any" required></label></div>
    <label>Check-in<input type="datetime-local" id="bIn" value="${toInput()}"></label>
    <div id="guests"></div><button class="btn block">Book room</button></div></form>`;
  const sel = $('#bRoom');
  if (App.preRoom && rooms.some(r => r.room_no === App.preRoom)) sel.value = App.preRoom; App.preRoom = null;
  const show = () => $('#bookShow').innerHTML = slideshow(rooms.find(r => r.room_no === sel.value)?.room_images);
  sel.onchange = show; show();
  const drawGuests = () => { // add/remove guest blocks without wiping typed values
    const n = Math.max(1, Math.min(10, +$('#bN').value || 1)), box = $('#guests');
    while (box.children.length > n) box.lastChild.remove();
    while (box.children.length < n) box.insertAdjacentHTML('beforeend', `<fieldset class="guest"><legend>Guest ${box.children.length + 1}</legend>
      <input data-f="name" placeholder="Name"><input data-f="phone" type="tel" placeholder="Phone">
      <label>ID photo<input type="file" accept="image/*" data-f="id"></label></fieldset>`);
  };
  $('#bN').oninput = drawGuests; drawGuests();
  $('#bookForm').onsubmit = e => { e.preventDefault(); safe(async () => {
    const rent = $('#bRent').value; if (rent === '') throw new Error('Room rent is required');
    const room = sel.value, bid = crypto.randomUUID(), cin = fromInput($('#bIn').value) || new Date().toISOString(), gs = $$('.guest'), rows = [];
    for (const [i, g] of gs.entries()) {
      const f = $('[data-f=id]', g).files[0];
      rows.push({ booking_id: bid, room_no: room, no_of_guest: gs.length, check_in: cin, is_primary: i === 0, room_rent: i ? 0 : +rent,
        name: $('[data-f=name]', g).value.trim() || null, phoneno: $('[data-f=phone]', g).value.trim() || null,
        uploaded_id: f ? await uploadFile(BUCKET_IDS, f, 'ids') : null });
    }
    const { error } = await sb.from('customers').insert(rows);
    if (error) throw error.code === '23505' ? new Error('This room is already booked') : error;
    await sb.from('rooms').update({ booked: true }).eq('room_no', room);
    toast(`Room ${room} booked`); showTab('home');
  }); };
}

/* ---------- edit booking / extras / checkout ---------- */
function receipt(o) {
  modal(`<div class="receipt"><h2>${esc(HOTEL_NAME)}</h2><p class="muted">Receipt · Room ${esc(o.roomNo)}</p><p>${esc(o.names || 'Guest')}</p>
    <p class="muted">${fmt(o.cin)} → ${fmt(o.cout)}</p><table>
    <tr><td>Room rent${o.paid ? ' (paid)' : ''}</td><td>${money(o.rent)}</td></tr>
    ${o.extras.map(x => `<tr><td>${esc(x.category || 'Extra')}${x.note ? ' · ' + esc(x.note) : ''}</td><td>${money(x.amount)}</td></tr>`).join('')}
    <tr><td><b>Total due</b></td><td><b>${money(o.total)}</b></td></tr></table></div>
    <div class="actions no-print"><button class="btn ghost" data-close>Close</button><button class="btn" onclick="window.print()">Print</button></div>`);
}
function editBooking(roomNo) { return safe(async () => {
  const { data: guests, error } = await sb.from('customers').select('*').eq('room_no', roomNo).eq('checked_out', false).order('created_at');
  if (error) throw error; if (!guests.length) throw new Error('No active booking for this room');
  const p = guests.find(g => g.is_primary) || guests[0], bid = p.booking_id;
  let cats = [], extras = [];
  const load = async () => {
    const [c, x] = await Promise.all([sb.from('extra_categories').select('*').order('name'), sb.from('extra').select('*').eq('booking_id', bid).order('created_at')]);
    if (c.error || x.error) throw c.error || x.error; cats = c.data; extras = x.data;
  }; await load();
  const m = modal(`<h2>Room ${esc(roomNo)} <small>${guests.length} guest${guests.length > 1 ? 's' : ''}</small></h2>
    <div class="row"><label>Room rent (₹) *<input type="number" id="eRent" min="0" step="any" value="${p.room_rent ?? ''}"></label>
    <label class="check"><input type="checkbox" id="ePaid" ${p.rent_paid ? 'checked' : ''}> Rent already paid</label></div>
    <div class="row"><label>Check-in<input type="datetime-local" id="eIn" value="${toInput(p.check_in)}"></label>
    <label>Check-out<input type="datetime-local" id="eOut" value="${p.check_out ? toInput(p.check_out) : ''}"></label></div>
    <h3>Guests</h3>${guests.map((g, i) => `<fieldset class="guest" data-gid="${g.id}"><legend>Guest ${i + 1}</legend>
      <input data-f="name" placeholder="Name" value="${esc(g.name)}"><input data-f="phone" placeholder="Phone" value="${esc(g.phoneno)}">
      <div class="idrow">${g.uploaded_id ? `<button type="button" class="btn small ghost" data-view="${esc(g.uploaded_id)}">View ID</button>` : '<span class="muted">No ID</span>'}
      <input type="file" accept="image/*" data-f="id"></div></fieldset>`).join('')}
    <h3>Extras</h3><div id="exList"></div>
    <div class="row ex-add"><select id="exCat"></select><input type="number" id="exAmt" placeholder="Amount" min="0" step="any"><input id="exNote" placeholder="Note"><button class="btn small" id="exAdd" type="button">Add</button></div>
    <details><summary>Manage categories</summary><div id="catBox"></div></details>
    <div class="bill" id="bill"></div>
    <div class="actions"><button class="btn ghost" data-close>Close</button><button class="btn ghost" id="eSave">Save</button><button class="btn danger" id="eOutBtn">Check out</button></div>`, 'wide');
  const totals = () => ({ rent: $('#ePaid', m).checked ? 0 : +$('#eRent', m).value || 0, ex: extras.reduce((a, x) => a + +x.amount, 0) });
  const drawBill = () => { const t = totals(); $('#bill', m).innerHTML = `<div><span>Room rent${$('#ePaid', m).checked ? ' (paid)' : ''}</span><b>${money(t.rent)}</b></div><div><span>Extras</span><b>${money(t.ex)}</b></div><div class="grand"><span>Amount due</span><b>${money(t.rent + t.ex)}</b></div>`; };
  const reload = async () => { await load(); drawEx(); };
  const drawEx = () => {
    $('#exList', m).innerHTML = extras.map(x => `<div class="ex-item"><span>${esc(x.category || 'Extra')}${x.note ? ' · ' + esc(x.note) : ''}</span><b>${money(x.amount)}</b><button type="button" class="x" data-xd="${x.id}">×</button></div>`).join('') || '<p class="muted">No extras added</p>';
    $('#exCat', m).innerHTML = cats.length ? cats.map(c => `<option>${esc(c.name)}</option>`).join('') : '<option value="">No categories</option>';
    $('#catBox', m).innerHTML = cats.map(c => `<div class="cat-row"><input value="${esc(c.name)}" data-cid="${c.id}"><button type="button" class="btn small ghost" data-cs="${c.id}">Save</button><button type="button" class="x" data-cd="${c.id}">×</button></div>`).join('')
      + '<div class="cat-row"><input id="newCat" placeholder="New category"><button type="button" class="btn small" id="catAdd">Add</button></div>';
    $$('[data-xd]', m).forEach(b => b.onclick = () => safe(async () => { const { error } = await sb.from('extra').delete().eq('id', b.dataset.xd); if (error) throw error; await reload(); }));
    $$('[data-cs]', m).forEach(b => b.onclick = () => safe(async () => { const v = $(`[data-cid="${b.dataset.cs}"]`, m).value.trim(); if (!v) return; const { error } = await sb.from('extra_categories').update({ name: v }).eq('id', b.dataset.cs); if (error) throw error; await reload(); toast('Category updated'); }));
    $$('[data-cd]', m).forEach(b => b.onclick = () => safe(async () => { const { error } = await sb.from('extra_categories').delete().eq('id', b.dataset.cd); if (error) throw error; await reload(); }));
    $('#catAdd', m).onclick = () => safe(async () => { const v = $('#newCat', m).value.trim(); if (!v) return; const { error } = await sb.from('extra_categories').insert({ name: v }); if (error) throw error; await reload(); });
    drawBill();
  }; drawEx();
  $$('[data-view]', m).forEach(b => b.onclick = () => viewId(b.dataset.view));
  $('#ePaid', m).onchange = $('#eRent', m).oninput = drawBill;
  $('#exAdd', m).onclick = () => safe(async () => {
    const amt = $('#exAmt', m).value; if (amt === '') throw new Error('Enter an amount');
    const { error } = await sb.from('extra').insert({ booking_id: bid, room_no: roomNo, amount: +amt, note: $('#exNote', m).value.trim() || null, category: $('#exCat', m).value || null });
    if (error) throw error; $('#exAmt', m).value = $('#exNote', m).value = ''; await reload();
  });
  const saveStay = async () => {
    const rent = $('#eRent', m).value; if (rent === '') throw new Error('Room rent is required');
    let r = await sb.from('customers').update({ check_in: fromInput($('#eIn', m).value), check_out: fromInput($('#eOut', m).value), rent_paid: $('#ePaid', m).checked }).eq('booking_id', bid); if (r.error) throw r.error;
    r = await sb.from('customers').update({ room_rent: +rent }).eq('id', p.id); if (r.error) throw r.error;
    for (const el of $$('.guest', m)) {
      const row = { name: $('[data-f=name]', el).value.trim() || null, phoneno: $('[data-f=phone]', el).value.trim() || null };
      const f = $('[data-f=id]', el).files[0]; if (f) row.uploaded_id = await uploadFile(BUCKET_IDS, f, 'ids');
      r = await sb.from('customers').update(row).eq('id', el.dataset.gid); if (r.error) throw r.error;
    }
  };
  $('#eSave', m).onclick = () => safe(async () => { await saveStay(); toast('Saved'); showTab(App.tab); });
  $('#eOutBtn', m).onclick = () => safe(async () => {
    if (!$('#eOut', m).value) $('#eOut', m).value = toInput();
    await saveStay(); const t = totals();
    if (!confirm(`Check out Room ${roomNo}?\nAmount due: ${money(t.rent + t.ex)}`)) return;
    const o = { roomNo, names: $$('[data-f=name]', m).map(i => i.value.trim()).filter(Boolean).join(', '), cin: fromInput($('#eIn', m).value), cout: fromInput($('#eOut', m).value), paid: $('#ePaid', m).checked, rent: t.rent, extras: [...extras], total: t.rent + t.ex };
    let r = await sb.from('customers').update({ checked_out: true }).eq('booking_id', bid); if (r.error) throw r.error;
    r = await sb.from('rooms').update({ booked: false }).eq('room_no', roomNo); if (r.error) throw r.error;
    toast(`Room ${roomNo} is available again`); receipt(o); showTab(App.tab);
  });
}); }

/* ---------- enquiries ---------- */
async function renderEnquiries() {
  const { data, error } = await sb.from('enquiries').select('*').order('created_at', { ascending: false }); if (error) throw error;
  const v = $('#view-enquiries');
  v.innerHTML = `<div class="toolbar"><h2>Enquiries</h2></div>` + (data.length ? `<div class="enq-grid">${data.map(q => `<div class="enq-card">
    <div class="top"><b>${esc(q.name)}</b><button class="x" data-eq="${q.id}" title="Mark done">×</button></div>
    <a href="tel:${esc(q.phoneno)}">${esc(q.phoneno)}</a><span>Room ${esc(q.room_no || '—')}</span>
    ${q.message ? `<p class="muted">${esc(q.message)}</p>` : ''}<small>${fmt(q.created_at)}</small></div>`).join('')}</div>` : '<p class="empty-msg">No enquiries yet.</p>');
  $$('[data-eq]', v).forEach(b => b.onclick = () => safe(async () => { const { error } = await sb.from('enquiries').delete().eq('id', b.dataset.eq); if (error) throw error; renderEnquiries(); }));
}