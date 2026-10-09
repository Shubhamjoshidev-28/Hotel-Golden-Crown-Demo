(async () => {
  if (await initDashboard(['staff', 'owner'])) registerTabs({ home: renderHome, rooms: renderRooms, book: renderBook, enquiries: renderEnquiries });
})();
