// user-mobile-calendar.js
// Mobile-first user calendar logic: week navigation, filtering, Firestore fetch, and rendering

// --- CONFIG ---
const FIRESTORE_COLLECTION = 'shifts'; // Change if your collection is named differently

// --- STATE ---
let currentMonday = getMondayOf(new Date());
// Asigură-te că există și global pentru toolbar.js
window.currentMonday = currentMonday;
let lastSearch = '';
let lastGroup = '';

// --- DOM Elements ---
const weekLabel = document.getElementById('userCurrentWeekLabel');
const calendarList = document.getElementById('userCalendar');
const prevBtn = document.getElementById('userPrevWeekBtn');
const nextBtn = document.getElementById('userNextWeekBtn');
const searchInput = document.getElementById('userSearchInput');
const groupSelect = document.getElementById('userGroupSelect');

if (searchInput) {
  searchInput.addEventListener('input', e => {
    lastSearch = e.target.value.trim();
    renderUserCalendar();
  });
}
if (groupSelect) {
  groupSelect.addEventListener('change', e => {
    lastGroup = e.target.value;
    renderUserCalendar();
  });
}

// --- Week Navigation ---
function updateWeekLabel() {
  const end = new Date(currentMonday);
  end.setDate(currentMonday.getDate() + 6);
  weekLabel.textContent = `${formatDate(currentMonday)} - ${formatDate(end)}`;
}

function formatDate(date) {
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth()+1).toString().padStart(2, '0')}`;
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

// --- Firestore Fetch ---
async function fetchShiftsAndTasks(monday, search, group) {
  if (!window.firebase || !window.firebase.firestore) return {shifts: [], tasks: {}};
  const db = firebase.firestore();
  const weekKey = window.getWeekKey ? window.getWeekKey(monday) : monday.toISOString().slice(0,10);
  // Fetch all employees for filtering
  const employeesSnap = await db.collection('employees').get();
  let employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (search) {
    const s = search.toLowerCase();
    employees = employees.filter(e => {
      const ln = (e.lastName || '').toLowerCase();
      const fn = (e.firstName || '').toLowerCase();
      return (ln + ' ' + fn).includes(s) || (fn + ' ' + ln).includes(s) || (e.id && e.id.toLowerCase().includes(s));
    });
  }
  // Fetch all shifts for weekKey once, for all cases
  const shiftsSnap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
  const allShifts = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (group) {
    const groupLower = group.toLowerCase();
    employees = employees.filter(e => {
      const dept = (e.department || '').toLowerCase().replace(/\s+/g, '');
      const empShifts = allShifts.filter(s => s.employeeId === e.id);
      if (groupLower === 'parter') {
        return empShifts.some(s => (s.location || '').toLowerCase().replace(/\s+/g, '') === 'parter');
      }
      if (groupLower === 'etaj') {
        return empShifts.some(s => (s.location || '').toLowerCase().replace(/\s+/g, '') === 'etaj');
      }
      if (groupLower === 'management') {
        return dept === 'storemanager' || dept === 'smdeputy' || dept === 'svim';
      }
      if (groupLower === 'extern') {
        return dept === 'emblema';
      }
      return false;
    });
  }
  const employeeIds = employees.map(e => e.id);
  let shifts = allShifts;
  if (group && employeeIds.length) {
    shifts = allShifts.filter(s => employeeIds.includes(s.employeeId));
  }
  // Fetch tasks for weekKey
  let tasks = {};
  try {
    const tasksDoc = await db.collection('tasks').doc(weekKey).get();
    tasks = tasksDoc.exists ? (tasksDoc.data().tasks || {}) : {};
  } catch {}
  return { shifts, tasks, employees };
}

// --- Render Calendar ---
function getLocalHoursArray() {
  // Returnează sloturi de la 07:00 la 22:30 dinamic, fără a modifica window.HOURS
  const arr = [];
  for (let h = 7; h <= 22; h++) {
    arr.push(`${h.toString().padStart(2, '0')}:00`);
    if (!(h === 22 && 30 > 0)) arr.push(`${h.toString().padStart(2, '0')}:30`);
  }
  arr.push('22:30');
  return arr;
}

async function renderUserCalendar() {
  window.currentMonday = currentMonday;
  updateWeekLabel();
  // Show loading message before user is resolved
  calendarList.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;">Se încarcă...</div>';
  let error = '';
  let data = { shifts: [], tasks: {}, employees: [] };
  try {
    data = await fetchShiftsAndTasks(currentMonday, lastSearch, lastGroup);
  } catch (e) {
    error = e.message || 'Eroare la încărcarea datelor.';
  }
  if (error) {
    calendarList.innerHTML = `<div style='color:#b00;text-align:center;padding:32px 0;'>${error}</div>`;
    return;
  }
  let { shifts, tasks, employees } = data;
  // Asigură variabile globale pentru statistics.js (pentru statistici premium)
  window.employees = employees;
  window.weekShifts = shifts;
  // leavesForWeek va fi setat mai jos după fetch
  const days = window.DAYS || ['Luni','Marti','Miercuri','Joi','Vineri','Sambata','Duminica'];
  if (!employees.length) {
    calendarList.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;">Niciun angajat găsit pentru această săptămână.</div>';
    return;
  }
  // --- LEAVE: Fetch all leaves for current week and build leaveMap before any usage ---
  let weekKey = window.getWeekKey ? window.getWeekKey(currentMonday) : currentMonday.toISOString().slice(0,10);
  let allLeaves = [];
  if (window.firebase && window.firebase.firestore) {
    const db = firebase.firestore();
    const leavesSnap = await db.collection('leaves')
      .where('weekKey', '==', weekKey)
      .get();
    allLeaves = leavesSnap.docs.map(doc => doc.data());
  }
  // Build a map: { employeeId: leaveData }
  const leaveMap = {};
  for (const leave of allLeaves) {
    if (leave.employeeId) leaveMap[leave.employeeId] = leave;
  }
  // Set global for statistics.js
  window.leavesForWeek = allLeaves;
  // --- User profile and statistics modal logic (now safe to use leaveMap) ---
  let user = null;
  let userId = window.userId || localStorage.getItem('userId');
  if (window.currentUser) {
    user = employees.find(e => e.id === window.currentUser.id);
  } else if (userId) {
    user = employees.find(e => e.id === userId);
  } else if (employees.length === 1) {
    user = employees[0];
  }
  // Profil vizual
  if (user) {
    // Îmbunătățire vizuală profil angajat cu buton statistici generale
    const profileContainer = document.getElementById('userProfile');
    if (profileContainer) {
      // Emoticoane pentru avatar random (listă extinsă)
      const avatarEmojis = [
        '😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','🙂‍↕️','😏',
        '😩','🥺','😢','😭','😮‍💨','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🫣','🤗','🫡','🤔','🫢','🤭','🤫','🤥','😶','😶‍🌫️','😐','😑','😬','🫨','🫠','🙄','😯','😦','😧','😮','😲','🥱','🤤','😪','😵','😵‍💫','🫥','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','🤡','👻','💀','☠️','👽','👾','🤖','🎃','😺'
      ];
      const randomEmoji = avatarEmojis[Math.floor(Math.random() * avatarEmojis.length)];
      profileContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;border-radius:22px;box-shadow:0 8px 32px #0002;padding:38px 28px 32px 28px;max-width:370px;margin:38px auto 32px auto;position:relative;">
          <div style="width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,#e3f2fd 60%,#fff 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 16px #1976d220;margin-bottom:22px;">
            <span style='font-size:3.2em;line-height:1;'>${randomEmoji}</span>
          </div>
          <div style="font-size:1.5em;font-weight:700;color:#222;margin-bottom:6px;letter-spacing:0.5px;text-align:center;">${user.lastName || ''} ${user.firstName || ''}</div>
          <div style="font-size:1.08em;font-weight:500;color:#1976d2;margin-bottom:10px;text-align:center;">${user.department || '-'}</div>
          <div style="font-size:1.08em;color:#444;margin-bottom:22px;text-align:center;">Normă: <span style='font-weight:600;color:#388e3c;'>${user.norma || '-'}</span></div>
          <button id='showGeneralStatsBtn' style='background:linear-gradient(90deg,#1976d2 60%,#64b5f6 100%);color:#fff;font-weight:600;border:none;border-radius:10px;padding:12px 0;font-size:1.08em;box-shadow:0 2px 12px #1976d230;cursor:pointer;transition:background 0.2s;width:100%;max-width:260px;margin-bottom:18px;'>Statistici generale</button>
          <button id='userLogoutBtn' style='background:linear-gradient(90deg,#d32f2f 60%,#ff7043 100%);color:#fff;font-weight:600;border:none;border-radius:8px;padding:10px 0;font-size:1em;box-shadow:0 2px 8px #d32f2f30;cursor:pointer;transition:background 0.2s;width:100%;max-width:260px;'>Logout</button>
        </div>
      `;
      // Adaugă event pentru butonul de statistici generale
      setTimeout(() => {
        const statsBtn = document.getElementById('showGeneralStatsBtn');
        if (statsBtn) {
          statsBtn.onclick = function() {
          // Folosește statisticsPanel din HTML ca modal, fără overlay
          const statsPanel = document.getElementById('statisticsPanel');
          if (!statsPanel) return;
          statsPanel.style.display = 'block';
          statsPanel.style.position = 'fixed';
          statsPanel.style.top = '50%';
          statsPanel.style.left = '50%';
          statsPanel.style.transform = 'translate(-50%, -50%)';
          statsPanel.style.background = '#fff';
          statsPanel.style.zIndex = '100000';
          statsPanel.style.maxHeight = '90vh';
          statsPanel.style.overflowY = 'auto';
          statsPanel.style.boxShadow = '0 8px 32px #0003';
          statsPanel.style.borderRadius = '22px';
          statsPanel.style.padding = '38px 28px 32px 28px';
          // Buton închidere
          let closeBtn = document.createElement('button');
          closeBtn.innerHTML = '&times;';
          closeBtn.title = 'Închide';
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '18px';
          closeBtn.style.right = '22px';
          closeBtn.style.fontSize = '2em';
          closeBtn.style.background = 'none';
          closeBtn.style.border = 'none';
          closeBtn.style.color = '#888';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.transition = 'color .15s';
          closeBtn.onmouseover = function() { closeBtn.style.color = '#d32f2f'; };
          closeBtn.onmouseout = function() { closeBtn.style.color = '#888'; };
          closeBtn.onclick = function(ev) { ev.stopPropagation(); closeStats(); };
          statsPanel.appendChild(closeBtn);
          // Apelează funcția de randare statistici
          if (typeof window.renderStatisticsPanel === 'function') {
            let weekKey = window.getWeekKey ? window.getWeekKey(window.currentMonday) : window.currentMonday.toISOString().slice(0,10);
            window.renderStatisticsPanel(weekKey);
          } else {
            statsPanel.innerHTML = '<div style="text-align:center;color:#888;font-size:1.2em;padding:32px 0;">Statistici indisponibile</div>';
          }
          function closeStats() {
            statsPanel.style.display = 'none';
            // readaugă panelul înapoi în DOM la locul original
            const main = document.querySelector('main#userMobileCalendar');
            if (main) main.appendChild(statsPanel);
          }
          };
        }
      }, 0);
    }

    // --- Statistici personale: reconstruiește complet conținutul la click pe buton ---
    const statsModal = document.getElementById('userStatsModal');
    // Eliminat complet logica pentru userStatsModal și userStatsModalOverlay
  }
  document.getElementById('userProfile').style.display = user ? '' : 'none';
  // --- SORTARE ANGAJATI: Parter, Etaj, Management, Externi ---
  const getSortGroup = emp => {
    const loc = (emp.location || emp.group || emp.department || '').toLowerCase();
    if (loc.includes('parter')) return 0;
    if (loc.includes('etaj')) return 1;
    // Management: Store Manager, SM Deputy, SVIM, Management, etc
    if (["store manager","sm deputy","svim","management","manager"].some(m => loc.includes(m))) return 2;
    if (loc.includes('extern')) return 3;
    return 4; // fallback
  };
  employees = employees.slice().sort((a, b) => {
    const gA = getSortGroup(a);
    const gB = getSortGroup(b);
    if (gA !== gB) return gA - gB;
    // Secondary: sort by lastName, then firstName
    const lnA = (a.lastName || '').toLowerCase();
    const lnB = (b.lastName || '').toLowerCase();
    if (lnA !== lnB) return lnA.localeCompare(lnB);
    const fnA = (a.firstName || '').toLowerCase();
    const fnB = (b.firstName || '').toLowerCase();
    return fnA.localeCompare(fnB);
  });
  // Build a map for quick shift lookup: { [day]: { [employeeId]: shift } }
  const shiftMap = {};
  for (const day of days) shiftMap[day] = {};
  for (const shift of shifts) {
    let day = shift.day;
    if (day === 'Marți') day = 'Marti';
    if (day === 'Sâmbătă') day = 'Sambata';
    if (day === 'Duminică') day = 'Duminica';
    shiftMap[day][shift.employeeId] = shift;
  }
  // Render grid
  // Determină ultimul slot de jumătate de oră necesar (maxim endHour:endMinute din shifuri)
  let maxEnd = 1350; // fallback: 22:30
  if (shifts.length) {
    maxEnd = Math.max(...shifts.map(s => (s.endHour || 0) * 60 + (s.endMinute || 0)), 1350);
    // rotunjim la următoarea jumătate de oră
    if (maxEnd % 30 !== 0) maxEnd = maxEnd + (30 - (maxEnd % 30));
  }
  // Folosește array local, nu window.HOURS!
  let localHours = getLocalHoursArray();
  let displayHours = localHours.filter(hh => {
    const [h, m] = hh.split(':').map(Number);
    const total = h * 60 + m;
    return total >= 360 && total <= maxEnd;
  });
  // Dacă ultimul shift se termină la o oră care nu există în localHours, adaugă slotul lipsă
  if (shifts.length) {
    const allEnds = shifts.map(s => (s.endHour || 0) * 60 + (s.endMinute || 0));
    const trueMaxEnd = Math.max(...allEnds);
    if (!displayHours.some(hh => {
      const [h, m] = hh.split(':').map(Number);
      return h * 60 + m === trueMaxEnd;
    })) {
      // Adaugă slotul lipsă la final
      const h = Math.floor(trueMaxEnd / 60);
      const m = trueMaxEnd % 60;
      const pad = n => n.toString().padStart(2, '0');
      displayHours.push(`${pad(h)}:${pad(m)}`);
    }
  }
  // Ajustează grid-template-columns pentru a reflecta corect numărul de coloane
  // Calculează câte ore afișate au label (doar orele rotunde de la 7:00 în sus)
  const hourLabelsCount = displayHours.filter(hh => {
    if (!hh.endsWith(':00')) return false;
    const hourNum = parseInt(hh.split(':')[0], 10);
    return hourNum > 6;
  }).length;
  // --- Inject professional, responsive calendar styles (only once) ---
  if (!document.getElementById('user-calendar-styles')) {
    const style = document.createElement('style');
    style.id = 'user-calendar-styles';
    style.innerHTML = `
      html, body {
        background: #f8f9fa;
        min-width: 0;
        max-width: none;
        overflow-x: hidden;
        padding: 0 !important;
        margin: 0 !important;
      }
      main#userMobileCalendar {
        width: fit-content !important;
        min-width: 0 !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
        background: #fff !important;
        box-shadow: 0 2px 16px #0001;
        padding: 0 !important;
        overflow-x: visible !important;
        border-radius: 0 0 18px 18px;
        border: none !important;
        position: relative;
        transition: width 0.2s;
      }
      #userCalendar {
        min-width: 0 !important;
        max-width: none !important;
        width: fit-content !important;
        padding: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        background: transparent !important;
        border: none !important;
        position: relative;
        transition: width 0.2s;
      }
      .user-calendar-wrapper {
        width: fit-content !important;
        min-width: 0 !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
        padding: 0 !important;
        border-radius: 0 0 18px 18px;
        box-shadow: none;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        min-height: 100vh;
        overflow-x: visible;
        background: transparent !important;
        border: none !important;
        transition: width 0.2s;
      }
      .user-calendar-grid {
        display: grid;
        grid-template-columns: 120px repeat(${displayHours.length}, 48px);
        grid-template-rows: 38px 20px repeat(100, 80px);
        width: fit-content;
        min-width: max-content;
        margin: 0 auto;
        box-sizing: border-box;
        gap: 0;
        border-bottom: 1px solid #e0e0e0;
        background: transparent !important;
        border: none !important;
        position: relative;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        transition: width 0.2s;
      }
      .calendar-toolbar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 56px;
        background: #fff;
        border-top: 1.5px solid #e0e0e0;
        box-shadow: 0 -2px 8px #0001;
        display: flex;
        align-items: center;
        justify-content: space-around;
        z-index: 100;
        touch-action: none;
      }
      /* --- MOBILE/TABLET RESPONSIVE --- */
      @media (max-width: 900px) {
        html, body {
          overflow-x: hidden !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        main#userMobileCalendar,
        #userCalendar,
        .user-calendar-wrapper {
          width: 100vw !important;
          min-width: 0 !important;
          max-width: 100vw !important;
          margin: 0 !important;
          padding: 0 !important;
          border-radius: 0 0 12px 12px;
        }
        .user-calendar-grid {
          width: 100vw !important;
          min-width: 0 !important;
          max-width: 100vw !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden !important;
          grid-template-columns: 80px repeat(${displayHours.length}, 1fr);
        }
        .calendar-hour-header, .calendar-halfhour-header {
          font-size: 0.78em !important;
          line-height: 1 !important;
          height: auto !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .calendar-bar-label {
          font-size: 0.95em !important;
        }
        .calendar-tasks, .calendar-task {
          font-size: 0.85em !important;
        }
        .calendar-emp-label {
          font-size: 0.68em !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          display: flex !important;
          text-align: left !important;
        }
      }
      @media (max-width: 700px) {
        .user-calendar-grid {
          width: 100vw !important;
          min-width: 0 !important;
          max-width: 100vw !important;
          grid-template-columns: 70px repeat(${displayHours.length}, 1fr);
        }
        .calendar-header-corner, .calendar-hour-header, .calendar-halfhour-header, .calendar-emp-label {
          font-size: 0.85em !important;
          min-width: 0;
          max-width: 100%;
          padding-left: 1px;
          padding-right: 1px;
        }
        .calendar-hour-header, .calendar-halfhour-header {
          font-size: 0.72em !important;
          line-height: 1 !important;
          height: auto !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .calendar-bar-label {
          font-size: 0.62em !important;
        }
        .calendar-tasks, .calendar-task {
          font-size: 0.78em !important;
        }
        .calendar-emp-label {
          font-size: 0.58em !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          display: flex !important;
          text-align: left !important;
        }
      }
      @media (max-width: 600px) {
        .user-calendar-grid {
          width: 100vw !important;
          min-width: 0 !important;
          max-width: 100vw !important;
          grid-template-columns: 60px repeat(${displayHours.length}, 1fr);
        }
        .calendar-header-corner, .calendar-hour-header, .calendar-halfhour-header, .calendar-emp-label {
          font-size: 0.78em !important;
          padding-left: 0px;
          padding-right: 0px;
        }
        .calendar-hour-header, .calendar-halfhour-header {
          font-size: 0.47em !important;
          line-height: 1 !important;
          height: auto !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .calendar-bar-label {
          font-size: 0.78em !important;
        }
        .calendar-tasks, .calendar-task {
          font-size: 0.72em !important;
        }
        .calendar-emp-label {
          font-size: 0.52em !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          display: flex !important;
          text-align: left !important;
        }
      }
      @media (max-width: 600px) {
        .user-calendar-wrapper {
          border-radius: 0 !important;
        }
        main#userMobileCalendar {
          border-radius: 0 !important;
        }
        .calendar-toolbar {
          border-radius: 0 !important;
        }
      }
      .calendar-header-corner {
        grid-row: 1 / span 2;
        grid-column: 1;
        position: sticky;
        left: 0;
        top: 0;
        z-index: 10;
        background: #fff;
        border-bottom: 2px solid #1976d2;
        border-right: 1px solid #e0e0e0;
        font-weight: 700;
        font-size: 1.1em;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 0 10px;
        box-shadow: 0 2px 8px #0001;
        color: #1976d2;
        min-width: 0;
        max-width: 100%;
      }
      .calendar-header-corner-icon {
        font-size: 1.2em;
        margin-right: 2px;
      }
      .calendar-header-corner-label {
        font-size: 0.98em;
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .calendar-hour-header {
        position: sticky;
        top: 0;
        z-index: 9;
        background: #fff;
        border-bottom: 1px solid #1976d2;
        border-right: 1px solid #e0e0e0;
        text-align: center;
        font-weight: 600;
        font-size: 1em;
        white-space: nowrap;
        line-height: 1.1;
        color: #222;
        box-shadow: 0 2px 8px #0001;
        display: flex;
        align-items: center;
        justify-content: center;
        grid-row: 1;
        min-width: 0;
        max-width: 100%;
        padding: 0;
      }
      .calendar-halfhour-header {
        position: sticky;
        top: 38px;
        z-index: 8;
        background: #fff;
        border-bottom: 2px solid #1976d2;
        border-right: 1px solid #e0e0e0;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.97em;
        color: #888;
        grid-row: 2;
        min-width: 0;
        max-width: 100%;
        padding: 0;
      }
      .calendar-day-label {
        grid-column: 1 / span ${displayHours.length+1};
        border-top: 2px solid #1976d2;
        background: #e3f2fd;
        font-size: 1em;
        padding: 8px 16px 8px 16px;
        letter-spacing: 0.5px;
        position: sticky;
        left: 0;
        z-index: 2;
        font-weight: 700;
        color: #1976d2;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        min-width: 0;
        max-width: 100%;
        line-height: 1.5;
        word-break: break-word;
        white-space: normal;
      }
      .calendar-tasks {
        margin: 0 0 0 12px;
        padding: 0;
        list-style: none;
        font-size: 0.97em;
        display: block;
      }
      .calendar-task {
        margin-bottom: 6px;
        display: flex;
        align-items: center;
      }
      .calendar-task:last-child {
        margin-bottom: 0;
      }
      .calendar-task-dot {
        display: inline-block;
        width: 12px;
        height: 12px;
        min-width: 27px;
        min-height: 12px;
        max-width: 12px;
        max-height: 12px;
        aspect-ratio: 1/1;
        margin-right: 4px;
        background: #4285f4;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 1px 2px #0001;
        vertical-align: middle;
      }
      .calendar-task-more {
        color: #888;
        cursor: pointer;
        font-size: 0.95em;
        margin-left: 8px;
      }
      .calendar-emp-label {
        grid-column: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
        font-size: 1em;
        padding: 4px 4px 4px 10px;
        border-right: 2px solid #1976d2;
        background: #f6f8fa;
        position: sticky;
        left: 0;
        z-index: 1;
        color: #1a237e;
        letter-spacing: 0.5px;
        box-shadow: 2px 0 6px -4px #0002;
        display: flex;
        align-items: center;
        min-width: 0;
        max-width: 100%;
      }
      .calendar-bar {
        height: 100%;
        background: #27ae60;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        border-radius: 7px;
        color: #fff;
        font-weight: 600;
        box-shadow: 0 2px 8px #0002;
        z-index: 2;
        cursor: pointer;
        margin: 0 0 0 0;
        padding: 0 2px;
        font-size: 0.98em;
        min-width: 0;
        overflow: hidden;
        line-height: 1.1;
        position: relative;
      }
      .calendar-bar-dot {
        display: inline-block !important;
        width: 7px !important;
        height: 7px !important;
        min-width: 27px !important;
        min-height: 7px !important;
        max-width: 7px !important;
        max-height: 7px !important;
        aspect-ratio: 1/1 !important;
        margin-right: 6px !important;
        border-radius: 50% !important;
        border: 3px solid #fff !important;
        box-shadow: 0 1px 2px #0001 !important;
        vertical-align: middle !important;
        flex-shrink: 0 !important;
        align-self: center !important;
        justify-self: flex-start !important;
        box-sizing: border-box !important;
        background-clip: content-box !important;
        overflow: visible !important;
      }
      .calendar-bar-label {
        display: flex !important;
        align-items: center !important;
        position: relative;
        min-height: 10px;
        line-height: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        font-size: 1.12em;
        font-weight: bold !important;
      }
      .calendar-bar-label {
        position: relative;
        min-height: 10px;
        line-height: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: inline-block;
        max-width: 100%;
        font-size: 1.12em;
        font-weight: bold !important;
      }
      @media (max-width: 900px) {
        main#userMobileCalendar, .calendar-wrapper {
          width: 100vw !important;
          min-width: 0 !important;
          max-width: 100vw !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          border-radius: 0 0 12px 12px;
        }
        #calendar {
          width: 100vw !important;
          min-width: 0 !important;
          max-width: 100vw !important;
        }
        .calendar-grid {
          grid-template-columns: 90px repeat(${displayHours.length}, 1fr);
          width: fit-content;
        }
      }
      @media (max-width: 700px) {
        .calendar-grid {
          grid-template-columns: 70px repeat(${displayHours.length}, 1fr);
        }
        .calendar-header-corner, .calendar-hour-header, .calendar-halfhour-header, .calendar-emp-label {
          font-size: 0.91em;
          min-width: 0;
          max-width: 100%;
          padding-left: 2px;
          padding-right: 2px;
        }
        .calendar-bar-label {
          font-size: 0.89em;
        }
      }
      @media (max-width: 600px) {
        .calendar-grid {
          grid-template-columns: 54px repeat(${displayHours.length}, 1fr);
        }
        .calendar-header-corner, .calendar-hour-header, .calendar-halfhour-header, .calendar-emp-label {
          font-size: 0.85em;
          padding-left: 1px;
          padding-right: 1px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // --- HTML STRUCTURE ---
  let html = `<div class='user-calendar-wrapper'>`;
  html += `<div class='user-calendar-grid'>`;
  // Sticky stacked header: 2 rows (ore și jumătăți de oră), ca în app.js
  html += `<div class='calendar-header-corner' style="grid-row: 1 / span 2;"><span class='calendar-header-corner-icon'>👤</span></div>`;
  // Row 1: ore, fiecare peste 2 coloane, dar nu depăși limita displayHours
  let lastHourIdx = -1;
  for (let i = 0; i < displayHours.length; i += 2) {
    let h = displayHours[i].split(':')[0];
    let colStart = i + 2;
    // Determine span: if next slot exists and is same hour, span 2; else span 1
    let span = 1;
    if (i + 1 < displayHours.length) {
      const nextH = displayHours[i + 1].split(':')[0];
      if (nextH === h) span = 2;
    }
    // Prevent spanning past the last column
    if (colStart + span - 1 > displayHours.length + 1) {
      span = 1;
    }
    if (parseInt(h, 10) > 6) {
      html += `<div class='calendar-hour-header' style="grid-row:1;grid-column:${colStart}/span ${span};">${h}:00</div>`;
    } else {
      html += `<div class='calendar-hour-header' style="grid-row:1;grid-column:${colStart}/span ${span};"></div>`;
    }
    lastHourIdx = i;
  }
  // Row 2: jumătăți de oră
  for (let i = 0; i < displayHours.length; i++) {
    let label = displayHours[i].endsWith(':00') ? ':00' : ':30';
    html += `<div class='calendar-halfhour-header' style="grid-row:2;grid-column:${i+2};">${label}</div>`;
  }
  // --- LOGICĂ 100% IDENTICĂ CU ADMIN (calendar.js) PENTRU TASKURI ---
  let baseRow = 3;
  // Paletă fără verde, albastru, mov (fără #27ae60, #4f8cff, #4285f4, #8e44ad, #0097A7)
  const baseTaskColors = [
    '#FF9800', // orange
    '#F44336', // red
    '#FFC107', // yellow
    '#795548', // brown
    '#FFB300', // dark yellow
    '#D84315', // deep orange
    '#607D8B', // blue grey
    '#8D6E63', // brown grey
    '#C0CA33', // lime
    '#E91E63', // pink
    '#A1887F', // light brown
    '#B0BEC5', // blue grey
    '#FF7043', // orange
    '#FFD600', // yellow
    '#B71C1C', // dark red
    '#FF6F00', // orange
    '#5D4037', // dark brown
    '#F06292', // pink
    '#FDD835', // yellow
    '#F4511E', // orange red
    '#FBC02D', // yellow
    '#C62828', // red
    '#FF8A65', // light orange
    '#FFB74D', // light orange
    '#FFCC80', // light orange
    '#FFD54F', // light yellow
    '#FFF176', // light yellow
    '#FFF59D', // light yellow
    '#FFE082', // light yellow
    '#FFAB91', // light orange
    '#D4E157', // lime
    '#FF5252', // red
    '#FF1744', // red
    '#D50000', // red
    '#FF4081', // pink
    '#F8BBD0', // pink
    '#F48FB1', // pink
    '#CE93D8', // purple (desaturat)
    '#E1BEE7', // purple (desaturat)
    '#B39DDB', // purple (desaturat)
    '#B388FF', // purple (desaturat)
    '#8C9EFF', // blue (desaturat)
    '#82B1FF', // blue (desaturat)
    '#80D8FF', // cyan (desaturat)
    '#A7FFEB', // teal (desaturat)
    '#B2FF59', // lime
    '#CCFF90', // light green
    '#FFFF8D', // light yellow
    '#FFD180', // light orange
    '#FF9E80'  // light orange
  ];
  // Funcție pentru a genera o culoare HSL distinctă pentru orice număr de taskuri
  function getTaskColor(idx, total) {
    if (idx < baseTaskColors.length) return baseTaskColors[idx];
    // Generează HSL cu hue distribuit uniform, saturație și luminozitate constantă
    const hue = Math.round((idx * 360 / total) % 360);
    return `hsl(${hue}, 85%, 60%)`;
  }
  for (const day of days) {
    // Normalize task keys (no diacritics)
    const normalizedTasks = {};
    for (const k of Object.keys(tasks)) {
      let nk = k;
      if (nk === 'Marți') nk = 'Marti';
      if (nk === 'Sâmbătă') nk = 'Sambata';
      if (nk === 'Duminică') nk = 'Duminica';
      normalizedTasks[nk] = tasks[k];
    }
    tasks = normalizedTasks;

    // --- Day name on its own grid row ---
html += `<div class='calendar-day-label' style="overflow-x:auto;white-space:normal;display:flex;align-items:center;justify-content:space-between;gap:0;max-width:100vw;background:#fff;font-weight:700;padding:0 0 0 0;">`
  + `<div style='font-weight:700;min-width:60px;flex-shrink:0;display:inline-block;margin-bottom:0;'>${day}</div>`
  + `<button class='user-preference-btn' data-day='${day}' style='margin-left:auto;padding:3px 10px;border-radius:7px;border:none;background:#1976d2;color:#fff;font-weight:500;cursor:pointer;font-size:0.92em;display:inline-block;line-height:1;'>Orar</button>`
  + `</div>`;
    // --- Build rowsForDay: leave, tasks, shifts ---
    let rowsForDay = [];
    // Afișează concediu pentru toți angajații cu leave în ziua curentă
    for (const emp of employees) {
      const leave = leaveMap[emp.id];
      let showLeave = false;
      if (leave) {
        if (Array.isArray(leave.days)) {
          if (leave.days.includes(day)) showLeave = true;
        } else {
          showLeave = true;
        }
      }
      if (showLeave) {
        rowsForDay.push({ type: 'leave', user: emp });
      }
    }
    let dayTasks = (tasks[day] || []);
    for (const [i, t] of dayTasks.entries()) {
      rowsForDay.push({ type: 'task', task: t, taskIdx: i, totalTasks: dayTasks.length });
    }
    let dayShifts = Object.values(shiftMap[day]);
    const getSortGroup = s => {
      const loc = (s.location || s.group || s.department || '').toLowerCase();
      if (loc.includes('parter')) return 0;
      if (loc.includes('etaj')) return 1;
      if (["store manager","sm deputy","svim","management","manager"].some(m => loc.includes(m))) return 2;
      if (loc.includes('extern')) return 3;
      return 4;
    };
    dayShifts = dayShifts.sort((a, b) => {
      const gA = getSortGroup(a);
      const gB = getSortGroup(b);
      if (gA !== gB) return gA - gB;
      const aStart = (a.startHour || 0) * 60 + (a.startMinute || 0);
      const bStart = (b.startHour || 0) * 60 + (b.startMinute || 0);
      if (aStart !== bStart) return aStart - bStart;
      const empA = employees.find(e => e.id === a.employeeId) || {};
      const empB = employees.find(e => e.id === b.employeeId) || {};
      const lnA = (empA.lastName || '').toLowerCase();
      const lnB = (empB.lastName || '').toLowerCase();
      if (lnA !== lnB) return lnA.localeCompare(lnB);
      const fnA = (empA.firstName || '').toLowerCase();
      const fnB = (empB.firstName || '').toLowerCase();
      return fnA.localeCompare(fnB);
    });
    for (const shift of dayShifts) {
      rowsForDay.push({ type: 'shift', shift });
    }
    // --- Render all rows for this day ---
    let rowIdx = baseRow;
    for (const row of rowsForDay) {
      rowIdx++;
      if (row.type === 'leave') {
        let norma = parseFloat(row.user && row.user.norma);
        let dailyNorm = '';
        if (!isNaN(norma) && norma > 0) {
          let val = Math.round((norma / 5) * 10) / 10;
          dailyNorm = (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + 'h';
        }
        html += `<div class='calendar-leave-bar' 
          data-employee-id='${row.user.id}'
          style='grid-row: ${rowIdx}; grid-column: 2 / span ${displayHours.length}; 
                 height: 50%; 
                 background: rgba(183, 183, 183, 0.1); 
                 border: 2px dashed #ed7d55ff; 
                 display: flex; 
                 align-items: center; 
                 justify-content: space-between; 
                 border-radius: 8px; 
                 color: #ae5656ff; 
                 font-weight: bold; 
                 font-size: 13px;
                 z-index: 1; 
                 cursor: default;
                 margin: 1px;
                 padding: 0 12px;
                 transition: all 0.2s ease;'
          title='Concediu - ${day}'>
          <span style='text-align: left; line-height: 1.2; flex: 1;'>
            ${row.user.lastName} ${row.user.firstName} - CONCEDIU 🏖️
          </span>
          <span style='text-align: right; font-size: 10px; color: #e65100;'>
            ${dailyNorm ? dailyNorm : ''}
          </span>
        </div>`;
      } else if (row.type === 'task') {
        const t = row.task;
        const color = t.color || getTaskColor(row.taskIdx, row.totalTasks);
        let assigned = '';
        if (t.employeeIds && t.employeeIds.length > 0) {
          assigned = ' — ' + t.employeeIds.map(eid => {
            const emp = employees.find(emp => emp.id === eid);
            return emp ? (emp.lastName + ' ' + emp.firstName) : '';
          }).filter(Boolean).join(', ');
        }
        html += `<div style="grid-row:${rowIdx};grid-column:1;display:flex;background:#fff;"></div>`;
        html += `<div class='calendar-task' style="grid-row:${rowIdx};grid-column:2/${displayHours.length+2};display:flex;align-items:center;gap:7px;background:#fff;padding:0 0 0 0;flex-wrap:wrap;">`+
          `<span class='calendar-task-dot' style='background:${color} !important;margin-right:7px;vertical-align:middle;border:2px solid #fff;box-shadow:0 1px 3px #0001;width:13px;height:13px;aspect-ratio:1/1;border-radius:50%;display:inline-block;'></span>`+
          `<span style='font-weight:700;color:${color};white-space:normal;word-break:break-word;'>${t.text}</span>`+
          `<span style='color:${color};font-weight:400;white-space:normal;word-break:break-word;'>${assigned}</span>`+
        `</div>`;
      } else if (row.type === 'shift') {
        const shift = row.shift;
        const emp = employees.find(e => e.id === shift.employeeId) || {};
        const firstName = emp.firstName || '';
        const lastInitial = (emp.lastName && emp.lastName.length > 0) ? emp.lastName[0].toUpperCase() : '';
        html += `<div class='calendar-emp-label' style="grid-row:${rowIdx};">${firstName} ${lastInitial}</div>`;
        const startIdx = displayHours.findIndex(hh => {
          const [h, m] = hh.split(':').map(Number);
          return h === shift.startHour && m === (shift.startMinute || 0);
        });
        let endIdx = displayHours.findIndex(hh => {
          const [h, m] = hh.split(':').map(Number);
          return h === shift.endHour && m === (shift.endMinute || 0);
        });
        if (endIdx === -1) endIdx = displayHours.length - 1;
        let barColor = '#27ae60';
        if (shift.department === 'Emblema') {
          barColor = '#ffb347';
        } else if (shift.isResponsabil) {
          barColor = '#8e44ad';
        } else if (["Store Manager", "SM Deputy", "SVIM"].includes(shift.department)) {
          barColor = '#8e44ad';
        } else if (shift.location === 'Etaj') {
          barColor = '#4f8cff';
        } else if (shift.location === 'Parter') {
          barColor = '#27ae60';
        }
        if (shift.isResponsabilInventar) {
          barColor = '#e74c3c';
        }
        let barClass = 'calendar-bar';
        if (shift.isResponsabilInventar) barClass += ' responsabil-inventar';
        let weekKey = window.getWeekKey ? window.getWeekKey(currentMonday) : currentMonday.toISOString().slice(0,10);
        let taskDot = '';
        let barBorderColor = '';
        if (shift.employeeId && dayTasks.length > 0) {
          const totalTasks = dayTasks.length;
          for (let i = 0; i < dayTasks.length; i++) {
            const t = dayTasks[i];
            if (Array.isArray(t.employeeIds) && t.employeeIds.includes(shift.employeeId) && !t.done) {
              const color = t.color || getTaskColor(i, totalTasks);
              barBorderColor = color;
              break;
            }
          }
        }
        let gridColStart = startIdx + 2;
        let gridColEnd = (endIdx >= startIdx ? endIdx + 2 : gridColStart + 1);
        let extraLabels = '';
        if (shift.isResponsabilInventar) extraLabels += ' (Inventar)';
        if (shift.isResponsabil) extraLabels += ' (DESCHIDERE/INCHIDERE)';
        html +=
  `<div class='${barClass}${barBorderColor ? ' calendar-bar-task-border' : ''}' data-employee-id='${shift.employeeId}' data-week-key='${weekKey}' style='grid-row:${rowIdx};grid-column:${gridColStart}/${gridColEnd};background:${barColor};overflow:hidden;position:relative;${barBorderColor ? `border: 4px solid ${barBorderColor} !important;` : ''}'>` +
    `<span class='calendar-bar-label' style='white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;'>${emp.lastName || ''} ${emp.firstName || ''}${extraLabels} ${String(shift.startHour).padStart(2,'0')}:${String(shift.startMinute||0).padStart(2,'0')}-${String(shift.endHour).padStart(2,'0')}:${String(shift.endMinute||0).padStart(2,'0')}${shift.location ? (shift.location !== 'Implicit' ? ', ' + shift.location : '') : ''}</span>` +
  `</div>`;
      }
    }
    baseRow = rowIdx + 1;
  }
  html += `</div></div>`;
  calendarList.innerHTML = html;

  // --- Modal pentru preferință ---
  if (!document.getElementById('userPreferenceModal')) {
    const modal = document.createElement('div');
    modal.id = 'userPreferenceModal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.background = '#fff';
    modal.style.zIndex = '100001';
    modal.style.boxShadow = '0 8px 32px #0003';
    modal.style.borderRadius = '18px';
    modal.style.padding = '32px 24px';
    modal.style.minWidth = '280px';
    modal.innerHTML = `
      <div style='font-size:1.08em;font-weight:700;margin-bottom:18px;color:#1976d2;text-align:center;letter-spacing:0.3px;'>Propune program pentru <span id='modalDayLabel'></span></div>
      <div style='width:100%;display:flex;flex-direction:column;gap:10px;'>
        <label style='font-weight:600;color:#1976d2;margin-bottom:2px;font-size:1.08em;'>Ora început:</label>
        <div style='display:flex;gap:8px;'>
          <input id='customStartHour' type='number' min='7' max='22' value='8' style='width:60px;font-size:1.08em;padding:10px 8px;border-radius:10px;border:2px solid #1976d2;background:#f3f7fa;color:#222;font-weight:600;text-align:center;'>
          <span style='font-size:1.08em;font-weight:700;color:#1976d2;align-self:center;'>:</span>
          <input id='customStartMinute' type='number' min='0' max='59' value='00' style='width:60px;font-size:1.08em;padding:10px 8px;border-radius:10px;border:2px solid #1976d2;background:#f3f7fa;color:#222;font-weight:600;text-align:center;'>
        </div>
        <label style='font-weight:600;color:#1976d2;margin-bottom:2px;font-size:1.08em;'>Ora sfârșit:</label>
        <div style='display:flex;gap:8px;'>
          <input id='customEndHour' type='number' min='7' max='22' value='16' style='width:60px;font-size:1.08em;padding:10px 8px;border-radius:10px;border:2px solid #1976d2;background:#f3f7fa;color:#222;font-weight:600;text-align:center;'>
          <span style='font-size:1.08em;font-weight:700;color:#1976d2;align-self:center;'>:</span>
          <input id='customEndMinute' type='number' min='0' max='59' value='00' style='width:60px;font-size:1.08em;padding:10px 8px;border-radius:10px;border:2px solid #1976d2;background:#f3f7fa;color:#222;font-weight:600;text-align:center;'>
        </div>
      </div>
      <button id='sendPreferenceBtn' style='width:100%;background:#1976d2;color:#fff;font-weight:700;font-size:0.98em;padding:8px 0;border-radius:10px;border:none;box-shadow:0 2px 8px #1976d2a1;cursor:pointer;margin-top:12px;margin-bottom:6px;transition:background 0.2s;'>Trimite preferința</button>
      <button id='closePreferenceModalBtn' style='width:100%;background:#f5f5f5;color:#444;font-weight:600;font-size:0.98em;padding:8px 0;border-radius:10px;border:none;box-shadow:0 1px 4px #0001;cursor:pointer;'>Anulează</button>
      <div id='preferenceStatusMsg' style='margin-top:14px;font-size:1.08em;color:#1976d2;text-align:center;'></div>
    `;
    document.body.appendChild(modal);
  }

  // --- Logica de deschidere modal ---
  document.querySelectorAll('.user-preference-btn').forEach(btn => {
    btn.onclick = function() {
      const day = btn.getAttribute('data-day');
      document.getElementById('modalDayLabel').textContent = day;
      document.getElementById('userPreferenceModal').style.display = 'block';
      document.getElementById('customStartHour').value = '8';
      document.getElementById('customStartMinute').value = '00';
      document.getElementById('customEndHour').value = '16';
      document.getElementById('customEndMinute').value = '00';
      // --- Premium UI pentru lista cu preferințe și butonul hide/unhide ---
      const userId = window.userId || localStorage.getItem('userId');
      if (window.firebase && window.firebase.firestore && userId) {
        const db = window.firebase.firestore();
        const monday = window.currentMonday || (window.getMondayOf ? window.getMondayOf(new Date()) : new Date());
        const weekKey = window.getWeekKey ? window.getWeekKey(monday) : monday.toISOString().slice(0,10);
        db.collection('workPreferences')
          .where('userId', '==', userId)
          .where('weekKey', '==', weekKey)
          // eliminat filtrul după status pentru a afișa toate preferințele
          .get()
          .then((allSnap) => {
            let html = `<button id='togglePrefListBtn' style='background:linear-gradient(90deg,#1976d2,#2196f3);color:#fff;font-weight:700;border:none;border-radius:14px;padding:12px 22px;margin-bottom:12px;cursor:pointer;box-shadow:0 4px 16px #1976d2a1;font-size:0.92em;letter-spacing:0.3px;transition:background 0.2s,box-shadow 0.2s;'>Afișează preferințele trimise</button>`;
            html += `<div id='prefListContainer' style='display:none;margin-bottom:12px;'></div>`;
            document.getElementById('preferenceStatusMsg').innerHTML = html;
            const prefListDiv = document.getElementById('prefListContainer');
            let listHtml = `<div style="margin-bottom:12px;font-size:1.08em;color:#1976d2;font-weight:700;letter-spacing:0.3px;display:flex;align-items:center;gap:8px;"><span style='font-size:1.18em;'>📋</span>Preferințe deja trimise:</div>`;
            if (allSnap.empty) {
              listHtml += '<div style="color:#888;font-size:1.08em;margin-bottom:10px;text-align:center;">Nicio preferință trimisă.</div>';
            } else {
              allSnap.forEach(doc => {
                const p = doc.data();
                let statusColor = p.status === 'approved' ? '#27ae60' : (p.status === 'pending' ? '#fbc02d' : '#e74c3c');
                let statusLabel = p.status === 'approved' ? 'Aprobată' : (p.status === 'pending' ? 'În așteptare' : 'Respinsă');
                listHtml += `<div style='background:linear-gradient(90deg,#f3f7fa,#e3eafc);border-radius:14px;padding:12px 18px;margin-bottom:10px;box-shadow:0 2px 12px #1976d2a1;display:flex;align-items:center;gap:12px;'>
                  <span style='font-size:1.08em;font-weight:700;color:#1976d2;min-width:80px;'>${p.day}</span>
                  <span style='font-size:1.08em;color:#223046;font-weight:600;'>${String(p.startHour).padStart(2,'0')}:${String(p.startMinute).padStart(2,'0')} - ${String(p.endHour).padStart(2,'0')}:${String(p.endMinute).padStart(2,'0')}</span>
                  <span style='font-size:1.08em;font-weight:700;color:${statusColor};margin-left:auto;border-radius:8px;padding:4px 12px;background:${statusColor}22;box-shadow:0 1px 6px ${statusColor}22;'>${statusLabel}</span>
                </div>`;
              });
            }
            prefListDiv.innerHTML = listHtml;
            let shown = false;
            document.getElementById('togglePrefListBtn').onmouseenter = function() {
              this.style.boxShadow = '0 6px 24px #2196f3a1';
            };
            document.getElementById('togglePrefListBtn').onmouseleave = function() {
              this.style.boxShadow = '0 4px 16px #1976d2a1';
            };
            document.getElementById('togglePrefListBtn').onclick = function() {
              shown = !shown;
              prefListDiv.style.display = shown ? 'block' : 'none';
              this.textContent = shown ? 'Ascunde preferințele trimise' : 'Afișează preferințele trimise';
              this.style.background = shown ? 'linear-gradient(90deg,#2196f3,#1976d2)' : 'linear-gradient(90deg,#1976d2,#2196f3)';
              this.style.boxShadow = shown ? '0 8px 32px #2196f3a1' : '0 4px 16px #1976d2a1';
            };
          });
      } else {
        document.getElementById('preferenceStatusMsg').textContent = '';
      }
    };
  });
  document.getElementById('closePreferenceModalBtn').onclick = function() {
    document.getElementById('userPreferenceModal').style.display = 'none';
  };
  // --- Logica de trimitere preferință (doar UI, fără Firebase încă) ---
  document.getElementById('sendPreferenceBtn').onclick = function() {
    const day = document.getElementById('modalDayLabel').textContent;
    const startHour = document.getElementById('customStartHour').value;
    const startMinute = document.getElementById('customStartMinute').value;
    const endHour = document.getElementById('customEndHour').value;
    const endMinute = document.getElementById('customEndMinute').value;
    if (!startHour || !startMinute || !endHour || !endMinute) {
      document.getElementById('preferenceStatusMsg').textContent = 'Completează ambele ore!';
      return;
    }
    const start = `${startHour.padStart(2,'0')}:${startMinute}`;
    const end = `${endHour.padStart(2,'0')}:${endMinute}`;
    const userId = window.userId || localStorage.getItem('userId');
    if (!userId) {
      document.getElementById('preferenceStatusMsg').textContent = 'Eroare: utilizator neautentificat!';
      return;
    }
    if (window.firebase && window.firebase.firestore) {
      const db = window.firebase.firestore();
      const monday = window.currentMonday || (window.getMondayOf ? window.getMondayOf(new Date()) : new Date());
      const weekKey = window.getWeekKey ? window.getWeekKey(monday) : monday.toISOString().slice(0,10);
      // Verifică dacă există deja tură aprobată pentru această zi
      db.collection('shifts')
        .where('employeeId', '==', userId)
        .where('day', '==', day)
        .where('weekKey', '==', weekKey)
        .where('status', '==', 'approved')
        .get()
        .then((shiftSnap) => {
          if (!shiftSnap.empty) {
            document.getElementById('preferenceStatusMsg').innerHTML = '<div style="color:#e74c3c;font-weight:600;margin-top:8px;">Există deja o tură aprobată pentru această zi! Nu puteți trimite o nouă preferință.</div>';
            return;
          }
          // Continuă cu verificarea preferinței duplicate
          db.collection('workPreferences')
            .where('userId', '==', userId)
            .where('weekKey', '==', weekKey)
            .where('status', 'in', ['pending', 'approved'])
            .get()
            .then((allSnap) => {
              let html = `<button id='togglePrefListBtn' style='background:#f3f7fa;color:#1976d2;font-weight:600;border:none;border-radius:8px;padding:7px 16px;margin-bottom:8px;cursor:pointer;'>Afișează preferințele trimise</button>`;
              html += `<div id='prefListContainer' style='display:none;margin-bottom:10px;font-size:1em;color:#1976d2;font-weight:600;'></div>`;
              document.getElementById('preferenceStatusMsg').innerHTML = html;
              const prefListDiv = document.getElementById('prefListContainer');
              let listHtml = '<div style="margin-bottom:10px;font-size:1em;color:#1976d2;font-weight:600;">Preferințe deja trimise:</div>';
              if (allSnap.empty) {
                listHtml += '<div style="color:#888;font-size:0.98em;margin-bottom:8px;">Nicio preferință trimisă.</div>';
              } else {
                allSnap.forEach(doc => {
                  const p = doc.data();
                  listHtml += `<div style='background:#f3f7fa;border-radius:7px;padding:7px 12px;margin-bottom:6px;box-shadow:0 1px 4px #0001;'>${p.day}: ${String(p.startHour).padStart(2,'0')}:${String(p.startMinute).padStart(2,'0')} - ${String(p.endHour).padStart(2,'0')}:${String(p.endMinute).padStart(2,'0')} <span style='color:#888;font-size:0.95em;'>(${p.status})</span></div>`;
                });
              }
              prefListDiv.innerHTML = listHtml;
              let shown = false;
              document.getElementById('togglePrefListBtn').onclick = function() {
                shown = !shown;
                prefListDiv.style.display = shown ? 'block' : 'none';
                this.textContent = shown ? 'Ascunde preferințele trimise' : 'Afișează preferințele trimise';
              };
              // După afișare, continuă cu verificarea duplicatului pentru ziua selectată
              const duplicate = allSnap.docs.find(doc => {
                const p = doc.data();
                return p.day === day;
              });
              if (duplicate) {
                document.getElementById('preferenceStatusMsg').innerHTML += '<div style="color:#e74c3c;font-weight:600;margin-top:8px;">Există deja o preferință pentru această zi!</div>';
                return;
              }
              // Dacă nu există duplicat, salvează preferința nouă
              db.collection('workPreferences').add({
                userId,
                day,
                startHour: parseInt(startHour, 10),
                startMinute: parseInt(startMinute, 10),
                endHour: parseInt(endHour, 10),
                endMinute: parseInt(endMinute, 10),
                weekKey,
                status: 'pending',
                timestamp: new Date()
              }).then(() => {
                document.getElementById('preferenceStatusMsg').innerHTML += `<div style='color:#27ae60;font-weight:600;margin-top:8px;'>Preferința pentru ${day} (${start} - ${end}) a fost trimisă!</div>`;
                setTimeout(() => {
                  document.getElementById('userPreferenceModal').style.display = 'none';
                }, 1200);
              }).catch((err) => {
                document.getElementById('preferenceStatusMsg').innerHTML += '<div style="color:#e74c3c;">Eroare la trimitere!</div>';
              });
            })
            .catch((err) => {
              document.getElementById('preferenceStatusMsg').innerHTML = '<div style="color:#e74c3c;">Eroare la verificare!</div>';
            });
        });
    } else {
      document.getElementById('preferenceStatusMsg').textContent = 'Firebase nu este disponibil!';
    }
  };
}

// --- Event Listeners ---
prevBtn.onclick = function(e) {
  e.preventDefault();
  currentMonday.setDate(currentMonday.getDate() - 7);
  currentMonday = getMondayOf(currentMonday);
  window.currentMonday = currentMonday;
  renderUserCalendar();
};
nextBtn.onclick = function(e) {
  e.preventDefault();
  currentMonday.setDate(currentMonday.getDate() + 7);
  currentMonday = getMondayOf(currentMonday);
  window.currentMonday = currentMonday;
  renderUserCalendar();
};

// --- Init ---

// --- GLOBAL HOURS FILTER: ensure window.HOURS never contains slots after 22:30 ---
// Eliminat modificarea globală window.HOURS! Folosește doar localHours în renderUserCalendar


document.addEventListener('DOMContentLoaded', () => {
  window.currentMonday = currentMonday;
  renderUserCalendar();
  // Buton logout user
  const logoutBtn = document.getElementById('userLogoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = function() {
      localStorage.removeItem('userId');
      window.location.href = 'login.html';
    };
  }
  // Modal for all leave hours (style injected once)
  if (!document.getElementById('all-leave-hours-modal-style')) {
    const style = document.createElement('style');
    style.id = 'all-leave-hours-modal-style';
    style.innerHTML = `
      .all-leave-hours-modal-overlay {
        position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.25); z-index: 99999; display: flex; align-items: center; justify-content: center;
        animation: fadeIn .2s;
      }
      .all-leave-hours-modal {
        background: #fff; border-radius: 14px; box-shadow: 0 8px 32px #0003;
        padding: 28px 22px 18px 22px; min-width: 260px; max-width: 95vw; width: 420px;
        font-family: inherit; color: #222; position: relative;
        animation: popIn .2s;
        max-height: 80vh; overflow-y: auto;
      }
      .all-leave-hours-modal h2 {
        margin: 0 0 10px 0; font-size: 1.25em; color: #ed7d55; font-weight: 700;
      }
      .all-leave-hours-modal .close-btn {
        position: absolute; top: 10px; right: 14px; font-size: 1.3em; color: #888; background: none; border: none; cursor: pointer; transition: color .15s;
      }
      .all-leave-hours-modal .close-btn:hover { color: #d32f2f; }
      .all-leave-hours-table {
        width: 100%; border-collapse: collapse; margin-top: 10px;
      }
      .all-leave-hours-table th, .all-leave-hours-table td {
        border: 1px solid #eee; padding: 7px 8px; text-align: left; font-size: 1em;
      }
      .all-leave-hours-table th {
        background: #fbe9e7; color: #ed7d55; font-weight: 700;
      }
      .all-leave-hours-table td {
        background: #fff;
      }
      .all-leave-hours-table tr:nth-child(even) td {
        background: #f9f9f9;
      }
    `;
    document.head.appendChild(style);
  }
  // Attach event for leave hours button after profile is rendered
  setTimeout(() => {
    const allLeaveBtn = document.getElementById('showAllLeaveHoursBtn');
    if (allLeaveBtn) {
      allLeaveBtn.onclick = async function() {
        // Fetch data for current week
        const weekKey = window.getWeekKey ? window.getWeekKey(window.currentMonday) : window.currentMonday.toISOString().slice(0,10);
        let employees = [];
        let allLeaves = [];
        let error = '';
        let loggedUserId = window.userId || (window.currentUser && window.currentUser.id) || localStorage.getItem('userId');
        let emp = null;
        if (window.firebase && window.firebase.firestore) {
          const db = firebase.firestore();
          try {
            const employeesSnap = await db.collection('employees').get();
            employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            emp = employees.find(e => e.id === loggedUserId);
            const leavesSnap = await db.collection('leaves').where('weekKey', '==', weekKey).get();
            allLeaves = leavesSnap.docs.map(doc => doc.data());
          } catch (e) { error = e.message || 'Eroare la încărcarea datelor.'; }
        }
        // Build leave map
        const leaveMap = {};
        for (const leave of allLeaves) {
          if (leave.employeeId) leaveMap[leave.employeeId] = leave;
        }
        // Build table row only for logged-in user
        let rows = [];
        if (emp) {
          let leave = leaveMap[emp.id];
          let leaveDays = (leave && Array.isArray(leave.days)) ? leave.days.length : 0;
          let norma = parseFloat(emp.norma);
          let leaveHours = (!isNaN(norma) && norma > 0 && leaveDays > 0) ? Math.round((norma / 5) * leaveDays * 10) / 10 : 0;
          rows.push({
            name: (emp.lastName || '') + ' ' + (emp.firstName || ''),
            department: emp.department || '-',
            leaveDays,
            leaveHours: leaveHours > 0 ? leaveHours + 'h' : '',
            days: leave && Array.isArray(leave.days) ? leave.days.join(', ') : ''
          });
        }
        // Modal HTML
        const overlay = document.createElement('div');
        overlay.className = 'all-leave-hours-modal-overlay';
        overlay.onclick = function(ev) { if (ev.target === overlay) document.body.removeChild(overlay); };
        const modal = document.createElement('div');
        modal.className = 'all-leave-hours-modal';
        modal.innerHTML = `
          <button class='close-btn' title='Închide'>&times;</button>
          <h2>Ore concediu angajat (săptămâna curentă)</h2>
          ${error ? `<div style='color:#b00;text-align:center;margin-bottom:12px;'>${error}</div>` : ''}
          <table class='all-leave-hours-table'>
            <thead><tr><th>Angajat</th><th>Departament</th><th>Zile concediu</th><th>Ore concediu</th><th>Zile</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${r.name}</td><td>${r.department}</td><td style='text-align:center;'>${r.leaveDays || ''}</td><td style='text-align:center;'>${r.leaveHours}</td><td>${r.days}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
        modal.querySelector('.close-btn').onclick = () => document.body.removeChild(overlay);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
      };
    }
  }, 0);
});

// Expose for debugging
window.renderUserCalendar = renderUserCalendar;
window.getMondayOf = getMondayOf;
