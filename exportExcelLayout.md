# Layout export Excel dorit

- Coloane: Norma | Departament | Nume Prenume Angajat | [pentru fiecare zi: ora inceput tura | ora sfarsit tura | ore lucrate] | total ore lucrate
- Sub tabel: total ore lucrate pe zi, procente acoperire pe zi

Exemplu header:
| Norma | Departament | Nume Prenume Angajat | Luni (Data) | ... | Duminica (Data) | Total ore lucrate |
|-------|-------------|----------------------|-------------|-----|-----------------|-------------------|
| 40    | Parter      | Popescu Ion          | 08:00-16:00 | ... |                 | 40                |

Sub tabel:
| Procent acoperire pe zi | 100% | ... | 90% |
| Total ore lucrate pe zi | 40   | ... | 36  |

# Observații
- Pentru fiecare angajat, pe fiecare zi: dacă nu are tură, celula e goală.
- Orele lucrate se calculează cu pauză (ca în statistici).
- Procent acoperire pe zi = total ore lucrate pe zi / total normă angajați prezenți în acea zi.
- Total ore lucrate pe zi = suma orelor lucrate de toți angajații în acea zi.

# Pași implementare
1. Preia lista angajați și toate turele pentru weekKey.
2. Construiește headerul cu zilele săptămânii și data (Luni, 2025-06-23 etc).
3. Pentru fiecare angajat, pentru fiecare zi:
   - Dacă are tură, completează ora început, ora sfârșit, ore lucrate.
   - Dacă nu, lasă gol.
4. Calculează total ore lucrate per angajat (suma pe rând).
5. Calculează total ore lucrate pe zi (suma pe coloană).
6. Calculează procent acoperire pe zi (total ore lucrate pe zi / suma normelor angajaților prezenți în acea zi).
7. Adaugă rândurile de totaluri și procente sub tabel.

# Următorul pas
Voi implementa această logică în funcția exportWeekToExcel din toolbar.js.
