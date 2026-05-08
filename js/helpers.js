// ============================================================
// JERSEY SVG
// ============================================================
const JRS = {
  "UAE Team Emirates":             { c1:"#FFFFFF", c2:"#E8001D", c3:"#000000" },
  "UAE Emirates":                  { c1:"#FFFFFF", c2:"#E8001D", c3:"#000000" },
  "Team Visma | Lease a Bike":     { c1:"#FFE000", c2:"#000000", c3:"#009BDE" },
  "Visma Lease-a-Bike":            { c1:"#FFE000", c2:"#000000", c3:"#009BDE" },
  "Soudal Quick-Step":             { c1:"#0070C0", c2:"#FFFFFF", c3:"#009246" },
  "BORA - hansgrohe":              { c1:"#CC0000", c2:"#1B1B1B", c3:"#FFFFFF" },
  "Red Bull Bora":                 { c1:"#CC0000", c2:"#1B1B1B", c3:"#FFFFFF" },
  "Alpecin - Deceuninck":          { c1:"#1E3A8A", c2:"#F97316", c3:"#FFFFFF" },
  "Alpecin Deceuninck":            { c1:"#1E3A8A", c2:"#F97316", c3:"#FFFFFF" },
  "Lidl - Trek":                   { c1:"#E8001D", c2:"#FFFFFF", c3:"#003DA5" },
  "Lidl-Trek":                     { c1:"#E8001D", c2:"#FFFFFF", c3:"#003DA5" },
  "INEOS Grenadiers":              { c1:"#004085", c2:"#FFFFFF", c3:"#E8001D" },
  "Groupama-FDJ":                  { c1:"#003DA5", c2:"#FFFFFF", c3:"#E8001D" },
  "EF Education - EasyPost":       { c1:"#FF69B4", c2:"#FFFFFF", c3:"#808080" },
  "Decathlon AG2R La Mondiale Team":{ c1:"#003DA5", c2:"#FFFFFF", c3:"#009246" },
  "Tudor Pro Cycling Team":        { c1:"#B8860B", c2:"#FFFFFF", c3:"#1A1A1A" },
  "Movistar Team":                 { c1:"#00D2FF", c2:"#003DA5", c3:"#FFFFFF" },
  "Q36.5":                         { c1:"#2C2C2C", c2:"#E8001D", c3:"#FFFFFF" },
  "Cofidis":                       { c1:"#E8001D", c2:"#003DA5", c3:"#FFFFFF" },
  "Bahrain - Victorious":          { c1:"#CC0000", c2:"#FFFFFF", c3:"#003DA5" },
  "Intermarché - Wanty":           { c1:"#E8001D", c2:"#FFFFFF", c3:"#1A1A1A" },
  "Arkéa - B&B Hotels":            { c1:"#FF8C00", c2:"#003DA5", c3:"#FFFFFF" },
  "Team dsm-firmenich PostNL":     { c1:"#FF6B00", c2:"#FFFFFF", c3:"#003DA5" },
  "Israel - Premier Tech":         { c1:"#003DA5", c2:"#E8001D", c3:"#FFFFFF" },
  "Astana Qazaqstan Team":         { c1:"#00BFFF", c2:"#003DA5", c3:"#FFD700" },
};

export function jersey(ploeg, size = 20) {
  const j = JRS[ploeg] || { c1:"#999", c2:"#ccc", c3:"#fff" };
  const h = Math.round(size * 1.15);
  return `<svg width="${size}" height="${h}" viewBox="0 0 26 30" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;display:block">
    <path d="M9,0 L4,5 L0,4 L0,14 L5,14 L5,30 L21,30 L21,14 L26,14 L26,4 L22,5 L17,0 Z" fill="${j.c1}"/>
    <path d="M9,0 L4,5 L0,4 L0,10 L5,10 L5,30 L10,30 L10,14 L10,0 Z" fill="${j.c2}" opacity="0.45"/>
    <path d="M10,0 L17,0 L17,14 L10,14 Z" fill="${j.c3}" opacity="0.55"/>
    <path d="M9,0 L17,0 Q13,4 9,0 Z" fill="${j.c2}"/>
  </svg>`;
}

// ============================================================
// PUNTEN ENGINE
// ============================================================
const RIT_PTS = {1:100,2:85,3:70,4:60,5:50,6:45,7:40,8:35,9:30,10:25,11:20,12:18,13:16,14:14,15:12};

export function ritPts(pos) {
  if (!pos && pos !== 0) return 0;
  const s = String(pos).trim().toUpperCase();
  if (s === 'DNF' || s === 'DNS' || s === '') return 0;
  const n = parseInt(s);
  if (isNaN(n)) return 0;
  if (RIT_PTS[n]) return RIT_PTS[n];
  if (n <= 20) return 10; if (n <= 25) return 8; if (n <= 50) return 6;
  if (n <= 75) return 4;  if (n <= 100) return 3;
  return 1;
}

export function dagPts(pos) {
  if (!pos && pos !== 0) return 0;
  const n = parseInt(pos);
  return { 1:15, 2:10, 3:5 }[n] || 0;
}

// Naam normaliseren voor fuzzy matching (accenten + hoofdletters)
export function normNaam(n) {
  return (n || '').replace(/\u00a0/g, ' ').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Bereken totaalpunten voor een gebruiker over alle uitslagen
// rijen: array van uitslag_rijen uit DB
// rennerNamen: array van namen in de ploeg
export function calcUserPtsFromRijen(rijen, rennerNamen) {
  // Groepeer per uitslag_id
  const byUitslag = {};
  rijen.forEach(r => {
    if (!byUitslag[r.uitslag_id]) byUitslag[r.uitslag_id] = { type: r.type || 'rit', rijen: [] };
    byUitslag[r.uitslag_id].rijen.push(r);
  });

  const normedNamen = rennerNamen.map(normNaam);
  let total = 0;

  Object.values(byUitslag).forEach(({ type, rijen: uRijen }) => {
    const ptsPerRenner = normedNamen.map(naam => {
      const row = uRijen.find(r => normNaam(r.renner_naam) === naam);
      return row ? (row.totaal || 0) : 0;
    });
    if (type === 'rit') {
      // Top-10 per rit
      total += ptsPerRenner.slice().sort((a,b) => b-a).slice(0,10).reduce((s,v) => s+v, 0);
    } else {
      total += ptsPerRenner.reduce((s,v) => s+v, 0);
    }
  });
  return total;
}

// Bereken punten voor één renner over alle uitslagen
export function calcRennerPtsFromRijen(rijen, rennerNaam) {
  const normed = normNaam(rennerNaam);
  return rijen
    .filter(r => normNaam(r.renner_naam) === normed)
    .reduce((s, r) => s + (r.totaal || 0), 0);
}

// ============================================================
// EXCEL PARSER (rituitslag)
// ============================================================
export function parseSheet(sheetName, koersNaam, data) {
  if (!data || data.length < 2) return { koersNaam, sheetName, type: 'rit', rijen: [] };

  // Header detecteren
  let hIdx = 0;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    if (data[i]?.some(c => String(c || '').toLowerCase().includes('rider'))) { hIdx = i; break; }
  }
  const hdr = data[hIdx].map(c => String(c || '').trim().toLowerCase());
  const ci = {};
  hdr.forEach((h, i) => {
    if (h === 'rnk' || h === 'rank') ci.rnk = i;
    else if (h === 'rider' || h === 'naam') ci.rider = i;
    else if (h === 'team') ci.team = i;
    else if (h === 'gc' || h === 'algemeen') ci.gc = i;
    else if (h === 'points' || h === 'punten') ci.points = i;
    else if (h === 'berg' || h === 'mountain') ci.berg = i;
    else if (h === 'jeugd' || h === 'youth') ci.jeugd = i;
  });

  // Winnaar voor DNF-bonus
  let winTeam = null;
  for (let i = hIdx + 1; i < data.length; i++) {
    const row = data[i]; if (!row) continue;
    if (String(row[ci.rnk] ?? '').trim() === '1') { winTeam = String(row[ci.team] ?? '').trim(); break; }
  }

  const rijen = [];
  for (let i = hIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every(c => c === null || c === '')) continue;
    const naam = String(row[ci.rider] ?? '').replace(/\u00a0/g, ' ').trim();
    const team = String(row[ci.team] ?? '').trim();
    if (!naam) continue;
    const rnkRaw = String(row[ci.rnk] ?? '').trim().toUpperCase();
    const isDNF = rnkRaw === 'DNF';
    const pts_rit    = ritPts(rnkRaw);
    const pts_gc     = dagPts(ci.gc     !== undefined ? row[ci.gc]     : null);
    const pts_points = dagPts(ci.points !== undefined ? row[ci.points] : null);
    const pts_berg   = dagPts(ci.berg   !== undefined ? row[ci.berg]   : null);
    const pts_jeugd  = dagPts(ci.jeugd  !== undefined ? row[ci.jeugd]  : null);
    let pts_bonus = 0, bonusReden = '';
    if (isDNF && winTeam && team === winTeam) { pts_bonus = 5; bonusReden = 'Teamgenoot wint'; }
    const totaal = pts_rit + pts_gc + pts_points + pts_berg + pts_jeugd + pts_bonus;
    rijen.push({ naam, team, rnk: rnkRaw, pts_rit, pts_gc, pts_points, pts_berg, pts_jeugd, pts_bonus, bonusReden, totaal });
  }
  return { koersNaam, sheetName, type: 'rit', rijen };
}

// ============================================================
// HELPERS
// ============================================================
export function fmtDL(dl) {
  if (!dl) return null;
  return new Date(dl).toLocaleString('nl-BE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

export function cDown(dl) {
  if (!dl) return null;
  const d = new Date(dl) - new Date();
  if (d <= 0) return { t:'Deadline verstreken', c:'cdown-over' };
  const days = Math.floor(d/86400000), hrs = Math.floor((d%86400000)/3600000), mins = Math.floor((d%3600000)/60000);
  const t = days > 0 ? `${days}d ${hrs}u` : hrs > 0 ? `${hrs}u ${mins}min` : `${mins}min`;
  return { t, c: d < 86400000 ? 'cdown-warn' : 'cdown-ok' };
}

export function showAlert(elId, msg, type = 'ad') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `alert ${type}`;
  el.innerHTML = msg;
  el.style.display = 'block';
}

export function loading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}
