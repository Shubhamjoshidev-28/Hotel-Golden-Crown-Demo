/* Owner dashboard: analytics cards + staff management. Rooms/booking/enquiries come from main.js */
const lineChart = (vals, labels) => {
  const W = 320, H = 120, p = 14, max = Math.max(...vals, 1);
  const x = i => p + i * (W - 2 * p) / Math.max(vals.length - 1, 1), y = v => H - p - (v / max) * (H - 2 * p);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart"><polyline points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.5"><title>${labels[i]}: ${money(v)}</title></circle>`).join('')}</svg>`;
};
const barChart = (vals, labels) => {
  const W = 320, H = 130, p = 16, max = Math.max(...vals, 1), bw = (W - 2 * p) / vals.length, short = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${vals.map((v, i) => {
    const h = (v / max) * (H - 2 * p - 12), cx = p + i * bw + bw / 2;
    return `<rect x="${p + i * bw + bw * .15}" y="${H - p - h}" width="${bw * .7}" height="${h}" rx="3"><title>${labels[i]}: ${v}</title></rect>
      <text class="v" x="${cx}" y="${H - p - h - 3}" text-anchor="middle">${short(v)}</text><text x="${cx}" y="${H - 3}" text-anchor="middle">${labels[i]}</text>`;
  }).join('')}</svg>`;
};

function staffForm(s) {
  const m = modal(`<h2>${s ? 'Edit' : 'Add'} staff</h2><div class="stack">
    <input id="sN" placeholder="Name" value="${esc(s?.name)}"><input id="sP" placeholder="Phone" value="${esc(s?.phoneno)}">
    <input id="sU" placeholder="Username" value="${esc(s?.username)}" ${s ? 'disabled' : ''}>
    ${s ? '' : '<input id="sW" type="password" placeholder="Password (min 6 characters)">'}
    <input id="sH" placeholder="Working hours e.g. 9 AM – 5 PM" value="${esc(s?.work_hours)}"></div>
    <div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="sS">Save</button></div>`);
  $('#sS', m).onclick = () => safe(async () => {
    const row = { name: $('#sN', m).value.trim(), phoneno: $('#sP', m).value.trim(), work_hours: $('#sH', m).value.trim() };
    if (!row.name) throw new Error('Name is required');
    if (s) { const { error } = await sb.from('hotel_users').update(row).eq('id', s.id); if (error) throw error; }
    else {
      const u = $('#sU', m).value.trim().toLowerCase(), pw = $('#sW', m).value;
      if (!u || pw.length < 6) throw new Error('Username and a 6+ character password are required');
      // separate non-persisting client so creating staff doesn't log the owner out
      const tmp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'tmp-signup' } });
      const { data, error: e } = await tmp.auth.signUp({ email: emailFor(u), password: pw }); if (e) throw e;
      const { error } = await sb.from('hotel_users').insert({ ...row, username: u, role: 'staff', auth_id: data.user.id }); if (error) throw error;
    }
    closeModal(); toast('Staff saved'); showTab('home');
  });
}

async function renderAnalytics() {
  const from = new Date(); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
  const [{ data, error }, st] = await Promise.all([
    sb.from('customers').select('room_no,name,check_in,room_rent,is_primary').gte('check_in', from.toISOString()),
    sb.from('hotel_users').select('*').eq('role', 'staff').order('created_at')]);
  if (error || st.error) throw error || st.error;
  const days = [...Array(30)].map((_, i) => { const d = new Date(from); d.setDate(from.getDate() + i); return dayKey(d); });
  const sale = {}, rooms = {}, guests = {}; days.forEach(k => sale[k] = rooms[k] = guests[k] = 0);
  const todayRows = [];
  data.forEach(r => {
    const k = dayKey(r.check_in); if (!(k in sale)) return;
    guests[k]++; if (r.is_primary) { rooms[k]++; sale[k] += +r.room_rent || 0; if (k === days[29]) todayRows.push(r); }
  });
  const sum = (o, ks) => ks.reduce((a, k) => a + o[k], 0), t = days[29], w = days.slice(23);
  const wd = k => new Date(k + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short' });
  $('#analytics').innerHTML = `
  <section class="card"><div class="card-h"><h3>Staff</h3><button class="btn small" id="staffAdd">+ Add</button></div>
    ${st.data.map(s => `<div class="srow"><div><b>${esc(s.name)}</b><small>${esc(s.phoneno)} · @${esc(s.username)}</small><small>🕒 ${esc(s.work_hours || 'Hours not set')}</small></div>
    <div><button class="btn small ghost" data-se="${s.id}">Edit</button><button class="x" data-sd="${s.id}">×</button></div></div>`).join('') || '<p class="muted">No staff yet</p>'}</section>
  <section class="card"><h3>Today's sale</h3><div class="kpis"><div><small>Rent collected</small><b>${money(sale[t])}</b></div></div>
    ${todayRows.map(r => `<div class="lrow" data-room="${esc(r.room_no)}"><span>Room ${esc(r.room_no)} · ${esc(r.name || 'Guest')}</span><b>${money(r.room_rent)}</b></div>`).join('') || '<p class="muted">No bookings today</p>'}</section>
  <section class="card"><h3>Today</h3><div class="kpis"><div><small>Rooms booked</small><b>${rooms[t]}</b></div><div><small>Guests arrived</small><b>${guests[t]}</b></div></div></section>
  <section class="card wide"><h3>Monthly report <small>last 30 days</small></h3>
    <div class="kpis"><div><small>Total sale</small><b>${money(sum(sale, days))}</b></div><div><small>Rooms booked</small><b>${sum(rooms, days)}</b></div></div>
    ${lineChart(days.map(k => sale[k]), days)}<small>Rooms booked per day</small>
    <div class="daygrid">${days.map(k => `<div title="${k}"><small>${+k.slice(8)}</small><b>${rooms[k]}</b></div>`).join('')}</div></section>
  <section class="card wide"><h3>Weekly report <small>last 7 days</small></h3>
    <div class="kpis"><div><small>Total sale</small><b>${money(sum(sale, w))}</b></div><div><small>Rooms booked</small><b>${sum(rooms, w)}</b></div></div>
    <div class="charts2"><div><small>Daily sale (₹)</small>${barChart(w.map(k => sale[k]), w.map(wd))}</div><div><small>Rooms booked</small>${barChart(w.map(k => rooms[k]), w.map(wd))}</div></div></section>`;
  $('#staffAdd').onclick = () => staffForm();
  $$('[data-se]').forEach(b => b.onclick = () => staffForm(st.data.find(s => s.id === b.dataset.se)));
  $$('[data-sd]').forEach(b => b.onclick = () => safe(async () => {
    if (!confirm('Remove this staff member? They will no longer be able to log in.')) return;
    const { error } = await sb.from('hotel_users').delete().eq('id', b.dataset.sd); if (error) throw error; toast('Staff removed'); renderAnalytics();
  }));
  $$('.lrow').forEach(r => r.onclick = () => editBooking(r.dataset.room));
}

(async () => {
  if (await initDashboard(['owner'])) registerTabs({
    home: () => Promise.all([renderHome(), renderAnalytics()]),
    rooms: renderRooms, book: renderBook, enquiries: renderEnquiries });
})();