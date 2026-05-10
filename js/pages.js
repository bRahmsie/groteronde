import { sb } from './supabase.js';
import { jersey, normNaam, calcUserPtsFromRijen, calcRennerPtsFromRijen, fmtDL, cDown, loading } from './helpers.js';

// ============================================================
// STATE
// ============================================================
export let state = window._appState = {
  profile:          null,
  settings:         {},
  koersen:          [],
  renners:          [],
  myTeams:          {},
  allUitslag_rijen: [],
  uitslagen: [],       // [{id, koers_id, sheet_naam, type}]
};

// Filterstate — globaal en persistent zodat renner selecteren ze niet reset
window._activeKF  = null;   // actieve koersfilter (koers id of null)
window._filterFT  = '';     // geselecteerde ploeg
window._filterFS  = 'naam'; // sorteerorder
window._filterQ      = '';     // zoekterm
window._filterMaxK   = '';     // max kostprijs filter
window._activeComp   = 'normal'; // actief geselecteerde competitie in selectie/mijnploeg

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

    // Uitslagen (metadata) — klein, snel laden
    const { data: uitslagenData } = await sb
      .from('uitslagen').select('id, koers_id, sheet_naam, type');
    state.uitslagen = uitslagenData || [];

    // Uitslag rijen — kan ook groot zijn
    const rijData = await fetchAll(
      sb.from('uitslag_rijen').select('*, uitslagen(type, koers_id)')
    );
    // Koppel sheet_naam via state.uitslagen lookup
    state.allUitslag_rijen = rijData.map(r => {
      const u = state.uitslagen.find(x => x.id === r.uitslag_id);
      return {
        ...r,
        type:       u?.type      || 'rit',
        koers_id:   u?.koers_id,
        sheet_naam: u?.sheet_naam || '',
      };
    });

  } finally {
    loading(false);
  }
}

// ============================================================
// HELPERS
// ============================================================
function cC()      { return window._activeComp || 'normal'; }
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
  const ns = cSett('normal');
  const ps = cSett('pro');

  const dlBadge = s => {
    if (!s.deadline) return '';
    const cd = cDown(s.deadline);
    return `<div style="margin-top:5px"><span class="countdown ${cd.c}">⏱ ${cd.t}</span></div>`;
  };

  const compBlock = (comp) => {
    const s       = comp === 'normal' ? ns : ps;
    const team    = myTeam(comp);
    const sel     = team.renner_ids;
    const locked  = isLocked(comp);
    const compleet = isComplete(comp);
    const label   = comp === 'normal' ? 'NORMAAL' : 'PRO';
    const kleur   = comp === 'normal'
      ? 'background:var(--green-light);color:var(--green-dark)'
      : 'background:var(--amber-light);color:var(--amber-text)';
    const hasTeam = !!state.myTeams[comp];

    return `<div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:.8rem">
        <div style="font-size:10px;font-weight:500;padding:2px 8px;border-radius:var(--radius);${kleur};display:inline-block">${label}</div>
        ${hasTeam && compleet ? '<span class="badge bg">✓ Compleet</span>' : ''}
        ${hasTeam && !compleet && sel.length > 0 ? `<span class="badge by">${sel.length}/${s.max_renners} renners</span>` : ''}
        ${hasTeam && sel.length === 0 ? '<span class="badge">Nog geen renners</span>' : ''}
        ${!hasTeam ? '<span class="badge" style="color:var(--text2)">Niet ingeschreven</span>' : ''}
      </div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:.8rem">
        Kostprijs: <strong>${s.budget || 1000}</strong> ·
        Renners: <strong>${s.max_renners || 15}</strong> ·
        Max/ploeg: <strong>${s.max_per_team || 3}</strong>
        ${dlBadge(s)}
      </div>
      <div style="margin-bottom:.8rem">
        <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">Ploegnaam</label>
        <div style="display:flex;gap:7px">
          <input type="text" id="pn-${comp}" placeholder="bv. The Flying Dutchmen"
            value="${team.ploeg_naam || ''}" style="margin-bottom:0;flex:1"
            ${locked ? 'disabled' : ''}/>
          <button class="btn btn-primary btn-sm" onclick="savePloegNaam('${comp}')"
            ${locked ? 'disabled' : ''}>Opslaan</button>
        </div>
        <div id="pn-saved-${comp}" style="display:none;font-size:12px;color:var(--green);margin-top:4px">✓ Opgeslagen!</div>
      </div>
      ${locked
        ? `<div class="alert ad" style="font-size:12px;margin-bottom:.5rem">🔒 Deadline verstreken — selectie gesloten.</div>`
        : ''}
      <button class="btn btn-primary w100" onclick="goToSelectie('${comp}')"
        ${locked ? 'disabled' : ''}>
        ${locked ? 'Selectieperiode gesloten' : `Ga naar selectie — ${label}`}
      </button>
    </div>`;
  };

  document.getElementById('page-competitie').innerHTML = `
    <div class="alert ai" style="margin-bottom:.8rem;font-size:12px">
      Je kan aan <strong>beide</strong> competities deelnemen met een aparte ploeg per competitie.
    </div>
    ${compBlock('normal')}
    ${compBlock('pro')}`;
}


export function renderSelectiePage() {
  const comp   = window._activeComp || 'normal';
  const s      = cSett(comp);
  const locked = isLocked(comp);
  const sel    = myTeam(comp).renner_ids;
  const left   = s.budget - budgetUsed(comp);

  // Voortgang beide competities voor de switcher
  const sn = cSett('normal'), sp = cSett('pro');
  const selN = myTeam('normal').renner_ids, selP = myTeam('pro').renner_ids;

  const pills = state.koersen.map(k =>
    `<span class="pill-filter${window._activeKF === k.id ? ' active' : ''}"
      onclick="setKF('${k.id}')"
    >Doet mee aan ${k.naam}</span>`
  ).join('');

  const ploegOpts = _ploegOptions(window._filterFT);

  document.getElementById('page-selectie').innerHTML = `
    <!-- Competitie switcher -->
    <div class="g2" style="margin-bottom:.8rem">
      <div class="cc${comp === 'normal' ? ' ac' : ''}" onclick="switchComp('normal')" style="padding:.7rem">
        <div style="font-size:10px;font-weight:500;padding:1px 7px;border-radius:var(--radius);background:var(--green-light);color:var(--green-dark);display:inline-block;margin-bottom:4px">NORMAAL</div>
        <div style="font-size:12px;font-weight:500">${myTeam('normal').ploeg_naam || 'Normaal'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">
          ${selN.length}/${sn.max_renners} renners
          ${selN.length === sn.max_renners ? ' <span class="badge bg" style="font-size:10px">✓</span>' : ''}
        </div>
      </div>
      <div class="cc${comp === 'pro' ? ' ac' : ''}" onclick="switchComp('pro')" style="padding:.7rem">
        <div style="font-size:10px;font-weight:500;padding:1px 7px;border-radius:var(--radius);background:var(--amber-light);color:var(--amber-text);display:inline-block;margin-bottom:4px">PRO</div>
        <div style="font-size:12px;font-weight:500">${myTeam('pro').ploeg_naam || 'Pro'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">
          ${selP.length}/${sp.max_renners} renners
          ${selP.length === sp.max_renners ? ' <span class="badge bg" style="font-size:10px">✓</span>' : ''}
        </div>
      </div>
    </div>

    ${locked
      ? `<div class="locked-banner">🔒 Deadline (${fmtDL(s.deadline)}) verstreken — ploeg kan niet meer gewijzigd worden.</div>`
      : ''}
    ${isComplete(comp)
      ? `<div class="complete-banner">
           <span>✔ ${comp === 'normal' ? 'Normaal' : 'Pro'} ploeg compleet!</span>
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
      <div style="margin-bottom:8px;display:flex;flex-wrap:wrap">
        <span class="pill-filter${window._activeKF === null ? ' active' : ''}"
          onclick="setKF(null)">Alle</span>
        ${pills}
      </div>
      <input type="text" id="search" placeholder="Zoek renner of ploeg..."
        value="${window._filterQ}"
        oninput="onSearchInput(this.value)"
        style="margin-bottom:8px"/>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
        <select id="ft" style="width:auto;margin-bottom:0" onchange="onFilterTeam(this.value)">
          <option value="">Alle ploegen</option>${ploegOpts}
        </select>
        <select id="fs" style="width:auto;margin-bottom:0" onchange="onFilterSort(this.value)">
          <option value="naam"  ${window._filterFS === 'naam' ? 'selected' : ''}>Naam A-Z</option>
          <option value="pd"    ${window._filterFS === 'pd'   ? 'selected' : ''}>Kostprijs ↓</option>
          <option value="pa"    ${window._filterFS === 'pa'   ? 'selected' : ''}>Kostprijs ↑</option>
        </select>
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:12px;color:var(--text2);white-space:nowrap">Max kostprijs:</span>
          <input type="number" id="fmk" min="1"
            value="${window._filterMaxK}"
            placeholder="bv. 500"
            oninput="onFilterMaxK(this.value)"
            style="width:90px;margin-bottom:0"/>
          ${window._filterMaxK ? `<button onclick="onFilterMaxK('')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text2);padding:0 2px" title="Wis filter">✕</button>` : ''}
        </div>
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
window.onFilterMaxK   = function(v) { window._filterMaxK = v;  renderRennerList(); };

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

  const maxK = parseInt(window._filterMaxK);
  if (!isNaN(maxK) && maxK > 0)
    list = list.filter(r => r.kostprijs <= maxK);

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
  const comp   = window._activeComp || 'normal';
  const s      = cSett(comp);
  const locked = isLocked(comp);
  const team   = myTeam(comp);
  const sel    = team.renner_ids;
  const used   = budgetUsed(comp);
  const pct    = Math.min(100, Math.round(used / s.budget * 100));

  const rennerNamen = sel.map(id => state.renners.find(r => r.id === id)?.naam).filter(Boolean);
  const totalPts    = calcUserPtsFromRijen(state.allUitslag_rijen, rennerNamen);

  // Voortgang beide competities voor switcher
  const sn = cSett('normal'), sp = cSett('pro');
  const selN = myTeam('normal').renner_ids, selP = myTeam('pro').renner_ids;

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
    <!-- Competitie switcher -->
    <div class="g2" style="margin-bottom:.8rem">
      <div class="cc${comp === 'normal' ? ' ac' : ''}" onclick="switchComp('normal')" style="padding:.7rem">
        <div style="font-size:10px;font-weight:500;padding:1px 7px;border-radius:var(--radius);background:var(--green-light);color:var(--green-dark);display:inline-block;margin-bottom:4px">NORMAAL</div>
        <div style="font-size:12px;font-weight:500">${myTeam('normal').ploeg_naam || 'Normaal'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">
          ${selN.length}/${sn.max_renners} renners
          ${selN.length === sn.max_renners ? ' <span class="badge bg" style="font-size:10px">✓</span>' : ''}
        </div>
      </div>
      <div class="cc${comp === 'pro' ? ' ac' : ''}" onclick="switchComp('pro')" style="padding:.7rem">
        <div style="font-size:10px;font-weight:500;padding:1px 7px;border-radius:var(--radius);background:var(--amber-light);color:var(--amber-text);display:inline-block;margin-bottom:4px">PRO</div>
        <div style="font-size:12px;font-weight:500">${myTeam('pro').ploeg_naam || 'Pro'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">
          ${selP.length}/${sp.max_renners} renners
          ${selP.length === sp.max_renners ? ' <span class="badge bg" style="font-size:10px">✓</span>' : ''}
        </div>
      </div>
    </div>

    ${locked ? `<div class="locked-banner">🔒 Deadline (${fmtDL(s.deadline)}) verstreken.</div>` : ''}
    <div class="card">
      <div class="sh">
        <div>
          <div class="card-title" style="margin-bottom:1px">${team.ploeg_naam || (comp === 'normal' ? 'Normaal ploeg' : 'Pro ploeg')}</div>
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
  const comp        = document.getElementById('kl-comp')?.value   || 'normal';
  const koersFilter = document.getElementById('kl-koers')?.value  || '';
  const ritFilter   = document.getElementById('kl-rit')?.value    || '';

  // Laad teams met renners
  const { data: teams } = await sb
    .from('user_teams')
    .select('*, profiles(naam), user_team_renners(renner_id, renners(naam))')
    .eq('competitie', comp);

  const s = cSett(comp);

  // Beschikbare ritten op basis van koersfilter — gebruik state.uitslagen (metadata)
  const uitslagenVoorKoers = koersFilter
    ? state.uitslagen.filter(u => u.koers_id === koersFilter)
    : state.uitslagen;

  // Uitslag_ids voor de rit-dropdown
  const rittenIds = uitslagenVoorKoers.map(u => u.id);

  // Filter rijen (de scores) op koers en/of rit
  let rijFilter = state.allUitslag_rijen;
  if (koersFilter) rijFilter = rijFilter.filter(r => r.koers_id === koersFilter);
  if (ritFilter)   rijFilter = rijFilter.filter(r => r.uitslag_id === ritFilter);

  // Bereken punten per team
  const rows = (teams || []).map(t => {
    const rennerNamen = (t.user_team_renners || [])
      .map(utr => utr.renners?.naam).filter(Boolean);
    const pts      = calcUserPtsFromRijen(rijFilter, rennerNamen);
    const compleet = rennerNamen.length === s.max_renners;

    // Detail: punten per renner (voor uitklap)
    const norm = n => (n || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const rennerDetail = rennerNamen.map(naam => {
      // Punten per uitslag voor deze renner (top-10 logica zit in calcUserPts)
      const rennerRijen = rijFilter.filter(r => norm(r.renner_naam) === norm(naam));
      const pts_totaal  = rennerRijen.reduce((s, r) => s + (r.totaal || 0), 0);
      const breakdown   = rennerRijen.map(r => ({
        sheet: r.sheet_naam || r.uitslag_id?.slice(0,8),
        pts_rit: r.pts_rit, pts_gc: r.pts_gc, pts_points: r.pts_points,
        pts_berg: r.pts_berg, pts_jeugd: r.pts_jeugd, pts_bonus: r.pts_bonus,
        totaal: r.totaal
      })).filter(r => r.totaal > 0);
      return { naam, pts_totaal, breakdown };
    }).filter(r => r.pts_totaal > 0).sort((a, b) => b.pts_totaal - a.pts_totaal);

    return {
      naam: t.profiles?.naam || '—',
      ploeg_naam: t.ploeg_naam,
      pts, compleet, rennerDetail,
      n: rennerNamen.length,
      uid: t.id,
    };
  }).sort((a, b) => b.pts - a.pts || a.naam.localeCompare(b.naam));

  // Dropdown opties
  const koersOpts = state.koersen.map(k =>
    `<option value="${k.id}"${k.id === koersFilter ? ' selected' : ''}>${k.naam}</option>`
  ).join('');

  // Rit-dropdown: gebruik state.uitslagen voor sheet_naam
  const ritOpts = uitslagenVoorKoers
    .slice()
    .sort((a, b) => (a.sheet_naam || '').localeCompare(b.sheet_naam || '', undefined, { numeric: true }))
    .map(u => `<option value="${u.id}"${u.id === ritFilter ? ' selected' : ''}>${u.sheet_naam || u.id.slice(0,8)}</option>`)
    .join('');

  // Tabel rijen
  const tabelRijen = rows.map((r, i) => {
    const detailId = `kl-detail-${r.uid}`;
    const detailHtml = r.rennerDetail.length === 0
      ? '<div style="font-size:12px;color:var(--text2);padding:.5rem">Geen gescoorde punten.</div>'
      : `<table style="margin-top:.4rem">
          <thead><tr>
            <th>Renner</th><th>Rit</th><th>Berg</th><th>GC</th><th>Punten</th><th>Jeugd</th><th>Bonus</th><th>Totaal</th>
          </tr></thead>
          <tbody>${r.rennerDetail.map(rd => {
            const rows = rd.breakdown.map(b =>
              `<tr>
                <td style="color:var(--text2);font-size:11px">${b.sheet || '?'}</td>
                <td>${b.pts_rit   > 0 ? `<span class="pts-pill pts-pos">+${b.pts_rit}</span>`   : '-'}</td>
                <td>${b.pts_berg  > 0 ? `<span class="pts-pill pts-pos">+${b.pts_berg}</span>`  : '-'}</td>
                <td>${b.pts_gc    > 0 ? `<span class="pts-pill pts-pos">+${b.pts_gc}</span>`    : '-'}</td>
                <td>${b.pts_points> 0 ? `<span class="pts-pill pts-pos">+${b.pts_points}</span>`: '-'}</td>
                <td>${b.pts_jeugd > 0 ? `<span class="pts-pill pts-pos">+${b.pts_jeugd}</span>` : '-'}</td>
                <td>${b.pts_bonus > 0 ? `<span class="pts-pill by">+${b.pts_bonus}</span>`      : '-'}</td>
                <td><strong><span class="pts-pill pts-pos">+${b.totaal}</span></strong></td>
              </tr>`
            ).join('');
            return `<tr style="background:var(--bg3)">
              <td colspan="8" style="padding:4px 8px 2px 8px">
                <strong style="font-size:12px">${rd.naam}</strong>
                <span class="pts-pill pts-pos" style="margin-left:6px">+${rd.pts_totaal} totaal</span>
              </td>
            </tr>${rows}`;
          }).join('')}</tbody>
        </table>`;

    return `<tr>
      <td class="${i===0?'rg':i===1?'rs':i===2?'rb':''}">${i+1}</td>
      <td style="font-weight:500">${r.naam}</td>
      <td style="color:var(--text2)">${r.ploeg_naam||'—'}</td>
      <td>${r.n}/${s.max_renners}</td>
      <td><span class="badge ${r.compleet?'bg':'br'}">${r.compleet?'✓':'✗'}</span></td>
      <td>
        <span class="pts-pill ${r.pts>0?'pts-pos':'pts-zero'}"
          style="font-size:13px;padding:2px 9px;cursor:${r.pts>0?'pointer':'default'}"
          onclick="${r.pts>0?`toggleKlDetail('${detailId}')`:''}">
          ${r.pts}${r.pts>0?' ▾':''}
        </span>
      </td>
    </tr>
    <tr id="${detailId}" style="display:none">
      <td colspan="6" style="padding:4px 8px 10px 28px;background:var(--bg3)">
        ${detailHtml}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('page-klassement').innerHTML = `
    <div class="card">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Klassement</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="kl-comp" style="width:110px;margin-bottom:0" onchange="renderKlassement()">
            <option value="normal"${comp==='normal'?' selected':''}>Normaal</option>
            <option value="pro"${comp==='pro'?' selected':''}>Pro</option>
          </select>
          <select id="kl-koers" style="width:150px;margin-bottom:0" onchange="klKoersChange()">
            <option value="">Alle koersen</option>${koersOpts}
          </select>
          <select id="kl-rit" style="width:130px;margin-bottom:0" onchange="renderKlassement()"
            ${!koersFilter?'disabled':''}>
            <option value="">Alle ritten</option>${ritOpts}
          </select>
        </div>
      </div>
      ${rows.length===0
        ? '<div style="font-size:13px;color:var(--text2);padding:.5rem">Geen deelnemers.</div>'
        : `<table><thead><tr>
             <th>#</th><th>Deelnemer</th><th>Ploegnaam</th><th>Renners</th><th>Status</th><th>Punten</th>
           </tr></thead>
           <tbody>${tabelRijen}</tbody></table>`}
    </div>`;
}

window.klKoersChange = function() {
  // Reset rit-filter bij koerswisseling
  const ritEl = document.getElementById('kl-rit');
  if (ritEl) ritEl.value = '';
  renderKlassement();
};

window.toggleKlDetail = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
};

// ============================================================
// PLOEGEN PAGINA — alle deelnemers met hun volledige selectie
// ============================================================
export async function renderPloegen() {
  const ploegenEl = document.getElementById('page-ploegen');
  if (!ploegenEl) return;
  ploegenEl.innerHTML = '<div style="padding:1rem"><div class="alert ai">Laden...</div></div>';

  const comp = window._activePloegComp || 'normal';
  const view = window._activePloegView || 'ploegen';

  const { data: teams } = await sb
    .from('user_teams')
    .select('*, profiles(naam), user_team_renners(renner_id, renners(naam, ploeg, kostprijs))')
    .order('ploeg_naam');

  const sNorm = state.settings['normal'] || {};
  const sPro  = state.settings['pro']    || {};
  const teamsNorm = (teams || []).filter(t => t.competitie === 'normal');
  const teamsPro  = (teams || []).filter(t => t.competitie === 'pro');
  const actTeams  = comp === 'normal' ? teamsNorm : teamsPro;
  const s         = comp === 'normal' ? sNorm : sPro;

  const compSwitcher =
    '<div class="g2" style="margin-bottom:.9rem">' +
    '<div class="cc' + (comp==='normal'?' ac':'') + '" onclick="switchPloegComp(\'normal\')" style="padding:.6rem;cursor:pointer">' +
    '<div style="font-size:10px;font-weight:500;padding:1px 7px;border-radius:var(--radius);background:var(--green-light);color:var(--green-dark);display:inline-block">NORMAAL</div>' +
    '<div style="font-size:12px;margin-top:4px;color:var(--text2)">' + teamsNorm.length + ' ploegen</div></div>' +
    '<div class="cc' + (comp==='pro'?' ac':'') + '" onclick="switchPloegComp(\'pro\')" style="padding:.6rem;cursor:pointer">' +
    '<div style="font-size:10px;font-weight:500;padding:1px 7px;border-radius:var(--radius);background:var(--amber-light);color:var(--amber-text);display:inline-block">PRO</div>' +
    '<div style="font-size:12px;margin-top:4px;color:var(--text2)">' + teamsPro.length + ' ploegen</div></div></div>';

  const viewTabs =
    '<div style="display:flex;gap:3px;background:var(--bg3);border-radius:var(--radius);padding:3px;margin-bottom:.9rem">' +
    '<div style="flex:1;text-align:center;padding:5px;font-size:13px;border-radius:6px;cursor:pointer;' +
    (view==='ploegen' ? 'background:var(--bg2);font-weight:500' : 'color:var(--text2)') +
    '" onclick="switchPloegView(\'ploegen\')">&#x1F465; Per ploeg</div>' +
    '<div style="flex:1;text-align:center;padding:5px;font-size:13px;border-radius:6px;cursor:pointer;' +
    (view==='renners' ? 'background:var(--bg2);font-weight:500' : 'color:var(--text2)') +
    '" onclick="switchPloegView(\'renners\')">&#x1F6B4; Per renner</div></div>';

  let content = '';

  if (view === 'ploegen') {
    if (!actTeams.length) {
      content = '<div class="card"><div style="font-size:13px;color:var(--text2)">Geen ploegen gevonden.</div></div>';
    } else {
      content = actTeams.map(t => {
        const renners = (t.user_team_renners || [])
          .map(utr => utr.renners).filter(Boolean)
          .sort((a, b) => a.naam.localeCompare(b.naam));
        const compleet = renners.length === s.max_renners;
        const kostprijsTotal = renners.reduce((sum, r) => sum + (r.kostprijs || 0), 0);
        const detailId = 'ploeg-detail-' + t.id;
const rennerRijen = renners.map(r => {
  // Check of renner DNF/DNS heeft in een uitslag
  const norm = n => (n||'').replace(/\u00a0/g,' ').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const uitslag = state.allUitslag_rijen.find(u =>
    norm(u.renner_naam) === norm(r.naam) &&
    (u.rnk === 'DNF' || u.rnk === 'DNS')
  );
  const bg = uitslag
    ? 'background:var(--red-light);border-left:3px solid var(--red-text);'
    : '';
  const label = uitslag
    ? '<span class="badge br" style="font-size:10px;margin-left:4px">' + uitslag.rnk + '</span>'
    : '';
  return '<div style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:0.5px solid var(--border);' + bg + '">' +
    jersey(r.ploeg, 18) +
    '<span style="font-size:12px;flex:1">' + r.naam + label + '</span>' +
    '<span style="font-size:11px;color:var(--text2)">' + r.ploeg + '</span>' +
    '<span style="font-size:11px;color:var(--text2);min-width:28px;text-align:right">' + r.kostprijs + '</span>' +
    '</div>';
}).join('');
        return '<div class="card" style="margin-bottom:.7rem">' +
          '<div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="togglePloegDetail(\'' + detailId + '\')">' +
          '<div style="flex:1">' +
          '<div style="font-size:14px;font-weight:500">' + (t.ploeg_naam || t.profiles?.naam || '—') + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">' + (t.profiles?.naam || '') + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
          '<span class="badge ' + (compleet ? 'bg' : 'by') + '">' + renners.length + '/' + s.max_renners + (compleet ? ' \u2713' : '') + '</span>' +
          '<div style="font-size:11px;color:var(--text2);margin-top:2px">' + kostprijsTotal + ' kostprijs</div>' +
          '</div>' +
          '<span style="font-size:14px;color:var(--text2);margin-left:4px">\u25BE</span>' +
          '</div>' +
          '<div id="' + detailId + '" style="display:none;margin-top:.7rem">' +
          (renners.length === 0 ? '<div style="font-size:12px;color:var(--text2)">Nog geen renners.</div>' : rennerRijen) +
          '</div></div>';
      }).join('');
    }

  } else {
    // PER RENNER — alle teams, beide competities
    const rennerKiezers = {};
    (teams || []).forEach(t => {
      const deelnemer = t.profiles?.naam || '—';
      const compLabel = t.competitie === 'normal' ? 'Normaal' : 'Pro';
      (t.user_team_renners || []).forEach(utr => {
        const naam = utr.renners?.naam;
        const ploeg = utr.renners?.ploeg;
        if (!naam) return;
        if (!rennerKiezers[naam]) rennerKiezers[naam] = { ploeg, kiezers: [] };
        rennerKiezers[naam].kiezers.push({ deelnemer, comp: compLabel });
      });
    });

    const gesorteerd = Object.entries(rennerKiezers)
      .sort((a, b) => b[1].kiezers.length - a[1].kiezers.length || a[0].localeCompare(b[0]));

    if (!gesorteerd.length) {
      content = '<div class="card"><div style="font-size:13px;color:var(--text2)">Nog geen renners geselecteerd.</div></div>';
    } else {
      const zoekBalk = '<div class="card" style="margin-bottom:.7rem;padding:.7rem">' +
        '<input type="text" id="renner-zoek" placeholder="Zoek renner..." ' +
        'oninput="filterRennerOverzicht(this.value)" style="margin-bottom:0"/></div>';

      const rijen = gesorteerd.map(([naam, data]) => {
        const detailId = 'renner-detail-' + naam.replace(/[^a-z0-9]/gi, '_');
        const kiezersHtml = data.kiezers.map(k =>
          '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:0.5px solid var(--border)">' +
          '<span style="font-size:12px;flex:1">' + k.deelnemer + '</span>' +
          '<span class="badge ' + (k.comp === 'Normaal' ? 'bg' : 'by') + '" style="font-size:10px">' + k.comp + '</span>' +
          '</div>'
        ).join('');
        return '<div class="renner-overzicht-item" data-naam="' + naam.toLowerCase() + '" style="margin-bottom:.5rem">' +
          '<div class="card" style="padding:.7rem">' +
          '<div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="togglePloegDetail(\'' + detailId + '\')">' +
          jersey(data.ploeg, 20) +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:500">' + naam + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">' + (data.ploeg || '') + '</div>' +
          '</div>' +
          '<span class="badge" style="margin-right:4px">' + data.kiezers.length + '\xD7</span>' +
          '<span style="font-size:13px;color:var(--text2)">\u25BE</span>' +
          '</div>' +
          '<div id="' + detailId + '" style="display:none;margin-top:.6rem">' +
          '<div style="font-size:11px;font-weight:500;color:var(--text2);margin-bottom:4px">' +
          'Gekozen door ' + data.kiezers.length + ' deelnemer' + (data.kiezers.length !== 1 ? 's' : '') + ':</div>' +
          kiezersHtml + '</div></div></div>';
      }).join('');

      content = zoekBalk + '<div id="renner-overzicht-lijst">' + rijen + '</div>';
    }
  }

  ploegenEl.innerHTML = '<div style="padding:1rem">' + compSwitcher + viewTabs + content + '</div>';
}

window.switchPloegComp = function(comp) {
  window._activePloegComp = comp;
  renderPloegen();
};

window.switchPloegView = function(view) {
  window._activePloegView = view;
  renderPloegen();
};

window.togglePloegDetail = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.filterRennerOverzicht = function(zoek) {
  const term = zoek.toLowerCase().trim();
  document.querySelectorAll('.renner-overzicht-item').forEach(el => {
    el.style.display = (!term || (el.dataset.naam || '').includes(term)) ? 'block' : 'none';
  });
};
