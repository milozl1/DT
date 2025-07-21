// leave.js
// Utilitar pentru gestionarea concediilor angajaților
// Format: { employeeId, weekKey: 'YYYY-MM-DD', days: ['Luni', ...] }
window.LeaveManager = {
  leaves: [], // local cache
  async fetchLeaves(db) {
    const snap = await db.collection('leaves').get();
    this.leaves = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return this.leaves;
  },
  isOnLeave(employeeId, date, dayName) {
    // date: Date sau string 'YYYY-MM-DD', dayName: 'Luni', ...
    if (!employeeId || !date || !dayName) return false;
    const ymd = typeof date === 'string' ? date : date.toISOString().slice(0,10);
    return this.leaves.some(l => l.employeeId === employeeId && l.weekKey === ymd && Array.isArray(l.days) && l.days.includes(dayName));
  },
  async addLeave(db, employeeId, weekKey, days) {
    if (!employeeId || !weekKey || !days || !days.length) return;
    // Caută dacă există deja concediu pentru acest angajat și săptămână
    await this.fetchLeaves(db);
    const existing = this.leaves.find(l => l.employeeId === employeeId && l.weekKey === weekKey);
    if (existing) {
      // Adaugă doar zilele care nu există deja
      const newDays = Array.from(new Set([...(existing.days || []), ...days]));
      await db.collection('leaves').doc(existing.id).update({ days: newDays });
    } else {
      await db.collection('leaves').add({ employeeId, weekKey, days });
    }
    await this.fetchLeaves(db);
  },
  async removeLeaveDay(employeeId, weekKey, day) {
    if (!employeeId || !weekKey || !day) return;
    const db = window.db;
    // Găsește documentul de concediu
    const leaveDoc = this.leaves.find(l => l.employeeId === employeeId && l.weekKey === weekKey);
    if (!leaveDoc) return;
    const newDays = (leaveDoc.days || []).filter(d => d !== day);
    if (newDays.length === 0) {
      // Șterge complet documentul
      await db.collection('leaves').doc(leaveDoc.id).delete();
    } else {
      // Actualizează doar zilele
      await db.collection('leaves').doc(leaveDoc.id).update({ days: newDays });
    }
    await this.fetchLeaves(db);
  }
};
