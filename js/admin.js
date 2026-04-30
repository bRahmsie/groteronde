import { sb } from './supabase.js';
import { jersey, parseSheet, fmtDL, cDown, loading, showAlert } from './helpers.js';
import { state, loadAllData, renderSelectiePage, renderRennerList } from './pages.js';

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
    el.classList.toggle('active', el.id === 'at-'+t);
  });
  const handlers = {
    gebruikers: renderGebruikers,
    normaal: () => renderSettingsTab('normal'),
    pro:     () => renderSettingsTab('pro'),
    koersen: renderKoersenTab,
    renners: renderRennersTab,
    uitslagen: renderUitslagenTab,
    csv: renderCsvTab,
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

  const total = users?.length || 0;
  const s_norm = state.settings['normal'] || {};
  const s_pro  = state.settings['pro']   || {};

  const rows = (users || []).map(u => {
    const teams = u.user_teams || [];
    const initials = u.naam.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    return teams.length === 0
      ? `<div class="user-row">
          <div class="avatar">${initials}</div>
          <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500">${u.naam}</div><div style="font-size:11px;color:var(--text2)">${u.email}</div></div>
          <span class="badge">Geen competitie</span>
        </div>`
      : teams.map(t => {
          const maxR = t.competitie==='normal' ? s_norm.max_renners : s_pro.max_renners;
          const n = (t.user_team_renners||[]).length;
          const compleet = n === maxR;
          return `<div class="user-row">
            <div class="avatar">${initials}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500">${u.naam}${t.ploeg_naam?` <span style="font-weight:400;color:var(--text2)">· ${t.ploeg_naam}</span>`:''}</div>
              <div style="font-size:11px;color:var(--text2)">${u.email}</div>
            </div>
            <span class="badge ${t.competitie==='normal'?'bg':'by'}" style="margin-right:6px">${t.competitie==='normal'?'Normaal':'Pro'}</span>
            <span class="badge ${compleet?'bg':'br'}">${n}/${maxR}${compleet?' ✓':''}</span>
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
    </div>
  `;
}

// ============================================================
// INSTELLINGEN TAB
// ============================================================
function renderSettingsTab(comp) {
  const s = state.settings[comp] || {};
  const pre = comp === 'normal' ? 'n' : 'p';
  const label = comp === 'normal' ? 'Normaal' : 'Pro';
  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">Instellingen — ${label}</div>
      <div class="srow"><div class="slbl">Max. renners</div><input type="number" style="width:75px;margin-bottom:0" id="${pre}-mr" value="${s.max_renners||15}" min="1" max="30"/></div>
      <div class="srow"><div class="slbl">Budget (kostprijs)</div><input type="number" style="width:75px;margin-bottom:0" id="${pre}-b" value="${s.budget||1000}" min="100"/></div>
      <div class="srow"><div class="slbl">Max. per wielerploeg</div><input type="number" style="width:75px;margin-bottom:0" id="${pre}-mt" value="${s.max_per_team||3}" min="1" max="10"/></div>
      <div class="srow">
        <div class="slbl">Deadline</div>
        <input type="datetime-local" id="${pre}-dl" value="${s.deadline?s.deadline.slice(0,16):''}" style="width:190px;margin-bottom:0"/>
        <button class="btn btn-sm btn-danger" onclick="clearDeadline('${comp}')">Wis</button>
      </div>
      ${s.deadline?`<div style="margin-bottom:6px">${(()=>{const cd=cDown(s.deadline);return`<span class="countdown ${cd.c}">⏱ ${cd.t} — ${fmtDL(s.deadline)}</span>`;})()}</div>`:''}
      <div id="sett-res" style="display:none"></div>
      <button class="btn btn-primary" onclick="saveSettings('${comp}')">Opslaan</button>
    </div>
  `;
}

window.saveSettings = async function(comp) {
  const pre = comp === 'normal' ? 'n' : 'p';
  const dlVal = document.getElementById(`${pre}-dl`).value;
  const updates = {
    max_renners:  parseInt(document.getElementById(`${pre}-mr`).value) || 15,
    budget:       parseInt(document.getElementById(`${pre}-b`).value)  || 1000,
    max_per_team: parseInt(document.getElementById(`${pre}-mt`).value) || 3,
    deadline:     dlVal || null,
    updated_at:   new Date().toISOString(),
  };
  const { error } = await sb.from('competition_settings').update(updates).eq('type', comp);
  if (error) { showAlert('sett-res', error.message); return; }
  state.settings[comp] = { ...state.settings[comp], ...updates };
  showAlert('sett-res', 'Opgeslagen!', 'as');
};

window.clearDeadline = async function(comp) {
  const pre = comp === 'normal' ? 'n' : 'p';
  document.getElementById(`${pre}-dl`).value = '';
  await sb.from('competition_settings').update({ deadline: null }).eq('type', comp);
  state.settings[comp] = { ...state.settings[comp], deadline: null };
  renderSettingsTab(comp);
};

// ============================================================
// KOERSEN TAB
// ============================================================
async function renderKoersenTab() {
  const list = state.koersen.map((k,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border)">
      <span style="font-size:13px;flex:1">🏁 ${k.naam}</span>
      <input type="text" value="${k.naam}" style="width:130px;margin-bottom:0;font-size:12px" onchange="renameKoers('${k.id}',this.value)"/>
      <button class="btn btn-sm btn-danger" onclick="deleteKoers('${k.id}')">✕</button>
    </div>`).join('');
  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">Koersen</div>
      <div style="display:flex;gap:7px;margin-bottom:10px">
        <input type="text" id="new-koers" placeholder="bv. Giro, Tour..." style="margin-bottom:0;flex:1"/>
        <button class="btn btn-primary" onclick="addKoers()">+</button>
      </div>
      <div id="koers-list">${list || '<div style="font-size:13px;color:var(--text2)">Nog geen koersen.</div>'}</div>
    </div>
  `;
}

window.addKoers = async function() {
  const naam = document.getElementById('new-koers').value.trim();
  if (!naam) return;
  const { data, error } = await sb.from('koersen').insert({ naam }).select().single();
  if (error) { alert(error.message); return; }
  state.koersen.push(data);
  document.getElementById('new-koers').value = '';
  renderKoersenTab();
};

window.renameKoers = async function(id, naam) {
  await sb.from('koersen').update({ naam: naam.trim() }).eq('id', id);
  const k = state.koersen.find(x => x.id === id);
  if (k) k.naam = naam.trim();
};

window.deleteKoers = async function(id) {
  if (!confirm('Koers verwijderen? Dit verwijdert ook alle bijhorende uitslagen.')) return;
  await sb.from('koersen').delete().eq('id', id);
  state.koersen = state.koersen.filter(k => k.id !== id);
  renderKoersenTab();
};

// ============================================================
// RENNERS TAB
// ============================================================
async function renderRennersTab() {
  const html = state.renners.map(r => {
    const cbs = state.koersen.map(k => {
      const checked = r.koers_ids?.includes(k.id) ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;margin-right:8px;cursor:pointer">
        <input type="checkbox" ${checked} onchange="toggleRennerKoers('${r.id}','${k.id}',this.checked)" style="width:auto;margin-bottom:0"/>${k.naam}
      </label>`;
    }).join('');
    return `<div style="padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
        ${jersey(r.ploeg,18)}
        <div style="flex:1;min-width:0"><span style="font-size:12px;font-weight:500">${r.naam}</span> <span style="font-size:11px;color:var(--text2)">${r.ploeg}</span></div>
        <input type="number" style="width:60px;margin-bottom:0;text-align:center;font-size:12px" value="${r.kostprijs}" min="1" max="9999"
          onchange="updateKostprijs('${r.id}',this.value)" title="Kostprijs"/>
        <span style="font-size:11px;color:var(--text2)">kostprijs</span>
      </div>
      ${state.koersen.length ? `<div style="padding-left:25px">${cbs}</div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">Renners &amp; kostprijs</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">Pas kostprijs aan en vink koersen aan per renner.</div>
      ${html || '<div style="font-size:13px;color:var(--text2)">Geen renners.</div>'}
    </div>
  `;
}

window.updateKostprijs = async function(id, val) {
  const v = parseInt(val) || 1;
  await sb.from('renners').update({ kostprijs: v }).eq('id', id);
  const r = state.renners.find(x => x.id === id);
  if (r) r.kostprijs = v;
};

window.toggleRennerKoers = async function(rennerId, koersId, checked) {
  if (checked) {
    await sb.from('renner_koersen').insert({ renner_id: rennerId, koers_id: koersId });
  } else {
    await sb.from('renner_koersen').delete().eq('renner_id', rennerId).eq('koers_id', koersId);
  }
  const r = state.renners.find(x => x.id === rennerId);
  if (!r) return;
  if (checked && !r.koers_ids.includes(koersId)) r.koers_ids.push(koersId);
  if (!checked) r.koers_ids = r.koers_ids.filter(k => k !== koersId);
};

// ============================================================
// UITSLAGEN TAB (Excel import)
// ============================================================
let xlWorkbook = null, xlSelSheets = new Set();

async function renderUitslagenTab() {
  // Bestaande uitslagen ophalen
  const { data: uitslagen } = await sb
    .from('uitslagen')
    .select('*, koersen(naam)')
    .order('imported_at', { ascending: false });

  const ovHtml = (uitslagen||[]).length === 0
    ? '<div style="font-size:13px;color:var(--text2)">Nog geen uitslagen.</div>'
    : (uitslagen||[]).map(u => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
          <span class="badge bg">${u.koersen?.naam||'?'}</span>
          <span style="font-size:12px;font-weight:500">${u.sheet_naam}</span>
          <span style="font-size:11px;color:var(--text2);margin-left:auto">${new Date(u.imported_at).toLocaleDateString('nl-BE')}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteUitslag('${u.id}')">✕</button>
        </div>`).join('');

  const koersOpts = state.koersen.map(k => `<option value="${k.id}">${k.naam}</option>`).join('');

  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">📥 Excel-uitslag importeren</div>
      <div class="alert ai" style="margin-bottom:.8rem">
        Formaat per tabblad: <code>Rnk · Rider · Team · GC · Points · Berg · Jeugd</code>
      </div>
      <div class="drop-zone" id="drop-zone" onclick="document.getElementById('xl-input').click()"
        ondragover="event.preventDefault();this.classList.add('dv')"
        ondragleave="this.classList.remove('dv')"
        ondrop="handleDrop(event)">
        <div style="font-size:1.6rem;margin-bottom:.3rem">📂</div>
        <div style="font-size:13px;font-weight:500">Klik of sleep Excel-bestand</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">.xlsx — één tabblad per rit</div>
      </div>
      <input type="file" id="xl-input" accept=".xlsx" style="display:none" onchange="handleFile(this.files[0])"/>
    </div>
    <div class="card" id="sheets-card" style="display:none">
      <div class="sh">
        <div class="card-title" style="margin-bottom:0">Kies ritten &amp; koers</div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-sm" onclick="selAllSheets(true)">Alles</button>
          <button class="btn btn-sm" onclick="selAllSheets(false)">Geen</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:.8rem">
        <span style="font-size:12px;color:var(--text2);flex-shrink:0">Koers:</span>
        <select id="imp-koers-sel" style="width:auto;margin-bottom:0;flex:1">
          ${koersOpts || '<option value="">— Voeg eerst een koers toe —</option>'}
        </select>
      </div>
      <div id="sheet-pills" style="margin-bottom:.8rem"></div>
      <button class="btn btn-primary" onclick="processSheets()">▶ Verwerk geselecteerde ritten</button>
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
        <button class="btn btn-sm btn-danger" onclick="if(confirm('Alles wissen?'))deleteAllUitslagen()">Wis alles</button>
      </div>
      <div id="ov-uitslagen">${ovHtml}</div>
    </div>
  `;
}

window.handleDrop = function(ev) {
  ev.preventDefault();
  document.getElementById('drop-zone').classList.remove('dv');
  handleFile(ev.dataTransfer.files[0]);
};

window.handleFile = function(file) {
  if (!file?.name.endsWith('.xlsx')) { alert('Alleen .xlsx'); return; }
  const rd = new FileReader();
  rd.onload = e => {
    xlWorkbook = XLSX.read(e.target.result, { type:'array' });
    xlSelSheets = new Set(xlWorkbook.SheetNames);
    document.getElementById('sheets-card').style.display = 'block';
    renderSheetPills();
  };
  rd.readAsArrayBuffer(file);
};

function renderSheetPills() {
  document.getElementById('sheet-pills').innerHTML = xlWorkbook.SheetNames.map(n =>
    `<span class="sheet-pill${xlSelSheets.has(n)?' active':''}" onclick="toggleSheet('${n}')">${n}</span>`
  ).join('');
}

window.toggleSheet = function(n) {
  if (xlSelSheets.has(n)) xlSelSheets.delete(n); else xlSelSheets.add(n);
  renderSheetPills();
};
window.selAllSheets = function(v) {
  if (v) xlWorkbook.SheetNames.forEach(n => xlSelSheets.add(n)); else xlSelSheets.clear();
  renderSheetPills();
};

window.processSheets = async function() {
  const koersId = document.getElementById('imp-koers-sel').value;
  if (!koersId) { alert('Kies eerst een koers.'); return; }
  const toProcess = xlWorkbook.SheetNames.filter(n => xlSelSheets.has(n));
  if (!toProcess.length) { alert('Selecteer minstens één rit.'); return; }

  document.getElementById('imp-prog-card').style.display = 'block';
  document.getElementById('imp-result-wrap').style.display = 'none';
  const koersNaam = state.koersen.find(k => k.id === koersId)?.naam || '';
  const log = document.getElementById('prog-log');
  log.innerHTML = '';
  const results = [];

  for (let i = 0; i < toProcess.length; i++) {
    const sn = toProcess[i];
    const pct = Math.round((i / toProcess.length) * 100);
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('prog-pct').textContent = pct + '%';
    document.getElementById('prog-lbl').textContent = `Verwerken: ${sn}`;

    const ws = xlWorkbook.Sheets[sn];
    const data = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
    const parsed = parseSheet(sn, koersNaam, data);

    // Upsert uitslag record
    const { data: uitslag, error: uErr } = await sb.from('uitslagen').upsert({
      koers_id: koersId,
      sheet_naam: sn,
      type: 'rit',
      rit_nummer: parseInt(sn.replace(/\D/g,'')) || null,
      imported_by: state.profile.id,
    }, { onConflict: 'koers_id,sheet_naam' }).select().single();

    if (uErr) { log.innerHTML += `<div>✗ ${sn}: ${uErr.message}</div>`; continue; }

    // Verwijder oude rijen en insert nieuwe
    await sb.from('uitslag_rijen').delete().eq('uitslag_id', uitslag.id);
    const rows = parsed.rijen.map(r => ({
      uitslag_id:  uitslag.id,
      renner_naam: r.naam,
      team_naam:   r.team,
      rnk:         r.rnk,
      pts_rit:     r.pts_rit,
      pts_gc:      r.pts_gc,
      pts_points:  r.pts_points,
      pts_berg:    r.pts_berg,
      pts_jeugd:   r.pts_jeugd,
      pts_bonus:   r.pts_bonus,
      totaal:      r.totaal,
    }));
    if (rows.length) await sb.from('uitslag_rijen').insert(rows);

    const scorers = parsed.rijen.filter(r => r.totaal > 0).length;
    log.innerHTML += `<div>✓ ${sn}: ${parsed.rijen.length} renners · ${scorers} scoren</div>`;
    log.scrollTop = log.scrollHeight;
    results.push({ sn, rijen: parsed.rijen });
    await new Promise(r => setTimeout(r, 20));
  }

  document.getElementById('prog-fill').style.width = '100%';
  document.getElementById('prog-pct').textContent = '100%';
  document.getElementById('prog-lbl').textContent = 'Klaar! Data herladen…';

  // Herlaad uitslag rijen in state
  const { data: rijen } = await sb.from('uitslag_rijen').select('*, uitslagen(type, koers_id)');
  state.allUitslag_rijen = (rijen || []).map(r => ({
    ...r, type: r.uitslagen?.type || 'rit', koers_id: r.uitslagen?.koers_id,
  }));

  // Resultaat tonen
  const top = results.map(({ sn, rijen }) => {
    const top3 = rijen.filter(r=>r.totaal>0).sort((a,b)=>b.totaal-a.totaal).slice(0,3);
    return `<div class="rit-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
      <span class="badge bg">${koersNaam}</span><span style="font-size:12px;font-weight:500">${sn}</span>
      <span class="badge" style="margin-left:auto">${rijen.filter(r=>r.totaal>0).length} scorers</span>
      <span style="font-size:11px;color:var(--text2);margin-left:4px">▾</span>
    </div>
    <div class="rit-body">
      <table><thead><tr><th>#</th><th>Renner</th><th>Pos</th><th>Rit</th><th>GC</th><th>Punten</th><th>Berg</th><th>Jeugd</th><th>Bonus</th><th>Totaal</th></tr></thead>
      <tbody>${top3.map((r,i)=>`<tr>
        <td class="${['rg','rs','rb'][i]||''}">${i+1}</td><td>${r.naam}</td><td>${r.rnk}</td>
        <td>${r.pts_rit>0?`<span class="pts-pill pts-pos">+${r.pts_rit}</span>`:'-'}</td>
        <td>${r.pts_gc>0?`<span class="pts-pill pts-pos">+${r.pts_gc}</span>`:'-'}</td>
        <td>${r.pts_points>0?`<span class="pts-pill pts-pos">+${r.pts_points}</span>`:'-'}</td>
        <td>${r.pts_berg>0?`<span class="pts-pill pts-pos">+${r.pts_berg}</span>`:'-'}</td>
        <td>${r.pts_jeugd>0?`<span class="pts-pill pts-pos">+${r.pts_jeugd}</span>`:'-'}</td>
        <td>${r.pts_bonus>0?`<span class="pts-pill by">+${r.pts_bonus}</span>`:'-'}</td>
        <td><strong><span class="pts-pill pts-pos">+${r.totaal}</span></strong></td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  }).join('');

  document.getElementById('imp-result-wrap').style.display = 'block';
  document.getElementById('imp-result-wrap').innerHTML = `<div class="card"><div class="card-title">Resultaten</div>${top}</div>`;
  renderUitslagenTab();
};

window.deleteUitslag = async function(id) {
  await sb.from('uitslagen').delete().eq('id', id);
  renderUitslagenTab();
};
window.deleteAllUitslagen = async function() {
  await sb.from('uitslag_rijen').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await sb.from('uitslagen').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  state.allUitslag_rijen = [];
  renderUitslagenTab();
};

// ============================================================
// CSV RENNERS
// ============================================================
function renderCsvTab() {
  document.getElementById('admin-content').innerHTML = `
    <div class="card">
      <div class="card-title">Renners importeren via CSV</div>
      <div class="alert ai" style="margin-bottom:.8rem">Formaat: <code>naam;ploeg;kostprijs;Koers1;Koers2;...</code><br>
        <span style="font-size:11px">Bestaande renners worden bijgewerkt. Nieuwe koersen worden automatisch aangemaakt.</span></div>
      <textarea class="csv-a" id="csv-in" placeholder="Tadej Pogacar;UAE Team Emirates;95;Giro;Tour&#10;Jonas Vingegaard;Team Visma | Lease a Bike;92;Tour"></textarea>
      <div style="display:flex;gap:7px;margin-bottom:8px">
        <button class="btn btn-primary" onclick="importCsvRenners()">Importeer</button>
        <label class="btn" style="cursor:pointer">Bestand<input type="file" accept=".csv,.txt" style="display:none" onchange="loadCsvFile(event)"/></label>
      </div>
      <div id="csv-res" style="display:none"></div>
    </div>
  `;
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
  let added = 0, updated = 0, newK = [];

  for (const line of lines) {
    const p = line.split(';');
    if (p.length < 3) continue;
    const naam = p[0].trim(), ploeg = p[1].trim(), kostprijs = parseInt(p[2].trim());
    if (!naam || !ploeg || isNaN(kostprijs)) continue;
    const koersNamen = p.slice(3).map(k => k.trim()).filter(k => k);

    // Koersen aanmaken indien nodig
    const koersIds = [];
    for (const kn of koersNamen) {
      let k = state.koersen.find(x => x.naam.toLowerCase() === kn.toLowerCase());
      if (!k) {
        const { data } = await sb.from('koersen').insert({ naam: kn }).select().single();
        if (data) { state.koersen.push(data); k = data; newK.push(kn); }
      }
      if (k) koersIds.push(k.id);
    }

    // Renner upsert
    const existing = state.renners.find(r => r.naam.toLowerCase() === naam.toLowerCase());
    if (existing) {
      await sb.from('renners').update({ ploeg, kostprijs }).eq('id', existing.id);
      existing.ploeg = ploeg; existing.kostprijs = kostprijs;
      // Koers-koppelingen resetten
      await sb.from('renner_koersen').delete().eq('renner_id', existing.id);
      if (koersIds.length) await sb.from('renner_koersen').insert(koersIds.map(kid => ({ renner_id: existing.id, koers_id: kid })));
      existing.koers_ids = koersIds;
      updated++;
    } else {
      const { data: nr } = await sb.from('renners').insert({ naam, ploeg, kostprijs }).select().single();
      if (nr) {
        if (koersIds.length) await sb.from('renner_koersen').insert(koersIds.map(kid => ({ renner_id: nr.id, koers_id: kid })));
        state.renners.push({ ...nr, koers_ids: koersIds });
        added++;
      }
    }
  }

  loading(false);
  let msg = `Import klaar: <strong>${added}</strong> toegevoegd, <strong>${updated}</strong> bijgewerkt.`;
  if (newK.length) msg += ` Nieuwe koersen: <strong>${newK.join(', ')}</strong>`;
  showAlert('csv-res', msg, 'as');
};
