// Funcție robustă, unică, pentru normalizare la luni local
window.getMondayOf = function(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  let day = d.getDay();
  if(day === 1) return d;
  if(day === 0) { d.setDate(d.getDate() - 6); return d; }
  d.setDate(d.getDate() - (day - 1));
  return d;
};
// Returnează un obiect Date pentru luni dintr-un weekKey (YYYY-MM-DD)
window.getMondayFromWeekKey = function(weekKey) {
  if (!weekKey) return null;
  // Format weekKey: 'YYYY-MM-DD'
  const parts = weekKey.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  // Calculează luni din săptămâna respectivă (luni = 1, duminică = 0)
  const dayOfWeek = d.getDay();
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0,0,0,0);
  return d;
};
// utils.js
// Funcții utilitare pentru aplicația de gestionare a turelor

const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];
const PALETTE = ['#27ae60', '#4f8cff', '#f39c12', '#e74c3c', '#8e44ad', '#16a085', '#2c3e50', '#ff6f00']; // #ff6f00 portocaliu pentru Emblema

function generateDaysCheckboxes(name, idPrefix) {
  return DAYS.map((day, idx) => {
    let label = day;
    if (day === 'Marti') label = 'Marți';
    if (day === 'Sambata') label = 'Sâmbătă';
    if (day === 'Duminica') label = 'Duminică';
    return `<label><input type="checkbox" name="${name}" value="${day}" id="${idPrefix || name}_${idx}">${label}</label>`;
  }).join(' ');
}

function getColor(name) {
  // Angajații Emblema au culoare portocaliu distinct
  if (typeof name === 'string' && name.toLowerCase().includes('emblema')) return '#ff6f00';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getMondayOf(date) {
  // Forțează ca orice dată să fie luni, ora 00:00:00, fără sări peste săptămâni
  const d = new Date(date);
  d.setHours(0,0,0,0);
  let day = d.getDay();
  // Dacă deja e luni, nu schimba nimic
  if(day === 1) return d;
  // Dacă e duminică, mută la luni precedentă (nu la ziua următoare)
  if(day === 0) {
    d.setDate(d.getDate() - 6);
    return d;
  }
  // Orice altă zi, mută la luni din săptămâna curentă
  d.setDate(d.getDate() - (day - 1));
  return d;
}

function getWeekKey(monday) {
  // Asigură-te că monday este la ora 00:00:00 și este luni
  const d = new Date(monday);
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0,0,0,0);
  // Format YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function getEmployeeGroupsAndHours(shifts, employees) {
  const groups = { 'Parter': [], 'Etaj': [], 'Management': [], 'Externi': [] };
  const empIdMap = {};
  for (const emp of employees) {
    let group = '';
    if (emp.department === 'Women') group = 'Parter';
    else if (emp.department === 'Men' || emp.department === 'Kids') group = 'Etaj';
    else if (["Store Manager", "SM Deputy", "SVIM"].includes(emp.department)) group = 'Management';
    else if (emp.department === 'Emblema') group = 'Externi';
    if (group) groups[group].push(emp);
    empIdMap[emp.id] = emp;
  }
  const empHours = {};
  for (const shift of shifts) {
    if (!shift.employeeId || typeof shift.startHour !== 'number' || typeof shift.endHour !== 'number') continue;
    let totalMinutes = (shift.endHour * 60 + (shift.endMinute || 0)) - (shift.startHour * 60 + (shift.startMinute || 0));
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    let displayHours = totalMinutes / 60;
    let pauza = 0;
    if (displayHours >= 9) pauza = 1;
    else if (displayHours >= 6.5) pauza = 0.5;
    let efectiv = displayHours - pauza;
    if (efectiv % 1 !== 0) efectiv = Math.floor(efectiv) + 0.5;
    empHours[shift.employeeId] = (empHours[shift.employeeId] || 0) + efectiv;
  }
  return { groups, empIdMap, empHours };
}

// Adaug definirea HOURS
const HOURS = (function(){
  const arr = [];
  // Orele de la 6:00 la 22:30 inclusiv
  for (let h = 6; h <= 22; h++) {
    arr.push(h.toString().padStart(2, '0') + ':00');
    arr.push(h.toString().padStart(2, '0') + ':30');
  }
  // Adaugă 22:30 ca ultim slot
  // (deja adăugat mai sus, deci nu e nevoie de extra sloturi)
  return arr;
})();

function setCurrentMonday(date) {
  // Normalizează data la luni (prima zi a săptămânii)
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Ajustează pentru duminică
  window.currentMonday = new Date(date.setDate(diff));
}

// Expun funcțiile la window pentru acces global
window.generateDaysCheckboxes = generateDaysCheckboxes;
window.getColor = getColor;
window.getMondayOf = getMondayOf;
window.getWeekKey = getWeekKey;
window.getEmployeeGroupsAndHours = getEmployeeGroupsAndHours;
window.HOURS = HOURS;
window.setCurrentMonday = setCurrentMonday;
