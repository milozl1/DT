// todo.js
// Modul simplu pentru gestionarea taskurilor (to-do) în aplicație

(function() {
  // Cheie pentru localStorage, pe săptămână
  // Folosește funcția globală robustă getWeekKey dacă există
  function getWeekKey(date) {
    if (window.getWeekKey) return window.getWeekKey(date);
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  }
  const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];

  async function getTasksForWeek(weekKey) {
    try {
      const snap = await db.collection('tasks').doc(weekKey).get();
      return snap.exists ? (snap.data().tasks || {}) : {};
    } catch {
      return {};
    }
  }
  async function saveTasksForWeek(weekKey, tasks) {
    await db.collection('tasks').doc(weekKey).set({ tasks });
  }

  async function renderWeeklyTasksModal() {
    let monday = window.currentMonday || (function(){
      const d = new Date();
      const day = d.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      d.setDate(d.getDate() + diffToMonday);
      d.setHours(0,0,0,0);
      return d;
    })();
    const weekKey = window.getWeekKey(monday);
    let tasks = await getTasksForWeek(weekKey);
    // 1. Preia lista angajaților pentru dropdown
    const employees = await db.collection('employees').get().then(qs =>
      qs.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    );
    // 2. Preia shifts pentru săptămâna curentă
    const shiftsSnap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
    const shifts = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const shiftsByDay = {};
    for (const day of DAYS) {
      shiftsByDay[day] = shifts.filter(s => s.day === day);
    }

    // Mută generarea HTML după ce ai employees
    let modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:820px;min-width:420px;width:98vw;padding:32px 32px 28px 32px;box-sizing:border-box;">
        <span class="close" id="closeTasksModal" style="float:right;font-size:1.5em;cursor:pointer;">&times;</span>
        <h2 style="margin-top:0;">Taskuri pe săptămână</h2>
        <button id="openMultiAssignTask" style="margin-bottom:18px;padding:8px 18px;background:#219150;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:1em;box-shadow:0 1px 4px #0001;cursor:pointer;">Asignare task pe mai multe zile </button>
        <div style="display:grid;grid-template-columns:1fr;gap:22px;">
          ${DAYS.map(day => {
            // Angajați cu tură în ziua respectivă
            const empIdsWithShift = new Set(shiftsByDay[day].map(s => s.employeeId));
            const employeesWithShift = employees.filter(e => empIdsWithShift.has(e.id));
            return `
            <div>
              <div style='font-weight:600;margin-bottom:4px;'>${day}</div>
              <ul id='tasksList_${day}' style='min-height:24px;padding-left:18px;margin-bottom:8px;'>
                ${(tasks[day]||[]).map((t,i) => `<li style='margin-bottom:6px;display:flex;align-items:center;gap:8px;'>
                  <input type='checkbox' ${t.done ? 'checked' : ''} data-day='${day}' data-idx='${i}' class='task-done'>
                  <span style='${t.done ? 'text-decoration:line-through;color:#888;' : ''}'>${t.text}</span>
                  <span style='color:#219150;font-size:0.97em;margin-left:8px;'>${(t.employeeIds && t.employeeIds.length > 0) ? '— ' + t.employeeIds.map(eid => {
                    const emp = employees.find(emp => emp.id === eid);
                    return emp ? (emp.lastName + ' ' + emp.firstName) : '';
                  }).filter(Boolean).join(', ') : ''}</span>
                  <button data-day='${day}' data-idx='${i}' class='task-delete' style='margin-left:auto;background:none;border:none;color:#e74c3c;cursor:pointer;font-size:1.25em;line-height:1;display:flex;align-items:center;' title='Șterge'>🗑️</button>
                </li>`).join('')}
              </ul>
              <form class='addTaskForm' data-day='${day}' style='display:flex;gap:12px;align-items:center;margin-top:0;background:#f7fafd;border-radius:8px;padding:10px 12px;box-shadow:0 2px 8px #0001;width:100%;box-sizing:border-box;'>
                <input type='text' class='newTaskInput' placeholder='Task nou...' style='flex:2 1 220px;min-width:0;padding:9px 14px;font-size:1em;border:1px solid #d0d7de;border-radius:6px;background:#fff;outline:none;transition:border 0.2s;'>
                <div class="assignTaskEmployees ux-employee-list">
                  <div class='ux-employee-group'>
                    <div class='ux-employee-group-title'>Parter</div>
                    ${employeesWithShift.filter(e=>e.department==='Women'||e.department==='Parter')
                      .map(emp => `<label class='ux-employee-item'><input type='checkbox' class='empCheck' value='${emp.id}'> <span>${emp.lastName} ${emp.firstName}</span></label>`).join('')}
                  </div>
                  <div class='ux-employee-group'>
                    <div class='ux-employee-group-title'>Etaj</div>
                    ${employeesWithShift.filter(e=>e.department==='Men'||e.department==='Kids'||e.department==='Etaj')
                      .map(emp => `<label class='ux-employee-item'><input type='checkbox' class='empCheck' value='${emp.id}'> <span>${emp.lastName} ${emp.firstName}</span></label>`).join('')}
                  </div>
                  <div class='ux-employee-group'>
                    <div class='ux-employee-group-title'>Management</div>
                    ${employeesWithShift.filter(e=>e.department!=='Women'&&e.department!=='Parter'&&e.department!=='Men'&&e.department!=='Kids'&&e.department!=='Etaj')
                      .map(emp => `<label class='ux-employee-item'><input type='checkbox' class='empCheck' value='${emp.id}'> <span>${emp.lastName} ${emp.firstName}</span></label>`).join('')}
                  </div>
                </div>
                <button type='submit' style='flex:0 0 auto;padding:9px 28px;background:linear-gradient(90deg,#27ae60,#219150);color:#fff;border:none;border-radius:6px;font-weight:600;font-size:1em;box-shadow:0 1px 4px #0001;transition:background 0.2s;cursor:pointer;'>Adaugă</button>
              </form>
            </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    // Închidere modal
    modal.querySelector('#closeTasksModal').onclick = () => modal.remove();
    // Adăugare task nou pe zi
    modal.querySelectorAll('.addTaskForm').forEach(form => {
      form.onsubmit = async function(e) {
        e.preventDefault();
        const day = this.dataset.day;
        const val = this.querySelector('.newTaskInput').value.trim();
        const empChecks = this.querySelectorAll('.empCheck:checked');
        const selected = Array.from(empChecks).map(cb => cb.value);
        // Generează culoare random din paletă
        const palette = ['#FF9800','#F44336','#FFC107','#795548','#00B8D4','#FFB300','#D84315','#607D8B','#8D6E63','#C0CA33','#E91E63','#A1887F','#B0BEC5','#FF7043','#FFD600','#B71C1C','#FF6F00','#5D4037','#0097A7','#F06292'];
        const color = palette[Math.floor(Math.random()*palette.length)];
        if(val) {
          tasks[day] = tasks[day] || [];
          tasks[day].push({text: val, done: false, employeeIds: selected, color});
          await saveTasksForWeek(weekKey, tasks);
          if(window.refreshCalendarForWeek && typeof window.currentMonday !== 'undefined') {
            window.refreshCalendarForWeek(window.getWeekKey(window.currentMonday));
          }
          modal.remove();
          renderWeeklyTasksModal();
        }
      };
    });
    // Bifare task
    modal.querySelectorAll('.task-done').forEach(cb => {
      cb.onchange = async function() {
        const day = this.dataset.day;
        const idx = +this.dataset.idx;
        tasks[day][idx].done = this.checked;
        await saveTasksForWeek(weekKey, tasks);
        if(window.refreshCalendarForWeek && typeof window.currentMonday !== 'undefined') {
          window.refreshCalendarForWeek(window.getWeekKey(window.currentMonday));
        }
        // Reîncarcă și calendarul user dacă există
        if(window.renderUserCalendar && window.userCalendarState && window.userCalendarState.monday) {
          window.renderUserCalendar(window.userCalendarState.monday, window.userCalendarState.search, window.userCalendarState.group);
        }
        modal.remove();
        renderWeeklyTasksModal();
      };
    });
    // Ștergere task
    modal.querySelectorAll('.task-delete').forEach(btn => {
      btn.onclick = async function() {
        const day = this.dataset.day;
        const idx = +this.dataset.idx;
        tasks[day].splice(idx,1);
        await saveTasksForWeek(weekKey, tasks);
        if(window.refreshCalendarForWeek && typeof window.currentMonday !== 'undefined') {
          window.refreshCalendarForWeek(window.getWeekKey(window.currentMonday));
        }
        modal.remove();
        renderWeeklyTasksModal();
      };
    });
  }

  // Atașează handler pe butonul din sidebar
  window.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('tasksBtn');
    if(btn) btn.onclick = renderWeeklyTasksModal;
  });

  window.renderWeeklyTasksModal = renderWeeklyTasksModal;
  // Fereastra pentru asignare task pe mai multe zile și angajați
  window.addEventListener('click', async function(e) {
    if (e.target && e.target.id === 'openMultiAssignTask') {
      e.preventDefault();
      // Modal nou cu UX/UI îmbunătățit
      let modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.display = 'block';
      // Preia angajați
      const employees = await db.collection('employees').get().then(qs => qs.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      // Grupează angajații pe departamente
      // Grupează angajații pe grupă (proprietatea "group" sau fallback la "Fără grupă")
      // Grupează angajații pe grupă explicită: Parter, Etaj, Management
      const groupOrder = ['Parter', 'Etaj', 'Management'];
      const groupLabels = { Parter: 'Parter', Etaj: 'Etaj', Management: 'Management', Other: 'Fără grupă' };
      const groups = { Parter: [], Etaj: [], Management: [], Other: [] };
      employees.forEach(emp => {
        // Grupare veche după departament
        if (emp.department === 'Women' || emp.department === 'Parter') groups.Parter.push(emp);
        else if (emp.department === 'Men' || emp.department === 'Kids' || emp.department === 'Etaj') groups.Etaj.push(emp);
        else if (emp.department !== 'Women' && emp.department !== 'Parter' && emp.department !== 'Men' && emp.department !== 'Kids' && emp.department !== 'Etaj') groups.Management.push(emp);
        else groups.Other.push(emp);
      });
      modal.innerHTML = `
        <div class="modal-content" style="max-width:540px;min-width:320px;width:96vw;padding:32px 32px 28px 32px;box-sizing:border-box;">
          <span class="close" id="closeMultiAssignModal" style="float:right;font-size:1.5em;cursor:pointer;">&times;</span>
          <h2 style="margin-top:0;margin-bottom:8px;">Asignare rapidă task</h2>
          <div style="color:#555;font-size:1em;margin-bottom:18px;">Adaugă rapid un task pentru mai multe zile și/sau mai mulți angajați.<br><span style='color:#219150;font-size:0.97em;'>Poți lăsa fără angajați pentru task general.</span></div>
          <form id="multiAssignTaskForm" style="display:flex;flex-direction:column;gap:18px;">
            <input type="text" id="multiTaskText" placeholder="Task nou..." style="padding:11px 16px;font-size:1.08em;border:1.5px solid #b7c2d2;border-radius:7px;background:#fff;outline:none;transition:border 0.2s;" required>
            <div><b>Zile:</b><br>
              <div style='display:flex;flex-wrap:wrap;gap:8px 8px;margin-top:6px;margin-bottom:2px;max-width:340px;'>
                ${DAYS.map((d,idx) => `<button type='button' class='multiDayBtn${idx===0?' active':''}' data-day='${d}' style='padding:7px 16px;border-radius:6px;border:1.5px solid #b7c2d2;background:#f7fafd;color:#223046;font-weight:500;cursor:pointer;outline:none;min-width:90px;transition:background 0.15s,border 0.15s,color 0.15s;'>${d}</button>`).join('')}
              </div>
              <style>
                .multiDayBtn.active { background: #219150 !important; color: #fff !important; border: 2px solid #219150 !important; }
              </style>
            </div>
            <div><b>Angajați:</b><br>
              <div style='max-height:150px;overflow-y:auto;border:1.5px solid #b7c2d2;padding:8px 8px 4px 8px;border-radius:7px;background:#fafbfc;display:flex;flex-wrap:wrap;gap:8px;'>
                ${groupOrder.concat('Other').map(group => groups[group].length ? `<div style='min-width:120px;'><div style='font-size:0.97em;font-weight:600;color:#219150;margin-bottom:2px;'>${groupLabels[group]}</div>${groups[group].map(emp => `<label style='display:block;margin-bottom:4px;'><input type='checkbox' class='multiEmpCheck' value='${emp.id}'> ${emp.lastName} ${emp.firstName}</label>`).join('')}</div>` : '').join('')}
              </div>
            </div>
            <button type="submit" style="margin-top:8px;padding:12px 0;background:linear-gradient(90deg,#27ae60,#219150);color:#fff;border:none;border-radius:7px;font-weight:700;font-size:1.08em;box-shadow:0 1px 4px #0001;transition:background 0.2s;cursor:pointer;letter-spacing:0.5px;display:flex;align-items:center;justify-content:center;gap:8px;"><span style='font-size:1.2em;'>➕</span>Adaugă task</button>
          </form>
        </div>
      `;
      document.body.appendChild(modal);
      // Toggle zile
      const dayBtns = modal.querySelectorAll('.multiDayBtn');
      dayBtns.forEach(btn => btn.onclick = function(ev) {
        ev.preventDefault();
        btn.classList.toggle('active');
      });
      modal.querySelector('#closeMultiAssignModal').onclick = () => modal.remove();
      modal.querySelector('#multiAssignTaskForm').onsubmit = async function(ev) {
        ev.preventDefault();
        const text = modal.querySelector('#multiTaskText').value.trim();
        const days = Array.from(modal.querySelectorAll('.multiDayBtn.active')).map(cb => cb.dataset.day);
        const empIds = Array.from(modal.querySelectorAll('.multiEmpCheck:checked')).map(cb => cb.value);
        if (!text || days.length === 0) return;
        let monday = window.currentMonday || (function(){
          const d = new Date();
          const day = d.getDay();
          const diffToMonday = (day === 0 ? -6 : 1) - day;
          d.setDate(d.getDate() + diffToMonday);
          d.setHours(0,0,0,0);
          return d;
        })();
        const weekKey = window.getWeekKey(monday);
        let tasks = await window.getTasksForWeek(weekKey);
        for (const day of days) {
          tasks[day] = tasks[day] || [];
          // Filtrează empIds să includă DOAR angajații care au tură în ziua respectivă
          const shiftsSnap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
          const shifts = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const empIdsWithShift = new Set(shifts.filter(s => s.day === day).map(s => s.employeeId));
          const filteredEmpIds = empIds.filter(id => empIdsWithShift.has(id));
          tasks[day].push({ text, done: false, employeeIds: filteredEmpIds, color: '#FF9800' });
        }
        await db.collection('tasks').doc(weekKey).set({ tasks });
        if(window.refreshCalendarForWeek && typeof window.currentMonday !== 'undefined') {
          window.refreshCalendarForWeek(window.getWeekKey(window.currentMonday));
        }
        modal.remove();
        if(window.renderWeeklyTasksModal) window.renderWeeklyTasksModal();
      };
    }
  });
  window.getTasksForWeek = getTasksForWeek;
})();
