// ============================================================
// XLSX library (globaal beschikbaar via CDN)
// ============================================================
const xlsxScript = document.createElement('script');
xlsxScript.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
document.head.appendChild(xlsxScript);

import { sb } from './supabase.js';
import { loading, showAlert } from './helpers.js';
import {
  state, loadAllData,
  renderCompPage, renderSelectiePage, renderRennerList,
  renderMijnPloeg, renderKlassement,
} from './pages.js';
import { renderAdminPage, switchATab } from './admin.js';

// ============================================================
// AUTH
// ============================================================
export function switchAuth(t) {
  ['login','register'].forEach(x => {
    document.getElementById('tab-'+x).classList.toggle('active', x === t);
    document.getElementById(x+'-form').style.display = x === t ? 'block' : 'none';
  });
}
window.switchAuth = switchAuth;

export async function doLogin() {
  const email = document.getElementById('le').value.trim().toLowerCase();
  const pw    = document.getElementById('lp').value;
  document.getElementById('lerr').style.display = 'none';
  loading(true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    loading(false);
    showAlert('lerr', error.message);
    return;
  }
  // Manueel de session verwerken als onAuthStateChange traag is
  if (data?.session) {
    await handleSession(data.session);
  }
}
window.doLogin = doLogin;

export async function doRegister() {
  const naam  = document.getElementById('rn').value.trim();
  const email = document.getElementById('re').value.trim().toLowerCase();
  const pw    = document.getElementById('rp').value;
  document.getElementById('rerr').style.display = 'none';
  document.getElementById('rsuc').style.display = 'none';
  if (!naam || !email || !pw) { showAlert('rerr', 'Vul alle velden in.'); return; }
  if (pw.length < 6) { showAlert('rerr', 'Wachtwoord min. 6 tekens.'); return; }
  loading(true);
  const { error } = await sb.auth.signUp({ email, password: pw, options: { data: { naam } } });
  loading(false);
  if (error) { showAlert('rerr', error.message); return; }
  showAlert('rsuc', 'Account aangemaakt! Meld je nu aan.', 'as');
  ['rn','re','rp'].forEach(id => document.getElementById(id).value = '');
}
window.doRegister = doRegister;

export async function doLogout() {
  await sb.auth.signOut();
}
window.doLogout = doLogout;

// ============================================================
// NAVIGATIE
// ============================================================
export function goPage(p) {
  ['competitie','selectie','mijnploeg','klassement','admin'].forEach(x => {
    document.getElementById('page-'+x).classList.toggle('active', x === p);
    const t = document.getElementById('nav-'+x);
    if (t) t.classList.toggle('active', x === p);
  });
  if (p === 'competitie') renderCompPage();
  if (p === 'selectie')   renderSelectiePage();
  if (p === 'mijnploeg')  renderMijnPloeg();
  if (p === 'klassement') renderKlassement();
  if (p === 'admin')      renderAdminPage();
}
window.goPage = goPage;

// ============================================================
// COMPETITIE ACTIES
// ============================================================
window.savePloegNaam = async function() {
  const naam = document.getElementById('pn-input').value.trim();
  const comp = state.profile.competitie;
  if (!comp) return;
  const team = state.myTeams[comp];
  if (!team) return;
  await sb.from('user_teams').update({ ploeg_naam: naam }).eq('id', team.id);
  team.ploeg_naam = naam;
  state.profile.ploeg_naam = naam;
  const el = document.getElementById('pn-saved');
  el.style.display = 'block';
  clearTimeout(window._pnt);
  window._pnt = setTimeout(() => el.style.display = 'none', 2000);
};

window.selComp = async function(comp) {
  // Zorg dat er een team bestaat voor deze competitie
  if (!state.myTeams[comp]) {
    const { data } = await sb.from('user_teams')
      .insert({ user_id: state.profile.id, competitie: comp, ploeg_naam: '' })
      .select().single();
    if (data) state.myTeams[comp] = { id: data.id, ploeg_naam: '', renner_ids: [] };
  }
  state.profile.competitie = comp;
  renderCompPage();
};

window.bevestigComp = function() {
  if (!state.profile.competitie) { alert('Kies een competitie.'); return; }
  goPage('selectie');
};

// ============================================================
// SELECTIE ACTIES
// ============================================================
window.setKF = function(koersId) {
  const { activeKF: _kf, ...rest } = window; // workaround
  window._activeKF = koersId;
  // Update module-level variable via re-import is not possible;
  // gebruik global
  window.__activeKF = koersId;
  renderSelectiePage();
};

// Overschrijf activeKF in pages.js via global trick
Object.defineProperty(window, '__activeKF', {
  set(v) { window.__activeKF_val = v; },
  get()  { return window.__activeKF_val ?? null; },
});

window.toggleRenner = async function(rennerId) {
  const comp = state.profile.competitie || 'normal';
  const s    = state.settings[comp] || {};
  const team = state.myTeams[comp];
  if (!team) return;

  const sel  = team.renner_ids;
  const isIn = sel.includes(rennerId);

  if (isIn) {
    await sb.from('user_team_renners')
      .delete()
      .eq('team_id', team.id)
      .eq('renner_id', rennerId);
    team.renner_ids = sel.filter(id => id !== rennerId);
  } else {
    // upsert ipv insert — voorkomt 409 als rij al bestaat
    const { error } = await sb.from('user_team_renners')
      .upsert(
        { team_id: team.id, renner_id: rennerId },
        { onConflict: 'team_id,renner_id', ignoreDuplicates: true }
      );
    if (!error) team.renner_ids = [...sel, rennerId];
  }

  renderRennerList();
  renderSelectiePage();
};

window.showAlertBox = function(msg) {
  const b = document.getElementById('ab');
  if (!b) return;
  b.innerHTML = `<div class="alert ad">${msg}</div>`;
  b.style.display = 'block';
  clearTimeout(window._at);
  window._at = setTimeout(() => b.style.display = 'none', 2500);
};

// ============================================================
// MIJN PLOEG ACTIES
// ============================================================
window.removeRenner = async function(rennerId) {
  const comp = state.profile.competitie || 'normal';
  const team = state.myTeams[comp];
  if (!team) return;
  await sb.from('user_team_renners').delete()
    .eq('team_id', team.id).eq('renner_id', rennerId);
  team.renner_ids = team.renner_ids.filter(id => id !== rennerId);
  renderMijnPloeg();
};

window.resetPloeg = async function() {
  if (!confirm('Wis je volledige selectie?')) return;
  const comp = state.profile.competitie || 'normal';
  const team = state.myTeams[comp];
  if (!team) return;
  await sb.from('user_team_renners').delete().eq('team_id', team.id);
  team.renner_ids = [];
  renderMijnPloeg();
};

// ============================================================
// KLASSEMENT
// ============================================================
window.renderKlassement = renderKlassement;

// ============================================================
// AUTH STATE LISTENER — start app
// ============================================================
// Check of er al een sessie actief is bij pagina laden
const { data: { session: existingSession } } = await sb.auth.getSession();
if (existingSession) {
  // trigger manueel
}
async function handleSession(session) {
  if (!session?.user) {
    state.profile = null;
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    loading(false);
    return;
  }
  loading(true);
  try {
    // Profiel ophalen of aanmaken
    let { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (!profile) {
      const naam = session.user.user_metadata?.naam || session.user.email.split('@')[0];
      const { data: np } = await sb.from('profiles')
        .insert({ id: session.user.id, naam, email: session.user.email, is_admin: false })
        .select().single();
      profile = np;
    }
    if (!profile) { loading(false); showAlert('lerr', 'Profiel niet gevonden.'); return; }
    state.profile = profile;

    // Competitie
    const { data: teams } = await sb.from('user_teams').select('competitie, ploeg_naam').eq('user_id', profile.id).limit(1);
    state.profile.competitie = teams?.[0]?.competitie || null;
    state.profile.ploeg_naam = teams?.[0]?.ploeg_naam || '';

    // Settings
    const { data: settData } = await sb.from('competition_settings').select('*');
    state.settings = {};
    (settData || []).forEach(s => state.settings[s.type] = s);
    if (!state.settings['normal']) {
      await sb.from('competition_settings').upsert([
        { type:'normal', max_renners:15, budget:1000, max_per_team:3 },
        { type:'pro',    max_renners:10, budget: 750, max_per_team:2 },
      ], { onConflict:'type' });
      state.settings = {
        normal: { type:'normal', max_renners:15, budget:1000, max_per_team:3, deadline:null },
        pro:    { type:'pro',    max_renners:10, budget: 750, max_per_team:2, deadline:null },
      };
    }

    // Koersen
    const { data: koersData } = await sb.from('koersen').select('*').order('naam');
    state.koersen = koersData || [];

    // Renners
    const { data: rennerData } = await sb.from('renners').select('*, renner_koersen(koers_id)').order('naam');
    state.renners = (rennerData || []).map(r => ({ ...r, koers_ids: (r.renner_koersen||[]).map(rk=>rk.koers_id) }));

    // Mijn ploegen
    const { data: teamData } = await sb.from('user_teams').select('*, user_team_renners(renner_id)').eq('user_id', profile.id);
    state.myTeams = {};
    (teamData||[]).forEach(t => {
      state.myTeams[t.competitie] = { id:t.id, ploeg_naam:t.ploeg_naam, renner_ids:(t.user_team_renners||[]).map(u=>u.renner_id) };
    });

    // Uitslag rijen
    const { data: rijen } = await sb.from('uitslag_rijen').select('*, uitslagen(type, koers_id)');
    state.allUitslag_rijen = (rijen||[]).map(r => ({ ...r, type:r.uitslagen?.type||'rit', koers_id:r.uitslagen?.koers_id }));

  } catch(e) {
    console.error('handleSession fout:', e);
    loading(false);
    showAlert('lerr', 'Fout bij laden: ' + e.message);
    return;
  }

  loading(false);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  document.getElementById('nav-admin').style.display = state.profile.is_admin ? 'inline-block' : 'none';
  goPage('competitie');
}

sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    state.profile = null;
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    loading(false);
  }
});

// Check bestaande sessie bij pagina laden
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await handleSession(session);
  else loading(false);
})();
