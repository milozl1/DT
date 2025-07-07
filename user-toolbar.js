// Toolbar și calendar pentru utilizator cu filtrare și navigare săptămânală

window.renderUserToolbar = function(container) {
  container.innerHTML = `
    <div class="toolbar toolbar-modern">
      <input type="text" id="searchInput" class="toolbar-input" placeholder="Caută angajat...">
      <select id="groupSelect" class="toolbar-select">
        <option value="">Toate grupele</option>
        <option value="Parter">Parter</option>
        <option value="Etaj">Etaj</option>
        <option value="Management">Management</option>
        <option value="Externi">Externi</option>
      </select>
    </div>
  `;
  const searchInput = container.querySelector('#searchInput');
  const groupSelect = container.querySelector('#groupSelect');
  // Setează valorile inițiale din state
  searchInput.value = window.userCalendarState.search || '';
  groupSelect.value = window.userCalendarState.group || '';
  searchInput.addEventListener('input', () => {
    window.userCalendarState.search = searchInput.value;
    window.userCalendarState.group = groupSelect.value;
    window.currentMonday = window.userCalendarState.monday;
    window.renderUserCalendar(window.userCalendarState.monday, window.userCalendarState.search, window.userCalendarState.group);
  });
  groupSelect.addEventListener('change', () => {
    window.userCalendarState.search = searchInput.value;
    window.userCalendarState.group = groupSelect.value;
    window.currentMonday = window.userCalendarState.monday;
    window.renderUserCalendar(window.userCalendarState.monday, window.userCalendarState.search, window.userCalendarState.group);
  });
};

window.userCalendarState = {
  monday: window.getMondayOf(new Date()),
  search: '',
  group: ''
};

window.renderUserCalendar = async function(monday, search, group) {
  window.userCalendarState.monday = window.getMondayOf(monday);
  window.userCalendarState.search = search || '';
  window.userCalendarState.group = group || '';

  // Actualizează eticheta săptămânii
  const weekLabel = document.getElementById('weekInterval') || document.getElementById('currentWeekLabel');
  if (weekLabel) {
    const d = new Date(window.userCalendarState.monday); d.setHours(0,0,0,0);
    const sunday = new Date(d); sunday.setDate(d.getDate() + 6);
    const fmt = dt => dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    weekLabel.textContent = fmt(d) + ' — ' + fmt(sunday);
  }

  // Filtrare angajați (identic cu admin)
  const db = window.db;
  let allEmployees = await db.collection('employees').get().then(qs => qs.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  let employees = allEmployees.slice();
  function getEmployeeGroup(e) {
    const dep = (e.department || '').trim();
    if (dep === 'Women') return 'Parter';
    if (dep === 'Men' || dep === 'Kids') return 'Etaj';
    if (["Store Manager", "SM Deputy", "SVIM"].includes(dep)) return 'Management';
    if (dep === 'Emblema') return 'Externi';
    if (e.group) return e.group;
    return '';
  }
  if (window.userCalendarState.group) {
    employees = employees.filter(e => getEmployeeGroup(e) === window.userCalendarState.group);
  }
  if (window.userCalendarState.search) {
    const search = window.userCalendarState.search.toLowerCase();
    employees = employees.filter(e => {
      const ln = (e.lastName || '').toLowerCase();
      const fn = (e.firstName || '').toLowerCase();
      return (ln + ' ' + fn).includes(search) || (fn + ' ' + ln).includes(search) || (e.id && e.id.toLowerCase().includes(search));
    });
  }

  // Încarcă taskurile pentru săptămână (ca în admin)
  const weekKey = window.getWeekKey(window.userCalendarState.monday);
  const calendar = document.getElementById('calendar');
  if (window.renderCustomCalendarForWeek) {
    // Transmite și employeeIds pentru filtrare corectă în calendar.js
    window.renderCustomCalendarForWeek({
      container: calendar,
      db: window.db,
      weekKey,
      employeeIds: employees.map(e => e.id)
    });
  } else {
    calendar.innerHTML = '<div style="padding:32px;text-align:center;color:#e74c3c;">Eroare: calendar.js nu este încărcat!</div>';
  }
};

window.addEventListener('DOMContentLoaded', function() {
  const toolbarContainer = document.getElementById('toolbarContainer');
  const prevBtn = document.getElementById('userPrevWeekBtn');
  const nextBtn = document.getElementById('userNextWeekBtn');
  window.renderUserToolbar(toolbarContainer);
  if (prevBtn) prevBtn.onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const newMonday = new Date(window.userCalendarState.monday);
    newMonday.setDate(newMonday.getDate() - 7);
    window.userCalendarState.monday = window.getMondayOf(newMonday);
    window.currentMonday = window.userCalendarState.monday;
    window.renderUserCalendar(window.userCalendarState.monday, window.userCalendarState.search, window.userCalendarState.group);
  };
  if (nextBtn) nextBtn.onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const newMonday = new Date(window.userCalendarState.monday);
    newMonday.setDate(newMonday.getDate() + 7);
    window.userCalendarState.monday = window.getMondayOf(newMonday);
    window.currentMonday = window.userCalendarState.monday;
    window.renderUserCalendar(window.userCalendarState.monday, window.userCalendarState.search, window.userCalendarState.group);
  };
  // La inițializare, folosește filtrele din state
  window.currentMonday = window.userCalendarState.monday;
  window.renderUserCalendar(window.userCalendarState.monday, window.userCalendarState.search, window.userCalendarState.group);
});


