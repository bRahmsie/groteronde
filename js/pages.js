import { sb } from './supabase.js';
import { jersey, normNaam, calcUserPtsFromRijen, calcRennerPtsFromRijen, fmtDL, cDown, loading } from './helpers.js';

// ============================================================
// STATE
// ============================================================
export let state = {
  profile:          null,
  settings:         {},
  koersen:          [],
  renners:          [],
  myTeams:          {},
  allUitslag_rijen: [],
};

// Filterstate — globaal en persistent zodat renner selecteren ze niet reset
window._activeKF  = null;   // actieve koersfilter (koers id of null)
window._filterFT  = '';     // geselecteerde ploeg
window._filterFS  = 'naam'; // sorteerorder
window._filterQ   = '';     // zoekterm

// ============================================================
// PAGINERING HELPER
// Supabase geeft standaard max 1000 rijen terug.
// fetchAll haalt alle rijen op in stappen van 1000.
// ============================================================
export async function fetchAll(query, pageSize = 1000) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break; // laatste pagina
    from += pageSize;
  }
  return all;
}

// ============================================================
// DATA LADEN
// ============================================================
export async function loadAllData() {
  loading(true);
  try {
    // Instellingen, koersen en teams hebben nooit >1000 rijen
    const [settRes, koersRes, teamRes] = await Promise.all([
      sb.from('competition_settings').select('*'),
      sb.from('koersen').select('*').order('naam'),
      sb.from('user_teams')
        .select('*, user_team_renners(renner_id)')
        .eq('user_id', state.profile.id),
    ]);

    state.settings = {};
    (settRes.data || []).forEach(s => state.settings[s.type] = s);

    state.koersen = koersRes.data || [];

    state.myTeams = {};
    (teamRes.data || []).forEach(t => {
      state.myTeams[t.competitie] = {
        id:         t.id,
        ploeg_naam: t.ploeg_naam,
        renner_ids: (t.user_team_renners || []).map(utr => utr.renner_id),
      };
    });

    // Renners — kan >1000 zijn, gebruik fetchAll
    const rennerData = await fetchAll(
      sb.from('renners').select('*, renner_koersen(koers_id)').order('naam')
    );
    state.renners = rennerData.map(r => ({
      ...r,
      koers_ids: (r.renner_koersen || []).map(rk => rk.koers_id),
    }));

    // Uitslag rijen — kan ook groot zijn
    const rijData = await fetchAll(
      sb.from('uitslag_rijen').select('*, uitslagen(type, koers_id)')
    );
    state.allUitslag_rijen = rijData.map(r => ({
      ...r,
      type:     r.uitslagen?.type     || 'rit',
      koers_id: r.uitslagen?.koers_id,
    }));

  } finally {
    loading(false);
  }
}

// ============================================================
// HELPERS
// ============================================================
function cC()      { return state.profile?.competitie || null; }
function cSett(c)  { return state.settings[c || cC()] || {}; }
function myTeam(c) { return state.myTeams[c || cC() || 'normal'] || { renner_ids: [], ploeg_naam: '' }; }

function budgetUsed(comp) {
  return myTeam(comp).renner_ids.reduce((s, id) => {
    const r = state.renners.find(x => x.id === id);
    return s + (r?.kostprijs || 0);
  }, 0);
}

function teamCount(ploeg, comp) {
  return myTeam(comp).renner_ids.filter(id => {
    const r = state.renners.find(x => x.id === id);
    return r?.ploeg === ploeg;
  }).length;
}

export function isComplete(comp) {
  const c = comp || cC() || 'normal';
  return myTeam(c).renner_ids.length === (cSett(c).max_renners || 15);
}

export function isLocked(comp) {
  const dl = cSett(comp || cC() || 'normal').deadline;
  return dl ? new Date() > new Date(dl) : false;
}

// ============================================================
// COMPETITIE PAGINA
// ============================================================
export function renderCompPage() {
  const p  = state.profile;
  const ns = cSett('normal');
  const ps = cSett('pro');

  const dlBadge = s => {
    if (!s.deadline) return '';
    const cd = cDown(s.deadline);
    return `<div style="margin-top:5px"><span class="countdown ${cd.c}">⏱ ${cd.t}</span></div>`;
  };

  document.getElementById('page-competitie').innerHTML = `
    <div class="card">
      <div class="card-title">Ploegnaam</div>
      <div style="display:flex;gap:7px">
        <input type="text" id="pn-input" placeholder="bv. The Flying Dutchmen"
          value="${p.ploeg_naam || ''}" style="margin-bottom:0;flex:1"
          ${isLocked(p.competitie) ? 'disabled' : ''}/>
        <button class="btn btn-primary" onclick="savePloegNaam()"
          ${isLocked(p.competitie) ? 'disabled' : ''}>Opslaan</button>
      </div>
      <div id="pn-saved" style="display:none;font-size:12px;color:var(--green);margin-top:4px">✓ Opgeslagen!</div>
    </div>
    <div class="g2" style="margin-bottom:.8rem">
      <div class="cc ${p.competitie === 'normal' ? 'ac' : ''}" onclick="selComp('normal')">
        <div style="font-size:10px;font-weight:500;padding:2px 8px;border-radius:var(--radius);background:var(--green-light);color:var(--green-dark);display:inline-block;margin-bottom:5px">NORMAAL</div>
        <div style="font-size:14px;font-weight:500;margin-bottom:4px">Normaal</div>
        <div style="font-size:11px;color:var(--text2)">
          Kostprijs: <strong>${ns.budget || 1000}</strong> ·
          Renners: <strong>${ns.max_renners || 15}</strong> ·
          Max/ploeg: <strong>${ns.max_per_team || 3}</strong>
        </div>
        ${dlBadge(ns)}
      </div>
      <div class="cc ${p.competitie === 'pro' ? 'ac' : ''}" onclick="selComp('pro')">
        <div style="font-size:10px;font-weight:500;padding:2px 8px;border-radius:var(--radius);background:var(--amber-light);color:var(--amber-text);display:inline-block;margin-bottom:5px">PRO</div>
        <div style="font-size:14px;font-weight:500;margin-bottom:4px">Pro</div>
        <div style="font-size:11px;color:var(--text2)">
          Kostprijs: <strong>${ps.budget || 750}</strong> ·
          Renners: <strong>${ps.max_renners || 10}</strong> ·
          Max/ploeg: <strong>${ps.max_per_team || 2}</strong>
        </div>
        ${dlBadge(ps)}
      </div>
    </div>
    ${p.competitie
      ? `<div class="alert as">${p.competitie === 'normal' ? 'Normaal' : 'Pro'}${p.ploeg_naam ? ' · ' + p.ploeg_naam : ''}</div>`
      : ''}
    <button class="btn btn-primary w100" onclick="bevestigComp()"
      ${isLocked(p.competitie) ? 'disabled' : ''}>
      ${isLocked(p.competitie) ? 'Selectieperiode gesloten' : 'Bevestig &amp; ga naar selectie'}
    </button>`;
}

// ============================================================
// SELECTIE PAGINA — bouw het frame éénmalig
// Filters/zoekterm worden hersteld vanuit globale state
// ============================================================
export function renderSelectiePage() {
  const comp   = cC();
  if (!comp) {
    document.getElementById('page-selectie').innerHTML =
      `<div class="alert ad">Kies eerst een competitie.</div>`;
    return;
  }
  const s      = cSett(comp);
  const locked = isLocked(comp);
  const sel    = myTeam(comp).renner_ids;
  const left   = s.budget - budgetUsed(comp);

  // Koers-pills
  const pills = state.koersen.map(k =>
    `<span class="pill-filter${window._activeKF === k.id ? ' active' : ''}"
      onclick="setKF('${k.id}')"
    >Doet mee aan ${k.naam}</span>`
  ).join('');

  // Ploegen dropdown — gefilterd op actieve koers
  const ploegOpts = _ploegOptions(window._filterFT);

  document.getElementById('page-selectie').innerHTML = `
    ${locked
      ? `<div class="locked-banner">🔒 Deadline (${fmtDL(s.deadline)}) verstreken — ploeg kan niet meer gewijzigd worden.</div>`
      : ''}
    ${isComplete(comp)
      ? `<div class="complete-banner">
           <span>✔ Ploeg compleet!</span>
           <button class="btn btn-sm"
             style="background:rgba(255,255,255,.2);color:#fff;border-color:rgba(255,255,255,.4)"
             onclick="goPage('mijnploeg')">Bekijk</button>
         </div>`
      : ''}
    <div class="g4" style="margin-bottom:.8rem">
      <div class="metric">
        <div class="metric-label">Competitie</div>
        <div class="metric-value" style="font-size:12px">${comp === 'pro' ? 'Pro' : 'Normaal'}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Renners</div>
        <div class="metric-value ${sel.length >= s.max_renners ? 'over' : 'ok'}">${sel.length} / ${s.max_renners}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Budget over</div>
        <div class="metric-value ${left < 0 ? 'over' : 'ok'}">${left}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Deadline</div>
        <div class="metric-value" style="font-size:11px">
          ${s.deadline
            ? (() => { const cd = cDown(s.deadline); return `<span class="countdown ${cd.c}">${cd.t}</span>`; })()
            : '<span style="color:var(--text2)">Geen</span>'}
        </div>
      </div>
    </div>
    <div class="card" style="padding-bottom:6px">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Renners</div>
        <span class="badge" id="badge-cnt">0</span>
      </div>

      <!-- Koers pills -->
      <div style="margin-bottom:8px;display:flex;flex-wrap:wrap">
        <span class="pill-filter${window._activeKF === null ? ' active' : ''}"
          onclick="setKF(null)">Alle</span>
        ${pills}
      </div>

      <!-- Zoek + filters -->
      <input type="text" id="search" placeholder="Zoek renner of ploeg..."
        value="${window._filterQ}"
        oninput="onSearchInput(this.value)"
        style="margin-bottom:8px"/>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <select id="ft" style="width:auto;margin-bottom:0" onchange="onFilterTeam(this.value)">
          <option value="">Alle ploegen</option>${ploegOpts}
        </select>
        <select id="fs" style="width:auto;margin-bottom:0" onchange="onFilterSort(this.value)">
          <option value="naam"  ${window._filterFS === 'naam' ? 'selected' : ''}>Naam A-Z</option>
          <option value="pd"    ${window._filterFS === 'pd'   ? 'selected' : ''}>Kostprijs ↓</option>
          <option value="pa"    ${window._filterFS === 'pa'   ? 'selected' : ''}>Kostprijs ↑</option>
        </select>
      </div>

      <div id="ab" style="display:none"></div>
      <div id="rl"></div>
    </div>`;

  renderRennerList();
}

// Hulpfunctie: bouw <option> tags voor ploegen, gefilterd op actieve koers
function _ploegOptions(geselecteerde) {
  const basis = window._activeKF
    ? state.renners.filter(r => r.koers_ids?.includes(window._activeKF))
    : state.renners;
  const ploegen = [...new Set(basis.map(r => r.ploeg))].sort();
  return ploegen.map(p =>
    `<option value="${p}"${p === geselecteerde ? ' selected' : ''}>${p}</option>`
  ).join('');
}

// ============================================================
// FILTER EVENT HANDLERS — sla op in globale state, render lijst
// ============================================================
window.onSearchInput  = function(v) { window._filterQ  = v;  renderRennerList(); };
window.onFilterTeam   = function(v) { window._filterFT = v;  renderRennerList(); };
window.onFilterSort   = function(v) { window._filterFS = v;  renderRennerList(); };

// Koersfilter: update pills + herlaad ploegen dropdown + render lijst
// Geen volledige pagina-rebuild — enkel de pills en dropdown bijwerken
window.setKF = function(koersId) {
  window._activeKF  = koersId;
  window._filterFT  = '';  // ploegfilter resetten want die ploeg bestaat misschien niet in nieuwe koers

  // Pills updaten
  document.querySelectorAll('.pill-filter').forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    const isAll   = onclick.includes('null');
    const isThis  = onclick.includes(`'${koersId}'`);
    el.classList.toggle('active', koersId === null ? isAll : isThis);
  });

  // Ploegen dropdown herbouwen
  const ftEl = document.getElementById('ft');
  if (ftEl) {
    ftEl.innerHTML = '<option value="">Alle ploegen</option>' + _ploegOptions('');
  }

  renderRennerList();
};

// ============================================================
// RENNERLIJST — enkel de kaarten, zonder de rest van de pagina te raken
// ============================================================
export function renderRennerList() {
  const comp   = cC() || 'normal';
  const s      = cSett(comp);
  const locked = isLocked(comp);
  const sel    = myTeam(comp).renner_ids;
  const left   = s.budget - budgetUsed(comp);

  const srch = (window._filterQ  || '').toLowerCase().trim();
  const ft   =  window._filterFT || '';
  const fs   =  window._filterFS || 'naam';

  // Filter pipeline
  let list = state.renners.slice();

  if (window._activeKF)
    list = list.filter(r => r.koers_ids?.includes(window._activeKF));

  if (ft)
    list = list.filter(r => r.ploeg === ft);

  if (srch)
    list = list.filter(r =>
      r.naam.toLowerCase().includes(srch) ||
      r.ploeg.toLowerCase().includes(srch)
    );

  // Sorteren
  if      (fs === 'pd') list.sort((a, b) => b.kostprijs - a.kostprijs);
  else if (fs === 'pa') list.sort((a, b) => a.kostprijs - b.kostprijs);
  else                  list.sort((a, b) => a.naam.localeCompare(b.naam));

  // Badge
  const badge = document.getElementById('badge-cnt');
  if (badge) badge.textContent = list.length + ' renners';

  // Metrics bijwerken
  _updateMetrics(comp, s, sel, left);

  // Kaarten
  const html = list.map(r => {
    const isSel = sel.includes(r.id);
    const tc    = teamCount(r.ploeg, comp);
    let dis = locked, reason = '';

    if (locked) {
      reason = 'Selectie gesloten';
    } else if (!isSel) {
      if      (sel.length >= s.max_renners) { dis = true; reason = 'Max bereikt'; }
      else if (r.kostprijs > left)          { dis = true; reason = 'Budget te laag'; }
      else if (tc >= s.max_per_team)        { dis = true; reason = 'Max/ploeg bereikt'; }
    }

    const tags = (r.koers_ids || []).map(kid => {
      const k = state.koersen.find(x => x.id === kid);
      return k ? `<span class="koers-tag">${k.naam}</span>` : '';
    }).join('');

    const rPts       = calcRennerPtsFromRijen(state.allUitslag_rijen, r.naam);
    const clickHandler = (dis && !isSel) || locked
      ? `showAlertBox('${locked ? 'Selectie gesloten' : reason}')`
      : `toggleRenner('${r.id}')`;

    return `<div class="rc${isSel ? ' sel' : ''}${dis && !isSel ? ' dis' : ''}"
        onclick="${clickHandler}">
      ${jersey(r.ploeg, 20)}
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${r.naam}${tags}
        </div>
        <div style="font-size:11px;color:var(--text2)">
          ${r.ploeg}${reason && !isSel ? ` · <span style="color:var(--red-text)">${reason}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:11px;color:var(--text2)">${r.kostprijs} kostprijs</div>
        ${rPts > 0 ? `<div style="font-size:11px;font-weight:500;color:var(--green)">${rPts} pts ✓</div>` : ''}
        ${isSel ? '<span class="badge bg" style="font-size:10px">✓</span>' : ''}
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--text2);font-size:13px;padding:.8rem">Geen renners gevonden</div>';

  const rl = document.getElementById('rl');
  if (rl) rl.innerHTML = html;
}
window.renderRennerList = renderRennerList;

// Metrics in de selectiepagina bijwerken zonder volledige herrender
function _updateMetrics(comp, s, sel, left) {
  const mg = document.querySelector('#page-selectie .metric-value.ok, #page-selectie .metric-value.over');
  // Renners teller
  const allMetrics = document.querySelectorAll('#page-selectie .metric');
  if (allMetrics[1]) {
    const mv = allMetrics[1].querySelector('.metric-value');
    if (mv) {
      mv.textContent = sel.length + ' / ' + s.max_renners;
      mv.className   = 'metric-value ' + (sel.length >= s.max_renners ? 'over' : 'ok');
    }
  }
  // Budget over
  if (allMetrics[2]) {
    const mv = allMetrics[2].querySelector('.metric-value');
    if (mv) {
      mv.textContent = left;
      mv.className   = 'metric-value ' + (left < 0 ? 'over' : 'ok');
    }
  }
  // Complete banner
  const cb = document.getElementById('complete-banner');
  // complete banner zit niet altijd in DOM als ploeg nog niet compleet was bij render
  // renderSelectiePage handelt dit af bij volgende navigatie
}

// ============================================================
// MIJN PLOEG
// ============================================================
export function renderMijnPloeg() {
  const comp   = cC() || 'normal';
  const s      = cSett(comp);
  const locked = isLocked(comp);
  const team   = myTeam(comp);
  const sel    = team.renner_ids;
  const used   = budgetUsed(comp);
  const pct    = Math.min(100, Math.round(used / s.budget * 100));

  const rennerNamen = sel
    .map(id => state.renners.find(r => r.id === id)?.naam)
    .filter(Boolean);
  const totalPts = calcUserPtsFromRijen(state.allUitslag_rijen, rennerNamen);

  let slots = '';
  for (let i = 0; i < s.max_renners; i++) {
    if (i < sel.length) {
      const r = state.renners.find(x => x.id === sel[i]);
      if (!r) continue;
      const rPts = calcRennerPtsFromRijen(state.allUitslag_rijen, r.naam);
      slots += `<div class="ts">
        <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
          ${jersey(r.ploeg, 20)}
          <div>
            <div style="font-size:12px;font-weight:500">${r.naam}</div>
            <div style="font-size:11px;color:var(--text2)">${r.ploeg}</div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-right:6px">
          ${rPts > 0 ? `<div style="font-size:12px;font-weight:600;color:var(--green)">${rPts} pts</div>` : ''}
          <div style="font-size:11px;color:var(--text2)">${r.kostprijs} kostprijs</div>
        </div>
        ${locked ? '' : `<button class="btn btn-sm btn-danger" onclick="removeRenner('${r.id}')">✕</button>`}
      </div>`;
    } else {
      slots += `<div class="ts tse" style="font-size:11px;color:var(--text2)">Positie ${i + 1} — leeg</div>`;
    }
  }

  const teams = {};
  sel.forEach(id => {
    const r = state.renners.find(x => x.id === id);
    if (r) teams[r.ploeg] = (teams[r.ploeg] || 0) + 1;
  });
  const breakdown = Object.entries(teams).map(([t, cnt]) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--border)">
      ${jersey(t, 18)}
      <span style="font-size:12px;flex:1">${t}</span>
      <span class="badge ${cnt >= s.max_per_team ? 'br' : 'bg'}">${cnt}/${s.max_per_team}</span>
    </div>`
  ).join('') || '<div style="font-size:12px;color:var(--text2)">Nog geen renners</div>';

  document.getElementById('page-mijnploeg').innerHTML = `
    ${locked
      ? `<div class="locked-banner">🔒 Deadline (${fmtDL(s.deadline)}) verstreken — ploeg kan niet meer gewijzigd worden.</div>`
      : ''}
    <div class="card">
      <div class="sh">
        <div>
          <div class="card-title" style="margin-bottom:1px">${team.ploeg_naam || 'Mijn ploeg'}</div>
          <div style="font-size:11px;color:var(--text2)">${comp === 'pro' ? 'Pro' : 'Normaal'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${totalPts > 0 ? `<span style="font-size:14px;font-weight:600;color:var(--green)">${totalPts} pts</span>` : ''}
          ${locked ? '' : `<button class="btn btn-sm btn-danger" onclick="resetPloeg()">Wis</button>`}
        </div>
      </div>
      ${isComplete(comp) ? `<div class="complete-banner">✔ Ploeg compleet!</div>` : ''}
      <div style="margin-bottom:.8rem">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:2px">
          <span>Kostprijs</span><span>${used} / ${s.budget}</span>
        </div>
        <div class="pb"><div class="pf${used > s.budget ? ' over' : ''}" style="width:${pct}%"></div></div>
      </div>
      ${slots}
    </div>
    <div class="card">
      <div class="card-title">Per wielerploeg</div>
      ${breakdown}
    </div>`;
}

// ============================================================
// KLASSEMENT
// ============================================================
export async function renderKlassement() {
  const comp        = document.getElementById('kl-comp')?.value  || 'normal';
  const koersFilter = document.getElementById('kl-koers')?.value || '';

  const { data: teams } = await sb
    .from('user_teams')
    .select('*, profiles(naam), user_team_renners(renner_id, renners(naam))')
    .eq('competitie', comp);

  const s = cSett(comp);

  const rows = (teams || []).map(t => {
    const rennerNamen = (t.user_team_renners || [])
      .map(utr => utr.renners?.naam)
      .filter(Boolean);
    const rijFilter = koersFilter
      ? state.allUitslag_rijen.filter(r => r.koers_id === koersFilter)
      : state.allUitslag_rijen;
    const pts      = calcUserPtsFromRijen(rijFilter, rennerNamen);
    const compleet = rennerNamen.length === s.max_renners;
    return {
      naam: t.profiles?.naam || '—',
      ploeg_naam: t.ploeg_naam,
      pts, compleet,
      n: rennerNamen.length,
    };
  }).sort((a, b) => b.pts - a.pts || a.naam.localeCompare(b.naam));

  const koersOpts = state.koersen.map(k =>
    `<option value="${k.id}"${k.id === koersFilter ? ' selected' : ''}>${k.naam}</option>`
  ).join('');

  document.getElementById('page-klassement').innerHTML = `
    <div class="card">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Klassement</div>
        <div style="display:flex;gap:6px">
          <select id="kl-comp" style="width:120px;margin-bottom:0" onchange="renderKlassement()">
            <option value="normal"${comp === 'normal' ? ' selected' : ''}>Normaal</option>
            <option value="pro"${comp === 'pro'    ? ' selected' : ''}>Pro</option>
          </select>
          <select id="kl-koers" style="width:150px;margin-bottom:0" onchange="renderKlassement()">
            <option value="">Alle koersen</option>${koersOpts}
          </select>
        </div>
      </div>
      ${rows.length === 0
        ? '<div style="font-size:13px;color:var(--text2);padding:.5rem">Geen deelnemers.</div>'
        : `<table><thead><tr>
             <th>#</th><th>Deelnemer</th><th>Ploegnaam</th><th>Renners</th><th>Status</th><th>Punten</th>
           </tr></thead>
           <tbody>${rows.map((r, i) => `<tr>
             <td class="${i === 0 ? 'rg' : i === 1 ? 'rs' : i === 2 ? 'rb' : ''}">${i + 1}</td>
             <td style="font-weight:500">${r.naam}</td>
             <td style="color:var(--text2)">${r.ploeg_naam || '—'}</td>
             <td>${r.n}/${s.max_renners}</td>
             <td><span class="badge ${r.compleet ? 'bg' : 'br'}">${r.compleet ? '✓ Compleet' : 'Incompleet'}</span></td>
             <td><span class="pts-pill ${r.pts > 0 ? 'pts-pos' : 'pts-zero'}"
               style="font-size:13px;padding:2px 9px">${r.pts}</span></td>
           </tr>`).join('')}</tbody></table>`}
    </div>`;
}
