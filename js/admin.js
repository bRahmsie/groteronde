import { sb } from './supabase.js';
import { jersey, parseSheet, fmtDL, cDown, loading, showAlert } from './helpers.js';
// state is beschikbaar via window._appState (gezet door pages.js)
const getState = () => window._appState;

// ============================================================
// PUNTENTABELLEN EINDKLASSEMENT
// ============================================================
const EIND_ALG_PTS = {
  1:250,2:220,3:190,4:150,5:130,6:125,7:120,8:115,9:110,10:100,
  11:90,12:80,13:70,14:60,15:50,16:40,17:30,18:25,19:20,20:15
};
function eindAlgPts(pos, uitgereden) {
  const p = parseInt(pos); if (isNaN(p)) return 0;
  if (EIND_ALG_PTS[p]) return EIND_ALG_PTS[p];
  if (p <= 100) return 10;
  if (uitgereden && p <= uitgereden) return 5;
  return 0;
}
const EIND_NEVEN_PTS = {1:150,2:125,3:100,4:75,5:50};
function eindNevenPts(pos, isJongeren) {
  const p = parseInt(pos); if (isNaN(p)) return 0;
  if (isJongeren && p > 3) return 0;
  return EIND_NEVEN_PTS[p] || 0;
}
function dagKlasPts(pos) {
  if (!pos && pos !== 0) return 0;
  const p = parseInt(pos);
  return {1:15,2:10,3:5}[p] || 0;
}

// ============================================================
// ADMIN PAGINA HOOFDRENDER
// ============================================================
export function renderAdminPage() {
  document.getElementById('page-admin').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;margin-bottom:.8rem">
      <button class="atab active" id="at-gebruikers" onclick="switchATab('gebruikers')">👥 Gebruikers</button>
      <button class="atab" id="at-normaal"    onclick="switchATab('normaal')">Normaal</button>
      <button class="atab" id="at-pro"        onclick="switchATab('pro')">Pro</button>
      <button class="atab" id="at-koersen"    onclick="switchATab('koersen')">Koersen</button>
      <button class="atab" id="at-renners"    onclick="switchATab('renners')">Renners</button>
      <button class="atab" id="at-uitslagen"  onclick="switchATab('uitslagen')">📥 Uitslagen</button>
      <button class="atab" id="at-csv"        onclick="switchATab('csv')">CSV renners</button>
    </div>
    <div id="admin-content"></div>
  `;
  switchATab('gebruikers');
}

export function switchATab(t) {
  document.querySelectorAll('.atab').forEach(el => {
    el.classList.toggle('active', el.id === 'at-' + t);
  });
  const handlers = {
    gebruikers: renderGebruikers,
    normaal:    () => renderSettingsTab('normal'),
    pro:        () => renderSettingsTab('pro'),
    koersen:    renderKoersenTab,
    renners:    renderRennersTab,
    uitslagen:  renderUitslagenTab,
    csv:        renderCsvTab,
  };
  (handlers[t] || (() => {}))();
}
window.switchATab = switchATab;

// ============================================================
// GEBRUIKERS OVERZICHT
// ============================================================
async function renderGebruikers() {
  loading(true);
  const { data: users } = await sb
    .from('profiles')
    .select('*, user_teams(competitie, ploeg_naam, user_team_renners(renner_id))')
    .eq('is_admin', false)
    .order('naam');
  loading(false);

  const s_norm = getState().settings['normal'] || {};
  const s_pro  = getState().settings['pro']   || {};
  const total  = users?.length || 0;

  const rows = (users || []).map(u => {
    const teams    = u.user_teams || [];
    const initials = u.naam.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    if (!teams.length) {
      return `<div class="user-row">
        <div class="avatar">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${u.naam}</div>
          <div style="font-size:11px;color:var(--text2)">${u.email}</div>
        </div>
        <span class="badge">Geen competitie</span>
      </div>`;
    }
    return teams.map(t => {
      const maxR     = t.competitie === 'normal' ? s_norm.max_renners : s_pro.max_renners;
      const n        = (t.user_team_renners || []).length;
      const compleet = n === maxR;
      return `<div class="user-row">
        <div class="avatar">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${u.naam}${t.ploeg_naam ? ` <span style="font-weight:400;color:var(--text2)">· ${t.ploeg_naam}</span>` : ''}</div>
          <div style="font-size:11px;color:var(--text2)">${u.email}</div>
        </div>
        <span class="badge ${t.competitie === 'normal' ? 'bg' : 'by'}" style="margin-right:6px">${t.competitie === 'normal' ? 'Normaal' : 'Pro'}</span>
        <span class="badge ${compleet ? 'bg' : 'br'}">${n}/${maxR}${compleet ? ' ✓' : ''}</span>
      </div>`;
    }).join('');
  }).join('');

  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Geregistreerde gebruikers</div>
        <span style="font-size:11px;color:var(--text2)">${total} gebruikers</span>
      </div>
      ${rows || '<div style="font-size:13px;color:var(--text2)">Geen gebruikers.</div>'}
    </div>`;
}

// ============================================================
// INSTELLINGEN TAB
// ============================================================
function renderSettingsTab(comp) {
  const s   = getState().settings[comp] || {};
  const pre = comp === 'normal' ? 'n' : 'p';
  const lbl = comp === 'normal' ? 'Normaal' : 'Pro';
  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">Instellingen — ${lbl}</div>
      <div class="srow"><div class="slbl">Max. renners</div>
        <input type="number" style="width:75px;margin-bottom:0" id="${pre}-mr" value="${s.max_renners || 15}" min="1" max="30"/>
      </div>
      <div class="srow"><div class="slbl">Budget (kostprijs)</div>
        <input type="number" style="width:75px;margin-bottom:0" id="${pre}-b" value="${s.budget || 1000}" min="100"/>
      </div>
      <div class="srow"><div class="slbl">Max. per wielerploeg</div>
        <input type="number" style="width:75px;margin-bottom:0" id="${pre}-mt" value="${s.max_per_team || 3}" min="1" max="10"/>
      </div>
      <div class="srow">
        <div class="slbl">Deadline</div>
        <input type="datetime-local" id="${pre}-dl" value="${s.deadline ? s.deadline.slice(0, 16) : ''}" style="width:190px;margin-bottom:0"/>
        <button class="btn btn-sm btn-danger" onclick="clearDeadline('${comp}')">Wis</button>
      </div>
      ${s.deadline ? `<div style="margin-bottom:6px">${(() => { const cd = cDown(s.deadline); return `<span class="countdown ${cd.c}">⏱ ${cd.t} — ${fmtDL(s.deadline)}</span>`; })()}</div>` : ''}
      <div id="sett-res" style="display:none"></div>
      <button class="btn btn-primary" onclick="saveSettings('${comp}')">Opslaan</button>
    </div>`;
}

window.saveSettings = async function(comp) {
  const pre = comp === 'normal' ? 'n' : 'p';
  const dlVal = document.getElementById(`${pre}-dl`).value;
  const updates = {
    type:         comp,
    max_renners:  parseInt(document.getElementById(`${pre}-mr`).value) || 15,
    budget:       parseInt(document.getElementById(`${pre}-b`).value)  || 1000,
    max_per_team: parseInt(document.getElementById(`${pre}-mt`).value) || 3,
    deadline:     dlVal || null,
    updated_at:   new Date().toISOString(),
  };
  const { error } = await sb.from('competition_settings')
    .upsert(updates, { onConflict: 'type' });
  if (error) { showAlert('sett-res', error.message); return; }
  getState().settings[comp] = { ...getState().settings[comp], ...updates };
  showAlert('sett-res', 'Opgeslagen!', 'as');
};

window.clearDeadline = async function(comp) {
  const pre = comp === 'normal' ? 'n' : 'p';
  document.getElementById(`${pre}-dl`).value = '';
  await sb.from('competition_settings').update({ deadline: null }).eq('type', comp);
  getState().settings[comp] = { ...getState().settings[comp], deadline: null };
  renderSettingsTab(comp);
};

// ============================================================
// KOERSEN TAB
// ============================================================
async function renderKoersenTab() {
  const list = getState().koersen.map(k => {
    const aantalDeelnemers = getState().renners.filter(r => r.koers_ids?.includes(k.id)).length;
    return `
    <div style="margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:0.5px solid var(--border)">
        <span style="font-size:13px;font-weight:500;flex:1">🏁 ${k.naam}</span>
        <span class="badge bg">${aantalDeelnemers} deelnemers</span>
        <input type="text" value="${k.naam}" style="width:130px;margin-bottom:0;font-size:12px"
          onchange="renameKoers('${k.id}', this.value)"/>
        <button class="btn btn-sm btn-danger" onclick="deleteKoers('${k.id}')">✕</button>
      </div>
      <div style="margin:8px 0 0 0">
        <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:5px">
          Deelnemers importeren voor <strong>${k.naam}</strong>
        </div>
        <div class="alert ai" style="margin-bottom:6px;font-size:12px">
          Één rennersnaam per rij — exact zoals in de rennersdatabase.<br>
          De bestaande deelnemerslijst voor <strong>${k.naam}</strong> wordt volledig vervangen.
        </div>
        <textarea id="deel-csv-${k.id}" class="csv-a" style="height:90px"
          placeholder="Tadej Pogacar&#10;Remco Evenepoel&#10;Primoz Roglic&#10;..."></textarea>
        <div style="display:flex;gap:7px;margin-bottom:4px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="importDeelnemers('${k.id}', '${k.naam}')">
            Importeer deelnemers
          </button>
          <label class="btn btn-sm" style="cursor:pointer">
            Bestand
            <input type="file" accept=".csv,.txt" style="display:none"
              onchange="loadDeelnemersFile(event, '${k.id}', '${k.naam}')"/>
          </label>
          <button class="btn btn-sm" onclick="clearDeelnemers('${k.id}', '${k.naam}')">
            Wis alle deelnemers
          </button>
        </div>
        <div id="deel-res-${k.id}" style="display:none"></div>
      </div>
    </div>`;
  }).join('');

  const totaalDeelnemers = getState().koersen.reduce((s, k) =>
    s + getState().renners.filter(r => r.koers_ids?.includes(k.id)).length, 0);

  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Koersen &amp; deelnemers</div>
        ${getState().koersen.length > 0 ? `
          <button class="btn btn-sm btn-danger" onclick="clearAlleDeelnemers()">
            Wis alle deelnemers (alle koersen)
          </button>` : ''}
      </div>
      <div class="alert ai" style="margin-bottom:.8rem;font-size:12px">
        Maak een koers aan, importeer daarna de deelnemerslijst. Gebruikers zien dan de filter
        <strong>"Doet mee aan [koers]"</strong> in de rennersselectie.
      </div>
      <div style="display:flex;gap:7px;margin-bottom:1rem">
        <input type="text" id="new-koers" placeholder="bv. Giro d'Italia, Tour de France..." style="margin-bottom:0;flex:1"/>
        <button class="btn btn-primary" onclick="addKoers()">+ Koers toevoegen</button>
      </div>
      ${list || '<div style="font-size:13px;color:var(--text2)">Nog geen koersen. Voeg er een toe hierboven.</div>'}
    </div>`;
}

window.importDeelnemers = async function(koersId, koersNaam) {
  const raw = document.getElementById(`deel-csv-${koersId}`).value.trim();
  if (!raw) { alert('Plak eerst een lijst met rennersnamen.'); return; }
  await _verwerkDeelnemers(koersId, koersNaam, raw);
};

window.loadDeelnemersFile = function(e, koersId, koersNaam) {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = async ev => {
    document.getElementById(`deel-csv-${koersId}`).value = ev.target.result.trim();
    await _verwerkDeelnemers(koersId, koersNaam, ev.target.result.trim());
  };
  rd.readAsText(f);
};

async function _verwerkDeelnemers(koersId, koersNaam, raw) {
  const resEl = document.getElementById(`deel-res-${koersId}`);
  resEl.style.display = 'none';
  loading(true);

  const namen = raw.split('\n').map(l => l.split(';')[0].trim()).filter(l => l.length > 0);
  const norm = n => (n || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let matched = 0;
  const notFound  = [];
  const rennerIds = [];

  namen.forEach(naam => {
    const r = getState().renners.find(x => norm(x.naam) === norm(naam));
    if (r) { rennerIds.push(r.id); matched++; }
    else notFound.push(naam);
  });

  await sb.from('renner_koersen').delete().eq('koers_id', koersId);
  if (rennerIds.length) {
    const rows = rennerIds.map(rid => ({ renner_id: rid, koers_id: koersId }));
    for (let i = 0; i < rows.length; i += 500) {
      await sb.from('renner_koersen').insert(rows.slice(i, i + 500));
    }
  }

  getState().renners.forEach(r => {
    r.koers_ids = (r.koers_ids || []).filter(k => k !== koersId);
    if (rennerIds.includes(r.id)) r.koers_ids.push(koersId);
  });

  loading(false);

  let msg = `✓ <strong>${matched}</strong> renners gekoppeld aan <strong>${koersNaam}</strong>.`;
  if (notFound.length) {
    msg += `<br><span style="color:var(--text2)">Niet gevonden (${notFound.length}): </span>`
         + `<span style="color:var(--red-text)">${notFound.slice(0, 10).join(', ')}${notFound.length > 10 ? ` … +${notFound.length - 10}` : ''}</span>`;
  }
  resEl.className = `alert ${notFound.length && !matched ? 'ad' : 'as'}`;
  resEl.innerHTML = msg;
  resEl.style.display = 'block';
  renderKoersenTab();
}

window.clearDeelnemers = async function(koersId, koersNaam) {
  if (!confirm(`Alle deelnemers van ${koersNaam} verwijderen?`)) return;
  loading(true);
  await sb.from('renner_koersen').delete().eq('koers_id', koersId);
  getState().renners.forEach(r => {
    if (r.koers_ids) r.koers_ids = r.koers_ids.filter(k => k !== koersId);
  });
  loading(false);
  renderKoersenTab();
};

window.clearAlleDeelnemers = async function() {
  if (!confirm('Alle deelnemers van ALLE koersen verwijderen?\nDe koersen zelf blijven bestaan.')) return;
  loading(true);
  await sb.from('renner_koersen').delete().neq('renner_id', '00000000-0000-0000-0000-000000000000');
  getState().renners.forEach(r => { r.koers_ids = []; });
  loading(false);
  renderKoersenTab();
};

window.addKoers = async function() {
  const naam = document.getElementById('new-koers').value.trim();
  if (!naam) return;
  const { data, error } = await sb.from('koersen').insert({ naam }).select().single();
  if (error) { alert(error.message); return; }
  getState().koersen.push(data);
  document.getElementById('new-koers').value = '';
  renderKoersenTab();
};

window.renameKoers = async function(id, naam) {
  await sb.from('koersen').update({ naam: naam.trim() }).eq('id', id);
  const k = getState().koersen.find(x => x.id === id);
  if (k) k.naam = naam.trim();
};

window.deleteKoers = async function(id) {
  if (!confirm('Koers verwijderen? Dit verwijdert ook alle bijhorende deelnemers en uitslagen.')) return;
  await sb.from('koersen').delete().eq('id', id);
  getState().koersen = getState().koersen.filter(k => k.id !== id);
  getState().renners.forEach(r => {
    if (r.koers_ids) r.koers_ids = r.koers_ids.filter(k => k !== id);
  });
  getState().allUitslag_rijen = getState().allUitslag_rijen.filter(r => r.koers_id !== id);
  getState().uitslagen = (getState().uitslagen || []).filter(u => u.koers_id !== id);
  renderKoersenTab();
};

// ============================================================
// RENNERS TAB
// ============================================================
async function renderRennersTab() {
  const html = getState().renners.map(r => {
    const koersLabels = (r.koers_ids || []).map(kid => {
      const k = getState().koersen.find(x => x.id === kid);
      return k ? `<span class="koers-tag">${k.naam}</span>` : '';
    }).join('');
    return `<div style="padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;align-items:center;gap:7px">
        ${jersey(r.ploeg, 18)}
        <div style="flex:1;min-width:0">
          <span style="font-size:12px;font-weight:500">${r.naam}</span>
          <span style="font-size:11px;color:var(--text2);margin-left:4px">${r.ploeg}</span>
          <div style="margin-top:2px">${koersLabels || '<span style="font-size:10px;color:var(--text2)">Geen koersen gekoppeld</span>'}</div>
        </div>
        <input type="number" style="width:65px;margin-bottom:0;text-align:center;font-size:12px"
          value="${r.kostprijs}" min="1" max="9999"
          onchange="updateKostprijs('${r.id}', this.value)" title="Kostprijs"/>
        <span style="font-size:11px;color:var(--text2)">kostprijs</span>
      </div>
    </div>`;
  }).join('');

  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Renners &amp; kostprijs</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge">${getState().renners.length} renners</span>
          ${getState().renners.length > 0 ? `
            <button class="btn btn-sm btn-danger" onclick="deleteAlleRenners()">
              Wis alle renners
            </button>` : ''}
        </div>
      </div>
      <div class="alert ai" style="margin-bottom:.8rem;font-size:12px">
        Pas hier de kostprijs per renner aan.
        Koers-deelname beheer je via het tabblad <strong>Koersen</strong>.
      </div>
      ${html || '<div style="font-size:13px;color:var(--text2)">Geen renners. Importeer via "CSV renners".</div>'}
    </div>`;
}

window.updateKostprijs = async function(id, val) {
  const v = parseInt(val) || 1;
  await sb.from('renners').update({ kostprijs: v }).eq('id', id);
  const r = getState().renners.find(x => x.id === id);
  if (r) r.kostprijs = v;
};

window.deleteAlleRenners = async function() {
  const n = getState().renners.length;
  if (!confirm(`Alle ${n} renners verwijderen?\nDit verwijdert ook alle koers-koppelingen en gebruikersselecties.`)) return;
  loading(true);
  await sb.from('renner_koersen').delete().neq('renner_id', '00000000-0000-0000-0000-000000000000');
  await sb.from('user_team_renners').delete().neq('renner_id', '00000000-0000-0000-0000-000000000000');
  await sb.from('renners').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  getState().renners = [];
  loading(false);
  renderRennersTab();
};

// ============================================================
// UITSLAGEN TAB — met type-selectie voor eindklassement
// ============================================================
let xlWorkbook = null, xlSelSheets = new Set();

const TYPE_LABELS = {
  'rit': 'Rit',
  'eind-algemeen': 'Eind Alg.',
  'eind-punten': 'Eind Punten',
  'eind-berg': 'Eind Berg',
  'eind-jongeren': 'Eind Jongeren',
  'dag-algemeen': 'Dag Alg.',
  'dag-punten': 'Dag Punten',
  'dag-berg': 'Dag Berg',
  'dag-jongeren': 'Dag Jongeren',
};

async function renderUitslagenTab() {
  const { data: uitslagen } = await sb
    .from('uitslagen')
    .select('*, koersen(naam)')
    .order('imported_at', { ascending: false });

  const ovHtml = !(uitslagen?.length)
    ? '<div style="font-size:13px;color:var(--text2)">Nog geen uitslagen.</div>'
    : uitslagen.map(u => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
          <span class="badge bg">${u.koersen?.naam || '?'}</span>
          <span class="badge bb" style="font-size:10px">${TYPE_LABELS[u.type] || u.type}</span>
          <span style="font-size:12px;font-weight:500">${u.sheet_naam}</span>
          <span style="font-size:11px;color:var(--text2);margin-left:auto">
            ${new Date(u.imported_at).toLocaleDateString('nl-BE')}
          </span>
          <button class="btn btn-sm btn-danger" onclick="deleteUitslag('${u.id}')">✕</button>
        </div>`).join('');

  const koersOpts = getState().koersen.map(k =>
    `<option value="${k.id}">${k.naam}</option>`
  ).join('');

  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">📥 Uitslag importeren</div>
      <div class="alert ai" style="margin-bottom:.8rem;font-size:12px">
        <strong>Rit:</strong> kolommen <code>Rnk · Rider · Team · GC · Points · Berg · Jeugd</code><br>
        <strong>Eindklassement / Dagklassement:</strong> kolommen <code>Rnk · Rider · Team</code>
      </div>

      <div class="srow">
        <div class="slbl">Koers</div>
        <select id="imp-koers-sel" style="width:auto;margin-bottom:0;flex:1">
          ${koersOpts || '<option value="">— Voeg eerst een koers toe —</option>'}
        </select>
      </div>
      <div class="srow">
        <div class="slbl">Type uitslag</div>
        <select id="imp-type" style="width:auto;margin-bottom:0" onchange="toggleUitslagType()">
          <option value="rit">Rituitslag</option>
          <option value="eind-algemeen">Eindklassement — Algemeen</option>
          <option value="eind-punten">Eindklassement — Punten</option>
          <option value="eind-berg">Eindklassement — Berg</option>
          <option value="eind-jongeren">Eindklassement — Jongeren</option>
          <option value="dag-algemeen">Dagklassement — Algemeen</option>
          <option value="dag-punten">Dagklassement — Punten</option>
          <option value="dag-berg">Dagklassement — Berg</option>
          <option value="dag-jongeren">Dagklassement — Jongeren</option>
        </select>
      </div>
      <div class="srow" id="uitgereden-row" style="display:none">
        <div class="slbl">Aantal uitgereden</div>
        <input type="number" id="imp-uitgereden" value="150" min="1" style="width:80px;margin-bottom:0"/>
        <span style="font-size:12px;color:var(--text2)">renners eindigden de koers (= 5 pts)</span>
      </div>

      <div class="drop-zone" id="drop-zone"
        onclick="document.getElementById('xl-input').click()"
        ondragover="event.preventDefault();this.classList.add('dv')"
        ondragleave="this.classList.remove('dv')"
        ondrop="handleDrop(event)">
        <div style="font-size:1.6rem;margin-bottom:.3rem">📂</div>
        <div style="font-size:13px;font-weight:500">Klik of sleep Excel-bestand</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">.xlsx bestand</div>
      </div>
      <input type="file" id="xl-input" accept=".xlsx" style="display:none" onchange="handleFile(this.files[0])"/>
    </div>

    <div class="card" id="sheets-card" style="display:none">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Kies tabbladen</div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-sm" onclick="selAllSheets(true)">Alles</button>
          <button class="btn btn-sm" onclick="selAllSheets(false)">Geen</button>
        </div>
      </div>
      <div id="sheet-pills" style="margin-bottom:.8rem"></div>
      <button class="btn btn-primary" onclick="processSheets()">▶ Verwerk</button>
    </div>

    <div class="card" id="imp-prog-card" style="display:none">
      <div class="card-title">Verwerking</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2)">
        <span id="prog-lbl">Verwerken…</span><span id="prog-pct">0%</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" id="prog-fill" style="width:0%"></div></div>
      <div id="prog-log" style="font-size:11px;color:var(--text2);max-height:100px;overflow-y:auto;line-height:1.8;margin-top:6px"></div>
    </div>

    <div id="imp-result-wrap" style="display:none"></div>

    <div class="card" style="margin-top:.8rem">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Geïmporteerde uitslagen</div>
        <button class="btn btn-sm btn-danger"
          onclick="if(confirm('Alles wissen?'))deleteAllUitslagen()">Wis alles</button>
      </div>
      <div id="ov-uitslagen">${ovHtml}</div>
    </div>`;
}

window.toggleUitslagType = function() {
  const type = document.getElementById('imp-type')?.value;
  const row  = document.getElementById('uitgereden-row');
  if (row) row.style.display = type === 'eind-algemeen' ? 'flex' : 'none';
};

window.handleDrop = function(ev) {
  ev.preventDefault();
  document.getElementById('drop-zone').classList.remove('dv');
  handleFile(ev.dataTransfer.files[0]);
};

window.handleFile = function(file) {
  if (!file?.name.endsWith('.xlsx')) { alert('Alleen .xlsx'); return; }
  const rd = new FileReader();
  rd.onload = e => {
    xlWorkbook = XLSX.read(e.target.result, { type: 'array' });
    xlSelSheets = new Set(xlWorkbook.SheetNames);
    document.getElementById('sheets-card').style.display = 'block';
    renderSheetPills();
  };
  rd.readAsArrayBuffer(file);
};

function renderSheetPills() {
  document.getElementById('sheet-pills').innerHTML = xlWorkbook.SheetNames.map(n =>
    `<span class="sheet-pill${xlSelSheets.has(n) ? ' active' : ''}" onclick="toggleSheet('${n}')">${n}</span>`
  ).join('');
}

window.toggleSheet  = n => { if (xlSelSheets.has(n)) xlSelSheets.delete(n); else xlSelSheets.add(n); renderSheetPills(); };
window.selAllSheets = v => { if (v) xlWorkbook.SheetNames.forEach(n => xlSelSheets.add(n)); else xlSelSheets.clear(); renderSheetPills(); };

// ---- Punt-berekening per rij op basis van type ----
function _berekenRijen(data, type, uitgereden) {
  if (!data || data.length < 2) return [];

  let hIdx = 0;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    if (data[i]?.some(c => String(c||'').toLowerCase().includes('rider') ||
                           String(c||'').toLowerCase().includes('naam'))) {
      hIdx = i; break;
    }
  }
  const hdr = data[hIdx].map(c => String(c||'').trim().toLowerCase());
  const ci  = {};
  hdr.forEach((h, i) => {
    if (h==='rnk'||h==='rank'||h==='pos') ci.rnk    = i;
    else if (h==='rider'||h==='naam')      ci.rider  = i;
    else if (h==='team')                   ci.team   = i;
    else if (h==='gc'||h==='algemeen')     ci.gc     = i;
    else if (h==='points'||h==='punten')   ci.points = i;
    else if (h==='berg'||h==='mountain')   ci.berg   = i;
    else if (h==='jeugd'||h==='youth')     ci.jeugd  = i;
  });

  // Winnaar voor DNF-bonus (alleen bij rit)
  let winTeam = null;
  if (type === 'rit') {
    for (let i = hIdx+1; i < data.length; i++) {
      const row = data[i]; if (!row) continue;
      if (String(row[ci.rnk]??'').trim() === '1') {
        winTeam = String(row[ci.team]??'').trim(); break;
      }
    }
  }

  const RIT_PTS = {1:100,2:85,3:70,4:60,5:50,6:45,7:40,8:35,9:30,10:25,
                   11:20,12:18,13:16,14:14,15:12};
  function ritPts(p) {
    const s = String(p||'').trim().toUpperCase();
    if (s==='DNF'||s==='DNS'||s==='') return 0;
    const n = parseInt(s); if (isNaN(n)) return 0;
    if (RIT_PTS[n]) return RIT_PTS[n];
    if (n<=20) return 10; if (n<=25) return 8; if (n<=50) return 6;
    if (n<=75) return 4;  if (n<=100) return 3; return 1;
  }

  const rijen = [];
  for (let i = hIdx+1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every(c => c===null||c==='')) continue;
    const naam = String(row[ci.rider]??'').replace(/\u00a0/g,' ').trim();
    const team = String(row[ci.team]??'').trim();
    if (!naam) continue;
    const rnkRaw = String(row[ci.rnk]??'').trim().toUpperCase();
    const isDNF  = rnkRaw === 'DNF';
    const isDNS  = rnkRaw === 'DNS';

    let pts_rit=0, pts_gc=0, pts_points=0, pts_berg=0, pts_jeugd=0, pts_bonus=0;

    if (type === 'rit') {
      if (!isDNF && !isDNS) pts_rit = ritPts(rnkRaw);
      if (isDNF && winTeam && team === winTeam) pts_bonus = 5;
      pts_gc     = dagKlasPts(ci.gc     !== undefined ? row[ci.gc]     : null);
      pts_points = dagKlasPts(ci.points !== undefined ? row[ci.points] : null);
      pts_berg   = dagKlasPts(ci.berg   !== undefined ? row[ci.berg]   : null);
      pts_jeugd  = dagKlasPts(ci.jeugd  !== undefined ? row[ci.jeugd]  : null);
    } else if (type === 'eind-algemeen') {
      pts_rit = eindAlgPts(rnkRaw, uitgereden);
    } else if (type === 'eind-punten') {
      pts_points = eindNevenPts(rnkRaw, false);
    } else if (type === 'eind-berg') {
      pts_berg = eindNevenPts(rnkRaw, false);
    } else if (type === 'eind-jongeren') {
      pts_jeugd = eindNevenPts(rnkRaw, true);
    } else if (type === 'dag-algemeen') {
      pts_gc = dagKlasPts(rnkRaw);
    } else if (type === 'dag-punten') {
      pts_points = dagKlasPts(rnkRaw);
    } else if (type === 'dag-berg') {
      pts_berg = dagKlasPts(rnkRaw);
    } else if (type === 'dag-jongeren') {
      pts_jeugd = dagKlasPts(rnkRaw);
    }

    const totaal = pts_rit + pts_gc + pts_points + pts_berg + pts_jeugd + pts_bonus;
    rijen.push({
      renner_naam: naam, team_naam: team, rnk: rnkRaw,
      pts_rit, pts_gc, pts_points, pts_berg, pts_jeugd, pts_bonus, totaal
    });
  }
  return rijen;
}

window.processSheets = async function() {
  const koersId    = document.getElementById('imp-koers-sel').value;
  const type       = document.getElementById('imp-type')?.value || 'rit';
  const uitgereden = parseInt(document.getElementById('imp-uitgereden')?.value) || 150;

  if (!koersId) { alert('Kies eerst een koers.'); return; }
  const toProcess = xlWorkbook.SheetNames.filter(n => xlSelSheets.has(n));
  if (!toProcess.length) { alert('Selecteer minstens één tabblad.'); return; }

  document.getElementById('imp-prog-card').style.display = 'block';
  document.getElementById('imp-result-wrap').style.display = 'none';
  const koersNaam = getState().koersen.find(k => k.id === koersId)?.naam || '';
  const log = document.getElementById('prog-log');
  log.innerHTML = '';
  const results = [];

  for (let i = 0; i < toProcess.length; i++) {
    const sn  = toProcess[i];
    const pct = Math.round((i / toProcess.length) * 100);
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('prog-pct').textContent  = pct + '%';
    document.getElementById('prog-lbl').textContent  = `Verwerken: ${sn}`;

    const ws   = xlWorkbook.Sheets[sn];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const rijen = _berekenRijen(data, type, uitgereden);

    const { data: uitslag, error: uErr } = await sb.from('uitslagen').upsert({
      koers_id:    koersId,
      sheet_naam:  sn,
      type:        type,
      rit_nummer:  type === 'rit' ? (parseInt(sn.replace(/\D/g, '')) || null) : null,
      imported_by: getState().profile.id,
    }, { onConflict: 'koers_id,sheet_naam' }).select().single();

    if (uErr) { log.innerHTML += `<div>✗ ${sn}: ${uErr.message}</div>`; continue; }

    await sb.from('uitslag_rijen').delete().eq('uitslag_id', uitslag.id);
    if (rijen.length) {
      // Batch insert van 500
      for (let b = 0; b < rijen.length; b += 500) {
        await sb.from('uitslag_rijen').insert(
          rijen.slice(b, b + 500).map(r => ({ uitslag_id: uitslag.id, ...r }))
        );
      }
    }

    const scorers = rijen.filter(r => r.totaal > 0).length;
    log.innerHTML += `<div>✓ ${sn} (${TYPE_LABELS[type]||type}): ${rijen.length} renners · ${scorers} scoren</div>`;
    log.scrollTop = log.scrollHeight;
    results.push({ sn, rijen });
    await new Promise(r => setTimeout(r, 20));
  }

  document.getElementById('prog-fill').style.width = '100%';
  document.getElementById('prog-pct').textContent  = '100%';
  document.getElementById('prog-lbl').textContent  = 'Klaar!';

  // Herlaad cache
  const { data: uitslagenMeta } = await sb.from('uitslagen').select('id, koers_id, sheet_naam, type');
  getState().uitslagen = uitslagenMeta || [];
  const { data: rijen } = await sb.from('uitslag_rijen').select('*, uitslagen(type, koers_id)');
  getState().allUitslag_rijen = (rijen || []).map(r => {
    const u = (getState().uitslagen || []).find(x => x.id === r.uitslag_id);
    return { ...r, type: u?.type || 'rit', koers_id: u?.koers_id, sheet_naam: u?.sheet_naam || '' };
  });

  // Toon resultaat
  const top = results.map(({ sn, rijen }) => {
    const top3 = rijen.filter(r => r.totaal > 0).sort((a, b) => b.totaal - a.totaal).slice(0, 3);
    return `<div class="rit-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
      <span class="badge bg">${koersNaam}</span>
      <span class="badge bb">${TYPE_LABELS[type]||type}</span>
      <span style="font-size:12px;font-weight:500">${sn}</span>
      <span class="badge" style="margin-left:auto">${rijen.filter(r=>r.totaal>0).length} scorers</span>
      <span style="font-size:11px;color:var(--text2);margin-left:4px">▾</span>
    </div>
    <div class="rit-body">
      <table><thead><tr><th>#</th><th>Renner</th><th>Pos</th><th>Punten</th></tr></thead>
      <tbody>${top3.map((r, i) => `<tr>
        <td class="${['rg','rs','rb'][i]||''}">${i+1}</td>
        <td>${r.renner_naam}</td><td>${r.rnk}</td>
        <td><span class="pts-pill pts-pos">+${r.totaal}</span></td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  }).join('');

  document.getElementById('imp-result-wrap').style.display = 'block';
  document.getElementById('imp-result-wrap').innerHTML =
    `<div class="card"><div class="card-title">Resultaten</div>${top}</div>`;
  renderUitslagenTab();
};

window.deleteUitslag = async function(id) {
  await sb.from('uitslagen').delete().eq('id', id);
  getState().allUitslag_rijen = getState().allUitslag_rijen.filter(r => r.uitslag_id !== id);
  getState().uitslagen = (getState().uitslagen || []).filter(u => u.id !== id);
  renderUitslagenTab();
};

window.deleteAllUitslagen = async function() {
  await sb.from('uitslag_rijen').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await sb.from('uitslagen').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  getState().allUitslag_rijen = [];
  getState().uitslagen = [];
  renderUitslagenTab();
};

// ============================================================
// CSV RENNERS TAB
// ============================================================
function renderCsvTab() {
  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">Renners importeren via CSV</div>
      <div class="alert ai" style="margin-bottom:.8rem">
        Ondersteunde formaten per rij:<br>
        <code>naam;ploeg;kostprijs</code> &nbsp;·&nbsp;
        <code>naam;;kostprijs</code> (lege ploeg) &nbsp;·&nbsp;
        <code>naam;kostprijs</code> (enkel naam+kostprijs)<br>
        <span style="font-size:11px">
          Bestaande renners worden bijgewerkt. Nieuwe renners worden toegevoegd.<br>
          <strong>Koers-deelname</strong> stel je apart in via het tabblad <strong>Koersen</strong>.
        </span>
      </div>
      <textarea class="csv-a" id="csv-in"
        placeholder="Tadej Pogacar;UAE Team Emirates;95&#10;Jonas Vingegaard;Team Visma | Lease a Bike;92"></textarea>
      <div style="display:flex;gap:7px;margin-bottom:8px">
        <button class="btn btn-primary" onclick="importCsvRenners()">Importeer</button>
        <label class="btn" style="cursor:pointer">
          Bestand
          <input type="file" accept=".csv,.txt" style="display:none" onchange="loadCsvFile(event)"/>
        </label>
      </div>
      <div id="csv-res" style="display:none"></div>
    </div>`;
}

window.loadCsvFile = function(e) {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = ev => { document.getElementById('csv-in').value = ev.target.result.trim(); };
  rd.readAsText(f);
};

window.importCsvRenners = async function() {
  const raw = document.getElementById('csv-in').value.trim();
  if (!raw) return;
  loading(true);
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
  let added = 0, updated = 0, errors = [];
  const toInsert = [];

  for (const line of lines) {
    const p = line.split(';');
    if (p.length < 2) { errors.push(`Ongeldig formaat: ${line}`); continue; }
    const naam = p[0].trim();
    if (!naam) { errors.push(`Lege naam: ${line}`); continue; }
    let ploeg, kostprijs;
    if (p.length >= 3 && isNaN(parseInt(p[1].trim()))) {
      ploeg = p[1].trim(); kostprijs = parseInt(p[2].trim());
    } else if (p.length >= 2 && !isNaN(parseInt(p[1].trim()))) {
      ploeg = ''; kostprijs = parseInt(p[1].trim());
    } else {
      ploeg = p[1].trim(); kostprijs = parseInt(p[2].trim());
    }
    if (isNaN(kostprijs)) { errors.push(`Ongeldige kostprijs: ${line}`); continue; }
    const existing = getState().renners.find(r => r.naam.toLowerCase().trim() === naam.toLowerCase().trim());
    if (existing) {
      const { error } = await sb.from('renners').update({ ploeg, kostprijs }).eq('id', existing.id);
      if (!error) { existing.ploeg = ploeg; existing.kostprijs = kostprijs; updated++; }
      else errors.push(`Update mislukt voor ${naam}: ${error.message}`);
    } else {
      toInsert.push({ naam, ploeg, kostprijs });
    }
  }

  const BATCH = 500;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { data: inserted, error } = await sb.from('renners').insert(batch).select();
    if (!error && inserted) {
      inserted.forEach(nr => { getState().renners.push({ ...nr, koers_ids: [] }); added++; });
    } else if (error) {
      errors.push(`Batch insert mislukt: ${error.message}`);
    }
  }

  loading(false);
  let msg = `Import klaar: <strong>${added}</strong> toegevoegd, <strong>${updated}</strong> bijgewerkt.`;
  if (errors.length) {
    msg += `<br><span style="color:var(--red-text);font-size:11px">
      ${errors.slice(0, 5).join('<br>')}${errors.length > 5 ? `<br>… +${errors.length - 5} anderen` : ''}
    </span>`;
  }
  showAlert('csv-res', msg, errors.length && !added && !updated ? 'ad' : 'as');
};
