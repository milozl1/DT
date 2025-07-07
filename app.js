// app.js
// Calendar custom: zile pe verticală, ore pe orizontală, bare colorate pentru ture
const firebaseConfig = {
  apiKey: "AIzaSyDNsrhAMusAUgy-BbuUDL6P59aG8ikpAKg",
  authDomain: "catimetable.firebaseapp.com",
  projectId: "catimetable",
  storageBucket: "catimetable.firebasestorage.app",
  messagingSenderId: "645967863163",
  appId: "1:645967863163:web:cfd3a3b5b00e70a5d171de",
  measurementId: "G-8V5HKBGNRR"
};
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
window.db = db;

// --- Calendar multi-săptămânal ---
// Funcție globală pentru toolbar.js
window.refreshCalendarForWeek = function(weekKey) {
  // Forțează ca window.currentMonday să fie mereu luni, indiferent de weekKey primit
  let monday = window.getMondayOf ? window.getMondayOf(weekKey) : new Date(weekKey);
  monday.setHours(0,0,0,0);
  window.currentMonday = monday;
  let calendar = document.getElementById('calendar');
  // Ascunde sau golește panoul de statistici la schimbarea săptămânii
  var statisticsPanel = document.getElementById('statisticsPanel');
  if (statisticsPanel) {
    statisticsPanel.innerHTML = '';
    statisticsPanel.style.display = 'none';
  }
  if (calendar) {
    try {
      renderCustomCalendarForWeek(calendar, db, window.getWeekKey ? window.getWeekKey(monday) : monday.toISOString().slice(0,10));
    } catch (err) {
      alert('Eroare la afișarea calendarului: ' + err.message);
    }
  }
  // Actualizează și eticheta intervalului de săptămână dacă există
  if(window.getWeekIntervalLabel && window.currentMonday) {
    var weekIntervalLabel = document.getElementById('weekInterval');
    if(weekIntervalLabel) {
      weekIntervalLabel.textContent = window.getWeekIntervalLabel(window.currentMonday);
    }
  }
};
// Calendar custom filtrat după weekKey
function renderCustomCalendarForWeek(container, db, weekKey) {
  console.log('renderCustomCalendarForWeek called', {weekKey});
  db.collection("shifts").where('weekKey', '==', weekKey).get().then(async querySnapshot => {
    const shifts = [];
    querySnapshot.forEach(doc => shifts.push({ ...doc.data(), id: doc.id }));
    const shiftsByDay = {};
    for (const day of DAYS) shiftsByDay[day] = [];
    for (const shift of shifts) {
      if (shiftsByDay[shift.day]) shiftsByDay[shift.day].push(shift);
    }
    const validShiftsByDay = {};
    for (const day of DAYS) {
      validShiftsByDay[day] = (shiftsByDay[day] || []).filter(s => s && typeof s === 'object' && s.startHour !== undefined && s.endHour !== undefined);
    }
    // --- Fetch tasks for the week (for task dot logic) ---
    let tasks = (window.getTasksForWeek ? await window.getTasksForWeek(weekKey) : (typeof getTasksForWeek !== 'undefined' ? await getTasksForWeek(weekKey) : {})) || {};
    // --- Sticky stacked header: headerul cu ore și jumătăți de oră sunt primele două rânduri ---
    let html = `<div class='calendar-wrapper'>`;
    let gridRows = [];
    let barGridRows = [];
    let rowIdx = 3;
    for (const day of DAYS) {
      gridRows.push(40);
      barGridRows.push({ type: 'day', row: rowIdx, day });
      rowIdx++;
      const shiftsForDay = validShiftsByDay[day].slice();
      // Sortează întâi după locație: Parter, Etaj, restul, apoi după ora de start
      shiftsForDay.sort((a, b) => {
        const locOrder = (loc) => loc === 'Parter' ? 0 : loc === 'Etaj' ? 1 : 2;
        const locA = locOrder(a.location);
        const locB = locOrder(b.location);
        if (locA !== locB) return locA - locB;
        const aStart = (a.startHour || 0) * 60 + (a.startMinute || 0);
        const bStart = (b.startHour || 0) * 60 + (b.startMinute || 0);
        return aStart - bStart;
      });
      for (let i = 0; i < shiftsForDay.length; i++) {
        gridRows.push(28);
        barGridRows.push({ type: 'shift', row: rowIdx, day, shift: shiftsForDay[i] });
        rowIdx++;
      }
    }
    html += `<div class='calendar-grid' style='display: grid; grid-template-columns: 120px repeat(${HOURS.length}, 1fr);'>`;
    // Colțul stânga sus (gol, nu afectează sticky)
    html += `<div class='calendar-corner' style='grid-row: 1; grid-column: 1;'></div>`;
    // Header ore (sticky, grid-row: 1)
    for (let i = 0; i < HOURS.length; i += 2) {
      let h = HOURS[i].split(':')[0];
      let colStart = i + 2;
      html += `<div class='calendar-hour' style='grid-row: 1; grid-column: ${colStart} / span 2; text-align: center; font-weight: bold;'>${h}:00</div>`;
    }
    // Header jumătăți de oră (sticky, grid-row: 2)
    for (let i = 0; i < HOURS.length; i++) {
      let label = HOURS[i].endsWith(':00') ? ':00' : ':30';
      html += `<div class='calendar-halfhour' style='grid-row: 2; grid-column: ${i + 2}; text-align: center;'>${label}</div>`;
    }
    // Zile și bare de tură (încep de la grid-row: 3)
    for (const bar of barGridRows) {
      if (bar.type === 'day') {
        html += `<div class='calendar-day' data-day='${bar.day}' style='grid-row: ${bar.row}; grid-column: 1 / span ${HOURS.length+1}; border-top: 2px solid #222; background: #f8f8f8; font-size: 1em; padding: 6px 12px 4px 16px; letter-spacing: 0.5px;'>${bar.day}</div>`;
      } else if (bar.type === 'shift') {
        const shift = bar.shift;
        const startIdx = HOURS.findIndex(hh => {
          const [h, m] = hh.split(':').map(Number);
          return h === shift.startHour && m === (shift.startMinute || 0);
        });
        const endIdx = HOURS.findIndex(hh => {
          const [h, m] = hh.split(':').map(Number);
          return h === shift.endHour && m === (shift.endMinute || 0);
        });
        let barColor = '#27ae60';
        if (shift.department === 'Emblema') {
          barColor = '#ffb347'; // portocaliu mai deschis pentru Emblema
        } else if (shift.isResponsabil) {
          barColor = '#8e44ad';
        } else if (["Store Manager", "SM Deputy", "SVIM"].includes(shift.department)) {
          barColor = '#8e44ad';
        } else if (shift.location === 'Etaj') {
          barColor = '#4f8cff';
        } else if (shift.location === 'Parter') {
          barColor = '#27ae60';
        }
        // Update barColor and append labels for Responsabil and Inventar
        let extraLabels = '';
        if (shift.isResponsabilInventar) {
          barColor = '#e74c3c'; // Red color for inventory responsibility
          extraLabels += ' (Inventar)';
        }
        if (shift.isResponsabil) {
          extraLabels += ' (DESCHIDERE/INCHIDERE)';
        }
        shift.name += extraLabels;
        let totalMinutes = (shift.endHour * 60 + (shift.endMinute || 0)) - (shift.startHour * 60 + (shift.startMinute || 0));
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        let displayHours = totalMinutes / 60;
        let pauza = 0;
        if (displayHours >= 9) pauza = 1;
        else if (displayHours >= 6.5) pauza = 0.5;
        let efectiv = displayHours - pauza;
        if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
        let oreText = efectiv + 'h';
        let barClass = 'calendar-bar';
        if (shift.isResponsabilInventar) {
          barClass += ' responsabil-inventar';
        }
        // --- TASK DOT LOGIC ---
        let taskDot = '';
        if (shift.employeeId && tasks[bar.day]) {
          // Caută primul task incomplet care conține acest employeeId
          const foundTaskIdx = tasks[bar.day].findIndex(t => Array.isArray(t.employeeIds) ? t.employeeIds.includes(shift.employeeId) && !t.done : t.employeeId === shift.employeeId && !t.done);
          if (foundTaskIdx !== -1) {
            const t = tasks[bar.day][foundTaskIdx];
            const taskColor = t.color || '#F44336';
            taskDot = `<span style='display:inline-block;width:7px;height:7px;min-width:27px;min-height:5px;max-width:7px;max-height:5px;aspect-ratio:1/1;margin-right:6px;background:${taskColor};border-radius:50%;border:3px solid #fff;box-shadow:0 1px 2px #0001;vertical-align:middle;flex-fit:0;'></span>&nbsp;`;
          }
        }
        html += `<div class='${barClass}' 
            data-shiftid='${shift.id}' 
            data-day='${bar.day}' 
            data-starthour='${shift.startHour}' 
            data-startminute='${shift.startMinute || 0}' 
            data-endhour='${shift.endHour}' 
            data-endminute='${shift.endMinute || 0}'
            data-department='${shift.department || ''}'
            data-location='${shift.location || 'Implicit'}'
            style='grid-row: ${bar.row}; grid-column: ${startIdx + 2} / ${endIdx + 2}; height: 100%; background: ${barColor}; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #fff; font-weight: bold; box-shadow: 0 2px 8px #0002; z-index: 2; cursor: pointer; margin: 0; padding: 0;'>
            <span style='position:relative;min-height:10px;line-height:10px;'>${taskDot}${shift.name} ${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute||0).padStart(2, '0')}-${String(shift.endHour).padStart(2, '0')}:${String(shift.endMinute||0).padStart(2, '0')}${shift.location ? (shift.location !== 'Implicit' ? ', ' + shift.location : '') : ''} ${oreText}</span>
          </div>`;
        continue;
      }
    }
    html += `</div>`;
    html += `</div>`;
    container.innerHTML = html;
    // --- Populează asincron taskurile pe zi ---
    (async function() {
      let weekKey = window.getWeekKey ? window.getWeekKey(window.currentMonday) : (typeof getWeekKey !== 'undefined' ? getWeekKey(window.currentMonday) : '');
      let tasks = (window.getTasksForWeek ? await window.getTasksForWeek(weekKey) : (typeof getTasksForWeek !== 'undefined' ? await getTasksForWeek(weekKey) : {})) || {};
      // Define the same palette for task colors
      const taskColors = [
        '#FF9800','#F44336','#FFC107','#795548','#00B8D4','#FFB300','#D84315','#607D8B','#8D6E63','#C0CA33','#E91E63','#A1887F','#B0BEC5','#FF7043','#FFD600','#B71C1C','#FF6F00','#5D4037','#0097A7','#F06292'
      ];
      // Fetch employees for displaying assigned names
      const employees = await db.collection('employees').get().then(qs => qs.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      for(const day of DAYS) {
        let dayTasks = (tasks[day] || []);
        let taskHtml = '';
        if(dayTasks.length > 0) {
          taskHtml = `<ul class='calendar-tasks' style='margin:4px 0 0 0;padding:0 0 0 5px;list-style:none;font-size:0.97em;'>` +
            dayTasks.map((t,i) => {
              const color = t.color || taskColors[i % taskColors.length];
              let assigned = '';
              if (t.employeeIds && t.employeeIds.length > 0) {
                assigned = ' — ' + t.employeeIds.map(eid => {
                  const emp = employees.find(emp => emp.id === eid);
                  return emp ? (emp.lastName + ' ' + emp.firstName) : '';
                }).filter(Boolean).join(', ');
              }
              return `<li class='calendar-task' style='color:${color};display:flex;align-items:center;gap:4px;'><span class='calendar-task-dot' style='background:${color};margin-right:5px;vertical-align:middle;border:1.5px solid #fff;box-shadow:0 1px 3px #0001;flex-shrink:10;width:14px;height:14px;aspect-ratio:1/1;border-radius:50%;display:inline-block;'></span> <span style='${t.done ? 'text-decoration:line-through;color:#aaa;' : ''}'>${t.text}${assigned}</span></li>`;
            }).join('') +
            `</ul>`;
        }
        const dayDiv = container.querySelector(`.calendar-day[data-day='${day}']`);
        if(dayDiv) dayDiv.innerHTML = `${day}${taskHtml}`;
      }
    })();
    container.querySelectorAll('.calendar-bar').forEach(bar => {
      bar.onclick = () => {
        const shiftId = bar.getAttribute('data-shiftid');
        const day = bar.getAttribute('data-day');
        const startHour = parseInt(bar.getAttribute('data-starthour'));
        const startMinute = parseInt(bar.getAttribute('data-startminute'));
        const endHour = parseInt(bar.getAttribute('data-endhour'));
        const endMinute = parseInt(bar.getAttribute('data-endminute'));
        const shift = { id: shiftId, day, startHour, startMinute, endHour, endMinute };
        openShiftEditModal(shift);
      };
      bar.onmouseenter = () => bar.style.filter = 'brightness(1.15) drop-shadow(0 2px 8px #0003)';
      bar.onmouseleave = () => bar.style.filter = '';
    });
    // Sincronizează lista de angajați cu săptămâna afișată
    if (window.updateEmployeeListForWeek) window.updateEmployeeListForWeek(weekKey);
    // Reaplică filtrul de grupă
    if (window.reapplyGroupFilter) window.reapplyGroupFilter();
  }).catch(err => {
    alert('Eroare la încărcarea turelor: ' + err.message);
  });
}
// --- END Calendar multi-săptămânal ---

function renderCustomCalendar(container, db) {
  db.collection("shifts").get().then(querySnapshot => {
    const shifts = [];
    querySnapshot.forEach(doc => shifts.push({ ...doc.data(), id: doc.id }));
    const shiftsByDay = {};
    for (const day of DAYS) shiftsByDay[day] = [];
    for (const shift of shifts) {
      if (shiftsByDay[shift.day]) shiftsByDay[shift.day].push(shift);
    }
    const validShiftsByDay = {};
    for (const day of DAYS) {
      validShiftsByDay[day] = (shiftsByDay[day] || []).filter(s => s && typeof s === 'object' && s.startHour !== undefined && s.endHour !== undefined);
    }
    let html = `<div class='calendar-wrapper'>`;
    let gridRows = [];
    let barGridRows = [];
    let rowIdx = 3;
    for (const day of DAYS) {
      gridRows.push(40);
      barGridRows.push({ type: 'day', row: rowIdx, day });
      rowIdx++;
      const shiftsForDay = validShiftsByDay[day].slice();
      // Sortează întâi după locație: Parter, Etaj, restul, apoi după ora de start
      shiftsForDay.sort((a, b) => {
        const locOrder = (loc) => loc === 'Parter' ? 0 : loc === 'Etaj' ? 1 : 2;
        const locA = locOrder(a.location);
        const locB = locOrder(b.location);
        if (locA !== locB) return locA - locB;
        const aStart = (a.startHour || 0) * 60 + (a.startMinute || 0);
        const bStart = (b.startHour || 0) * 60 + (b.startMinute || 0);
        return aStart - bStart;
      });
      for (let i = 0; i < shiftsForDay.length; i++) {
        gridRows.push(28);
        barGridRows.push({ type: 'shift', row: rowIdx, day, shift: shiftsForDay[i] });
        rowIdx++;
      }
    }
    html += `<div class='calendar-grid' style='display: grid; grid-template-columns: 120px repeat(${HOURS.length}, 1fr);'>`;
    html += `<div class='calendar-corner' style='grid-row: 1; grid-column: 1;'></div>`;
    for (let i = 0; i < HOURS.length; i += 2) {
      let h = HOURS[i].split(':')[0];
      let colStart = i + 2;
      html += `<div class='calendar-hour' style='grid-row: 1; grid-column: ${colStart} / span 2; text-align: center; font-weight: bold;'>${h}:00</div>`;
    }
    for (let i = 0; i < HOURS.length; i++) {
      let label = HOURS[i].endsWith(':00') ? ':00' : ':30';
      html += `<div class='calendar-halfhour' style='grid-row: 2; grid-column: ${i + 2}; text-align: center;'>${label}</div>`;
    }
    for (const bar of barGridRows) {
      if (bar.type === 'day') {
        // --- TASKURI PE ZI ---
        let weekKey = window.getWeekKey ? window.getWeekKey(window.currentMonday) : (typeof getWeekKey !== 'undefined' ? getWeekKey(window.currentMonday) : '');
        let tasks = (window.getTasksForWeek ? window.getTasksForWeek(weekKey) : (typeof getTasksForWeek !== 'undefined' ? getTasksForWeek(weekKey) : {})) || {};
        console.log('TASKS DEBUG', {weekKey, tasks, day: bar.day, dayTasks: tasks[bar.day]});
        let dayTasks = (tasks[bar.day] || []);
        let taskHtml = '';
        if(dayTasks.length > 0) {
          let shown = dayTasks.slice(0,3);
          taskHtml = `<ul class='calendar-tasks' style='margin:2px 0 0 0;padding:0 0 0 8px;list-style:none;font-size:0.97em;'>` +
            shown.map((t,i) => {
              const color = taskColors[i % taskColors.length];
              return `<li class='calendar-task' style='color:${color};display:flex;align-items:center;gap:4px;'><span style='display:inline-block;width:11px;height:11px;aspect-ratio:1/1;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle;border:1.5px solid #fff;box-shadow:0 1px 3px #0001;flex-shrink:0;'></span> <span style='${t.done ? 'text-decoration:line-through;color:#aaa;' : ''}'>${t.text}</span></li>`;
            }).join('') +
            (dayTasks.length > 3 ? `<li class='calendar-task calendar-task-more' style='color:#888;cursor:pointer;' onclick='window.renderWeeklyTasksModal && window.renderWeeklyTasksModal()'>+ alte ${dayTasks.length-3}</li>` : '') +
            `</ul>`;
        }
        html += `<div class='calendar-day' style='grid-row: ${bar.row}; grid-column: 1 / span ${HOURS.length+1}; border-top: 2px solid #222; background: #f8f8f8; font-size: 1em; padding: 6px 12px 4px 16px; letter-spacing: 0.5px;'>${bar.day}${taskHtml}</div>`;
      } else if (bar.type === 'shift') {
        const shift = bar.shift;
        const startIdx = HOURS.findIndex(hh => {
          const [h, m] = hh.split(':').map(Number);
          return h === shift.startHour && m === (shift.startMinute || 0);
        });
        const endIdx = HOURS.findIndex(hh => {
          const [h, m] = hh.split(':').map(Number);
          return h === shift.endHour && m === (shift.endMinute || 0);
        });
        let barColor = '#27ae60';
        if (shift.isResponsabil) {
          barColor = '#8e44ad';
        } else if (["Store Manager", "SM Deputy", "SVIM"].includes(shift.department)) {
          barColor = '#8e44ad';
        } else if (shift.location === 'Etaj') {
          barColor = '#4f8cff';
        } else if (shift.location === 'Parter') {
          barColor = '#27ae60';
        }
        // Update barColor and append labels for Responsabil and Inventar
        let extraLabels = '';
        if (shift.isResponsabilInventar) {
          barColor = '#e74c3c'; // Red color for inventory responsibility
          extraLabels += ' (Inventar)';
        }
        if (shift.isResponsabil) {
          extraLabels += ' (DESCHIDERE/INCHIDERE)';
        }
        shift.name += extraLabels;
        let totalMinutes = (shift.endHour * 60 + (shift.endMinute || 0)) - (shift.startHour * 60 + (shift.startMinute || 0));
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        let displayHours = totalMinutes / 60;
        let pauza = 0;
        if (displayHours >= 9) pauza = 1;
        else if (displayHours >= 6.5) pauza = 0.5;
        let efectiv = displayHours - pauza;
        if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
        let oreText = efectiv + 'h';
        let barClass = 'calendar-bar';
        if (shift.isResponsabilInventar) {
          barClass += ' responsabil-inventar';
        }
        // --- TASK DOT LOGIC ---
        let taskDot = '';
        if (shift.employeeId && tasks[bar.day]) {
          // Caută primul task incomplet care conține acest employeeId
          const foundTaskIdx = tasks[bar.day].findIndex(t => Array.isArray(t.employeeIds) ? t.employeeIds.includes(shift.employeeId) && !t.done : t.employeeId === shift.employeeId && !t.done);
          if (foundTaskIdx !== -1) {
            const t = tasks[bar.day][foundTaskIdx];
            const taskColor = t.color || '#F44336';
            taskDot = `<span style='display:inline-block;width:10px;height:10px;min-width:27px;min-height:10px;max-width:10px;max-height:10px;aspect-ratio:1/1;margin-right:6px;background:${taskColor};border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 2px #0001;vertical-align:middle;flex-shrink:0;'></span>&nbsp;`;
          }
        }
        html += `<div class='${barClass}' 
            data-shiftid='${shift.id}' 
            data-day='${bar.day}' 
            data-starthour='${shift.startHour}' 
            data-startminute='${shift.startMinute || 0}' 
            data-endhour='${shift.endHour}' 
            data-endminute='${shift.endMinute || 0}'
            data-department='${shift.department || ''}'
            data-location='${shift.location || 'Implicit'}'
            style='grid-row: ${bar.row}; grid-column: ${startIdx + 2} / ${endIdx + 2}; height: 100%; background: ${barColor}; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #fff; font-weight: bold; box-shadow: 0 2px 8px #0002; z-index: 2; cursor: pointer; margin: 0; padding: 0;'>
            <span style='position:relative;min-height:16px;line-height:16px;'>${taskDot}${shift.name} ${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute||0).padStart(2, '0')}-${String(shift.endHour).padStart(2, '0')}:${String(shift.endMinute||0).padStart(2, '0')}${shift.location ? (shift.location !== 'Implicit' ? ', ' + shift.location : '') : ''} ${oreText}</span>
          </div>`;
        continue;
      }
    }
    html += `</div>`;
    html += `</div>`;
    container.innerHTML = html;
    container.querySelectorAll('.calendar-bar').forEach(bar => {
      bar.onclick = () => {
        const shiftId = bar.getAttribute('data-shiftid');
        const day = bar.getAttribute('data-day');
        const startHour = parseInt(bar.getAttribute('data-starthour'));
        const startMinute = parseInt(bar.getAttribute('data-startminute'));
        const endHour = parseInt(bar.getAttribute('data-endhour'));
        const endMinute = parseInt(bar.getAttribute('data-endminute'));
        const shift = { id: shiftId, day, startHour, startMinute, endHour, endMinute };
        openShiftEditModal(shift);
      };
      bar.onmouseenter = () => bar.style.filter = 'brightness(1.15) drop-shadow(0 2px 8px #0003)';
      bar.onmouseleave = () => bar.style.filter = '';
    });
  }).catch(err => {
    alert('Eroare la încărcarea calendarului: ' + err.message);
  });
}

// Modal pentru editare/ștergere tură
function openShiftEditModal(shift) {
  let modal = document.getElementById('shiftEditModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shiftEditModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content shift-modal-premium">
        <button class="close" aria-label="Închide">&times;</button>
        <div class="shift-modal-header">
          <div class="shift-modal-icon"><span>🕒</span></div>
          <div>
            <div class="shift-modal-title">Editare tură</div>
            <div class="shift-modal-day">${shift.day}</div>
          </div>
        </div>
        <form id="shiftEditForm" class="shift-modal-form">
          <div class="shift-modal-row">
            <label for="editShiftStartHour">Ora intrare</label>
            <input type="number" id="editShiftStartHour" min="7" max="23" required> :
            <input type="number" id="editShiftStartMinute" min="0" max="59" required>
          </div>
          <div class="shift-modal-row">
            <label for="editShiftEndHour">Ora ieșire</label>
            <input type="number" id="editShiftEndHour" min="8" max="24" required> :
            <input type="number" id="editShiftEndMinute" min="0" max="59" required>
          </div>
          <div class="shift-modal-row">
            <label for="editShiftLocation">Locație tură</label>
            <select id="editShiftLocation">
              <option value="Implicit">Implicit</option>
              <option value="Parter">Parter</option>
              <option value="Etaj">Etaj</option>
            </select>
          </div>
          <div class="shift-modal-actions">
            <button type="submit" class="shift-modal-save">Salvează</button>
            <button type="button" id="deleteShiftBtn" class="shift-modal-delete">Șterge</button>
          </div>
          <input type="hidden" id="editShiftId">
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }
  // Populează formularul cu datele turei
  document.getElementById('editShiftId').value = shift.id;
  document.getElementById('editShiftStartHour').value = shift.startHour;
  document.getElementById('editShiftStartMinute').value = shift.startMinute;
  document.getElementById('editShiftEndHour').value = shift.endHour;
  document.getElementById('editShiftEndMinute').value = shift.endMinute;
  document.getElementById('editShiftLocation').value = shift.location || 'Implicit';
  showModalWithBackdrop(modal);
  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  window.onclick = (event) => { if (event.target == modal) hideModalWithBackdrop(modal); };
  document.getElementById('shiftEditForm').onsubmit = async function(e) {
    e.preventDefault();
    const id = document.getElementById('editShiftId').value;
    const startHour = parseInt(document.getElementById('editShiftStartHour').value);
    const startMinute = parseInt(document.getElementById('editShiftStartMinute').value);
    const endHour = parseInt(document.getElementById('editShiftEndHour').value);
    const endMinute = parseInt(document.getElementById('editShiftEndMinute').value);
    // Validare: ora de început și ora de sfârșit să nu fie identice
    if (startHour === endHour && startMinute === endMinute) {
      alert('Ora de început și ora de sfârșit nu pot fi identice!');
      return;
    }
    let location = document.getElementById('editShiftLocation').value;
    try {
      let shiftDoc = await db.collection('shifts').doc(id).get();
      let shiftData = shiftDoc.data();
      if (location === 'Implicit' && shiftData && shiftData.department) {
        if (shiftData.department === 'Women') location = 'Parter';
        else if (shiftData.department === 'Men' || shiftData.department === 'Kids') location = 'Etaj';
        else location = 'Implicit';
      }
      // --- CORECȚIE: recalculare weekKey ca luni pentru data de start a turei ---
      let weekDate = shiftData && shiftData.weekKey ? (window.getMondayFromWeekKey ? window.getMondayFromWeekKey(shiftData.weekKey) : new Date(shiftData.weekKey)) : (window.currentMonday || new Date());
      let weekKey = window.getWeekKey ? window.getWeekKey(weekDate) : weekDate.toISOString().slice(0,10);
      await db.collection('shifts').doc(id).update({ startHour, startMinute, endHour, endMinute, location, weekKey });
      hideModalWithBackdrop(modal);
      // --- MODIFICARE: păstrează săptămâna activă după editare ---
      if (shiftData && shiftData.weekKey) {
        window.currentMonday = new Date(weekKey);
      }
      renderCustomCalendarForWeek(document.getElementById('calendar'), db, weekKey);
    } catch (err) {
      alert('Eroare la salvarea modificărilor: ' + err.message);
    }
  };
  document.getElementById('deleteShiftBtn').onclick = async function() {
    const id = document.getElementById('editShiftId').value;
    // --- MODIFICARE: păstrează săptămâna activă după ștergere ---
    let shiftDoc = await db.collection('shifts').doc(id).get();
    let shiftData = shiftDoc.data();
    let weekKey = shiftData && shiftData.weekKey ? shiftData.weekKey : (window.currentMonday ? getWeekKey(window.currentMonday) : getWeekKey(new Date()));
    if (confirm('Sigur vrei să ștergi această tură?')) {
      await db.collection('shifts').doc(id).delete();
      hideModalWithBackdrop(modal);
      renderCustomCalendarForWeek(document.getElementById('calendar'), db, weekKey);
      // Actualizează și lista de angajați cu orele
      const employeeList = document.getElementById('employeeList');
      if (employeeList) renderEmployeeList(employeeList, db, weekKey);
    }
  };
}

// Utilitar pentru a afișa/ascunde backdrop cu blur pentru orice modal
function showModalWithBackdrop(modal) {
  let backdrop = document.querySelector('.modal-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.style.display = 'block';
  modal.style.display = 'block';
  backdrop.onclick = () => { hideModalWithBackdrop(modal); };
}
function hideModalWithBackdrop(modal) {
  modal.style.display = 'none';
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function renderEmployeeList(container, db, weekKeyOverride) {
  console.log('renderEmployeeList called');
  // Preia weekKey-ul săptămânii afișate
  let monday = window.currentMonday || getMondayOf(new Date());
  let weekKey = weekKeyOverride || getWeekKey(monday);
  // Preia toate turele pentru săptămâna curentă
  db.collection("shifts").where('weekKey', '==', weekKey).get().then(shiftSnap => {
    const shifts = [];
    shiftSnap.forEach(doc => shifts.push({ ...doc.data(), id: doc.id }));
    db.collection("employees").get().then(querySnapshot => {
      const employees = [];
      querySnapshot.forEach(doc => employees.push({ ...doc.data(), id: doc.id }));
      const { groups, empIdMap, empHours } = getEmployeeGroupsAndHours(shifts, employees);
      let html = '';
      for (const group of ['Parter', 'Etaj', 'Management', 'Externi']) {
        html += `<div class='employee-group'><div class='employee-group-title'>${group}</div>`;
        if (groups[group] && groups[group].length > 0) {
          html += '<ul class="employee-list">';
          for (const emp of groups[group]) {
            let deptClass = '';
            if (group === 'Parter') deptClass = 'dept-green';
            else if (group === 'Etaj') deptClass = 'dept-blue';
            else if (group === 'Management') deptClass = 'dept-purple';
            else if (group === 'Externi') deptClass = 'dept-orange';
            let ore = empHours[emp.id] ? empHours[emp.id] : 0;
            let norma = parseFloat(emp.norma);
            let isComplete = !isNaN(norma) && ore >= norma;
            let checkMark = isComplete ? `<span class='employee-complete' title='Norma completă' style='color:#27ae60;font-size:1.2em;margin-left:8px;'>✔️</span>` : '';
            let oreText = `<span class='employee-hours' style='color:#888; font-size:0.95em;'>${ore}h</span>`;
            html += `<li class="employee-item" data-empid="${emp.id}">
              <div class="employee-main-row">${emp.lastName} ${emp.firstName} <span style='color:#aaa'>(${emp.norma})</span></div>
              <div class="employee-info-row"><span class="employee-dept ${deptClass}">${emp.department}</span> ${oreText}${checkMark}</div>
            </li>`;
          }
          html += '</ul>';
        } else {
          html += '<div class="employee-empty">(niciun angajat)</div>';
        }
        html += '</div>';
      }
      container.innerHTML = html;
      container.querySelectorAll('.employee-item').forEach(li => {
        li.addEventListener('click', function() {
          openEmployeeDetailsModal(this.dataset.empid, empIdMap[this.dataset.empid]);
        });
      });
    }).catch(err => {
      alert('Eroare la încărcarea angajaților: ' + err.message);
    });
  }).catch(err => {
    alert('Eroare la încărcarea turelor: ' + err.message);
  });
}

// Funcție globală pentru actualizarea listei de angajați la schimbarea săptămânii
window.updateEmployeeListForWeek = function(weekKey) {
  const employeeList = document.getElementById('employeeList');
  if (employeeList) renderEmployeeList(employeeList, db, weekKey);
}

// Actualizează lista de angajați pentru o anumită săptămână (weekKey)
function updateEmployeeListForWeek(weekKey) {
  const employeeList = document.getElementById('employeeList');
  if (!employeeList) return;
  // Preia toate turele DOAR pentru weekKey dat
  db.collection("shifts").where('weekKey', '==', weekKey).get().then(shiftSnap => {
    const shifts = [];
    shiftSnap.forEach(doc => shifts.push({ ...doc.data(), id: doc.id }));
    db.collection("employees").get().then(querySnapshot => {
      const employees = [];
      querySnapshot.forEach(doc => employees.push({ ...doc.data(), id: doc.id }));
      const { groups, empIdMap, empHours } = getEmployeeGroupsAndHours(shifts, employees);
      let html = '';
      for (const group of ['Parter', 'Etaj', 'Management']) {
        html += `<div class='employee-group'><div class='employee-group-title'>${group}</div>`;
        if (groups[group].length > 0) {
          html += '<ul class="employee-list">';
          for (const emp of groups[group]) {
            let deptClass = '';
            if (group === 'Parter') deptClass = 'dept-green';
            else if (group === 'Etaj') deptClass = 'dept-blue';
            else if (group === 'Management') deptClass = 'dept-purple';
            let ore = empHours[emp.id] ? empHours[emp.id] : 0;
            let norma = parseFloat(emp.norma);
            let isComplete = !isNaN(norma) && ore >= norma;
            let checkMark = isComplete ? `<span class='employee-complete' title='Norma completă' style='color:#27ae60;font-size:1.2em;margin-left:8px;'>✔️</span>` : '';
            let oreText = `<span class='employee-hours' style='color:#888; font-size:0.95em;'>${ore}h</span>`;
            html += `<li class="employee-item" data-empid="${emp.id}">
              <div class="employee-main-row">${emp.lastName} ${emp.firstName} <span style='color:#aaa'>(${emp.norma})</span></div>
              <div class="employee-info-row"><span class="employee-dept ${deptClass}">${emp.department}</span> ${oreText}${checkMark}</div>
            </li>`;
          }
          html += '</ul>';
        } else {
          html += '<div class="employee-empty">(niciun angajat)</div>';
        }
        html += '</div>';
      }
      employeeList.innerHTML = html;
      employeeList.querySelectorAll('.employee-item').forEach(li => {
        li.addEventListener('click', function() {
          openEmployeeDetailsModal(this.dataset.empid, empIdMap[this.dataset.empid]);
        });
      });
    }).catch(err => {
      alert('Eroare la încărcarea angajaților: ' + err.message);
    });
  }).catch(err => {
    alert('Eroare la încărcarea turelor: ' + err.message);
  });
}

// Modal detalii angajat (vizualizare + buton Editează + buton Adaugă tură)
function openEmployeeDetailsModal(empId, empData) {
  let modal = document.getElementById('employeeDetailsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'employeeDetailsModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-content shift-modal-premium">
      <button class="close" aria-label="Închide">&times;</button>
      <div class="shift-modal-header">
        <div class="shift-modal-icon"><span>👤</span></div>
        <div>
          <div class="shift-modal-title">${empData.lastName} ${empData.firstName}</div>
          <div class="shift-modal-day">${empData.department} | Norma: ${empData.norma}</div>
        </div>
      </div>
      <div class="shift-modal-actions" style="margin-top:18px;display:flex;gap:12px;justify-content: center;">
        <button id="editEmployeeBtn" class="shift-modal-save" style="min-width:110px;padding:10px 0;font-size:1em;">Editează</button>
        <button id="addShiftForEmployeeBtn" class="shift-modal-save" style="background:#4f8cff;min-width:100px;padding:10px 0;font-size:1em;">Adaugă tură</button>
        <button id="deleteEmployeeBtn" class="shift-modal-delete" style="background:#e74c3c;min-width:100px;padding:10px 0;font-size:1em;">Șterge</button>
      </div>
    </div>
  `;
  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  window.onclick = (event) => { if (event.target == modal) hideModalWithBackdrop(modal); };
  // Buton Editează (corectat: fallback la openAddEmployeeModal dacă openEditEmployeeModal nu există)
  const editBtn = document.getElementById('editEmployeeBtn');
  if (editBtn) {
    editBtn.onclick = function() {
      hideModalWithBackdrop(modal);
      if (typeof window.openEditEmployeeModal === 'function') {
        window.openEditEmployeeModal(empId, empData);
      } else if (typeof window.openAddEmployeeModal === 'function') {
        window.openAddEmployeeModal(empId, empData);
      } else {
        alert('Funcția de editare angajat nu este disponibilă! Contactați administratorul.');
      }
    };
  }
  // Buton Adaugă tură
  const addShiftBtn = document.getElementById('addShiftForEmployeeBtn');
  if (addShiftBtn) {
    addShiftBtn.onclick = function() {
      hideModalWithBackdrop(modal);
      window.openAddShiftModal(empId);
    };
  }
  const deleteBtn = document.getElementById('deleteEmployeeBtn');
  if (deleteBtn) {
    deleteBtn.onclick = async function() {
      if (!confirm('Sigur vrei să ștergi acest angajat? Această acțiune este ireversibilă!')) return;
      try {
        await db.collection('employees').doc(empId).delete();
        // Șterge și toate turele asociate angajatului
        const shiftsSnap = await db.collection('shifts').where('employeeId', '==', empId).get();
        const batch = db.batch();
        shiftsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        hideModalWithBackdrop(modal);
        const employeeList = document.getElementById('employeeList');
        if (employeeList) renderEmployeeList(employeeList, db);
        // --- MODIFICARE: reîncarcă calendarul pentru săptămâna activă ---
        const calendar = document.getElementById('calendar');
        let monday = window.currentMonday || getMondayOf(new Date());
        let weekKey = getWeekKey(monday);
        if (calendar && typeof renderCustomCalendarForWeek === 'function') {
          renderCustomCalendarForWeek(calendar, db, weekKey);
        }
        alert('Angajatul și toate turele asociate au fost șterse!');
      } catch (err) {
        alert('Eroare la ștergerea angajatului: ' + err.message);
      }
    };
  }
  showModalWithBackdrop(modal);
}
window.openEmployeeDetailsModal = openEmployeeDetailsModal;

// Modal pentru adăugare angajat
function openAddEmployeeModal(empId, empData) {
  let modal = document.getElementById('addEmployeeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'addEmployeeModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content shift-modal-premium">
        <button class="close" aria-label="Închide">&times;</button>
        <div class="shift-modal-header">
          <div class="shift-modal-icon"><span>👤</span></div>
          <div>
            <div class="shift-modal-title">${empId ? 'Editează angajat' : 'Adaugă angajat'}</div>
          </div>
        </div>
        <form id="addEmployeeForm" class="shift-modal-form">
          <div class="shift-modal-row"><label>Nume:</label><input type="text" id="addLastName" required></div>
          <div class="shift-modal-row"><label>Prenume:</label><input type="text" id="addFirstName" required></div>
          <div class="shift-modal-row" id="normaRow">
            <label>Norma:</label>
            <select id="addNormaSelect" required>
              <option value="40">40h</option>
              <option value="30">30h</option>
              <option value="20">20h</option>
            </select>
            <input type="number" id="addNormaInput" min="1" max="100" step="0.5" style="display:none;width:80px;" placeholder="ore" />
          </div>
          <div class="shift-modal-row"><label>Departament:</label>
            <select id="addDepartment" required>
              <option value="Women">Women</option>
              <option value="Men">Men</option>
              <option value="Kids">Kids</option>
              <option value="Store Manager">Store Manager</option>
              <option value="SM Deputy">SM Deputy</option>
              <option value="SVIM">SVIM</option>
              <option value="Emblema">Emblema</option>
            </select>
          </div>
          <div class="shift-modal-actions">
            <button type="submit" class="shift-modal-save">${empId ? 'Salvează' : 'Adaugă'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  if (empId && empData) {
    // Populează câmpurile pentru editare
    document.getElementById('addLastName').value = empData.lastName;
    document.getElementById('addFirstName').value = empData.firstName;
    // Norma: dacă e Emblema, folosește input numeric, altfel select
    if (empData.department === 'Emblema') {
      document.getElementById('addNormaSelect').style.display = 'none';
      document.getElementById('addNormaInput').style.display = '';
      document.getElementById('addNormaInput').value = empData.norma;
    } else {
      document.getElementById('addNormaSelect').style.display = '';
      document.getElementById('addNormaInput').style.display = 'none';
      document.getElementById('addNormaSelect').value = empData.norma;
    }
    document.getElementById('addDepartment').value = empData.department;
  } else {
    // Resetează câmpurile pentru adăugare
    document.getElementById('addLastName').value = '';
    document.getElementById('addFirstName').value = '';
    document.getElementById('addNormaSelect').value = '40';
    document.getElementById('addNormaSelect').style.display = '';
    document.getElementById('addNormaInput').style.display = 'none';
    document.getElementById('addNormaInput').value = '';
    document.getElementById('addDepartment').value = 'Women';
  }

  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  window.onclick = (event) => { if (event.target == modal) hideModalWithBackdrop(modal); };

  // Schimbă inputul de normă dacă se selectează Emblema
  document.getElementById('addDepartment').onchange = function() {
    if (this.value === 'Emblema') {
      document.getElementById('addNormaSelect').style.display = 'none';
      document.getElementById('addNormaInput').style.display = '';
    } else {
      document.getElementById('addNormaSelect').style.display = '';
      document.getElementById('addNormaInput').style.display = 'none';
    }
  };

  document.getElementById('addEmployeeForm').onsubmit = async function(e) {
    e.preventDefault();
    const lastName = document.getElementById('addLastName').value.trim();
    const firstName = document.getElementById('addFirstName').value.trim();
    const department = document.getElementById('addDepartment').value;
    let norma = '';
    if (department === 'Emblema') {
      norma = document.getElementById('addNormaInput').value.trim();
    } else {
      norma = document.getElementById('addNormaSelect').value.trim();
    }

    if (!lastName || !firstName || !norma || !department) {
      alert('Completează toate câmpurile!');
      return;
    }

    try {
      if (empId) {
        // Actualizează angajatul existent
        await db.collection('employees').doc(empId).update({ lastName, firstName, norma, department });
      } else {
        // Adaugă un angajat nou
        await db.collection('employees').add({ lastName, firstName, norma, department });
      }

      hideModalWithBackdrop(modal);
      const employeeList = document.getElementById('employeeList');
      if (employeeList) renderEmployeeList(employeeList, db);
    } catch (err) {
      alert('Eroare la salvarea angajatului: ' + err.message);
    }
  };

  showModalWithBackdrop(modal);
}
window.openAddEmployeeModal = openAddEmployeeModal;

// Modifică openAddShiftModal să accepte empId opțional
function openAddShiftModal(empId) {
  let modal = document.getElementById('addShiftModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'addShiftModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content shift-modal-premium">
        <button class="close" aria-label="Închide">&times;</button>
        <div class="shift-modal-header">
          <div class="shift-modal-icon"><span>🕒</span></div>
          <div>
            <div class="shift-modal-title">Adaugă tură</div>
          </div>
        </div>
        <form id="addShiftDirectForm" class="shift-modal-form">
          <div class="shift-modal-row" id="addShiftEmployeeRow"></div>
          <div class="shift-modal-row days-row"><label>Zile:</label><span id="addShiftDaysContainer"></span></div>
          <div class="shift-modal-row">
            <label>Preset orar:</label>
            <select id="addShiftPresetInterval">
              <option value="">-- alege --</option>
              <option value="08:00-17:00">08:00-17:00</option>
              <option value="08:00-14:30">08:00-14:30</option>
              <option value="10:00-14:00">10:00-14:00</option>
              <option value="10:00-16:30">10:00-16:30</option>
              <option value="10:00-19:00">10:00-19:00</option>
              <option value="13:00-22:00">13:00-22:00</option>
              <option value="15:30-22:00">15:30-22:00</option>
              <option value="18:00-22:00">18:00-22:00</option>
            </select>
          </div>
          <div class="shift-modal-row">
            <label>Ora intrare:</label>
            <select id="addShiftStartHour" required></select> : <select id="addShiftStartMinute" required></select>
          </div>
          <div class="shift-modal-row">
            <label>Ora ieșire:</label>
            <select id="addShiftEndHour" required></select> : <select id="addShiftEndMinute" required></select>
          </div>
          <div class="shift-modal-row">
            <label for="addShiftLocation">Locație tură:</label>
            <select id="addShiftLocation" required>
              <option value="Implicit">Implicit</option>
              <option value="Parter">Parter</option>
              <option value="Etaj">Etaj</option>
            </select>
          </div>
          <div class="shift-modal-row">
            <label><input type="checkbox" id="addShiftResponsabil"> Responsabil deschidere/închidere/numărat case/acte/trezor</label>
          </div>
          <div class="shift-modal-row">
            <label><input type="checkbox" id="addShiftResponsabilInventar"> Responsabil inventar</label>
          </div>
          <div class="shift-modal-actions">
            <button type="submit" class="shift-modal-save">Adaugă tură</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }
  // Populează dropdown-urile pentru ore și minute
  function fillSelect(id, start, end, pad) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    for (let i = start; i <= end; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = pad ? String(i).padStart(2, '0') : i;
      sel.appendChild(opt);
    }
  }
  fillSelect('addShiftStartHour', 7, 23, true);
  fillSelect('addShiftEndHour', 8, 24, true);
  fillSelect('addShiftStartMinute', 0, 59, true);
  fillSelect('addShiftEndMinute', 0, 59, true);

  // Înlocuiește dropdown-ul cu numele angajatului dacă empId este dat
  const empRow = document.getElementById('addShiftEmployeeRow');
  if (empId) {
    db.collection('employees').doc(empId).get().then(doc => {
      if (!doc.exists) {
        empRow.innerHTML = '<span style="color:#e74c3c">Angajat inexistent!</span>';
        return;
      }
      const d = doc.data();
      empRow.innerHTML = `<label>Angajat:</label><span style="font-weight:500;font-size:1.08em;margin-left:8px;">${d.lastName} ${d.firstName} <span style='color:#888;font-size:0.95em;'>(${d.department})</span></span>`;
      empRow.dataset.empid = empId;
    });
  } else {
    // Dacă nu e dat empId, folosește dropdown ca fallback
    empRow.innerHTML = `<label>Angajat:</label><select id="addShiftEmployeeId" required><option value="">Se încarcă...</option></select>`;
    const empSelect = document.getElementById('addShiftEmployeeId');
    db.collection('employees').get().then(qs => {
      empSelect.innerHTML = '<option value="">Alege angajat...</option>';
      qs.forEach(doc => {
        const d = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = `${d.lastName} ${d.firstName} (${d.department})`;
        empSelect.appendChild(opt);
      });
    });
  }

  // Preset orar: la selectare, completează automat orele
  const presetSelect = document.getElementById('addShiftPresetInterval');
  if (presetSelect) {
    presetSelect.onchange = function() {
      if (!this.value) return;
      const [start, end] = this.value.split('-');
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      document.getElementById('addShiftStartHour').value = sh;
      document.getElementById('addShiftStartMinute').value = sm;
      document.getElementById('addShiftEndHour').value = eh;
      document.getElementById('addShiftEndMinute').value = em;
    };
  }

  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  window.onclick = (event) => { if (event.target == modal) hideModalWithBackdrop(modal); };
  document.getElementById('addShiftDirectForm').onsubmit = async function(e) {
    e.preventDefault();
    let empIdVal = empId;
    if (!empIdVal) {
      empIdVal = document.getElementById('addShiftEmployeeId').value;
      if (!empIdVal) { alert('Selectează un angajat!'); return; }
    }
    // Preia zilele selectate
    const days = Array.from(document.querySelectorAll('input[name="addShiftDays"]:checked')).map(cb => cb.value);
    if (days.length === 0) { alert('Selectează cel puțin o zi!'); return; }
    const startHour = parseInt(document.getElementById('addShiftStartHour').value);
    const startMinute = parseInt(document.getElementById('addShiftStartMinute').value);
    const endHour = parseInt(document.getElementById('addShiftEndHour').value);
    const endMinute = parseInt(document.getElementById('addShiftEndMinute').value);
    // Validare: ora de început și ora de sfârșit să nu fie identice
    if (startHour === endHour && startMinute === endMinute) {
      alert('Ora de început și ora de sfârșit nu pot fi identice!');
      return;
    }
    let location = document.getElementById('addShiftLocation').value;
    const isResponsabil = document.getElementById('addShiftResponsabil').checked;
    const isResponsabilInventar = document.getElementById('addShiftResponsabilInventar').checked;
    // Preia datele angajatului pentru nume, departament
    const empDoc = await db.collection('employees').doc(empIdVal).get();
    if (!empDoc.exists) {
      alert('ID angajat invalid!');
      return;
    }
    const emp = empDoc.data();
    if (location === 'Implicit') {
      if (emp.department === 'Women') location = 'Parter';
      else if (emp.department === 'Men' || emp.department === 'Kids') location = 'Etaj';
      else location = 'Implicit';
    }
    let monday = window.currentMonday || getMondayOf(new Date());
    let weekKey = getWeekKey(monday);
    let added = 0;
    for (const day of days) {
      // Verifică dacă există deja tură pentru acea zi și săptămână
      const existingShiftsSnap = await db.collection('shifts')
        .where('employeeId', '==', empIdVal)
        .where('day', '==', day)
        .where('weekKey', '==', weekKey)
        .get();
      if (!existingShiftsSnap.empty) continue;
      await db.collection('shifts').add({
        name: emp.lastName + ' ' + emp.firstName,
        lastName: emp.lastName,
        firstName: emp.firstName,
        day,
        startHour,
        startMinute,
        endHour,
        endMinute,
        department: emp.department,
        employeeId: empIdVal,
        location: location,
        weekKey: weekKey,
        isResponsabil: isResponsabil,
        isResponsabilInventar: isResponsabilInventar
      });
      added++;
    }
    hideModalWithBackdrop(modal);
    renderCustomCalendarForWeek(document.getElementById('calendar'), db, weekKey);
    const employeeList = document.getElementById('employeeList');
    if (employeeList) renderEmployeeList(employeeList, db);
    if (added > 0) alert(`Au fost adăugate ${added} ture.`);
    else alert('Nu s-a adăugat nicio tură (există deja pentru zilele selectate).');
  };
  // Populează checkbox-urile pentru zile dinamic (doar o dată, nu dublat)
  const daysContainer = modal.querySelector('#addShiftDaysContainer');
  if (daysContainer) {
    daysContainer.innerHTML = generateDaysCheckboxes('addShiftDays', 'addShiftDays');
    // Forțează font-weight normal pe toate label-urile zilelor
    daysContainer.querySelectorAll('label').forEach(l => l.style.fontWeight = '400');
  }
  showModalWithBackdrop(modal);
}

// === BUTON MASS SHIFT ÎN SIDEBAR ===
window.addEventListener('DOMContentLoaded', () => {
  // Adaugă butonul Mass Shift în sidebar dacă există employeeList
  const employeeList = document.getElementById('employeeList');
  if (employeeList && !document.getElementById('massShiftBtn')) {
    const massBtn = document.createElement('button');
    massBtn.id = 'massShiftBtn';
    massBtn.className = 'shift-modal-save mass-shift-btn';
    massBtn.style = 'margin: 12px 0 16px 0; width: 100%; font-size: 1.08em; background: #4f8cff; color: #fff; border-radius: 8px;';
    massBtn.innerHTML = 'Mass Shift';
    employeeList.parentNode.insertBefore(massBtn, employeeList);
    massBtn.onclick = openMassShiftModal;
  }
  // === Asigură afișarea calendarului la încărcarea paginii ===
  const calendar = document.getElementById('calendar');
  if (calendar && typeof renderCustomCalendarForWeek === 'function' && typeof db !== 'undefined') {
    let monday = window.currentMonday || getMondayOf(new Date());
    let weekKey = getWeekKey(monday);
    renderCustomCalendarForWeek(calendar, db, weekKey);
  }
  // === Asociază handler pentru butonul Adaugă angajat ===
  const addEmpBtn = document.querySelector('button, input[type="button"], input[type="submit"]#addEmployeeBtn, #addEmployeeBtn');
  // Caută butonul după text dacă nu are id
  let foundBtn = addEmpBtn;
  if (!foundBtn) {
    const btns = Array.from(document.querySelectorAll('button'));
    foundBtn = btns.find(b => b.textContent && b.textContent.trim().toLowerCase().includes('adaugă angajat'));
  }
  if (foundBtn) {
    foundBtn.onclick = () => openAddEmployeeModal(); // Apel fără parametrii pentru adăugare nouă
  }
});

// === MODAL MASS SHIFT ===
function openMassShiftModal() {
  let modal = document.getElementById('massShiftModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'massShiftModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content shift-modal-premium">
        <button class="close" aria-label="Închide">&times;</button>
        <div class="shift-modal-header">
          <div class="shift-modal-icon"><span>🕒</span></div>
          <div><div class="shift-modal-title">Adaugă tură în masă</div></div>
        </div>
        <form id="massShiftForm" class="shift-modal-form">
          <div class="shift-modal-row"><label>Angajați:</label><div id="massShiftEmpList" style="max-height:180px;overflow:auto;border:1px solid #eee;padding:6px 8px;border-radius:6px;"></div></div>
          <div class="shift-modal-row days-row"><label>Zile:</label><span id="massShiftDaysContainer"></span></div>
          <div class="shift-modal-row">
            <label>Preset orar:</label>
            <select id="massShiftPresetInterval">
              <option value="">-- alege --</option>
              <option value="08:00-17:00">08:00-17:00</option>
              <option value="08:00-14:30">08:00-14:30</option>
              <option value="10:00-14:00">10:00-14:00</option>
              <option value="10:00-16:30">10:00-16:30</option>
              <option value="10:00-19:00">10:00-19:00</option>
              <option value="13:00-22:00">13:00-22:00</option>
              <option value="15:30-22:00">15:30-22:00</option>
              <option value="18:00-22:00">18:00-22:00</option>
            </select>
          </div>
          <div class="shift-modal-row">
            <label>Ora intrare:</label>
            <select id="massShiftStartHour" required></select> : <select id="massShiftStartMinute" required></select>
          </div>
          <div class="shift-modal-row">
            <label>Ora ieșire:</label>
            <select id="massShiftEndHour" required></select> : <select id="massShiftEndMinute" required></select>
          </div>
          <div class="shift-modal-row">
            <label for="massShiftLocation">Locație tură:</label>
            <select id="massShiftLocation" required>
              <option value="Implicit">Implicit</option>
              <option value="Parter">Parter</option>
              <option value="Etaj">Etaj</option>
            </select>
          </div>
          <div class="shift-modal-row">
            <label><input type="checkbox" id="massShiftResponsabil"> Responsabil deschidere/închidere/numărat case/acte/trezor</label>
          </div>
          <div class="shift-modal-row">
            <label><input type="checkbox" id="massShiftResponsabilInventar"> Responsabil inventar</label>
          </div>
          <div class="shift-modal-actions">
            <button type="submit" class="shift-modal-save">Adaugă ture</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }
  // Populează lista de angajați cu checkbox-uri grupate pe grup
  const empListDiv = modal.querySelector('#massShiftEmpList');
  empListDiv.innerHTML = '<span>Se încarcă...</span>';
  db.collection('employees').get().then(qs => {
    // Grupare după departament
    const groups = { 'Parter': [], 'Etaj': [], 'Management': [] };
    qs.forEach(doc => {
      const d = doc.data();
      let group = '';
      if (d.department === 'Women') group = 'Parter';
      else if (d.department === 'Men' || d.department === 'Kids') group = 'Etaj';
      else if (["Store Manager", "SM Deputy", "SVIM"].includes(d.department)) group = 'Management';
      if (group) groups[group].push({ id: doc.id, ...d });
    });
    let html = '';
    for (const group of ['Parter', 'Etaj', 'Management']) {
      html += `<div style='margin-bottom:8px;'><div style='font-weight:bold;margin-bottom:2px;color:#4f8cff;'>${group}</div>`;
      if (groups[group].length > 0) {
        groups[group].forEach(emp => {
          html += `<label style='display:block;margin-bottom:2px;'><input type='checkbox' name='massShiftEmp' value='${emp.id}'> ${emp.lastName} ${emp.firstName} <span style='color:#aaa;font-size:0.95em;'>(${emp.department})</span></label>`;
        });
      } else {
        html += `<span style='color:#aaa;font-size:0.95em;'>(niciun angajat)</span>`;
      }
      html += `</div>`;
    }
    empListDiv.innerHTML = html;
  });
  // Populează dropdown-urile pentru ore și minute
  function fillSelect(id, start, end, pad) {
    const sel = modal.querySelector('#' + id); // caută doar în modal
    if (!sel) return;
    sel.innerHTML = '';
    for (let i = start; i <= end; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = pad ? String(i).padStart(2, '0') : i;
      sel.appendChild(opt);
    }
  }
  fillSelect('massShiftStartHour', 7, 23, true);
  fillSelect('massShiftEndHour', 8, 24, true);
  fillSelect('massShiftStartMinute', 0, 59, true);
  fillSelect('massShiftEndMinute', 0, 59, true);

  // Preset orar: la selectare, completează automat orele
  const presetSelect = modal.querySelector('#massShiftPresetInterval');
  if (presetSelect) {
    presetSelect.onchange = function() {
      if (!this.value) return;
      const [start, end] = this.value.split('-');
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      modal.querySelector('#massShiftStartHour').value = sh;
      modal.querySelector('#massShiftStartMinute').value = sm;
      modal.querySelector('#massShiftEndHour').value = eh;
      modal.querySelector('#massShiftEndMinute').value = em;
    };
  }
  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  window.onclick = (event) => { if (event.target == modal) hideModalWithBackdrop(modal); };
  modal.querySelector('#massShiftForm').onsubmit = async function(e) {
    e.preventDefault();
    const empIds = Array.from(modal.querySelectorAll('input[name="massShiftEmp"]:checked')).map(cb => cb.value);
    const days = Array.from(modal.querySelectorAll('input[name="massShiftDays"]:checked')).map(cb => cb.value);
    if (empIds.length === 0) { alert('Selectează cel puțin un angajat!'); return; }
    if (days.length === 0) { alert('Selectează cel puțin o zi!'); return; }
    const startHour = parseInt(modal.querySelector('#massShiftStartHour').value);
    const startMinute = parseInt(modal.querySelector('#massShiftStartMinute').value);
    const endHour = parseInt(modal.querySelector('#massShiftEndHour').value);
    const endMinute = parseInt(modal.querySelector('#massShiftEndMinute').value);
    let location = modal.querySelector('#massShiftLocation').value;
    const isResponsabil = modal.querySelector('#massShiftResponsabil').checked;
    const isResponsabilInventar = modal.querySelector('#massShiftResponsabilInventar').checked;
    let monday = window.currentMonday || getMondayOf(new Date());
    let weekKey = getWeekKey(monday);
    let added = 0;
    for (const empId of empIds) {
      const empDoc = await db.collection('employees').doc(empId).get();
      if (!empDoc.exists) continue;
      const emp = empDoc.data();
      let loc = location;
      if (loc === 'Implicit') {
        if (emp.department === 'Women') loc = 'Parter';
        else if (emp.department === 'Men' || emp.department === 'Kids') loc = 'Etaj';
        else loc = 'Implicit';
      }
      for (const day of days) {
        // Verifică dacă există deja tură pentru acea zi și săptămână
        const existingShiftsSnap = await db.collection('shifts')
          .where('employeeId', '==', empId)
          .where('day', '==', day)
          .where('weekKey', '==', weekKey)
          .get();
        if (!existingShiftsSnap.empty) continue;
        await db.collection('shifts').add({
          name: emp.lastName + ' ' + emp.firstName,
          lastName: emp.lastName,
          firstName: emp.firstName,
          day,
          startHour,
          startMinute,
          endHour,
          endMinute,
          department: emp.department,
          employeeId: empId,
          location: loc,
          weekKey: weekKey,
          isResponsabil: isResponsabil,
          isResponsabilInventar: isResponsabilInventar
        });
        added++;
      }
    }
    hideModalWithBackdrop(modal);
    renderCustomCalendarForWeek(document.getElementById('calendar'), db, weekKey);
    const employeeList = document.getElementById('employeeList');
    if (employeeList) renderEmployeeList(employeeList, db);
    if (added > 0) alert(`Au fost adăugate ${added} ture.`);
    else alert('Nu s-a adăugat nicio tură (există deja pentru zilele selectate).');
  };
   // Populează checkbox-urile pentru zile dinamic (doar o dată, nu dublat)
  const daysContainer = modal.querySelector('#massShiftDaysContainer');
  if (daysContainer) {
    daysContainer.innerHTML = generateDaysCheckboxes('massShiftDays', 'massShiftDays');
    // Forțează font-weight normal pe toate label-urile zilelor
    daysContainer.querySelectorAll('label').forEach(l => l.style.fontWeight = '400');
  }
  showModalWithBackdrop(modal);
}

// Add tooltips for buttons and fields
document.querySelectorAll('button, input, select').forEach(el => {
  el.setAttribute('title', el.getAttribute('aria-label') || '');
});

// Real-time validation for forms
document.querySelectorAll('form').forEach(form => {
  form.addEventListener('input', event => {
    const target = event.target;
    if (target.validity.valid) {
      target.style.borderColor = '';
      target.setCustomValidity('');
    } else {
      target.style.borderColor = 'red';
      target.setCustomValidity('Invalid input');
    }
  });
});

// Highlight current day in the calendar
const today = new Date().toLocaleDateString('en-CA');
document.querySelectorAll('.calendar-day').forEach(day => {
  if (day.textContent.includes(today)) {
    day.classList.add('current');
  }
});
