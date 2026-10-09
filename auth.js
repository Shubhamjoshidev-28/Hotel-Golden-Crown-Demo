/* Login + owner registration. Supabase Auth is the first gate; the `users` table (role) is the second. */
$('#hotelName').textContent = HOTEL_NAME;
const go = u => location.href = u.role === 'owner' ? 'ownerdashboard.html' : 'staffdashboard.html';
async function enter() {
  const { data: { session } } = await sb.auth.getSession(); if (!session) return;
  const { data: u } = await sb.from('hotel_users').select('*').eq('auth_id', session.user.id).maybeSingle();
  if (u) return go(u);
  await sb.auth.signOut(); throw new Error('This account is not registered in the hotel system');
}
$$('[data-t]').forEach(b => b.onclick = () => {
  $$('[data-t]').forEach(x => x.classList.toggle('ghost', x !== b));
  $('#login').hidden = b.dataset.t !== 'login'; $('#register').hidden = b.dataset.t !== 'register';
});
$('#login').onsubmit = e => { e.preventDefault(); safe(async () => {
  const { error } = await sb.auth.signInWithPassword({ email: emailFor($('#lu').value), password: $('#lp').value });
  if (error) throw new Error('Invalid username or password'); await enter();
}); };
$('#register').onsubmit = e => { e.preventDefault(); safe(async () => {
  const u = $('#ru').value.trim().toLowerCase();
  const { data, error } = await sb.auth.signUp({ email: emailFor(u), password: $('#rp').value }); if (error) throw error;
  if (!data.session) throw new Error('Turn OFF "Confirm email" in Supabase Auth settings, then try again');
  const { error: e2 } = await sb.from('hotel_users').insert({ auth_id: data.user.id, name: $('#rn').value.trim(), phoneno: $('#rph').value.trim(), username: u, role: 'owner' });
  if (e2) { await sb.auth.signOut(); throw new Error('An owner is already registered. Ask the owner for a staff login.'); }
  await enter();
}); };
safe(enter);