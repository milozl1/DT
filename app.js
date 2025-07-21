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

    // --- Fetch leaves for the week ---
    let leavesForWeek = [];
    if (window.LeaveManager) {
      await window.LeaveManager.fetchLeaves(db);
      leavesForWeek = window.LeaveManager.leaves.filter(leave => leave.weekKey === weekKey);
    }

    // --- Fetch employees for leave bars ---
    const employeesSnap = await db.collection('employees').get();
    const employeesMap = {};
    employeesSnap.forEach(doc => {
      employeesMap[doc.id] = doc.data();
    });

    // --- Assign globals for statistics.js ---
    window.employees = Object.entries(employeesMap).map(([id, data]) => ({ id, ...data }));
    window.weekShifts = shifts;
    window.leavesForWeek = leavesForWeek;

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
      // --- Concedii pe rânduri separate ---
      const leavesForDay = leavesForWeek.filter(leave => leave.days && leave.days.includes(day));
      for (const leave of leavesForDay) {
        const employee = employeesMap[leave.employeeId];
        if (employee) {
          gridRows.push(28);
          barGridRows.push({
            type: 'leave',
            row: rowIdx,
            day,
            employeeId: leave.employeeId,
            employee,
            leave
          });
          rowIdx++;
        }
      }
      // --- Ture ---
      const shiftsForDay = validShiftsByDay[day].slice();
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
        const shift = shiftsForDay[i];
        let displayName = '';
        if (typeof employeesMap !== 'undefined' && shift.employeeId && employeesMap[shift.employeeId]) {
          const emp = employeesMap[shift.employeeId];
          displayName = `${emp.lastName || ''} ${emp.firstName || ''}`;
        } else {
          displayName = 'undefined';
        }
        gridRows.push(28);
        barGridRows.push({ type: 'shift', row: rowIdx, day, shift, displayName });
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
        // ...ziua, ca înainte...
        const leavesForDay = leavesForWeek.filter(leave => leave.days && leave.days.includes(bar.day));
        let leaveIndicator = '';
        if (leavesForDay.length > 0) {
          leaveIndicator = ` <span style="color: #ff6b35; font-weight: bold;" title="${leavesForDay.length} angajat(i) în concediu">🏖️ ${leavesForDay.length}</span>`;
        }
        html += `<div class='calendar-day' data-day='${bar.day}' style='grid-row: ${bar.row}; grid-column: 1 / span ${HOURS.length+1}; border-top: 2px solid #222; background: #f8f8f8; font-size: 1em; padding: 6px 12px 4px 16px; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center;'><span>${bar.day}</span>${leaveIndicator}</div>`;
      } else if (bar.type === 'leave') {
        // --- Bară concediu pe rând separat ---
        html += `<div class='calendar-leave-bar' data-employee-id='${bar.employeeId}' onclick='openEmployeeLeaveModal("${bar.employeeId}", ${JSON.stringify(bar.employee).replace(/"/g, "&quot;")})' style='grid-row:${bar.row}; grid-column:2 / span ${HOURS.length}; height:100%; background:rgba(255,107,53,0.12); border:2px dashed #ff6b35; display:flex; align-items:center; justify-content:space-between; border-radius:8px; color:#ff6b35; font-weight:bold; font-size:13px; z-index:1; cursor:pointer; margin:1px; padding:0 12px; transition:all 0.2s;'>\n          <span style='text-align:left;line-height:1.2;flex:1;'>${bar.employee.lastName} ${bar.employee.firstName} - CONCEDIU 🏖️</span>\n          <span style='text-align:right;font-size:11px;color:#e65100;'>${bar.employee.norma ? Math.round((parseFloat(bar.employee.norma)/5)*10)/10 + 'h' : ''}</span>\n        </div>`;
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
        
        // --- LEAVE INDICATOR ---
        let leaveIndicator = '';
        if (window.LeaveManager && shift.employeeId && window.LeaveManager.isOnLeave(shift.employeeId, weekKey, bar.day)) {
          leaveIndicator = ' 🏖️';
          barColor = '#ff6b35'; // Orange pentru concediu
        }
        
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
            <span style='position:relative;min-height:10px;line-height:10px;'>${taskDot}${bar.displayName} ${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute||0).padStart(2, '0')}-${String(shift.endHour).padStart(2, '0')}:${String(shift.endMinute||0).padStart(2, '0')}${shift.location ? (shift.location !== 'Implicit' ? ', ' + shift.location : '') : ''} ${oreText}${leaveIndicator}</span>
          </div>`;
        continue;
      } else if (bar.type === 'leave') {
        // --- LEAVE BAR PE ZIUA CORECTĂ ---
        const employee = bar.employee;
        const day = bar.day;
        // Calculează norma zilnică (împărțit la 5 zile lucrătoare)
        let norma = parseFloat(employee.norma);
        let dailyNorm = '';
        if (!isNaN(norma) && norma > 0) {
          let val = Math.round((norma / 5) * 10) / 10;
          // Dacă e întreagă, afișează fără zecimale
          dailyNorm = (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + 'h';
        }
        html += `<div class='calendar-leave-bar' 
            data-employee-id='${bar.employeeId}'
            onclick='openEmployeeLeaveModal("${bar.employeeId}", ${JSON.stringify(employee).replace(/"/g, "&quot;")})'
            style='grid-row: ${bar.row}; grid-column: 2 / span ${HOURS.length}; 
                   height: 100%; 
                   background: rgba(255, 107, 53, 0.1); 
                   border: 2px dashed #ff6b35; 
                   display: flex; 
                   align-items: center; 
                   justify-content: space-between; 
                   border-radius: 8px; 
                   color: #ff6b35; 
                   font-weight: bold; 
                   font-size: 12px;
                   z-index: 1; 
                   cursor: pointer;
                   margin: 1px;
                   padding: 0 12px;
                   transition: all 0.2s ease;'
            onmouseover='this.style.background="rgba(255, 107, 53, 0.2)"; this.style.transform="scale(1.01)";'
            onmouseout='this.style.background="rgba(255, 107, 53, 0.1)"; this.style.transform="scale(1)";'
            title='Click pentru gestionare concediu - ${day}'>
            <span style='text-align: left; line-height: 1.2; flex: 1;'>
              ${employee.lastName} ${employee.firstName} - CONCEDIU 🏖️
            </span>
            <span style='text-align: right; font-size: 10px; color: #e65100;'>
              ${dailyNorm ? dailyNorm : ''}
            </span>
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
      let tasks = (window.getTasksForWeek ? await window.getTasksForWeek(weekKey) : (typeof getTasksForWeek !== 'undefined' ? getTasksForWeek(weekKey) : {})) || {};
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
    
    // --- Adaugă barele de concediu după turele normale ---
    // Grupează concediile pe angajați
    const leavesByEmployee = {};
    leavesForWeek.forEach(leave => {
      if (!leavesByEmployee[leave.employeeId]) {
        leavesByEmployee[leave.employeeId] = [];
      }
      leavesByEmployee[leave.employeeId].push(leave);
    });
    
    // Adaugă rând pentru fiecare angajat cu concediu
    Object.keys(leavesByEmployee).forEach(employeeId => {
      const employee = employeesMap[employeeId];
      if (employee) {
        gridRows.push(32); // Înălțime pentru bara de concediu
        barGridRows.push({ 
          type: 'leave', 
          row: rowIdx, 
          employeeId, 
          employee, 
          leaves: leavesByEmployee[employeeId] 
        });
        rowIdx++;
      }
    });
    
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
              const color = t.color || taskColors[i % taskColors.length];
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
      } else if (bar.type === 'leave') {
        // --- LEAVE BAR ---
        const employee = bar.employee;
        const leaves = bar.leaves;
        
        // Grupează concediile pe zile pentru această săptămână
        const leaveDaysByDay = {};
        leaves.forEach(leave => {
          if (leave.days && Array.isArray(leave.days)) {
            leave.days.forEach(day => {
              if (DAYS.includes(day)) {
                leaveDaysByDay[day] = true;
              }
            });
          }
        });
        
        // Creează o singură bară pentru toată săptămâna cu informații despre zilele de concediu
        const leaveDaysForWeek = Object.keys(leaveDaysByDay);
        if (leaveDaysForWeek.length > 0) {
          // Afișează bara pe toată lățimea calendarului
          html += `<div class='calendar-leave-bar' 
              data-employee-id='${bar.employeeId}'
              onclick='openEmployeeLeaveModal("${bar.employeeId}", ${JSON.stringify(employee).replace(/"/g, "&quot;")})'
              style='grid-row: ${bar.row}; grid-column: 2 / span ${HOURS.length}; 
                     height: 100%; 
                     background: rgba(255, 107, 53, 0.1); 
                     border: 2px dashed #ff6b35; 
                     display: flex; 
                     align-items: center; 
                     justify-content: space-between; 
                     border-radius: 8px; 
                     color: #ff6b35; 
                     font-weight: bold; 
                     font-size: 12px;
                     z-index: 1; 
                     cursor: pointer;
                     margin: 1px;
                     padding: 0 12px;
                     transition: all 0.2s ease;'
              onmouseover='this.style.background="rgba(255, 107, 53, 0.2)"; this.style.transform="scale(1.01)";'
              onmouseout='this.style.background="rgba(255, 107, 53, 0.1)"; this.style.transform="scale(1)";'
              title='Click pentru gestionare concediu - ${leaveDaysForWeek.join(", ")}'>
              <span style='text-align: left; line-height: 1.2; flex: 1;'>
                ${employee.lastName} ${employee.firstName} - CONCEDIU 🏖️
              </span>
              <span style='text-align: right; font-size: 10px; color: #e65100;'>
                ${leaveDaysForWeek.join(", ")}
              </span>
            </div>`;
        }
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

    // --- Username and password generation ---
    function generateUsername(firstName, lastName) {
      let base = (firstName[0] || '').toLowerCase() + (lastName || '').toLowerCase();
      base = base.replace(/[^a-z0-9]/g, '');
      return base;
    }
    function generatePassword() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      let pass = '';
      for (let i = 0; i < 6; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
      return pass;
    }

    try {
      if (empId) {
        // Actualizează angajatul existent (nu schimba username/parola)
        await db.collection('employees').doc(empId).update({ lastName, firstName, norma, department });
        hideModalWithBackdrop(modal);
        const employeeList = document.getElementById('employeeList');
        if (employeeList) renderEmployeeList(employeeList, db);
      } else {
        // Adaugă un angajat nou cu username și parolă
        let username = generateUsername(firstName, lastName);
        let password = generatePassword();
        // Ensure username is unique
        let exists = false;
        let suffix = 1;
        do {
          const snapshot = await db.collection('employees').where('username', '==', username).get();
          exists = !snapshot.empty;
          if (exists) {
            username = username + suffix;
            suffix++;
          }
        } while (exists);
        const newEmp = { lastName, firstName, norma, department, username, password };
        await db.collection('employees').add(newEmp);
        hideModalWithBackdrop(modal);
        // Show credentials to admin
        setTimeout(() => {
          alert('Angajat adăugat!\n\nUsername: ' + username + '\nParolă: ' + password + '\n\nSalvează aceste date și comunică-le angajatului.');
        }, 300);
        const employeeList = document.getElementById('employeeList');
        if (employeeList) renderEmployeeList(employeeList, db);
      }
    } catch (err) {
      alert('Eroare la salvarea angajatului: ' + err.message);
    }
  };

  showModalWithBackdrop(modal);
}
window.openAddEmployeeModal = openAddEmployeeModal;

// === GESTIONARE CONCEDII ===
// Modal pentru gestionarea concediilor
function openLeaveManagementModal() {
  let modal = document.getElementById('leaveManagementModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'leaveManagementModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content shift-modal-premium" style="max-width: 800px;">
        <button class="close" aria-label="Închide">&times;</button>
        <div class="shift-modal-header">
          <div class="shift-modal-icon"><span>🏖️</span></div>
          <div>
            <div class="shift-modal-title">Gestionare Concedii</div>
            <div class="shift-modal-subtitle">Adaugă și gestionează concediile angajaților</div>
          </div>
        </div>
        <div class="shift-modal-form">
          <!-- Secțiunea de adăugare concediu -->
          <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #223046;">Adaugă concediu nou pentru săptămâna curentă</h3>
            <div class="shift-modal-row">
              <label>Angajat:</label>
              <select id="leaveEmployeeSelect" required>
                <option value="">Selectează angajat...</option>
              </select>
            </div>
            <div class="shift-modal-row">
              <label>Zile de concediu din săptămâna curentă:</label>
              <div id="leaveDaysContainer" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                <!-- Checkbox-uri pentru zile -->
              </div>
            </div>
            <button id="addLeaveBtn" class="shift-modal-save" style="margin-top: 16px;">Adaugă concediu</button>
          </div>
          
          <!-- Secțiunea cu concediile existente -->
          <div>
            <h3 style="margin: 0 0 16px 0; color: #223046;">Concedii existente</h3>
            <div id="existingLeavesContainer" style="max-height: 300px; overflow-y: auto;">
              <!-- Lista concediilor -->
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Populează dropdown-ul cu angajații
  const employeeSelect = document.getElementById('leaveEmployeeSelect');
  db.collection('employees').get().then(querySnapshot => {
    employeeSelect.innerHTML = '<option value="">Selectează angajat...</option>';
    // Grupare pe departamente
    const departments = {};
    querySnapshot.forEach(doc => {
      const emp = doc.data();
      const dept = emp.department || 'Fără departament';
      if (!departments[dept]) departments[dept] = [];
      departments[dept].push({ id: doc.id, ...emp });
    });
    // Ordinea dorită: Women, Men, Kids, Restul (alfabetic)
    const specialOrder = ['Women', 'Men', 'Kids'];
    const rest = Object.keys(departments).filter(d => !specialOrder.includes(d)).sort();
    const ordered = [...specialOrder, ...rest];
    ordered.forEach(dept => {
      if (!departments[dept]) return;
      const optgroup = document.createElement('optgroup');
      optgroup.label = dept;
      departments[dept].sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName));
      departments[dept].forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.id;
        option.textContent = `${emp.lastName} ${emp.firstName}`;
        optgroup.appendChild(option);
      });
      employeeSelect.appendChild(optgroup);
    });
  });

  // Generează checkbox-urile pentru zile
  const daysContainer = document.getElementById('leaveDaysContainer');
  // Folosește DAYS global definit în utils.js pentru consistență
  daysContainer.innerHTML = (window.DAYS || ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica']).map(day => `
    <label style="display: flex; align-items: center; gap: 6px; background: #fff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e3e7ef; cursor: pointer;">
      <input type="checkbox" value="${day}" style="margin: 0;">
      <span>${day}</span>
    </label>
  `).join('');

  // Event listener pentru adăugarea concediului
  const addLeaveBtn = document.getElementById('addLeaveBtn');
  addLeaveBtn.onclick = async function() {
    const employeeId = document.getElementById('leaveEmployeeSelect').value;
    const selectedDays = Array.from(daysContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    if (!employeeId || selectedDays.length === 0) {
      alert('Selectează un angajat și cel puțin o zi!');
      return;
    }

    try {
      // Folosește săptămâna curentă din calendar
      let monday = window.currentMonday || (window.getMondayOf ? window.getMondayOf(new Date()) : new Date());
      let weekKey = window.getWeekKey ? window.getWeekKey(monday) : (typeof getWeekKey !== 'undefined' ? getWeekKey(monday) : monday.toISOString().slice(0,10));
      await window.LeaveManager.addLeave(db, employeeId, weekKey, selectedDays);
      alert('Concediul a fost adăugat cu succes!');
      // Reset form
      document.getElementById('leaveEmployeeSelect').value = '';
      daysContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      // Refresh lists
      loadExistingLeaves();
      // Refresh calendar pentru săptămâna curentă
      const calendar = document.getElementById('calendar');
      if (calendar) {
        renderCustomCalendarForWeek(calendar, db, weekKey);
      }
    } catch (error) {
      alert('Eroare la adăugarea concediului: ' + error.message);
    }
  };

  // Funcție pentru încărcarea concediilor existente
  async function loadExistingLeaves() {
    const container = document.getElementById('existingLeavesContainer');
    const leaves = await window.LeaveManager.fetchLeaves(db);
    
    if (leaves.length === 0) {
      container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">Nu există concedii înregistrate</p>';
      return;
    }

    // Grupează concediile pe angajați
    const employeesMap = {};
    const employeesSnap = await db.collection('employees').get();
    employeesSnap.forEach(doc => {
      employeesMap[doc.id] = doc.data();
    });

    container.innerHTML = leaves.map(leave => {
      const emp = employeesMap[leave.employeeId];
      const empName = emp ? `${emp.lastName} ${emp.firstName}` : 'Angajat necunoscut';
      
      return `
        <div class="leave-item" style="background: #fff; border: 1px solid #e3e7ef; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 8px;">
            <strong>${empName}</strong>
            <small style="color: #888;">${leave.weekKey}</small>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${leave.days.map(day => `
              <span class="day-tag" style="background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 4px; font-size: 0.9em; cursor: pointer;" 
                    onclick="removeLeaveDay('${leave.employeeId}', '${leave.weekKey}', '${day}')"
                    title="Click pentru a șterge">
                ${day} ✕
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // Funcție globală pentru ștergerea unei zile de concediu
  window.removeLeaveDay = async function(employeeId, weekKey, day) {
    if (!confirm(`Sigur vrei să ștergi ziua de ${day} din concediul angajatului?`)) return;
    
    try {
      await window.LeaveManager.removeLeaveDay(employeeId, weekKey, day);
      loadExistingLeaves();
      
      // Refresh calendar dacă e pentru săptămâna curentă
      const calendar = document.getElementById('calendar');
      if (calendar) {
        let monday = window.currentMonday || getMondayOf(new Date());
        let currentWeekKey = getWeekKey(monday);
        renderCustomCalendarForWeek(calendar, db, currentWeekKey);
      }
    } catch (error) {
      alert('Eroare la ștergerea zilei de concediu: ' + error.message);
    }
  };

  // Încarcă concediile existente
  loadExistingLeaves();

  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  // Eliminat window.onclick care bloca modalul la orice click
  showModalWithBackdrop(modal);
  console.log('[DEBUG] showModalWithBackdrop called for employeeDetailsModal');

  showModalWithBackdrop(modal);
}

// Modal pentru gestionarea concediilor unui angajat specific
function openEmployeeLeaveModal(empId, empData) {
  let modal = document.getElementById('employeeLeaveModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'employeeLeaveModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content shift-modal-premium" style="max-width: 600px;">
        <button class="close" aria-label="Închide">&times;</button>
        <div class="shift-modal-header">
          <div class="shift-modal-icon"><span>🏖️</span></div>
          <div>
            <div class="shift-modal-title">Concedii - ${empData.lastName} ${empData.firstName}</div>
            <div class="shift-modal-subtitle">Gestionează concediile pentru acest angajat</div>
          </div>
        </div>
        <div class="shift-modal-form">
          <!-- Secțiunea de adăugare concediu -->
          <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #223046;">Adaugă concediu nou pentru săptămâna curentă</h3>
            <div class="shift-modal-row">
              <label>Zile de concediu din săptămâna curentă:</label>
              <div id="empLeaveDaysContainer" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                <!-- Checkbox-uri pentru zile -->
              </div>
            </div>
            <button id="addEmpLeaveBtn" class="shift-modal-save" style="margin-top: 16px;">Adaugă concediu</button>
          </div>
          
          <!-- Secțiunea cu concediile existente pentru acest angajat -->
          <div>
            <h3 style="margin: 0 0 16px 0; color: #223046;">Concediile acestui angajat</h3>
            <div id="empExistingLeavesContainer" style="max-height: 300px; overflow-y: auto;">
              <!-- Lista concediilor angajatului -->
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Generează checkbox-urile pentru zile
  const daysContainer = document.getElementById('empLeaveDaysContainer');
  // Folosește DAYS global definit în utils.js pentru consistență
  daysContainer.innerHTML = (window.DAYS || ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica']).map(day => `
    <label style="display: flex; align-items: center; gap: 6px; background: #fff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e3e7ef; cursor: pointer;">
      <input type="checkbox" value="${day}" style="margin: 0;">
      <span>${day}</span>
    </label>
  `).join('');

  // Event listener pentru adăugarea concediului
  const addEmpLeaveBtn = document.getElementById('addEmpLeaveBtn');
  addEmpLeaveBtn.onclick = async function() {
    const selectedDays = Array.from(daysContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    if (selectedDays.length === 0) {
      alert('Selectează cel puțin o zi!');
      return;
    }

    try {
      // Folosește săptămâna curentă din calendar
      let monday = window.currentMonday || getMondayOf(new Date());
      let weekKey = getWeekKey(monday);
      
      await window.LeaveManager.addLeave(db, empId, weekKey, selectedDays);
      alert('Concediul a fost adăugat cu succes!');
      
      // Reset form
      daysContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      
      // Refresh list
      loadEmployeeLeaves();
      
      // Refresh calendar dacă e pentru săptămâna curentă
      const calendar = document.getElementById('calendar');
      if (calendar) {
        let monday = window.currentMonday || getMondayOf(new Date());
        let currentWeekKey = getWeekKey(monday);
        renderCustomCalendarForWeek(calendar, db, currentWeekKey);
      }
      
      // Refresh employee list
      const employeeList = document.getElementById('employeeList');
      if (employeeList) renderEmployeeList(employeeList, db);
    } catch (error) {
      alert('Eroare la adăugarea concediului: ' + error.message);
    }
  };

  // Funcție pentru încărcarea concediilor acestui angajat
  async function loadEmployeeLeaves() {
    const container = document.getElementById('empExistingLeavesContainer');
    const leaves = await window.LeaveManager.fetchLeaves(db);
    const employeeLeaves = leaves.filter(leave => leave.employeeId === empId);
    
    if (employeeLeaves.length === 0) {
      container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">Nu există concedii înregistrate pentru acest angajat</p>';
      return;
    }

    container.innerHTML = employeeLeaves.map(leave => `
      <div class="leave-item" style="background: #fff; border: 1px solid #e3e7ef; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong>Săptămâna ${leave.weekKey}</strong>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${leave.days.map(day => `
            <span class="day-tag" style="background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 4px; font-size: 0.9em; cursor: pointer;" 
                  onclick="removeEmployeeLeaveDay('${leave.employeeId}', '${leave.weekKey}', '${day}')"
                  title="Click pentru a șterge">
              ${day} ✕
            </span>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // Funcție globală pentru ștergerea unei zile de concediu pentru angajat
  window.removeEmployeeLeaveDay = async function(employeeId, weekKey, day) {
    if (!confirm(`Sigur vrei să ștergi ziua de ${day} din concediul angajatului?`)) return;
    
    try {
      await window.LeaveManager.removeLeaveDay(employeeId, weekKey, day);
      loadEmployeeLeaves();
      
      // Refresh calendar dacă e pentru săptămâna curentă
      const calendar = document.getElementById('calendar');
      if (calendar) {
        let monday = window.currentMonday || getMondayOf(new Date());
        let currentWeekKey = getWeekKey(monday);
        renderCustomCalendarForWeek(calendar, db, currentWeekKey);
      }
      
      // Refresh employee list
      const employeeList = document.getElementById('employeeList');
      if (employeeList) renderEmployeeList(employeeList, db);
    } catch (error) {
      alert('Eroare la ștergerea zilei de concediu: ' + error.message);
    }
  };

  // Încarcă concediile angajatului
  loadEmployeeLeaves();

  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  // Eliminat window.onclick care bloca modalul la orice click
  showModalWithBackdrop(modal);

  showModalWithBackdrop(modal);
}

// === BUTON MASS SHIFT ÎN SIDEBAR ===
window.addEventListener('DOMContentLoaded', () => {
  // Buton Adaugă angajat
  const addEmployeeBtn = document.getElementById('addEmployeeBtn');
  if (addEmployeeBtn && typeof window.openAddEmployeeModal === 'function') {
    addEmployeeBtn.addEventListener('click', function() {
      window.openAddEmployeeModal();
    });
  }
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

  // === INTEGRARE LEAVE MANAGER ===
  // Încarcă concediile la inițializare
  if (window.LeaveManager && db) {
    window.LeaveManager.fetchLeaves(db);
  }

  // Adaugă event listener pentru butonul de concedii
  const leaveBtn = document.getElementById('leaveBtn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', openLeaveManagementModal);
  }

  // === Asigură afișarea calendarului la încărcarea paginii ===
  const calendar = document.getElementById('calendar');
  if (calendar && typeof renderCustomCalendarForWeek === 'function' && typeof db !== 'undefined') {
    let monday = window.currentMonday || getMondayOf(new Date());
    let weekKey = getWeekKey(monday);
    renderCustomCalendarForWeek(calendar, db, weekKey);
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
  // Eliminat window.onclick care bloca modalul la orice click
  showModalWithBackdrop(modal);
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
    let skippedLeave = 0; // Counter pentru ture sărite din cauza concediului
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
        // Verifică dacă angajatul este în concediu în ziua respectivă
        if (window.LeaveManager && window.LeaveManager.isOnLeave(empId, weekKey, day)) {
          console.log(`Nu se poate adăuga tură pentru ${emp.lastName} ${emp.firstName} în ziua ${day} - angajatul este în concediu`);
          skippedLeave++;
          continue; // Sare peste această zi pentru acest angajat
        }
        
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
    
    // Mesaj detaliat despre rezultatul operației
    let message = '';
    if (added > 0) {
      message += `Au fost adăugate ${added} ture.`;
    }
    if (skippedLeave > 0) {
      message += (added > 0 ? '\n' : '') + `${skippedLeave} ture nu au fost adăugate deoarece angajații respectivi sunt în concediu.`;
    }
    if (added === 0 && skippedLeave === 0) {
      message = 'Nu s-a adăugat nicio tură (există deja pentru zilele selectate).';
    }
    
    alert(message);
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

// Modal pentru adăugare tură individuală pentru un angajat
function openAddShiftModal(empId) {
  // Obține informațiile angajatului
  db.collection('employees').doc(empId).get().then(empDoc => {
    if (!empDoc.exists) {
      alert('Angajatul nu a fost găsit!');
      return;
    }
    
    const emp = empDoc.data();
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
              <div class="shift-modal-title">Adaugă tură pentru</div>
              <div class="shift-modal-employee" id="addShiftEmployeeName"></div>
            </div>
          </div>
          <form id="addShiftForm" class="shift-modal-form">
            <div class="shift-modal-row days-row">
              <label>Zile:</label>
              <span id="addShiftDaysContainer"></span>
            </div>
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
              <button type="submit" class="shift-modal-save">Adaugă ture</button>
            </div>
            <input type="hidden" id="addShiftEmployeeId">
          </form>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    // Populează informațiile angajatului
    document.getElementById('addShiftEmployeeName').textContent = `${emp.lastName} ${emp.firstName}`;
    document.getElementById('addShiftEmployeeId').value = empId;
    
    // Populează dropdown-urile pentru ore și minute
    function fillSelect(id, start, end, pad) {
      const sel = modal.querySelector('#' + id);
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

    // Preset orar
    const presetSelect = modal.querySelector('#addShiftPresetInterval');
    if (presetSelect) {
      presetSelect.onchange = function() {
        if (!this.value) return;
        const [start, end] = this.value.split('-');
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        modal.querySelector('#addShiftStartHour').value = sh;
        modal.querySelector('#addShiftStartMinute').value = sm;
        modal.querySelector('#addShiftEndHour').value = eh;
        modal.querySelector('#addShiftEndMinute').value = em;
      };
    }

    // Populează checkbox-urile pentru zile
    const daysContainer = modal.querySelector('#addShiftDaysContainer');
    if (daysContainer) {
      daysContainer.innerHTML = generateDaysCheckboxes('addShiftDays', 'addShiftDays');
      daysContainer.querySelectorAll('label').forEach(l => l.style.fontWeight = '400');
    }

    // Set implicit location based on department
    const locationSelect = modal.querySelector('#addShiftLocation');
    if (locationSelect) {
      if (emp.department === 'Women') {
        locationSelect.value = 'Parter';
      } else if (emp.department === 'Men' || emp.department === 'Kids') {
        locationSelect.value = 'Etaj';
      } else {
        locationSelect.value = 'Implicit';
      }
    }

    modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
    window.onclick = (event) => { if (event.target == modal) hideModalWithBackdrop(modal); };
    
    modal.querySelector('#addShiftForm').onsubmit = async function(e) {
      e.preventDefault();
      const empId = document.getElementById('addShiftEmployeeId').value;
      const days = Array.from(modal.querySelectorAll('input[name="addShiftDays"]:checked')).map(cb => cb.value);
      
      if (days.length === 0) { 
        alert('Selectează cel puțin o zi!'); 
        return; 
      }
      
      const startHour = parseInt(modal.querySelector('#addShiftStartHour').value);
      const startMinute = parseInt(modal.querySelector('#addShiftStartMinute').value);
      const endHour = parseInt(modal.querySelector('#addShiftEndHour').value);
      const endMinute = parseInt(modal.querySelector('#addShiftEndMinute').value);
      let location = modal.querySelector('#addShiftLocation').value;
      const isResponsabil = modal.querySelector('#addShiftResponsabil').checked;
      const isResponsabilInventar = modal.querySelector('#addShiftResponsabilInventar').checked;
      
      let monday = window.currentMonday || getMondayOf(new Date());
      let weekKey = getWeekKey(monday);
      
      // Asigură-te că LeaveManager este inițializat
      if (window.LeaveManager) {
        await window.LeaveManager.fetchLeaves(db);
      }
      
      let added = 0;
      let skippedLeave = 0;
      let skippedExisting = 0;
      
      for (const day of days) {
        // Verifică dacă angajatul este în concediu în ziua respectivă
        if (window.LeaveManager && window.LeaveManager.isOnLeave(empId, weekKey, day)) {
          console.log(`Nu se poate adăuga tură pentru ${emp.lastName} ${emp.firstName} în ziua ${day} - angajatul este în concediu`);
          skippedLeave++;
          continue;
        }
        
        // Verifică dacă există deja tură pentru acea zi și săptămână
        const existingShiftsSnap = await db.collection('shifts')
          .where('employeeId', '==', empId)
          .where('day', '==', day)
          .where('weekKey', '==', weekKey)
          .get();
        
        if (!existingShiftsSnap.empty) {
          skippedExisting++;
          continue;
        }
        
        // Adaugă tura
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
      
      // Mesaj detaliat despre rezultatul operației
      let message = '';
      if (added > 0) {
        message += `Au fost adăugate ${added} ture pentru ${emp.lastName} ${emp.firstName}.`;
      }
      if (skippedLeave > 0) {
        message += (added > 0 ? '\n' : '') + `${skippedLeave} ture nu au fost adăugate deoarece angajatul este în concediu.`;
      }
      if (skippedExisting > 0) {
        message += (added > 0 || skippedLeave > 0 ? '\n' : '') + `${skippedExisting} ture nu au fost adăugate deoarece există deja pentru zilele respective.`;
      }
      if (added === 0 && skippedLeave === 0 && skippedExisting === 0) {
        message = 'Nu s-a adăugat nicio tură.';
      }
      
      alert(message);
    };
    
    showModalWithBackdrop(modal);
  }).catch(err => {
    alert('Eroare la încărcarea angajatului: ' + err.message);
  });
}

// Definire funcție globală
window.openAddShiftModal = openAddShiftModal;

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
  db.collection("shifts").where('weekKey', '==', weekKey).get().then(async shiftSnap => {
    const shifts = [];
    shiftSnap.forEach(doc => shifts.push({ ...doc.data(), id: doc.id }));
    
    // Încarcă concediile pentru săptămână
    let leavesForWeek = [];
    if (window.LeaveManager) {
      await window.LeaveManager.fetchLeaves(db);
      leavesForWeek = window.LeaveManager.leaves.filter(leave => leave.weekKey === weekKey);
    }
    
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
            
            // Verifică dacă angajatul are concediu în această săptămână
            const empLeaves = leavesForWeek.filter(leave => leave.employeeId === emp.id);
            let leaveIndicator = '';
            if (empLeaves.length > 0) {
              const totalLeaveDays = empLeaves.reduce((total, leave) => total + leave.days.length, 0);
              leaveIndicator = ` <span style="color:#ff6b35;font-size:1.1em;" title="${totalLeaveDays} zi(le) de concediu">🏖️</span>`;
            }
            
            let oreText = `<span class='employee-hours' style='color:#888; font-size:0.95em;'>${ore}h</span>`;
            html += `<li class="employee-item" data-empid="${emp.id}">
              <div class="employee-main-row">${emp.lastName} ${emp.firstName} <span style='color:#aaa'>(${emp.norma})</span>${leaveIndicator}</div>
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
      // La click pe angajat, deschide modalul de detalii cu datele angajatului
      container.querySelectorAll('.employee-item').forEach(li => {
        li.addEventListener('click', function() {
          const empId = this.dataset.empid;
          // Caută datele angajatului în lista employees
          const empData = employees.find(e => e.id === empId);
          if (empData) {
            window.openEmployeeDetailsModal(empId, empData);
          } else {
            alert('Datele angajatului nu au putut fi găsite!');
          }
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
      // La click pe angajat, deschide modalul de detalii cu datele angajatului (folosește employees ca în renderEmployeeList)
      employeeList.querySelectorAll('.employee-item').forEach(li => {
        li.addEventListener('click', function() {
          const empId = this.dataset.empid;
          const empData = employees.find(e => e.id === empId);
          if (empData) {
            window.openEmployeeDetailsModal(empId, empData);
          } else {
            alert('Datele angajatului nu au putut fi găsite!');
          }
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
      <div id="login-details-toggle" style="margin:18px 0 0 0;display:flex;justify-content:center;">
        <button id="showLoginDetailsBtn" style="background:#1976d2;color:#fff;border:none;border-radius:5px;padding:7px 16px;font-size:0.98em;cursor:pointer;box-shadow:0 2px 8px #1976d233;transition:background .15s;">Detalii logare</button>
      </div>
      <div id="loginDetailsSection" style="display:none;margin:14px 0 0 0;padding:12px 18px 10px 18px;background:#f5f7fa;border-radius:8px;box-shadow:0 2px 8px #0001;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="font-weight:600;color:#1976d2;min-width:90px;">Username:</span><span style="color:#222;">${empData.username || '-'}</span></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:0;"><span style="font-weight:600;color:#1976d2;min-width:90px;">Parolă:</span><span style="color:#222;">${empData.password || '<span style=\'color:#888\'>(doar admin)</span>'}</span></div>
      </div>
      <div class="shift-modal-actions" style="margin-top:18px;display:flex;flex-wrap:wrap;gap:8px;justify-content: center;">
        <button id="editEmployeeBtn" class="shift-modal-save" style="min-width:110px;padding:10px 0;font-size:1em;">Editează</button>
        <button id="addShiftForEmployeeBtn" class="shift-modal-save" style="background:#4f8cff;min-width:100px;padding:10px 0;font-size:1em;">Adaugă tură</button>
        <button id="manageLeaveBtn" class="shift-modal-save" style="background:#ff6b35;min-width:100px;padding:10px 0;font-size:1em;">Concedii</button>
        <button id="deleteEmployeeBtn" class="shift-modal-delete" style="background:#e74c3c;min-width:100px;padding:10px 0;font-size:1em;">Șterge</button>
      </div>
    </div>
  `;
  // Toggle login details
  setTimeout(() => {
    const btn = modal.querySelector('#showLoginDetailsBtn');
    const section = modal.querySelector('#loginDetailsSection');
    if (btn && section) {
      btn.onclick = function() {
        if (section.style.display === 'none') {
          section.style.display = 'block';
          btn.textContent = 'Ascunde detalii logare';
        } else {
          section.style.display = 'none';
          btn.textContent = 'Detalii logare';
        }
      };
    }
  }, 0);
  // Toggle login details
  setTimeout(() => {
    const btn = modal.querySelector('#showLoginDetailsBtn');
    const section = modal.querySelector('#loginDetailsSection');
    if (btn && section) {
      btn.onclick = function() {
        if (section.style.display === 'none') {
          section.style.display = 'block';
          btn.textContent = 'Ascunde detalii logare';
        } else {
          section.style.display = 'none';
          btn.textContent = 'Detalii logare';
        }
      };
    }
  }, 0);
  modal.querySelector('.close').onclick = () => { hideModalWithBackdrop(modal); };
  // Eliminat window.onclick care bloca modalul la orice click
  showModalWithBackdrop(modal);
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
  
  // Buton Gestionare Concedii
  const manageLeaveBtn = document.getElementById('manageLeaveBtn');
  if (manageLeaveBtn) {
    manageLeaveBtn.onclick = function() {
      hideModalWithBackdrop(modal);
      openEmployeeLeaveModal(empId, empData);
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
}
window.openEmployeeDetailsModal = openEmployeeDetailsModal;

// === MISC ===
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
