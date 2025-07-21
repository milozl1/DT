// statistics.js
// Modul pentru statistici avansate: ore, procente, top suplimentare/deficit, zile lucrate, activități

// Funcția principală: renderStatisticsPanel(weekKey)
window.renderStatisticsPanel = async function(weekKey) {
  // DIAGNOSTIC: Verifică dacă datele globale sunt populate
  console.log('STATISTICS DIAGNOSTIC:');
  console.log('employees:', window.employees);
  console.log('weekShifts:', window.weekShifts);
  console.log('leavesForWeek:', window.leavesForWeek);
  const panel = document.getElementById('statisticsPanel');
  // Asigură existența variabilelor globale necesare
  const employees = window.employees || [];
  const weekShifts = window.weekShifts || [];
  const leavesForWeek = window.leavesForWeek || [];
  // Calculează statistici pentru fiecare angajat
  const empStats = {};
  for (const emp of employees) {
    let ore = 0;
    let zile = new Set();
    let activitati = {};
    let norma = emp.norma ? parseFloat(emp.norma) : 0;
    let leaveHours = 0;
    // Turele săptămânii pentru angajat
    const shifts = weekShifts.filter(s => s.employeeId === emp.id);
    for (const sh of shifts) {
      let totalMinutes = (sh.endHour * 60 + (sh.endMinute || 0)) - (sh.startHour * 60 + (sh.startMinute || 0));
      if (totalMinutes < 0) totalMinutes += 24 * 60;
      let displayHours = totalMinutes / 60;
      let pauza = 0;
      if (displayHours >= 9) pauza = 1;
      else if (displayHours >= 6.5) pauza = 0.5;
      let efectiv = displayHours - pauza;
      if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
      ore += efectiv;
      zile.add(sh.day);
      // Activitate
      if (sh.activity) {
        if (!activitati[sh.activity]) activitati[sh.activity] = 0;
        activitati[sh.activity] += efectiv;
      }
    }
    // Ore concediu
    const leaves = leavesForWeek.filter(lv => lv.employeeId === emp.id);
    let totalLeaveDays = 0;
    for (const lv of leaves) {
      if (Array.isArray(lv.days)) totalLeaveDays += lv.days.length;
    }
    let dailyNorm = (!isNaN(norma) && norma > 0) ? norma / 5 : 0;
    leaveHours = Math.round(totalLeaveDays * dailyNorm * 10) / 10;
    empStats[emp.id] = { ore, zile, activitati, norma, leaveHours };
  }
  const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];
  // Calculează orele și norma pe zi
  const orePeZi = {};
  const dayStats = {};
  for (const day of DAYS) {
    let ore = 0, norma = 0;
    for (const emp of employees) {
      // Dacă are tură în acea zi
      if (weekShifts && weekShifts.find(s => s.employeeId === emp.id && s.day === day)) {
        let s = weekShifts.filter(s => s.employeeId === emp.id && s.day === day);
        for (const sh of s) {
          let totalMinutes = (sh.endHour * 60 + (sh.endMinute || 0)) - (sh.startHour * 60 + (sh.startMinute || 0));
          if (totalMinutes < 0) totalMinutes += 24 * 60;
          let displayHours = totalMinutes / 60;
          let pauza = 0;
          if (displayHours >= 9) pauza = 1;
          else if (displayHours >= 6.5) pauza = 0.5;
          let efectiv = displayHours - pauza;
          if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
          ore += efectiv;
        }
        norma += emp.norma ? parseFloat(emp.norma)/7 : 0;
      }
    }
    orePeZi[day] = ore;
    dayStats[day] = { ore, norma };
  }
  // ...existing code...
      // --- Grafic Ore efectuate vs Norma ---
      const renderCharts = (employees, empStats) => {
        // Helper pentru înălțime dinamică
        const getChartHeight = (count) => window.innerWidth < 700 ? Math.max(count * 48, 320) : Math.max(count * 24, 300);

        // Ore efectuate vs. normă
        const ctx = document.getElementById('statsOreChart').getContext('2d');
        ctx.canvas.height = getChartHeight(employees.length);
        ctx.canvas.width = 600;
        // Group employees by department
        const groupedEmployees = {};
        employees.forEach(emp => {
          const department = emp.department || 'Unknown';
          if (!groupedEmployees[department]) groupedEmployees[department] = [];
          groupedEmployees[department].push(emp);
        });
        const labels = [];
        const oreData = [];
        const ramaseData = [];
        Object.keys(groupedEmployees).forEach(department => {
          groupedEmployees[department].forEach(emp => {
            labels.push(`${emp.lastName} ${emp.firstName}`);
            oreData.push(empStats[emp.id].ore);
            ramaseData.push(Math.max(empStats[emp.id].norma - empStats[emp.id].ore, 0));
          });
        });
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Ore efectuate', data: oreData, backgroundColor: '#4f8cff' },
              { label: 'Ore rămase', data: ramaseData, backgroundColor: '#ff7f50' }
            ]
          },
          options: {
            indexAxis: 'y', // Transposează graficul
            responsive: true,
            plugins: { legend: { position: 'top' } },
            scales: {
              x: { stacked: true, beginAtZero: true },
              y: {
                stacked: true,
                ticks: {
                  autoSkip: false,
                  font: { size: window.innerWidth < 700 ? 13 : 15 }
                }
              }
            }
          }
        });

        // Top suplimentare/deficit
        const suplimentariCtx = document.getElementById('statsSuplimentariChart').getContext('2d');
        suplimentariCtx.canvas.height = getChartHeight(suplimentari.length);
        suplimentariCtx.canvas.width = 600;
        new Chart(suplimentariCtx, {
          type: 'bar',
          data: {
            labels: suplimentari.map(e => `${e.lastName} ${e.firstName}`),
            datasets: [
              { label: 'Diferență (ore-normă)', data: suplimentari.map(e => e.diff), backgroundColor: suplimentari.map(e => e.diff >= 0 ? '#27ae60' : '#e74c3c') }
            ]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { position: 'top' } },
            scales: {
              x: { beginAtZero: true },
              y: {
                ticks: {
                  autoSkip: false,
                  font: { size: window.innerWidth < 700 ? 13 : 15 }
                }
              }
            }
          }
        });

        // Ore concediu pe angajat
        const leaveCtx = document.getElementById('statsLeaveChart').getContext('2d');
        leaveCtx.canvas.height = getChartHeight(employees.length);
        leaveCtx.canvas.width = 600;
        new Chart(leaveCtx, {
          type: 'bar',
          data: {
            labels: employees.map(e => `${e.lastName} ${e.firstName}`),
            datasets: [
              { label: 'Ore concediu', data: employees.map(e => empStats[e.id].leaveHours), backgroundColor: '#ed7d55' }
            ]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { position: 'top' } },
            scales: {
              x: { beginAtZero: true },
              y: {
                ticks: {
                  autoSkip: false,
                  font: { size: window.innerWidth < 700 ? 13 : 15 }
                }
              }
            }
          }
        });
      };
  const totalOreSaptamana = Object.values(orePeZi).reduce((sum, val) => sum + val, 0);
  for (const day of DAYS) {
    let procent = totalOreSaptamana ? Math.round(orePeZi[day] / totalOreSaptamana * 100) : 0;
    dayStats[day].cover = procent;
  }
  // Calculează totalul orelor lucrate în săptămâna selectată
  const totalWeekHours = Object.values(dayStats).reduce((sum, day) => sum + day.ore, 0);
  // Top suplimentare/deficit
  const suplimentari = employees.map(emp => {
    const ore = empStats[emp.id].ore;
    const norma = empStats[emp.id].norma;
    return { ...emp, ore, norma, diff: Math.round((ore-norma)*100)/100 };
  });
  suplimentari.sort((a,b) => b.diff - a.diff);
  // Zile lucrate/angajat (săptămână)
  const zileLucrate = employees.map(emp => ({
    ...emp,
    zile: empStats[emp.id].zile.size
  }));
  // Ore pe tip activitate (săptămână)
  const activitati = {};
  for (const emp of employees) {
    for (const act in empStats[emp.id].activitati) {
      if (!activitati[act]) activitati[act] = 0;
      activitati[act] += empStats[emp.id].activitati[act];
    }
  }
  
  // Statistici concedii
  const leaveStats = {
    totalEmployeesOnLeave: leavesForWeek.length,
    totalLeaveDays: leavesForWeek.reduce((total, leave) => total + leave.days.length, 0),
    leavesByDay: {}
  };
  
  // Calculează concediile pe zi
  DAYS.forEach(day => {
    leaveStats.leavesByDay[day] = leavesForWeek.reduce((count, leave) => {
      return count + (leave.days.includes(day) ? 1 : 0);
    }, 0);
  });

  // --- UI NOU: layout premium, modern, UX optimizat ---
  // Structură: header centrat, 2 grafice mari pe un rând, sub ele 3 carduri/tabele pe un rând, totul centrat și compact
  let html = `
    <div class="premium-stats" style="max-height:90vh;overflow-y:auto;position:relative;">
      <button id="closeStatsPanel" style="position:absolute;top:18px;right:24px;z-index:10;background:none;border:none;font-size:2.2em;color:#bbb;cursor:pointer;transition:color 0.18s;">&times;</button>
      <header class="stats-header">
        <h1>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><circle cx="12" cy="12" r="12" fill="#4f8cff"/><path d="M8 12l2.5 2.5L16 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Statistici săptămânale angajați
        </h1>
        <p class="stats-desc">Analiză vizuală și tabelară a orelor, normei și acoperirii pe săptămână.</p>
      </header>
      <div class="stats-row-flex" style="justify-content:center;gap:24px;flex-wrap:wrap;">
        <section class="stats-card" style="flex:1 1 320px;max-width:700px;min-width:0;width:100%;">
          <h2 class="stats-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><rect x="3" y="10" width="4" height="10" rx="2" fill="#4f8cff"/><rect x="10" y="6" width="4" height="14" rx="2" fill="#4f8cff"/><rect x="17" y="2" width="4" height="18" rx="2" fill="#4f8cff"/></svg>
            Ore efectuate vs. normă
          </h2>
          <div style="width:100%;overflow-x:auto;">
            <canvas id="statsOreChart" style="width:100% !important;max-width:100vw !important;min-width:0 !important;height:auto;display:block;"></canvas>
          </div>
        </section>
        <section class="stats-card" style="flex:1 1 320px;max-width:700px;min-width:0;width:100%;">
          <h2 class="stats-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><rect x="4" y="4" width="16" height="16" rx="8" fill="#ff7f50"/></svg>
            Top suplimentare/deficit
          </h2>
          <div style="width:100%;overflow-x:auto;">
            <canvas id="statsSuplimentariChart" style="width:100% !important;max-width:100vw !important;min-width:0 !important;height:auto;display:block;"></canvas>
          </div>
        </section>
      </div>
      <div class="stats-row-flex" style="justify-content:center;gap:24px;margin-top:24px;flex-wrap:wrap;">
        <section class="stats-card" style="flex:1 1 320px;max-width:700px;min-width:0;width:100%;">
          <h2 class="stats-title" style="color:#ff6b35;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><rect x="4" y="4" width="16" height="16" rx="8" fill="#ff6b35"/></svg>
            Ore concediu pe angajat
          </h2>
          <div style="width:100%;overflow-x:auto;">
            <canvas id="statsLeaveChart" style="width:100% !important;max-width:100vw !important;min-width:0 !important;height:auto;display:block;"></canvas>
          </div>
        </section>
      </div>
  <style>
    @media (max-width: 700px) {
      .premium-stats .stats-card {
        min-width: 0 !important;
        max-width: 100vw !important;
        width: 100% !important;
        padding: 0 !important;
      }
      .premium-stats canvas {
        width: 100% !important;
        max-width: 100vw !important;
        min-width: 0 !important;
        height: auto !important;
      }
    }
  </style>
      <div class="stats-row-flex" style="justify-content:center;flex-wrap:wrap;gap:24px;">
        <section class="stats-card" style="flex:1 1 1200px;max-width:1400px;min-width:320px;">
          <h2 class="stats-title" style="color:#27ae60;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="9" fill="#27ae60"/></svg>
            Detaliu tabelar
          </h2>
          <div class="stats-table-container" style="overflow-x:auto;width:100%;margin-bottom:18px;">
            <table class="stats-table" style="font-size:1em;min-width:480px;width:100%;max-width:100%;border-collapse:collapse;">
              <thead style="background:#e3f2fd;">
                <tr>
                  <th style="padding:7px 4px;min-width:90px;">Angajat</th>
                  <th style="padding:7px 4px;min-width:50px;">Ore</th>
                  <th style="padding:7px 4px;min-width:50px;">Normă</th>
                  <th style="padding:7px 4px;min-width:40px;">%</th>
                  <th style="padding:7px 4px;min-width:70px;">Ore concediu</th>
                </tr>
              </thead>
              <tbody>
                ${employees.map(emp => {
                  const ore = empStats[emp.id].ore;
                  const norma = empStats[emp.id].norma;
                  const pct = norma ? (100 * ore / norma).toFixed(2) : '0.00';
                  // Calculează orele de concediu pentru acest angajat
                  const leaves = leavesForWeek.filter(lv => lv.employeeId === emp.id);
                  let totalLeaveDays = 0;
                  for (const lv of leaves) {
                    if (Array.isArray(lv.days)) totalLeaveDays += lv.days.length;
                  }
                  let dailyNorm = (!isNaN(norma) && norma > 0) ? norma / 5 : 0;
                  let leaveHours = (totalLeaveDays * dailyNorm).toFixed(2);
                  return `<tr style="font-size:0.98em;">
                    <td style="padding:6px 4px;white-space:nowrap;">${emp.lastName} ${emp.firstName}</td>
                    <td style="padding:6px 4px;text-align:center;">${ore.toFixed(2)}</td>
                    <td style="padding:6px 4px;text-align:center;">${norma.toFixed(2)}</td>
                    <td style="padding:6px 4px;text-align:center;">${pct}%</td>
                    <td style="padding:6px 4px;text-align:center;">${leaveHours}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <!-- Top suplimentare/deficit -->
          <div class="stats-table-container" style="overflow-x:auto;width:100%;margin-bottom:18px;">
            <h3 style="font-size:1.08em;color:#ff7f50;margin:8px 0 4px 0;">Top suplimentare/deficit</h3>
            <table class="stats-table" style="font-size:0.98em;min-width:340px;width:100%;max-width:100%;border-collapse:collapse;">
              <thead style="background:#fff3e0;">
                <tr>
                  <th style="padding:6px 4px;min-width:90px;">Angajat</th>
                  <th style="padding:6px 4px;min-width:60px;">Diferență (ore-normă)</th>
                </tr>
              </thead>
              <tbody>
                ${suplimentari.map(e => `<tr><td style='padding:5px 4px;'>${e.lastName} ${e.firstName}</td><td style='padding:5px 4px;text-align:center;color:${e.diff>=0?'#27ae60':'#e74c3c'};'>${e.diff.toFixed(2)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <!-- Zile lucrate/angajat -->
          <div class="stats-table-container" style="overflow-x:auto;width:100%;margin-bottom:18px;">
            <h3 style="font-size:1.08em;color:#1976d2;margin:8px 0 4px 0;">Zile lucrate/angajat</h3>
            <table class="stats-table" style="font-size:0.98em;min-width:340px;width:100%;max-width:100%;border-collapse:collapse;">
              <thead style="background:#e3f2fd;">
                <tr>
                  <th style="padding:6px 4px;min-width:90px;">Angajat</th>
                  <th style="padding:6px 4px;min-width:60px;">Zile lucrate</th>
                </tr>
              </thead>
              <tbody>
                ${zileLucrate.map(e => `<tr><td style='padding:5px 4px;'>${e.lastName} ${e.firstName}</td><td style='padding:5px 4px;text-align:center;'>${e.zile}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <!-- Ore pe tip activitate -->
          <div class="stats-table-container" style="overflow-x:auto;width:100%;margin-bottom:18px;">
            <h3 style="font-size:1.08em;color:#388e3c;margin:8px 0 4px 0;">Ore pe tip activitate (total săptămână)</h3>
            <table class="stats-table" style="font-size:0.98em;min-width:340px;width:100%;max-width:100%;border-collapse:collapse;">
              <thead style="background:#e8f5e9;">
                <tr>
                  <th style="padding:6px 4px;min-width:90px;">Activitate</th>
                  <th style="padding:6px 4px;min-width:60px;">Ore</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(activitati).map(([act, ore]) => `<tr><td style='padding:5px 4px;'>${act}</td><td style='padding:5px 4px;text-align:center;'>${ore.toFixed(2)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <!-- Acoperire pe zi -->
          <div class="stats-table-container" style="overflow-x:auto;width:100%;margin-bottom:18px;">
            <h3 style="font-size:1.08em;color:#0097A7;margin:8px 0 4px 0;">Acoperire pe zi</h3>
            <table class="stats-table" style="font-size:0.98em;min-width:340px;width:100%;max-width:100%;border-collapse:collapse;">
              <thead style="background:#e1f5fe;">
                <tr>
                  <th style="padding:6px 4px;min-width:90px;">Zi</th>
                  <th style="padding:6px 4px;min-width:60px;">Ore</th>
                  <th style="padding:6px 4px;min-width:60px;">Normă</th>
                  <th style="padding:6px 4px;min-width:40px;">%</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(dayStats).map(([zi, d]) => `<tr><td style='padding:5px 4px;'>${zi}</td><td style='padding:5px 4px;text-align:center;'>${d.ore.toFixed(2)}</td><td style='padding:5px 4px;text-align:center;'>${d.norma.toFixed(2)}</td><td style='padding:5px 4px;text-align:center;'>${d.cover.toFixed(2)}%</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <!-- Concedii pe zi -->
          <div class="stats-table-container" style="overflow-x:auto;width:100%;margin-bottom:18px;">
            <h3 style="font-size:1.08em;color:#ed7d55;margin:8px 0 4px 0;">Concedii pe zi</h3>
            <table class="stats-table" style="font-size:0.98em;min-width:340px;width:100%;max-width:100%;border-collapse:collapse;">
              <thead style="background:#fff8e1;">
                <tr>
                  <th style="padding:6px 4px;min-width:90px;">Zi</th>
                  <th style="padding:6px 4px;min-width:60px;">Nr. angajați în concediu</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(leaveStats.leavesByDay).map(([zi, nr]) => `<tr><td style='padding:5px 4px;'>${zi}</td><td style='padding:5px 4px;text-align:center;'>${nr}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <style>
        @media (max-width: 700px) {
          .stats-table-container { overflow-x: auto !important; }
          .stats-table { font-size: 0.92em !important; min-width: 420px !important; }
          .stats-table th, .stats-table td { padding: 5px 2px !important; }
        }
        @media (max-width: 500px) {
          .stats-table { font-size: 0.85em !important; min-width: 340px !important; }
          .stats-table th, .stats-table td { padding: 4px 1px !important; }
        }
      </style>
    </div>
  </div>`;
  // Adaugă handler pentru închidere panel la click pe X
  setTimeout(() => {
    const closeBtn = document.getElementById('closeStatsPanel');
    if (closeBtn) {
      closeBtn.onclick = function() {
        const panel = document.getElementById('statisticsPanel');
        if (panel) panel.style.display = 'none';
        const cal = document.getElementById('calendar');
        if (cal) cal.style.display = 'block';
      };
    }
  }, 0);

  panel.innerHTML = html;

  // --- EXPUNERE DATE PENTRU MODAL UTILIZATOR ---
  window.statisticsPanelData = {
    empStats,
    leavesForWeek
  };

  // --- GRAFICE ---
  if(window.Chart) {
    // --- Grafic Ore efectuate vs Norma ---
    const renderCharts = (employees, empStats) => {
      // Înălțime dinamică pentru mobil: mai mare dacă sunt mulți angajați
      let chartHeight = 300;
      if (window.innerWidth < 700) {
        chartHeight = Math.max(employees.length * 48, 320); // 48px per angajat, minim 320px
      } else {
        chartHeight = Math.max(employees.length * 24, 300);
      }
      const ctx = document.getElementById('statsOreChart').getContext('2d');
      ctx.canvas.height = chartHeight;
      ctx.canvas.width = 600;

      // Group employees by department
      const groupedEmployees = {};
      employees.forEach(emp => {
        const department = emp.department || 'Unknown';
        if (!groupedEmployees[department]) groupedEmployees[department] = [];
        groupedEmployees[department].push(emp);
      });

      const labels = [];
      const oreData = [];
      const ramaseData = [];

      Object.keys(groupedEmployees).forEach(department => {
        groupedEmployees[department].forEach(emp => {
          labels.push(`${emp.lastName} ${emp.firstName}`);
          oreData.push(empStats[emp.id].ore);
          ramaseData.push(Math.max(empStats[emp.id].norma - empStats[emp.id].ore, 0));
        });
      });

      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Ore efectuate', data: oreData, backgroundColor: '#4f8cff' },
            { label: 'Ore rămase', data: ramaseData, backgroundColor: '#ff7f50' }
          ]
        },
        options: {
          indexAxis: 'y', // Transposează graficul
          responsive: true,
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { stacked: true, beginAtZero: true },
            y: {
              stacked: true,
              ticks: {
                autoSkip: false,
                font: { size: window.innerWidth < 700 ? 13 : 15 }
              }
            }
          }
        }
      });
    };

    const renderSuplimentariChart = (suplimentari) => {
      const canvas = document.getElementById('statsSuplimentariChart');
      if (!canvas) {
        console.warn('Canvas element for statsSuplimentariChart is missing. Ensure it is present in the HTML.');
        return;
      }
      const ctx = canvas.getContext('2d');
      // Folosește employees.length pentru înălțime, ca la graficul principal
      const isMobile = window.innerWidth < 700;
      const employees = window.employees || [];
      ctx.canvas.height = Math.max(employees.length * (isMobile ? 48 : 32), 320);
      ctx.canvas.width = 600;

      const labels = suplimentari.map(e => `${e.lastName} ${e.firstName}`);
      const data = suplimentari.map(e => e.diff);
      const backgroundColors = data.map(value => value >= 0 ? '#27ae60' : '#e74c3c');

      ctx.canvas.style.maxWidth = '100%';
      ctx.canvas.style.minWidth = '320px';
      ctx.canvas.style.display = 'block';
      ctx.canvas.style.boxSizing = 'border-box';

      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Diferență (ore - normă)',
              data,
              backgroundColor: backgroundColors,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value = context.raw;
                  return `${context.label}: ${value} ore`;
                },
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: {
                drawBorder: true,
                color: (context) => context.tick.value === 0 ? '#000' : '#ccc',
                lineWidth: (context) => context.tick.value === 0 ? 2 : 1,
              },
            },
            y: {
              grid: {
                drawBorder: false,
              },
            },
          },
        },
      });
    };

    // Asigură că employees este trecut la renderCharts și renderSuplimentariChart
    // --- Grafic Ore concediu pe angajat ---
    const renderLeaveChart = (employees, leavesForWeek) => {
      const canvas = document.getElementById('statsLeaveChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      // Calculează orele de concediu pentru fiecare angajat
      const leaveHours = employees.map(emp => {
        // Caută concediile pentru acest angajat
        const leaves = leavesForWeek.filter(lv => lv.employeeId === emp.id);
        let totalLeaveDays = 0;
        for (const lv of leaves) {
          if (Array.isArray(lv.days)) totalLeaveDays += lv.days.length;
        }
        // Norma zilnică
        let norma = parseFloat(emp.norma);
        let dailyNorm = (!isNaN(norma) && norma > 0) ? norma / 5 : 0;
        let leaveHours = Math.round(totalLeaveDays * dailyNorm * 10) / 10;
        return leaveHours;
      });
      const labels = employees.map(emp => `${emp.lastName} ${emp.firstName}`);
      // Folosește aceeași logică de înălțime și stil ca la celelalte grafice
      const isMobile = window.innerWidth < 700;
      ctx.canvas.height = Math.max(employees.length * (isMobile ? 48 : 32), 320);
      ctx.canvas.width = 600;
      ctx.canvas.style.maxWidth = '100%';
      ctx.canvas.style.minWidth = '320px';
      ctx.canvas.style.display = 'block';
      ctx.canvas.style.boxSizing = 'border-box';
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Ore concediu',
              data: leaveHours,
              backgroundColor: '#ff6b35',
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `${context.label}: ${context.raw} ore concediu`,
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: {
                drawBorder: true,
                color: (context) => context.tick.value === 0 ? '#000' : '#ccc',
                lineWidth: (context) => context.tick.value === 0 ? 2 : 1,
              },
            },
            y: {
              grid: {
                drawBorder: false,
              },
            },
          },
        },
      });
    };
    renderCharts(employees, empStats);
    renderSuplimentariChart(suplimentari);
    renderLeaveChart(employees, leavesForWeek);
  }

  // Verificare angajați fără ture
  const angajatiFaraTure = employees.filter(emp => !weekShifts.some(shift => shift.employeeId === emp.id));
  if (angajatiFaraTure.length > 0) {
    console.warn('Angajati fara ture:', angajatiFaraTure.map(emp => `${emp.firstName} ${emp.lastName}`));
  }
};
// Integrare automată: asigură existența div-ului pentru statistici
window.addEventListener('DOMContentLoaded', function() {
  // Asigură existența div-ului pentru statistici
  if (!document.getElementById('statisticsPanel')) {
    let panel = document.createElement('div');
    panel.id = 'statisticsPanel';
    panel.style.display = 'none';
    document.body.appendChild(panel);
  }
  // Handler pe butonul de statistici din toolbar (id="statsBtn")
  setTimeout(function() {
    const statBtn = document.getElementById('statsBtn');
    if (statBtn) {
      statBtn.addEventListener('click', function(e) {
        e.preventDefault();
        let panel = document.getElementById('statisticsPanel');
        if (!panel) return;
        // Mută panel-ul în .main dacă există, pentru layout corect
        let main = document.querySelector('.main');
        if (main && panel.parentNode !== main) main.appendChild(panel);
        // Elimină toate stilurile inline de container/modal
        panel.removeAttribute('style');
        panel.style.display = 'block';
        let cal = document.getElementById('calendar');
        if (cal) cal.style.display = 'none';
        // Folosește o variabilă separată pentru săptămâna statisticilor
        if (!window.statisticsCurrentMonday) {
          let today = new Date();
          let monday = window.getMondayOf ? window.getMondayOf(today) : today;
          window.statisticsCurrentMonday = new Date(monday);
        }
        let weekKey = window.getWeekKey ? window.getWeekKey(window.statisticsCurrentMonday) : window.statisticsCurrentMonday.toISOString().slice(0,10);
        if(window.getWeekIntervalLabel) {
          var weekIntervalLabel = document.getElementById('weekInterval');
          if(weekIntervalLabel) weekIntervalLabel.textContent = window.getWeekIntervalLabel(window.statisticsCurrentMonday);
        }
        window.renderStatisticsPanel(weekKey);

        // Adaugă handler pentru săgeți doar când statistica e vizibilă
        const prevBtn = document.getElementById('prevWeekBtn');
        const nextBtn = document.getElementById('nextWeekBtn');
        if (prevBtn && nextBtn) {
          prevBtn.onclick = null;
          nextBtn.onclick = null;
          prevBtn.onclick = function() {
            window.statisticsCurrentMonday.setDate(window.statisticsCurrentMonday.getDate() - 7);
            let weekKey = window.getWeekKey(window.statisticsCurrentMonday);
            window.renderStatisticsPanel(weekKey);
            if(window.getWeekIntervalLabel) {
              var weekIntervalLabel = document.getElementById('weekInterval');
              if(weekIntervalLabel) weekIntervalLabel.textContent = window.getWeekIntervalLabel(window.statisticsCurrentMonday);
            }
          };
          nextBtn.onclick = function() {
            window.statisticsCurrentMonday.setDate(window.statisticsCurrentMonday.getDate() + 7);
            let weekKey = window.getWeekKey(window.statisticsCurrentMonday);
            window.renderStatisticsPanel(weekKey);
            if(window.getWeekIntervalLabel) {
              var weekIntervalLabel = document.getElementById('weekInterval');
              if(weekIntervalLabel) weekIntervalLabel.textContent = window.getWeekIntervalLabel(window.statisticsCurrentMonday);
            }
          };
        }
      });
    }
    // Handler pe butonul Orar din toolbar (calendarBtn)
    const calendarBtn = document.getElementById('calendarBtn');
    if (calendarBtn) {
      calendarBtn.addEventListener('click', function(e) {
        e.preventDefault();
        let panel = document.getElementById('statisticsPanel');
        if (panel) panel.style.display = 'none';
        let cal = document.getElementById('calendar');
        if (cal) cal.style.display = 'block';
      });
    }
  }, 0);
});

// Recomandare: adaugă și stiluri CSS pentru .stats-section, .stats-table etc. pentru un aspect premium/minimalist.
