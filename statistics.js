// statistics.js
// Modul pentru statistici avansate: ore, procente, top suplimentare/deficit, zile lucrate, activități

// Funcția principală: renderStatisticsPanel(weekKey)
window.renderStatisticsPanel = async function(weekKey) {
  // Sincronizează statisticsCurrentMonday cu weekKey primit (mereu luni corectă)
  if (weekKey) {
    if (window.getMondayOf) {
      window.statisticsCurrentMonday = window.getMondayOf(new Date(weekKey));
    } else {
      let d = new Date(weekKey);
      if (!isNaN(d)) window.statisticsCurrentMonday = d;
    }
  }
  const panel = document.getElementById('statisticsPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">Se încarcă statistici...</div>';
  // Preia toate turele pentru săptămâna selectată
  const weekShiftsSnap = await db.collection('shifts').where('weekKey', '==', weekKey).get();
  const weekShifts = [];
  weekShiftsSnap.forEach(doc => weekShifts.push({ ...doc.data(), id: doc.id }));
  // Preia toți angajații
  const empSnap = await db.collection('employees').get();
  const employees = [];
  const empIdMap = {};
  empSnap.forEach(doc => { employees.push({ ...doc.data(), id: doc.id }); empIdMap[doc.id] = { ...doc.data(), id: doc.id }; });
  // Grupare după grup
  const groups = { 'Parter': [], 'Etaj': [], 'Management': [] };
  employees.forEach(emp => {
    if (emp.department === 'Women') groups.Parter.push(emp);
    else if (emp.department === 'Men' || emp.department === 'Kids') groups.Etaj.push(emp);
    else if (["Store Manager", "SM Deputy", "SVIM"].includes(emp.department)) groups.Management.push(emp);
  });
  // Ore efectuate, zile lucrate, ore pe tip activitate
  const empStats = {};
  // Filtrare ture și angajați pentru săptămâna selectată
  const filteredShifts = weekShifts.filter(shift => shift.weekKey === weekKey);

  // Resetare empStats pentru a include doar datele din săptămâna selectată
  for (const emp of employees) {
    empStats[emp.id] = { ore: 0, zile: new Set(), activitati: {}, norma: parseFloat(emp.norma) || 0 };
  }

  for (const shift of filteredShifts) {
    if (!shift.employeeId) continue;
    // Ore efectuate
    let totalMinutes = (shift.endHour * 60 + (shift.endMinute || 0)) - (shift.startHour * 60 + (shift.startMinute || 0));
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    let displayHours = totalMinutes / 60;
    let pauza = 0;
    if (displayHours >= 9) pauza = 1;
    else if (displayHours >= 6.5) pauza = 0.5;
    let efectiv = displayHours - pauza;
    if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
    empStats[shift.employeeId].ore += efectiv;
    empStats[shift.employeeId].zile.add(shift.day);
    // Ore pe tip activitate
    let act = shift.activityType || 'Standard';
    if (!empStats[shift.employeeId].activitati[act]) empStats[shift.employeeId].activitati[act] = 0;
    empStats[shift.employeeId].activitati[act] += efectiv;
  }
  // Ore pe grup și total
  const groupStats = { 'Parter': 0, 'Etaj': 0, 'Management': 0 };
  const groupNorma = { 'Parter': 0, 'Etaj': 0, 'Management': 0 }; // Initialize globally with default values
  for (const group of ['Parter', 'Etaj', 'Management']) {
    for (const emp of groups[group]) {
      groupStats[group] += empStats[emp.id].ore;
      groupNorma[group] += empStats[emp.id].norma;
    }
  }
  const totalOre = groupStats.Parter + groupStats.Etaj + groupStats.Management;
  const totalNorma = (groupNorma?.Parter || 0) + (groupNorma?.Etaj || 0) + (groupNorma?.Management || 0);
  const totalNormaAngajati = totalNorma;
  const totalOreLucrate = totalOre;
  const totalOreLipsa = totalNormaAngajati - totalOreLucrate;
  const procentOreLucrate = totalNormaAngajati ? Math.round((totalOreLucrate / totalNormaAngajati) * 100) : 0;
  // Procente acoperire pe săptămână și pe grup
  const groupCover = {
    'Parter': groupNorma.Parter ? Math.round(100 * groupStats.Parter / groupNorma.Parter) : 0,
    'Etaj': groupNorma.Etaj ? Math.round(100 * groupStats.Etaj / groupNorma.Etaj) : 0,
    'Management': groupNorma.Management ? Math.round(100 * groupStats.Management / groupNorma.Management) : 0,
    'Total': totalNorma ? Math.round(100 * totalOre / totalNorma) : 0
  };
  // Procente acoperire pe zi
  const days = ['Luni','Marti','Miercuri','Joi','Vineri','Sambata','Duminica'];
  const dayStats = {};
  for (const day of days) {
    let ore = 0, norma = 0;
    for (const emp of employees) {
      // Dacă are tură în acea zi
      if (weekShifts.find(s => s.employeeId === emp.id && s.day === day)) {
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
    dayStats[day] = { ore, norma, cover: norma ? Math.round(100*ore/norma) : 0 };
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
      <div class="stats-row-flex" style="justify-content:center;gap:48px;">
        <section class="stats-card" style="flex:1 1 600px;max-width:700px;min-width:420px;">
          <h2 class="stats-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><rect x="3" y="10" width="4" height="10" rx="2" fill="#4f8cff"/><rect x="10" y="6" width="4" height="14" rx="2" fill="#4f8cff"/><rect x="17" y="2" width="4" height="18" rx="2" fill="#4f8cff"/></svg>
            Ore efectuate vs. normă
          </h2>
          <canvas id="statsOreChart" width="1200" height="520" style="max-width:100%;min-width:320px;"></canvas>
        </section>
        <section class="stats-card" style="flex:1 1 600px;max-width:700px;min-width:420px;">
          <h2 class="stats-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><rect x="4" y="4" width="16" height="16" rx="8" fill="#ff7f50"/></svg>
            Top suplimentare/deficit
          </h2>
          <canvas id="statsSuplimentariChart" width="1200" height="520" style="max-width:100%;min-width:320px;"></canvas>
        </section>
      </div>
      <div class="stats-row-flex" style="justify-content:center;gap:32px;">
        <section class="stats-card" style="flex:1 1 420px;max-width:520px;min-width:320px;">
          <h2 class="stats-title" style="color:#27ae60;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="9" fill="#27ae60"/></svg>
            Detaliu tabelar
          </h2>
          <div class="stats-table-container">
            <table class="stats-table" style="font-size:1.15em;min-width:320px;max-width:100%;">
              <thead><tr><th>Angajat</th><th>Ore</th><th>Normă</th><th>%</th></tr></thead><tbody>
                ${employees.map(emp => {
                  const ore = empStats[emp.id].ore;
                  const norma = empStats[emp.id].norma;
                  const pct = norma ? Math.round(100 * ore / norma) : 0;
                  return `<tr><td>${emp.lastName} ${emp.firstName}</td><td>${ore}</td><td>${norma}</td><td>${pct}%</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>
        <section class="stats-card" style="flex:1 1 320px;max-width:400px;min-width:220px;">
          <h2 class="stats-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><rect x="3" y="3" width="18" height="18" rx="4" fill="#223046"/></svg>
            Procente pe zi
          </h2>
          <div class="stats-table-container">
            <table class="stats-table" style="font-size:1.08em;min-width:220px;max-width:100%;">
              <thead><tr><th>Zi</th><th>Ore</th><th>% din total săptămână</th></tr></thead><tbody>
                ${days.map(day => {
                  const percentageOfWeek = totalWeekHours ? (100 * dayStats[day].ore / totalWeekHours).toFixed(1) : '0.0';
                  return `<tr><td>${day}</td><td>${dayStats[day].ore}</td><td>${percentageOfWeek}%</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>
        <section class="stats-card" style="flex:1 1 320px;max-width:400px;min-width:220px;">
          <h2 class="stats-title" style="color:#8e44ad;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="9" fill="#8e44ad"/></svg>
            Rezumat totaluri
          </h2>
          <div class="stats-table-container">
            <table class="stats-table" style="font-size:1.08em;min-width:220px;max-width:100%;">
              <thead><tr><th>Detaliu</th><th>Valoare</th></tr></thead><tbody>
                <tr><td>Total ore angajați (normă)</td><td>${totalNormaAngajati.toFixed(1)}</td></tr>
                <tr><td>Ore lucrate</td><td>${totalOreLucrate.toFixed(1)}</td></tr>
                <tr><td>Ore lipsă din normă</td><td>${totalOreLipsa.toFixed(1)}</td></tr>
                <tr><td>Procent ore lucrate / total normă</td><td>${procentOreLucrate}%</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
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

  // --- GRAFICE ---
  if(window.Chart) {
    const renderCharts = (employees, empStats) => {
      const chartHeight = Math.max(employees.length * 24, 300); // crește înălțimea minimă
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
            y: { stacked: true }
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
      ctx.canvas.height = Math.max(suplimentari.length * 24, 300); // crește înălțimea minimă
      ctx.canvas.width = 600;

      const labels = suplimentari.map(e => `${e.lastName} ${e.firstName}`);
      const data = suplimentari.map(e => e.diff);
      const backgroundColors = data.map(value => value >= 0 ? '#27ae60' : '#e74c3c');

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
    renderCharts(employees, empStats);
    renderSuplimentariChart(suplimentari);
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
