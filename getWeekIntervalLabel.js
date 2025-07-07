// utils.js
// ...existing code...

function getWeekIntervalLabel(monday) {
  // Primesc un obiect Date care e luni
  const luni = new Date(monday);
  const duminica = new Date(monday);
  duminica.setDate(luni.getDate() + 6);
  // Format: 11-17 August 2025
  const months = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  const ziStart = luni.getDate();
  const ziEnd = duminica.getDate();
  const luna = months[duminica.getMonth()];
  const an = duminica.getFullYear();
  return `Săptămâna ${ziStart}-${ziEnd} ${luna} ${an}`;
}

window.getWeekIntervalLabel = getWeekIntervalLabel;
