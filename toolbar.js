// toolbar.js
// Elimină orice export/import, folosește doar variabile globale și funcții globale pentru compatibilitate cu scripturile din CDN.

function renderToolbar(container) {
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
      <button id="backToCalendarBtn" class="toolbar-btn"><span class="toolbar-icon">📆</span> Orar</button>
      <button id="monthBtn" class="toolbar-btn"><span class="toolbar-icon">📅</span> Săptămâna curentă</button>
      <button id="excelBtn" class="toolbar-btn"><span class="toolbar-icon"> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></svg> </span> Excel</button>
      <button id="statsBtn" class="toolbar-btn"><span class="toolbar-icon"> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M9 17v-6"/><path d="M15 17v-2"/></svg> </span> Statistici</button>
      <button id="resetBtn" class="toolbar-btn toolbar-btn-secondary"><span class="toolbar-icon">⟳</span> Reset săptămână</button>
      <button id="copyPrevBtn" class="toolbar-btn toolbar-btn-primary"><span class="toolbar-icon"> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> </span> Copiază săptămâna precedentă</button>
      <button id="goToUserPageBtn" class="toolbar-btn toolbar-btn-secondary" style="margin-left:12px;"><span class="toolbar-icon">👤</span> Calendar utilizator</button>
    </div>
  `;
  // Butonul către user.html
  const goToUserPageBtn = document.getElementById('goToUserPageBtn');
  if (goToUserPageBtn) {
    goToUserPageBtn.addEventListener('click', function() {
      window.location.href = 'user.html';
    });
  }
}

function filterEmployees(employees, criteria) {
  return employees.filter(emp => {
    let ok = true;
    if (criteria.department && emp.department !== criteria.department) ok = false;
    if (criteria.name && !(emp.lastName + ' ' + emp.firstName).toLowerCase().includes(criteria.name.toLowerCase())) ok = false;
    return ok;
  });
}

function searchEmployee(employees, searchTerm) {
  return employees.filter(emp => (emp.lastName + ' ' + emp.firstName).toLowerCase().includes(searchTerm.toLowerCase()));
}

window.renderToolbar = renderToolbar;
window.filterEmployees = filterEmployees;
window.searchEmployee = searchEmployee;


window.addEventListener('DOMContentLoaded', () => {
  const toolbarContainer = document.getElementById('toolbarContainer');
  if (toolbarContainer) renderToolbar(toolbarContainer);


  // --- STATISTICI LA CLICK PE TURA ---
  // Funcție generală pentru a afișa statistici pentru orice angajat și săptămână
  async function showPersonalStatsPanel(employeeId, weekKey) {
    const calendar = document.getElementById('calendar');
    if (calendar) calendar.style.display = 'none';
    const statisticsPanel = document.getElementById('statisticsPanel');
    if (statisticsPanel) {
      statisticsPanel.style.display = 'flex'; // asigură afișarea corectă ca modal
      statisticsPanel.innerHTML = '<div class="loading">Se încarcă statistici personale...</div>';
      // Forțează reflow pentru a declanșa afișarea (fix pentru unele browsere/mobile)
      void statisticsPanel.offsetHeight;
    }
    // Salvează săptămâna pentru statistici separat de currentMonday (pentru navigare corectă)
    if (weekKey) {
      window.statisticsCurrentMonday = window.getMondayFromWeekKey ? window.getMondayFromWeekKey(weekKey) : new Date(weekKey);
    }
    let userNorma = 40;
    let userName = '';
    let userDepartment = '';
    let userShifts = [];
    if (window.firebase && window.firebase.firestore) {
      const db = window.firebase.firestore();
      const empSnap = await db.collection('employees').doc(employeeId).get();
      if (empSnap.exists) {
        const emp = empSnap.data();
        userNorma = emp.norma || 40;
        userName = (emp.lastName || '') + ' ' + (emp.firstName || '');
        userDepartment = emp.department || '';
      }
      const shiftsSnap = await db.collection('shifts').where('employeeId', '==', employeeId).where('weekKey', '==', weekKey).get();
      userShifts = shiftsSnap.docs.map(doc => doc.data());
    }
    let totalOre = 0;
    const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];
    let tabelRows = '';
    for (const day of DAYS) {
      const shift = userShifts.find(s => s.day === day);
      let efectiv = '';
      let interval = '';
      if (shift) {
        let totalMinutes = (shift.endHour * 60 + (shift.endMinute || 0)) - (shift.startHour * 60 + (shift.startMinute || 0));
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        let displayHours = totalMinutes / 60;
        let pauza = 0;
        if (displayHours >= 9) pauza = 1;
        else if (displayHours >= 6.5) pauza = 0.5;
        efectiv = displayHours - pauza;
        if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
        totalOre += efectiv;
        interval = `${String(shift.startHour).padStart(2,'0')}:${String(shift.startMinute||0).padStart(2,'0')} - ${String(shift.endHour).padStart(2,'0')}:${String(shift.endMinute||0).padStart(2,'0')}`;
      }
      tabelRows += `<tr><td>${day}</td><td>${interval}</td><td>${efectiv !== '' ? efectiv : '-'}</td></tr>`;
    }
    const diff = Math.round((totalOre - userNorma) * 100) / 100;
    let diffText = diff === 0 ? 'Normă completă' : (diff > 0 ? `+${diff} ore` : `${diff} ore`);
    let diffClass = diff === 0 ? 'at-norma' : (diff > 0 ? 'plus' : 'minus');
    if (statisticsPanel) {
      statisticsPanel.innerHTML = `
        <div class="personal-stats-panel">
          <h2>Statistici personale (${userName})</h2>
          <div class="personal-stats-summary">
            <div><b>Normă săptămânală:</b> ${userNorma} ore</div>
            <div><b>Ore efectuate:</b> ${totalOre} ore</div>
            <div><b>Diferență:</b> <span class="${diffClass}">${diffText}</span></div>
          </div>
          <table class="personal-stats-table">
            <thead><tr><th>Zi</th><th>Interval</th><th>Ore efectuate</th></tr></thead>
            <tbody>${tabelRows}</tbody>
          </table>
          <button id="backToCalendarFromStats" class="toolbar-btn" style="margin-top:18px;">Înapoi la orar</button>
        </div>
      `;
      document.getElementById('backToCalendarFromStats').onclick = function() {
        statisticsPanel.style.display = 'none';
        if (calendar) calendar.style.display = 'block';
      };
      // Navigare săptămână în modul statistici (folosește statisticsCurrentMonday)
      const prevBtn = document.getElementById('userPrevWeekBtn') || document.getElementById('prevWeekBtn');
      const nextBtn = document.getElementById('userNextWeekBtn') || document.getElementById('nextWeekBtn');
      if (prevBtn && nextBtn) {
        // Elimină handler-ele vechi pentru a evita dublarea
        try {
          prevBtn._oldStatsHandler && prevBtn.removeEventListener('click', prevBtn._oldStatsHandler);
        } catch(e) {}
        try {
          nextBtn._oldStatsHandler && nextBtn.removeEventListener('click', nextBtn._oldStatsHandler);
        } catch(e) {}
        const prevHandler = async function(e) {
          // Nu bloca click-ul dacă nu suntem în statistici
          if (statisticsPanel.style.display === 'flex' || statisticsPanel.style.display === 'block') {
            e.stopImmediatePropagation();
            e.preventDefault();
            window.statisticsCurrentMonday = window.statisticsCurrentMonday || (window.getMondayFromWeekKey ? window.getMondayFromWeekKey(weekKey) : new Date(weekKey));
            window.statisticsCurrentMonday.setDate(window.statisticsCurrentMonday.getDate() - 7);
            const newWeekKey = window.getWeekKey(window.statisticsCurrentMonday);
            await showPersonalStatsPanel(employeeId, newWeekKey);
          }
        };
        const nextHandler = async function(e) {
          if (statisticsPanel.style.display === 'flex' || statisticsPanel.style.display === 'block') {
            e.stopImmediatePropagation();
            e.preventDefault();
            window.statisticsCurrentMonday = window.statisticsCurrentMonday || (window.getMondayFromWeekKey ? window.getMondayFromWeekKey(weekKey) : new Date(weekKey));
            window.statisticsCurrentMonday.setDate(window.statisticsCurrentMonday.getDate() + 7);
            const newWeekKey = window.getWeekKey(window.statisticsCurrentMonday);
            await showPersonalStatsPanel(employeeId, newWeekKey);
          }
        };
        prevBtn.addEventListener('click', prevHandler, true);
        nextBtn.addEventListener('click', nextHandler, true);
        prevBtn._oldStatsHandler = prevHandler;
        nextBtn._oldStatsHandler = nextHandler;
      }
    }
  }

  // Adaugă event listener pe barele de calendar după fiecare refresh al calendarului
  function attachStatsClickToCalendarBars() {
    // Debug: marchează de câte ori încercăm atașarea
    if (!window._statsAttachCount) window._statsAttachCount = 0;
    window._statsAttachCount++;
    setTimeout(() => {
      const bars = document.querySelectorAll('.calendar-bar[data-employee-id]');
      console.log(`[DEBUG] attachStatsClickToCalendarBars #${window._statsAttachCount}: găsite ${bars.length} bare`);
      bars.forEach(bar => {
        bar.removeEventListener('click', bar._statsClickHandler || (()=>{}));
        const handler = function(e) {
          e.stopPropagation();
          const employeeId = bar.getAttribute('data-employee-id');
          if (!employeeId) return;
          console.log('[DEBUG] Click pe calendar-bar, employeeId:', employeeId);
          // Folosește săptămâna afișată efectiv în calendar, nu doar window.currentMonday
          let weekKey = '';
          if (bar.hasAttribute('data-week-key')) {
            weekKey = bar.getAttribute('data-week-key');
          } else if (window.getWeekKey && window.currentMonday) {
            weekKey = window.getWeekKey(window.currentMonday);
          } else if (window.currentMonday) {
            weekKey = window.currentMonday.toISOString().slice(0,10);
          }
          showPersonalStatsPanel(employeeId, weekKey);
        };
        bar.addEventListener('click', handler);
        bar._statsClickHandler = handler;
        bar.style.cursor = 'pointer';
        bar.title = 'Vezi statistici personale';
      });
    }, 200);
    // Încearcă de mai multe ori la fiecare refresh, ca fallback pentru randare întârziată
    // Atașează la fiecare re-randare, fără limită de încercări, pentru mobile
    if (window._statsAttachInterval) {
      clearInterval(window._statsAttachInterval);
      window._statsAttachInterval = null;
    }
    window._statsAttachInterval = setInterval(() => {
      // Atașează mereu la fiecare secundă, dacă există bare noi
      attachStatsClickToCalendarBars._lastBars = attachStatsClickToCalendarBars._lastBars || 0;
      const bars = document.querySelectorAll('.calendar-bar[data-employee-id]');
      if (bars.length !== attachStatsClickToCalendarBars._lastBars) {
        attachStatsClickToCalendarBars._lastBars = bars.length;
        bars.forEach(bar => {
          bar.removeEventListener('click', bar._statsClickHandler || (()=>{}));
          const handler = function(e) {
            e.stopPropagation();
            const employeeId = bar.getAttribute('data-employee-id');
            if (!employeeId) return;
            let weekKey = '';
            if (bar.hasAttribute('data-week-key')) {
              weekKey = bar.getAttribute('data-week-key');
            } else if (window.getWeekKey && window.currentMonday) {
              weekKey = window.getWeekKey(window.currentMonday);
            } else if (window.currentMonday) {
              weekKey = window.currentMonday.toISOString().slice(0,10);
            }
            showPersonalStatsPanel(employeeId, weekKey);
          };
          bar.addEventListener('click', handler);
          bar._statsClickHandler = handler;
          bar.style.cursor = 'pointer';
          bar.title = 'Vezi statistici personale';
        });
      }
    }, 1000);
  }
  // Atașează la inițializare și după fiecare refresh de calendar (dacă există funcția globală)
  if (window.renderCustomCalendarForWeek) {
    const origRender = window.renderCustomCalendarForWeek;
    window.renderCustomCalendarForWeek = function() {
      // Suportă atât apel cu obiect, cât și cu argumente multiple
      if (arguments.length === 1 && typeof arguments[0] === 'object' && arguments[0] !== null) {
        origRender.call(this, arguments[0]);
      } else {
        origRender.apply(this, arguments);
      }
      attachStatsClickToCalendarBars();
    };
  }
  if (window.refreshCalendarForWeek) {
    const origRefresh = window.refreshCalendarForWeek;
    window.refreshCalendarForWeek = function() {
      origRefresh.apply(this, arguments);
      attachStatsClickToCalendarBars();
    };
  }
  // --- SUPORT calendar utilizator (user.html) ---
  if (window.renderUserCalendarForWeek) {
    const origUserRender = window.renderUserCalendarForWeek;
    window.renderUserCalendarForWeek = function() {
      origUserRender.apply(this, arguments);
      attachStatsClickToCalendarBars();
    };
  }
  if (window.refreshUserCalendarForWeek) {
    const origUserRefresh = window.refreshUserCalendarForWeek;
    window.refreshUserCalendarForWeek = function() {
      origUserRefresh.apply(this, arguments);
      attachStatsClickToCalendarBars();
    };
  }
  // Atașează și la inițializare (după un mic delay)
  setTimeout(attachStatsClickToCalendarBars, 500);

  // --- EXPORT EXCEL ---
  const excelBtn = document.getElementById('excelBtn');
  excelBtn && excelBtn.addEventListener('click', async () => {
    // Forțează ca la export să fie mereu luni, indiferent de ce e în window.currentMonday
    let selectedDate = window.currentMonday || new Date();
    let monday = window.getMondayOf ? window.getMondayOf(selectedDate) : selectedDate;
    monday.setHours(0,0,0,0);
    // DEBUG: loghează datele folosite la export
    console.log('[EXPORT EXCEL] selectedDate:', selectedDate, '| monday:', monday, '| weekKey:', window.getWeekKey ? window.getWeekKey(monday) : monday.toISOString().slice(0,10));
    const weekKey = window.getWeekKey ? window.getWeekKey(monday) : monday.toISOString().slice(0,10);
    const shifts = await getShiftsForWeek(weekKey);
    exportWeekToExcel(shifts, weekKey);
  });

  // --- BUTON STATISTICI ---
  const statsBtn = document.getElementById('statsBtn');
  if (statsBtn) {
    statsBtn.addEventListener('click', function() {
      // Folosește săptămâna selectată în calendar (window.currentMonday)
      if (window.currentMonday && window.getWeekKey && window.renderStatisticsPanel) {
        // Setează statisticsCurrentMonday la aceeași valoare cu currentMonday
        window.statisticsCurrentMonday = new Date(window.currentMonday.getTime());
        var weekKey = window.getWeekKey(window.statisticsCurrentMonday);
        var statisticsPanel = document.getElementById('statisticsPanel');
        if (statisticsPanel) {
          statisticsPanel.style.display = 'block';
        }
        window.renderStatisticsPanel(weekKey);
        // Actualizează și eticheta intervalului de săptămână
        if (typeof updateWeekIntervalUI === 'function') {
          updateWeekIntervalUI(window.statisticsCurrentMonday);
        }
      }
    });
  }

  // --- BUTON "Luna" devine "Săptămâna curentă" ---
  const weekBtn = document.getElementById('monthBtn');
  if (weekBtn) {
    weekBtn.innerHTML = '<span class="toolbar-icon">📅</span> Săptămâna curentă';
    weekBtn.title = 'Afișează săptămâna curentă';
    weekBtn.onclick = () => {
      // Setează currentMonday la săptămâna curentă și actualizează UI
      const today = new Date();
      window.currentMonday = getMondayOf(today);
      if (typeof updateWeekIntervalUI === 'function') {
        updateWeekIntervalUI();
      } else {
        // fallback: actualizează manual textul dacă funcția nu există
        const weekIntervalSpan = document.getElementById('weekInterval');
        if (weekIntervalSpan) {
          // Folosește funcția getWeekIntervalString dacă există
          if (typeof getWeekIntervalString === 'function') {
            weekIntervalSpan.textContent = getWeekIntervalString(window.currentMonday);
          } else {
            // fallback simplu
            weekIntervalSpan.textContent = '';
          }
        }
      }
      if (window.refreshCalendarForWeek) {
        window.refreshCalendarForWeek(getWeekKey(window.currentMonday));
      }
    };
  }

  async function getShiftsForWeek(weekKey) {
    if (window.firebase && window.firebase.firestore) {
      const db = window.firebase.firestore();
      const snap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
      return snap.docs.map(doc => doc.data());
    }
    return [];
  }

  async function exportWeekToExcel(shifts, weekKey) {
    if (!window.XLSX) { alert('SheetJS/xlsx nu este încărcat!'); return; }
    // 1. Preia toți angajații
    let employees = [];
    if (window.firebase && window.firebase.firestore) {
      const db = window.firebase.firestore();
      const empSnap = await db.collection('employees').get();
      employees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    // DEBUG: Afișează toate weekKey-urile turelor exportate
    const uniqueWeekKeys = Array.from(new Set(shifts.map(s => s.weekKey)));
    console.log('[EXPORT EXCEL] weekKey folosit la export:', weekKey, '| weekKey-uri din ture:', uniqueWeekKeys);
    const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];
    // Sortează angajații după ordinea dorită: Women, Men, Kids, SVIM, SM Deputy, Store Manager
    const departmentOrder = {
      'Women': 1,
      'Men': 2,
      'Kids': 3,
      'SVIM': 4,
      'SM Deputy': 5,
      'Store Manager': 6
    };
    employees.sort((a, b) => {
      const orderA = departmentOrder[a.department] || 99;
      const orderB = departmentOrder[b.department] || 99;
      if (orderA !== orderB) return orderA - orderB;
      // Dacă sunt în același departament, sortează alfabetic după nume
      const nameA = (a.lastName || '') + ' ' + (a.firstName || '');
      const nameB = (b.lastName || '') + ' ' + (b.firstName || '');
      return nameA.localeCompare(nameB);
    });
    // Folosește weekKey-ul primit și calculează luni corectă pentru header
    let monday = window.getMondayFromWeekKey ? window.getMondayFromWeekKey(weekKey) : new Date(weekKey);
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0); // asigură-te că e o copie nouă, ora 00:00:00
    function formatDateLocal(date) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const dateStrings = [];
    for (let i = 0; i < 7; i++) {
      let d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 0, 0, 0, 0);
      dateStrings.push(formatDateLocal(d));
    }
    // DEBUG: Afișează datele din headerul Excel
    console.log('[EXPORT EXCEL] dateStrings pentru header:', dateStrings);
    // Header pe 2 randuri cu merge
    let header1 = ['Norma', 'Departament', 'Nume Prenume Angajat'];
    let header2 = ['', '', ''];
    for (let i = 0; i < 7; i++) {
      header1.push(DAYS[i], '', '');
      header2.push(dateStrings[i], '', '');
    }
    header1.push('Total ore lucrate');
    header2.push('');
    // Subheader: pentru fiecare zi, 3 coloane
    let subHeader = ['','',''];
    for (let i = 0; i < 7; i++) {
      subHeader.push('Ora început', 'Ora sfârșit', 'Ore lucrate');
    }
    subHeader.push('');

    // Indexare ture pe angajat și zi
    const shiftsByEmpDay = {};
    for (const s of shifts) {
      if (!s.employeeId || !s.day) continue;
      if (!shiftsByEmpDay[s.employeeId]) shiftsByEmpDay[s.employeeId] = {};
      shiftsByEmpDay[s.employeeId][s.day] = s;
    }
    // Date pe rânduri
    const rows = [];
    for (const emp of employees) {
      // Asigură că norma este număr, nu string, pentru a permite formule în Excel
      let normaValue = (typeof emp.norma === 'number') ? emp.norma : (emp.norma ? parseFloat(emp.norma) : '');
      if (isNaN(normaValue)) normaValue = '';
      let row = [normaValue, emp.department || '', `${emp.lastName || ''} ${emp.firstName || ''}`.trim()];
      let totalOre = 0;
      for (let i = 0; i < 7; i++) {
        const day = DAYS[i];
        const shift = (shiftsByEmpDay[emp.id] && shiftsByEmpDay[emp.id][day]) ? shiftsByEmpDay[emp.id][day] : null;
        if (shift) {
          let totalMinutes = (shift.endHour * 60 + (shift.endMinute || 0)) - (shift.startHour * 60 + (shift.startMinute || 0));
          if (totalMinutes < 0) totalMinutes += 24 * 60;
          let displayHours = totalMinutes / 60;
          let pauza = 0;
          if (displayHours >= 9) pauza = 1;
          else if (displayHours >= 6.5) pauza = 0.5;
          let efectiv = displayHours - pauza;
          if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
          totalOre += efectiv;
          // StartHour/EndHour ca string (pentru format), efectiv ca număr
          row.push(
            (shift.startHour != null ? `${String(shift.startHour).padStart(2,'0')}:${String(shift.startMinute||0).padStart(2,'0')}` : ''),
            (shift.endHour != null ? `${String(shift.endHour).padStart(2,'0')}:${String(shift.endMinute||0).padStart(2,'0')}` : ''),
            typeof efectiv === 'number' ? efectiv : ''
          );
        } else {
          row.push('', '', '');
        }
      }
      row.push(typeof totalOre === 'number' ? totalOre : '');
      rows.push(row);
    }
    // Totaluri pe zi pentru "Ore reale C&A" (fără Emblema) și "TOTAL GENERAL" (cu toți) - folosind direct datele din rows
    let totalOrePeZiFaraEmblema = Array(7).fill(0);
    let totalOrePeZiCuEmblema = Array(7).fill(0);
    for (let i = 0; i < 7; i++) {
      const oreCol = 3 + i*3 + 2;
      for (let r = 0; r < rows.length; r++) {
        const emp = employees[r];
        let val = rows[r][oreCol];
        // Conversie robustă la număr, inclusiv pentru stringuri cu spații sau gol
        if (typeof val === 'string') val = val.replace(',', '.').replace(/\s/g, '');
        val = Number(val);
        if (!isNaN(val) && val !== 0) {
          totalOrePeZiCuEmblema[i] += val;
          if ((emp.department || '').trim().toLowerCase() !== 'emblema') {
            totalOrePeZiFaraEmblema[i] += val;
          }
        }
      }
    }
    // Total ore lucrate săptămână (ca în statistici)
    let totalOreSaptamanaFaraEmblema = totalOrePeZiFaraEmblema.reduce((a, b) => a + b, 0);
    // Rând "Ore reale C&A" (fără Emblema)
    let totalRow = ['','','Ore reale C&A'];
    for (let i = 0; i < 7; i++) {
      totalRow.push('', '', typeof totalOrePeZiFaraEmblema[i] === 'number' ? totalOrePeZiFaraEmblema[i] : '');
    }
    totalRow.push('');
    // Procentul să fie pe toate cele 3 celule unite pentru fiecare zi (calculat pe baza "Ore reale C&A")
    let procenteRow = ['','','Procente acoperire'];
    for (let i = 0; i < 7; i++) {
      let pct = totalOreSaptamanaFaraEmblema ? ((totalOrePeZiFaraEmblema[i] / totalOreSaptamanaFaraEmblema) * 100) : 0;
      procenteRow.push(pct, '', '');
    }
    procenteRow.push('');

    // --- Adaugă rând de totaluri SUM pentru coloana Norma și Total ore lucrate ---
    // Construiește wsData înainte de a-l folosi
    const wsData = [header1, header2, subHeader, ...rows, totalRow, procenteRow];
    // Găsește indexul coloanei Norma (0) și Total ore lucrate (24)
    const normaCol = 0;
    const totalOreCol = 24;
    // Rândurile cu date angajați: de la row 4 la row 4+rows.length-1 (Excel e 1-based)
    const excelFirstDataRow = 4;
    const excelLastDataRow = 4 + rows.length - 1;
    // --- Rând "TOTAL GENERAL" construit manual, nu cu formule ---
    // Eliminat complet rândul "TOTAL GENERAL" și orice cod asociat acestuia la cererea utilizatorului

    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    // Eliminat orice setare de celule sau formule pentru randul "TOTAL GENERAL"
    // --- Corectează tipul celulelor pentru numere (ore, procente) ---
    // Ore lucrate (col 3+i*3+2), total ore (col 24), totaluri, procente
    // Primele 3 rânduri sunt headeruri, apoi urmează datele, apoi totaluri
    const firstDataRow = 3;
    const lastDataRow = 3 + rows.length - 1;
    // Norma (col 0)
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      // Norma (col 0)
      const normaCellAddr = window.XLSX.utils.encode_cell({r, c:0});
      const normaCell = ws[normaCellAddr];
      if (normaCell && typeof normaCell.v === 'number') {
        normaCell.t = 'n';
      }
      // Ore lucrate pe fiecare zi (pentru fiecare angajat)
      for (let i = 0; i < 7; i++) {
        const c = 3 + i*3 + 2;
        const cellAddr = window.XLSX.utils.encode_cell({r, c});
        const cell = ws[cellAddr];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
        }
      }
      // Total ore lucrate (col 24)
      const totalCellAddr = window.XLSX.utils.encode_cell({r, c:24});
      const totalCell = ws[totalCellAddr];
      if (totalCell && typeof totalCell.v === 'number') {
        totalCell.t = 'n';
      }
    }
    // Totaluri pe zi (totalRow, r = lastDataRow+1)
    for (let i = 0; i < 7; i++) {
      const c = 3 + i*3 + 2;
      const cellAddr = window.XLSX.utils.encode_cell({r: lastDataRow+1, c});
      const cell = ws[cellAddr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
      }
    }
    // Procente pe zi (procenteRow, r = lastDataRow+2)
    for (let i = 0; i < 7; i++) {
      const c = 3 + i*3;
      const cellAddr = window.XLSX.utils.encode_cell({r: lastDataRow+2, c});
      const cell = ws[cellAddr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        // Opțional: formatare procent (pentru SheetJS Pro, ignorat în open source)
        cell.z = '0.0%';
        cell.v = cell.v / 100; // pentru a fi recunoscut ca procent în Excel
      }
    }
    // Unire celule pentru headerul pe 2 randuri, dar NU pentru randul TOTAL GENERAL
    ws['!merges'] = [
      // Norma, Departament, Nume
      {s:{r:0,c:0}, e:{r:2,c:0}},
      {s:{r:0,c:1}, e:{r:2,c:1}},
      {s:{r:0,c:2}, e:{r:2,c:2}},
      // Pentru fiecare zi: 3 coloane unite pe r:0, apoi 3 coloane unite pe r:1
      ...Array.from({length:7}, (_,i) => ({s:{r:0,c:3+i*3}, e:{r:0,c:3+i*3+2}})),
      ...Array.from({length:7}, (_,i) => ({s:{r:1,c:3+i*3}, e:{r:1,c:3+i*3+2}})),
      // Total ore lucrate
      {s:{r:0,c:24}, e:{r:2,c:24}},
      // Procente acoperire pe zi: fiecare procent să fie pe toate cele 3 celule unite
      ...Array.from({length:7}, (_,i) => ({s:{r:wsData.length-1,c:3+i*3}, e:{r:wsData.length-1,c:3+i*3+2}}))
    ];

    // --- FORMATĂRI: wrap text primele 3 rânduri, centrare toate celulele ---
    // Determină dimensiunea tabelului
    const numRows = wsData.length;
    const numCols = wsData[0].length;
    // Nu seta ws['!cols'] cu obiecte goale, lasă SheetJS să determine automat coloanele
    // ws['!rows'] = ws['!rows'] || [];
    // Parcurge toate celulele și aplică stilul
    for (let R = 0; R < numRows; ++R) {
      for (let C = 0; C < numCols; ++C) {
        const cellAddress = window.XLSX.utils.encode_cell({r: R, c: C});
        const cell = ws[cellAddress];
        if (!cell) continue;
        cell.s = cell.s || {};
        cell.s.alignment = cell.s.alignment || {};
        // Wrap text pentru primele 3 rânduri
        if (R <= 2) {
          cell.s.alignment.wrapText = true;
        }
        // Centrare pentru toate celulele
        cell.s.alignment.horizontal = 'center';
        cell.s.alignment.vertical = 'center';
      }
    }

    // Creează workbook și exportă
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Orar');
    // Asigură opțiunea cellStyles la scriere pentru SheetJS Pro, dar pentru SheetJS open source e ignorat
    window.XLSX.writeFile(wb, 'orar_' + weekKey + '.xlsx', {cellStyles: true});
  }
  // --- END EXPORT EXCEL ---

  // --- NAVIGARE SĂPTĂMÂNI ---
  // Variabilă globală pentru săptămâna activă (data de luni)
  window.currentMonday = getMondayOf(new Date()); // folosește DOAR window.currentMonday global, fără currentMonday local
  // Obiect pentru stocare date calendar per săptămână (cheie: yyyy-mm-dd)
  window.calendarsByWeek = window.calendarsByWeek || {};

  function getMondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0,0,0,0);
    return d;
  }
  // Folosește funcția globală robustă getWeekKey dacă există
  function getWeekKey(monday) {
    if (window.getWeekKey) return window.getWeekKey(monday);
    return monday.toISOString().slice(0,10); // fallback
  }
  function getWeekIntervalString(monday) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const months = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
    const ziStart = monday.getDate();
    const lunaStart = months[monday.getMonth()];
    const ziEnd = sunday.getDate();
    const lunaEnd = months[sunday.getMonth()];
    const an = monday.getFullYear();
    if (monday.getMonth() === sunday.getMonth()) {
      return `Săptămâna ${ziStart}-${ziEnd} ${lunaStart} ${an}`;
    } else {
      return `Săptămâna ${ziStart} ${lunaStart} - ${ziEnd} ${lunaEnd} ${an}`;
    }
  }
  function updateWeekIntervalUI(forceMonday) {
    const weekIntervalSpan = document.getElementById('weekInterval');
    let mondayToShow = forceMonday || window.currentMonday;
    if (weekIntervalSpan) {
      weekIntervalSpan.textContent = getWeekIntervalString(mondayToShow);
    }
  }
  function triggerCalendarRefresh() {
    // Eliminat: window.currentMonday = currentMonday; // nu reseta săptămâna activă!
    // La schimbarea săptămânii, ascunde/golește panoul de statistici și afișează calendarul
    var statisticsPanel = document.getElementById('statisticsPanel');
    if (statisticsPanel) {
      statisticsPanel.innerHTML = '';
      statisticsPanel.style.display = 'none';
    }
    if (window.refreshCalendarForWeek) {
      window.refreshCalendarForWeek(getWeekKey(window.currentMonday));
    }
    // Altfel, poți pune aici logica de reafișare calendar la schimbarea săptămânii
  }
  // Butoane navigare
  const prevBtn = document.getElementById('prevWeekBtn');
  const nextBtn = document.getElementById('nextWeekBtn');
  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      // Dacă suntem în statistici vizibile, navighează acolo
      var statisticsPanel = document.getElementById('statisticsPanel');
      if (statisticsPanel && statisticsPanel.style.display === 'block') {
        if(window.statisticsCurrentMonday) window.statisticsCurrentMonday.setDate(window.statisticsCurrentMonday.getDate() - 7);
        let weekKey = window.getWeekKey(window.statisticsCurrentMonday);
        window.renderStatisticsPanel(weekKey);
        updateWeekIntervalUI(window.statisticsCurrentMonday);
      } else {
        window.currentMonday.setDate(window.currentMonday.getDate() - 7);
        updateWeekIntervalUI();
        triggerCalendarRefresh();
      }
    });
    nextBtn.addEventListener('click', () => {
      var statisticsPanel = document.getElementById('statisticsPanel');
      if (statisticsPanel && statisticsPanel.style.display === 'block') {
        if(window.statisticsCurrentMonday) window.statisticsCurrentMonday.setDate(window.statisticsCurrentMonday.getDate() + 7);
        let weekKey = window.getWeekKey(window.statisticsCurrentMonday);
        window.renderStatisticsPanel(weekKey);
        updateWeekIntervalUI(window.statisticsCurrentMonday);
      } else {
        window.currentMonday.setDate(window.currentMonday.getDate() + 7);
        updateWeekIntervalUI();
        triggerCalendarRefresh();
      }
    });
  }
  // Inițializare UI la încărcare
  updateWeekIntervalUI();
  // --- END NAVIGARE SĂPTĂMÂNI ---

  // --- Afișare interval săptămână curentă lângă titlu ---
  function getCurrentWeekIntervalString() {
    const now = new Date();
    // Luni = 1, Duminica = 0 (JS: 0=Sunday, 1=Monday...)
    const day = now.getDay();
    // Offset pentru luni (dacă e duminică, săptămâna începe luni trecută)
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    // Format: zi-lună-an
    const months = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
    const ziStart = monday.getDate();
    const lunaStart = months[monday.getMonth()];
    const ziEnd = sunday.getDate();
    const lunaEnd = months[sunday.getMonth()];
    const an = monday.getFullYear();
    // Dacă săptămâna e în aceeași lună
    if (monday.getMonth() === sunday.getMonth()) {
      return `Săptămâna ${ziStart}-${ziEnd} ${lunaStart} ${an}`;
    } else {
      return `Săptămâna ${ziStart} ${lunaStart} - ${ziEnd} ${lunaEnd} ${an}`;
    }
  }
  const weekIntervalSpan = document.getElementById('weekInterval');
  if (weekIntervalSpan) {
    weekIntervalSpan.textContent = getCurrentWeekIntervalString();
  }
  // --- END interval săptămână ---

  // Căutare live angajat în sidebar și calendar
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const term = this.value.trim().toLowerCase();
      // Sidebar: filtrează angajații
      document.querySelectorAll('.employee-item').forEach(item => {
        const name = item.querySelector('.employee-main')?.textContent?.toLowerCase() || '';
        if (!term || name.includes(term)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
      // Calendar: evidențiază sau ascunde barele
      document.querySelectorAll('.calendar-bar').forEach(bar => {
        const barText = bar.textContent.toLowerCase();
        if (!term || barText.includes(term)) {
          bar.style.opacity = '1';
          bar.style.outline = term ? '2px solid #27ae60' : '';
        } else {
          bar.style.opacity = '0.15';
          bar.style.outline = '';
        }
      });
    });
  }

  // Filtrare calendar și sidebar după grupă (Parter, Etaj, Management)
  const groupSelect = document.getElementById('groupSelect');
  if (groupSelect) {
    // La inițializare, setează valoarea din localStorage dacă există
    const last = localStorage.getItem('lastGroupSelect');
    if (last) groupSelect.value = last;
    groupSelect.addEventListener('change', function() {
      localStorage.setItem('lastGroupSelect', this.value);
      const group = this.value;
      // Sidebar: afișează doar angajații din grupul selectat (după departament ca până acum)
      document.querySelectorAll('.employee-item').forEach(item => {
        const dept = item.querySelector('.employee-dept')?.textContent || '';
        let show = false;
        if (!group) show = true;
        else if (group === 'Parter' && dept === 'Women') show = true;
        else if (group === 'Etaj' && (dept === 'Men' || dept === 'Kids')) show = true;
        else if (group === 'Management' && (dept === 'Store Manager' || dept === 'SM Deputy' || dept === 'SVIM')) show = true;
        else if (group === 'Externi' && dept === 'Emblema') show = true;
        item.style.display = show ? '' : 'none';
      });
      // Calendar: afișează doar barele pentru grupul selectat, pe baza data-location și data-department
      document.querySelectorAll('.calendar-bar').forEach(bar => {
        const loc = bar.getAttribute('data-location');
        const dept = bar.getAttribute('data-department');
        let show = false;
        if (!group) show = true;
        else if (group === 'Parter' && (loc === 'Parter' || (['Store Manager','SM Deputy','SVIM'].includes(dept) && loc === 'Implicit'))) show = true;
        else if (group === 'Etaj' && (loc === 'Etaj' || (['Store Manager','SM Deputy','SVIM'].includes(dept) && loc === 'Implicit'))) show = true;
        else if (group === 'Management' && (['Store Manager','SM Deputy','SVIM'].includes(dept))) show = true;
        else if (group === 'Externi' && dept === 'Emblema') show = true;
        bar.style.display = show ? '' : 'none';
      });
    });
    // Forțează aplicarea filtrului la inițializare
    setTimeout(() => {
      const event = new Event('change', { bubbles: true });
      groupSelect.dispatchEvent(event);
    }, 0);
  }

  // --- RESET SĂPTĂMÂNĂ ---
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const weekKey = window.getWeekKey(window.currentMonday);
      if (!confirm('Sigur vrei să ștergi toate turele din săptămâna selectată?')) return;
      if (window.firebase && window.firebase.firestore) {
        const db = window.firebase.firestore();
        const snap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        if (window.refreshCalendarForWeek) window.refreshCalendarForWeek(weekKey);
        if (window.updateEmployeeListForWeek) window.updateEmployeeListForWeek(weekKey);
      } else {
        alert('Firebase nu este disponibil!');
      }
    });
  }

  // --- COPIAZĂ SĂPTĂMÂNA PRECEDENTĂ ---
  const copyPrevBtn = document.getElementById('copyPrevBtn');
  if (copyPrevBtn) {
    copyPrevBtn.addEventListener('click', async () => {
      const weekKey = window.getWeekKey(window.currentMonday);
      // Calculează weekKey-ul săptămânii precedente
      const prevMonday = new Date(window.currentMonday);
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevWeekKey = window.getWeekKey(prevMonday);
      if (!confirm('Sigur vrei să copiezi toate turele din săptămâna precedentă peste săptămâna selectată?')) return;
      if (window.firebase && window.firebase.firestore) {
        const db = window.firebase.firestore();
        // Preia toate turele din săptămâna precedentă
        const prevSnap = await db.collection('shifts').where('weekKey', '==', prevWeekKey).get();
        const prevShifts = prevSnap.docs.map(doc => doc.data());
        // Preia toate turele din săptămâna curentă (pentru a evita duplicate)
        const currSnap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
        const currShifts = currSnap.docs.map(doc => doc.data());
        // Creează un set cu chei unice (employeeId, day) pentru săptămâna curentă
        const currKeys = new Set(currShifts.map(s => `${s.employeeId}|${s.day}`));
        let added = 0;
        for (const shift of prevShifts) {
          const key = `${shift.employeeId}|${shift.day}`;
          if (!currKeys.has(key)) {
            // Copiază tura, dar cu weekKey actual
            const newShift = { ...shift, weekKey };
            delete newShift.id; // elimină id-ul vechi dacă există
            await db.collection('shifts').add(newShift);
            added++;
          }
        }
        if (window.refreshCalendarForWeek) window.refreshCalendarForWeek(weekKey);
        if (window.updateEmployeeListForWeek) window.updateEmployeeListForWeek(weekKey);
        alert(`Copiere finalizată. Au fost adăugate ${added} ture noi.`);
      } else {
        alert('Firebase nu este disponibil!');
      }
    });
  }

  // Buton "Orar" - resetare la calendarul săptămânii curente
  const orarBtn = document.getElementById('backToCalendarBtn');
  if (orarBtn) {
    orarBtn.addEventListener('click', function() {
      if(window.getMondayOf && window.getWeekKey && window.renderCustomCalendarForWeek && window.getWeekIntervalLabel) {
        var today = new Date();
        var monday = window.getMondayOf(today);
        window.currentMonday = monday;
        // La revenirea în calendar, nu reseta statisticsCurrentMonday, doar ascunde statistici
        var weekKey = window.getWeekKey(monday);
        var calendar = document.getElementById('calendar');
        // Ascunde panoul de statistici dacă există
        var panel = document.getElementById('statisticsPanel');
        if(panel) panel.style.display = 'none';
        // Afișează calendarul dacă există
        if(calendar) {
          calendar.style.display = 'block';
          window.renderCustomCalendarForWeek(calendar, window.db || firebase.firestore(), weekKey);
        }
        // Actualizează și eticheta intervalului de săptămână
        var weekIntervalLabel = document.getElementById('weekInterval');
        if(weekIntervalLabel) {
          weekIntervalLabel.textContent = window.getWeekIntervalLabel(monday);
        }
        if(window.updateEmployeeListForWeek) window.updateEmployeeListForWeek(weekKey);
      }
    });
  }
});
