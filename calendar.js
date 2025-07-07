// --- Funcție globală pentru refresh săptămânal, IDENTICĂ cu app.js ---
window.refreshCalendarForWeek = function(weekKey) {
  // Normalizează la luni local, o singură dată, peste tot
  let monday = window.getMondayOf(weekKey instanceof Date ? weekKey : new Date(weekKey));
  // Forțează mereu local time, fără conversii UTC
  window.currentMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  // DEBUG
  console.log('[DEBUG] refreshCalendarForWeek:', { input: weekKey, normalizedMonday: window.currentMonday.toLocaleString() });
  let calendar = document.getElementById('calendar');
  var statisticsPanel = document.getElementById('statisticsPanel');
  if (statisticsPanel) {
    statisticsPanel.innerHTML = '';
    statisticsPanel.style.display = 'none';
  }
  if (calendar) {
    try {
      if (window.renderCustomCalendarForWeek) {
        let weekKeyNorm = window.getWeekKey(window.currentMonday);
        console.log('[DEBUG] renderCustomCalendarForWeek with weekKey:', weekKeyNorm);
        window.renderCustomCalendarForWeek(
          calendar,
          window.db || (window.firebase && window.firebase.firestore && window.firebase.firestore()),
          weekKeyNorm
        );
      }
    } catch (err) {
      alert('Eroare la afișarea calendarului: ' + err.message);
    }
  }
  if(window.updateWeekLabel && window.currentMonday) {
    var weekLabel = document.getElementById('currentWeekLabel');
    if(weekLabel) {
      window.updateWeekLabel(window.currentMonday);
    }
  }
  // DEBUG: Final state
  console.log('[DEBUG] window.currentMonday:', window.currentMonday.toLocaleString());
};
// calendar.js - implementare minimă pentru funcționalitate de bază

// Funcție mock pentru generarea cheii săptămânii

// --- Funcții utilitare ---
// Folosește doar getWeekKey din utils.js, nu local

// --- Calendar read-only pentru utilizator ---
window.renderCustomCalendarForWeek = function(container, db, weekKey) {
  // Folosește exact aceleași chei ca în Firestore/app.js/todo.js (fără diacritice!)
  const DAYS = window.DAYS;
  const HOURS = window.HOURS;
  if (!container || !db || !DAYS || !HOURS) {
    container.innerHTML = `<div style='padding:32px;text-align:center;color:#888;'>Calendarul nu poate fi afișat (lipsesc datele necesare).</div>`;
    return;
  }
  console.log('[renderCustomCalendarForWeek] weekKey:', weekKey, 'window.currentMonday:', window.currentMonday);
  db.collection("shifts").where('weekKey', '==', weekKey).get().then(async querySnapshot => {
    const shifts = [];
    querySnapshot.forEach(doc => shifts.push({ ...doc.data(), id: doc.id }));
    console.log('[DEBUG][FIRESTORE] weekKey:', weekKey, '| shifts:', shifts.length, shifts);
    const shiftsByDay = {};
    for (const day of DAYS) shiftsByDay[day] = [];
    for (const shift of shifts) {
      // Normalizează ziua la formatul fără diacritice pentru compatibilitate
      let dayKey = shift.day;
      if (dayKey === 'Marți') dayKey = 'Marti';
      if (dayKey === 'Sâmbătă') dayKey = 'Sambata';
      if (dayKey === 'Duminică') dayKey = 'Duminica';
      if (shiftsByDay[dayKey]) shiftsByDay[dayKey].push(shift);
    }
    const validShiftsByDay = {};
    for (const day of DAYS) {
      validShiftsByDay[day] = (shiftsByDay[day] || []).filter(s => s && typeof s === 'object' && s.startHour !== undefined && s.endHour !== undefined);
    }
    let html = `<div class='calendar-wrapper'>`;
    html += `<div style='color:#888;font-size:1em;margin-bottom:12px;text-align:center;'>DEBUG: weekKey căutat: <b>${weekKey}</b> &mdash; ture găsite: <b>${shifts.length}</b></div>`;
    let gridRows = [];
    let barGridRows = [];
    let rowIdx = 3;
    for (const day of DAYS) {
      gridRows.push(40);
      barGridRows.push({ type: 'day', row: rowIdx, day });
      rowIdx++;
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
    // --- TASK DOT LOGIC (ca în app.js) ---
    let taskDotData = {};
    // Unique, non-overlapping, shift-bar-safe color logic
    const SHIFT_BAR_COLORS = ['#27ae60', '#4f8cff', '#8e44ad', '#ffb347', '#e74c3c'];
    const BASE_TASK_COLORS = [
      '#FF9800','#F44336','#FFC107','#795548','#00B8D4','#FFB300','#D84315','#607D8B','#8D6E63','#C0CA33','#E91E63','#A1887F','#B0BEC5','#FF7043','#FFD600','#B71C1C','#FF6F00','#5D4037','#0097A7','#F06292'
    ].filter(c => !SHIFT_BAR_COLORS.includes(c.toLowerCase()));
    function getTaskColorMap(tasks) {
      // Flatten all tasks for the week
      let allTasks = [];
      for (const day of Object.keys(tasks)) {
        let dayTasks = Array.isArray(tasks[day]) ? tasks[day] : Object.values(tasks[day] || {});
        for (const t of dayTasks) {
          if (t && t.text) allTasks.push(t.text.trim());
        }
      }
      // Unique task names
      let uniqueTasks = Array.from(new Set(allTasks));
      let colorMap = {};
      uniqueTasks.forEach((task, i) => {
        if (i < BASE_TASK_COLORS.length) {
          colorMap[task] = BASE_TASK_COLORS[i];
        } else {
          // Generate HSL color, avoiding green/blue/purple/yellow/orange hues
          let hue = (i * 47) % 360;
          // Avoid 120-170 (green), 200-250 (blue), 260-300 (purple), 40-60 (yellow), 20-40 (orange)
          if ((hue >= 120 && hue <= 170) || (hue >= 200 && hue <= 250) || (hue >= 260 && hue <= 300) || (hue >= 40 && hue <= 60) || (hue >= 20 && hue <= 40)) {
            hue = (hue + 80) % 360;
          }
          colorMap[task] = `hsl(${hue}, 80%, 54%)`;
        }
      });
      return colorMap;
    }
    let tasks = {};
    if (window.getTasksForWeek && weekKey) {
      try {
        let t = await window.getTasksForWeek(weekKey);
        // Normalizează cheile taskurilor la formatul fără diacritice
        const normalizedTasks = {};
        for (const k of Object.keys(t)) {
          let nk = k;
          if (nk === 'Marți') nk = 'Marti';
          if (nk === 'Sâmbătă') nk = 'Sambata';
          if (nk === 'Duminică') nk = 'Duminica';
          normalizedTasks[nk] = t[k];
        }
        tasks = normalizedTasks;
      } catch {}
    }
    for (const bar of barGridRows) {
      if (bar.type === 'day') {
        // Render day header with tasks synchronously (like admin)
        let dayTasks = (tasks[bar.day] || []);
        let taskHtml = '';
        // Fetch all employees for assigned names
        let employees = await db.collection('employees').get().then(qs => qs.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        // Build color map for all tasks in the week
        const colorMap = getTaskColorMap(tasks);
        if(dayTasks.length > 0) {
          taskHtml = `<ul class='calendar-tasks' style='margin:4px 0 0 0;padding:0 0 0 5px;list-style:none;font-size:0.97em;'>` +
            dayTasks.map((t,i) => {
              const color = colorMap[t.text && t.text.trim()];
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
        html += `<div class='calendar-day' data-day='${bar.day}' style='grid-row: ${bar.row}; grid-column: 1 / span ${HOURS.length+1}; border-top: 2px solid #222; background: #f8f8f8; font-size: 1em; padding: 6px 12px 4px 16px; letter-spacing: 0.5px;'>${bar.day}${taskHtml}</div>`;
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
        // --- Adaugă etichete pentru Inventar și Deschidere/Inchidere ---
        let extraLabels = '';
        if (shift.isResponsabilInventar) {
          barColor = '#e74c3c';
          extraLabels += ' (Inventar)';
        }
        if (shift.isResponsabil) {
          extraLabels += ' (DESCHIDERE/INCHIDERE)';
        }
        let responsabilLabel = '';
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
          const foundTaskIdx = tasks[bar.day].findIndex(t => Array.isArray(t.employeeIds) ? t.employeeIds.includes(shift.employeeId) && !t.done : t.employeeId === shift.employeeId && !t.done);
          if (foundTaskIdx !== -1) {
            const t = tasks[bar.day][foundTaskIdx];
            // Use the same color map as above
            const colorMap = getTaskColorMap(tasks);
            const taskColor = colorMap[t.text && t.text.trim()];
            taskDot = `<span style='display:inline-block;width:7px;height:7px;min-width:7px;min-height:7px;max-width:7px;max-height:7px;aspect-ratio:1/1;margin-right:6px;background:${taskColor};border-radius:50%;border:2px solid #fff;box-shadow:0 1px 2px #0001;vertical-align:middle;'></span>`;
          }
        }
html += `<div class='${barClass}' 
            data-shiftid='${shift.id}' 
            data-employee-id='${shift.employeeId}'
            data-day='${bar.day}' 
            data-starthour='${shift.startHour}' 
            data-startminute='${shift.startMinute || 0}' 
            data-endhour='${shift.endHour}' 
            data-endminute='${shift.endMinute || 0}'
            data-department='${shift.department || ''}'
            data-location='${shift.location || 'Implicit'}'
            style='grid-row: ${bar.row}; grid-column: ${startIdx + 2} / ${endIdx + 2}; height: 100%; background: ${barColor}; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #fff; font-weight: bold; box-shadow: 0 2px 8px #0002; z-index: 2; margin: 0; padding: 0;'>
            <span style='position:relative;min-height:10px;line-height:10px;display:inline-block;max-width:100%;white-space:normal;'>${taskDot}${shift.name}${extraLabels} ${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute||0).padStart(2, '0')}-${String(shift.endHour).padStart(2, '0')}:${String(shift.endMinute||0).padStart(2, '0')}${shift.location ? (shift.location !== 'Implicit' ? ', ' + shift.location : '') : ''} ${oreText}</span>
          </div>`;
        continue;
      }
    }
    html += `</div>`;
    html += `</div>`;
    if (shifts.length === 0) {
      html += `<div style='color:#e74c3c;font-size:1.1em;text-align:center;margin:32px 0 0 0;'>Nu există nicio tură pentru această săptămână (${weekKey}).</div>`;
    }
    container.innerHTML = html;
    console.log('[renderCustomCalendarForWeek] Etichetă săptămână:', document.getElementById('currentWeekLabel')?.textContent);
    // Actualizează eticheta săptămânii după fiecare randare calendar
    if(window.updateWeekLabel && window.currentMonday) {
      window.updateWeekLabel(window.currentMonday);
    } else if(document.getElementById('currentWeekLabel')) {
      const monday = new Date(window.currentMonday);
      monday.setHours(0,0,0,0);
      let sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (dt) => dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      document.getElementById('currentWeekLabel').textContent = fmt(monday) + ' — ' + fmt(sunday);
    }
    // --- Populează asincron taskurile pe zi, ca în app.js ---
    (async function() {
      let weekKey = window.getWeekKey ? window.getWeekKey(window.currentMonday) : (typeof getWeekKey !== 'undefined' ? getWeekKey(window.currentMonday) : '');
      console.log('[TASKS] weekKey pentru taskuri:', weekKey, 'window.currentMonday:', window.currentMonday);
      let tasks = (window.getTasksForWeek ? await window.getTasksForWeek(weekKey) : (typeof getTasksForWeek !== 'undefined' ? await getTasksForWeek(weekKey) : {})) || {};
      // Normalizează cheile taskurilor la formatul fără diacritice
      const normalizedTasks = {};
      for (const k of Object.keys(tasks)) {
        let nk = k;
        if (nk === 'Marți') nk = 'Marti';
        if (nk === 'Sâmbătă') nk = 'Sambata';
        if (nk === 'Duminică') nk = 'Duminica';
        normalizedTasks[nk] = tasks[k];
      }
      tasks = normalizedTasks;
      const employees = await db.collection('employees').get().then(qs => qs.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      // Build color map for all tasks in the week
      const colorMap = getTaskColorMap(tasks);
      for(const day of DAYS) {
        let dayTasks = (tasks[day] || []);
        if(dayTasks.length > 0) {
          const containerDiv = container.querySelector(`.calendar-day[data-day='${day}'] .calendar-tasks-container`);
          if(containerDiv) {
            dayTasks.forEach((t,i) => {
              const color = colorMap[t.text && t.text.trim()];
              let assigned = '';
              if (t.employeeIds && t.employeeIds.length > 0) {
                assigned = ' — ' + t.employeeIds.map(eid => {
                  const emp = employees.find(emp => emp.id === eid);
                  return emp ? (emp.lastName + ' ' + emp.firstName) : '';
                }).filter(Boolean).join(', ');
              }
              const li = document.createElement('span');
              li.className = 'calendar-task';
              li.style.display = 'flex';
              li.style.alignItems = 'center';
              li.style.gap = '4px';
              li.innerHTML = `<span class='calendar-task-dot' style='background:${color};margin-right:5px;vertical-align:middle;border:1.5px solid #fff;box-shadow:0 1px 3px #0001;flex-shrink:10;width:14px;height:14px;aspect-ratio:1/1;border-radius:50%;display:inline-block;'></span> <span style='${t.done ? 'text-decoration:line-through;color:#aaa;' : ''}'>${t.text}${assigned}</span>`;
              containerDiv.appendChild(li);
            });
          }
        }
      }
    })();
  }).catch(err => {
    container.innerHTML = `<div style='padding:32px;text-align:center;color:#e74c3c;'>Eroare la încărcarea calendarului: ${err.message}</div>`;
  });
};

function updateWeekLabel(currentMonday) {
  const endOfWeek = new Date(currentMonday);
  endOfWeek.setDate(currentMonday.getDate() + 6); // Adaugă 6 zile pentru a obține duminica

  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const startLabel = currentMonday.toLocaleDateString('ro-RO', options);
  const endLabel = endOfWeek.toLocaleDateString('ro-RO', options);

  document.getElementById('currentWeekLabel').textContent = `${startLabel} — ${endLabel}`;
}
