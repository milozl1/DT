// Etichetă săptămână minimalistă, identic cu toolbar.js/app.js
window.getUserWeekLabel = function(monday) {
  if (!(monday instanceof Date)) monday = new Date(monday);
  if (isNaN(monday.getTime())) return '';
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
};
