/* Public page: only rooms that are not booked; clicking one opens gallery + enquiry form */
(async () => {
  $('#hotelName').textContent = HOTEL_NAME;
  await safe(async () => {
    const rooms = (await getRooms()).filter(r => !r.booked);
    $('#roomGrid').innerHTML = rooms.map(r => `<article class="room-card free" data-id="${r.id}">${slideshow(r.room_images)}
      <div class="rc-body"><h3>Room ${esc(r.room_no)}</h3><span>${esc(r.room_category)}</span></div></article>`).join('')
      || '<p class="empty-msg">All rooms are currently booked. Please check back soon.</p>';
    $$('.room-card').forEach(c => c.onclick = () => open(rooms.find(r => r.id === c.dataset.id)));
  });
  function open(r) {
    const m = modal(`<h2>Room ${esc(r.room_no)} <small>${esc(r.room_category)}</small></h2>
      <div class="gallery">${r.room_images.length ? `<img id="gMain" src="${esc(r.room_images[0])}" alt=""><div class="thumbs">${r.room_images.map(u => `<div class="thumb"><img data-g="${esc(u)}" src="${esc(u)}" alt=""></div>`).join('')}</div>` : '<p class="muted">No photos yet</p>'}</div>
      <div class="stack"><input id="qN" placeholder="Your name"><input id="qP" type="tel" placeholder="Phone number"><textarea id="qM" rows="2" placeholder="Your enquiry (optional)"></textarea>
      <button class="btn block" id="qS">Send enquiry</button></div>`, 'wide');
    $$('[data-g]', m).forEach(i => i.onclick = () => $('#gMain', m).src = i.dataset.g);
    $('#qS', m).onclick = () => safe(async () => {
      const name = $('#qN', m).value.trim(), phone = $('#qP', m).value.trim();
      if (!name || !phone) throw new Error('Please enter your name and phone number');
      const { error } = await sb.from('enquiries').insert({ name, phoneno: phone, room_no: r.room_no, message: $('#qM', m).value.trim() || null });
      if (error) throw error; closeModal(); toast('Enquiry sent. We will contact you soon!');
    });
  }
})();