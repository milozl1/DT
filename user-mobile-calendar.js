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
  // Remove all debug overlays from previous renders
  setTimeout(() => {
    const main = document.querySelector('main#userMobileCalendar');
    const cal = document.getElementById('userCalendar');
    if (main) {
      main.style.width = 'fit-content';
      main.style.minWidth = '0';
      main.style.maxWidth = 'none';
      main.style.marginLeft = 'auto';
      main.style.marginRight = 'auto';
      main.style.padding = '0';
      main.style.border = 'none';
      main.style.position = 'relative';
    }
    if (cal) {
      cal.style.width = 'fit-content';
      cal.style.minWidth = '0';
      cal.style.maxWidth = 'none';
      cal.style.marginLeft = 'auto';
      cal.style.marginRight = 'auto';
      cal.style.padding = '0';
      cal.style.border = 'none';
      cal.style.position = 'relative';
    }
  }, 10);
  window.currentMonday = currentMonday;
  updateWeekLabel();
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
  const days = window.DAYS || ['Luni','Marti','Miercuri','Joi','Vineri','Sambata','Duminica'];
  if (!employees.length) {
    calendarList.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;">Niciun angajat găsit pentru această săptămână.</div>';
    return;
  }
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
        grid-template-rows: 38px 20px repeat(100, 44px);
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
        font-size: 0.97em;
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
        font-size: 0.97em;
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
    // Normalizează cheile taskurilor la formatul fără diacritice (ca în calendar.js)
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
    html += `<div class='calendar-day-label' style="grid-row:${baseRow};overflow-x:auto;white-space:normal;display:block;align-items:flex-start;gap:0;max-width:100vw;background:#fff;font-weight:700;padding:0 0 0 0;">`
      + `<div style='font-weight:700;min-width:60px;flex-shrink:0;display:inline-block;margin-bottom:0;'>${day}</div>`
      + `</div>`;
    let dayTasks = (tasks[day] || []);
    let taskRows = '';
    let rowIdx = baseRow;
    if(dayTasks.length > 0) {
      const totalTasks = dayTasks.length;
      for (const [i, t] of dayTasks.entries()) {
        rowIdx++;
        // Culoare unică pentru fiecare task, fără verde/albastru/mov
        const color = t.color || getTaskColor(i, totalTasks);
        let assigned = '';
        if (t.employeeIds && t.employeeIds.length > 0) {
          assigned = ' — ' + t.employeeIds.map(eid => {
            const emp = employees.find(emp => emp.id === eid);
            return emp ? (emp.lastName + ' ' + emp.firstName) : '';
          }).filter(Boolean).join(', ');
        }
        // Empty cell for alignment, then task content spanning the rest
        taskRows += `<div style="grid-row:${rowIdx};grid-column:1;display:flex;background:#fff;"></div>`;
        taskRows += `<div class='calendar-task' style="grid-row:${rowIdx};grid-column:2/${displayHours.length+2};display:flex;align-items:center;gap:7px;background:#fff;padding:0 0 0 0;">`+
          `<span class='calendar-task-dot' style='background:${color} !important;margin-right:7px;vertical-align:middle;border:2px solid #fff;box-shadow:0 1px 3px #0001;width:13px;height:13px;aspect-ratio:1/1;border-radius:50%;display:inline-block;'></span>`+
          `<span style='font-weight:700;color:${color};'>${t.text}</span>`+
          `<span style='color:#222;font-weight:400;'>${assigned}</span>`+
        `</div>`;
      }
    }
    html += taskRows;
    // rowIdx is already incremented for tasks, continue for shifts

    // --- Shifturi ca rânduri în grid ---
    let dayShifts = Object.values(shiftMap[day]);
    // sortare ca la admin
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
      // Secondary: sort by start time (hour, minute)
      const aStart = (a.startHour || 0) * 60 + (a.startMinute || 0);
      const bStart = (b.startHour || 0) * 60 + (b.startMinute || 0);
      if (aStart !== bStart) return aStart - bStart;
      // Tertiary: sort by lastName, then firstName
      const empA = employees.find(e => e.id === a.employeeId) || {};
      const empB = employees.find(e => e.id === b.employeeId) || {};
      const lnA = (empA.lastName || '').toLowerCase();
      const lnB = (empB.lastName || '').toLowerCase();
      if (lnA !== lnB) return lnA.localeCompare(lnB);
      const fnA = (empA.firstName || '').toLowerCase();
      const fnB = (empB.firstName || '').toLowerCase();
      return fnA.localeCompare(fnB);
    });
    let shiftRowIdx = rowIdx;
    for (const shift of dayShifts) {
      shiftRowIdx++;
      const emp = employees.find(e => e.id === shift.employeeId) || {};
      const firstName = emp.firstName || '';
      const lastInitial = (emp.lastName && emp.lastName.length > 0) ? emp.lastName[0].toUpperCase() : '';
      html += `<div class='calendar-emp-label' style="grid-row:${shiftRowIdx};">${firstName} ${lastInitial}</div>`;
      // Find grid columns for shift
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
      // --- TASK DOT LOGICĂ ADMIN ---
      if (shift.employeeId && dayTasks.length > 0) {
        const totalTasks = dayTasks.length;
        for (let i = 0; i < dayTasks.length; i++) {
          const t = dayTasks[i];
          if (Array.isArray(t.employeeIds) && t.employeeIds.includes(shift.employeeId) && !t.done) {
            const color = t.color || getTaskColor(i, totalTasks);
            taskDot = `<span class='calendar-bar-dot' style='background:${color};width:7px !important;height:7px !important;margin-right:6px !important;'></span>`;
            break;
          }
        }
      }
      let gridColStart = startIdx + 2;
      let gridColEnd = (endIdx >= startIdx ? endIdx + 2 : gridColStart + 1);
      // Compose label with (Inventar) and (DESCHIDERE/INCHIDERE) if needed
      let extraLabels = '';
      if (shift.isResponsabilInventar) extraLabels += ' (Inventar)';
      if (shift.isResponsabil) extraLabels += ' (DESCHIDERE/INCHIDERE)';
      html += `<div class='${barClass}' data-employee-id='${shift.employeeId}' data-week-key='${weekKey}' style='grid-row:${shiftRowIdx};grid-column:${gridColStart}/${gridColEnd};background:${barColor};overflow:hidden;'>` +
        `<span class='calendar-bar-label' style='white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;'>${taskDot}${emp.lastName || ''} ${emp.firstName || ''}${extraLabels} ${String(shift.startHour).padStart(2,'0')}:${String(shift.startMinute||0).padStart(2,'0')}-${String(shift.endHour).padStart(2,'0')}:${String(shift.endMinute||0).padStart(2,'0')}${shift.location ? (shift.location !== 'Implicit' ? ', ' + shift.location : '') : ''}</span>` +
        `</div>`;
    }
    baseRow = shiftRowIdx + 1;
  }
  html += `</div></div>`;
  calendarList.innerHTML = html;
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
});

// Expose for debugging
window.renderUserCalendar = renderUserCalendar;
window.getMondayOf = getMondayOf;
