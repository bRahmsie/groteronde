import { sb } from './supabase.js';
import { loading, showAlert } from './helpers.js';
import {
  state, loadAllData,
  renderCompPage, renderSelectiePage, renderRennerList,
  renderMijnPloeg, renderKlassement, renderPloegen,
} from './pages.js';

// XLSX via CDN — geladen na imports
(function() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  document.head.appendChild(s);
})();

// ============================================================
// AUTH
// ============================================================
window.switchAuth = function(t) {
  ['login','register'].forEach(x => {
    document.getElementById('tab-'+x).classList.toggle('active', x === t);
    document.getElementById(x+'-form').style.display = x === t ? 'block' : 'none';
  });
};

window.doLogin = async function() {
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
  if (data?.session) {
    await handleSession(data.session);
  }
};

window.doRegister = async function() {
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
};

window.doLogout = async function() {
  await sb.auth.signOut();
};

// ============================================================
// SESSION HANDLER
// ============================================================
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
    if (!profile) {
      loading(false);
      showAlert('lerr', 'Profiel niet gevonden.');
      return;
    }
    state.profile = profile;

    // Actieve competitie
    const { data: teams } = await sb
      .from('user_teams').select('competitie').eq('user_id', profile.id).limit(1);
    window._activeComp = teams?.[0]?.competitie || 'normal';

    // Alle data laden
    await loadAllData();

  } catch(e) {
    console.error('handleSession fout:', e);
    loading(false);
    showAlert('lerr', 'Fout bij laden: ' + e.message);
    return;
  }

  loading(false);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  document.getElementById('nav-admin').style.display =
    state.profile.is_admin ? 'inline-block' : 'none';
  goPage('competitie');
}

// Uitloggen via onAuthStateChange
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    state.profile = null;
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    loading(false);
  }
});

// Bestaande sessie bij pagina laden
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await handleSession(session);
  } else {
    loading(false);
  }
})();

// ============================================================
// NAVIGATIE
// ============================================================
window.goPage = function(p) {
  ['competitie','selectie','mijnploeg','klassement','ploegen','admin'].forEach(x => {
    const pg = document.getElementById('page-'+x); if (pg) pg.classList.toggle('active', x === p);
    const t = document.getElementById('nav-'+x);
    if (t) t.classList.toggle('active', x === p);
  });
  if (p === 'competitie') renderCompPage();
  if (p === 'selectie')   renderSelectiePage();
  if (p === 'mijnploeg')  renderMijnPloeg();
  if (p === 'klassement') renderKlassement();
  if (p === 'ploegen')    renderPloegen();
  if (p === 'admin') {
    import('./admin.js')
      .then(m => m.renderAdminPage())
      .catch(e => {
        document.getElementById('page-admin').innerHTML =
          `<div style="padding:1rem"><div class="alert ad">Admin laadprobleem: ${e.message}</div></div>`;
      });
  }
};

// ============================================================
// COMPETITIE ACTIES
// ============================================================
window.savePloegNaam = async function(comp) {
  comp = comp || window._activeComp || 'normal';
  const naam = document.getElementById('pn-' + comp)?.value.trim() || '';
  if (!state.myTeams[comp]) {
    const { data } = await sb.from('user_teams')
      .insert({ user_id: state.profile.id, competitie: comp, ploeg_naam: naam })
      .select().single();
    if (data) state.myTeams[comp] = { id: data.id, ploeg_naam: naam, renner_ids: [] };
  } else {
    await sb.from('user_teams').update({ ploeg_naam: naam }).eq('id', state.myTeams[comp].id);
    state.myTeams[comp].ploeg_naam = naam;
  }
  const el = document.getElementById('pn-saved-' + comp);
  if (el) {
    el.style.display = 'block';
    clearTimeout(window._pnt);
    window._pnt = setTimeout(() => el.style.display = 'none', 2000);
  }
  renderCompPage();
};

window.switchComp = async function(comp) {
  if (!state.myTeams[comp]) {
    const { data } = await sb.from('user_teams')
      .insert({ user_id: state.profile.id, competitie: comp, ploeg_naam: '' })
      .select().single();
    if (data) state.myTeams[comp] = { id: data.id, ploeg_naam: '', renner_ids: [] };
  }
  window._activeComp = comp;
  const activePage = document.querySelector('.page.active')?.id;
  if (activePage === 'page-selectie')   renderSelectiePage();
  if (activePage === 'page-mijnploeg')  renderMijnPloeg();
  if (activePage === 'page-competitie') renderCompPage();
};

window.goToSelectie = async function(comp) {
  if (!state.myTeams[comp]) {
    const { data } = await sb.from('user_teams')
      .insert({ user_id: state.profile.id, competitie: comp, ploeg_naam: '' })
      .select().single();
    if (data) state.myTeams[comp] = { id: data.id, ploeg_naam: '', renner_ids: [] };
  }
  window._activeComp = comp;
  window.goPage('selectie');
};

// ============================================================
// SELECTIE ACTIES
// ============================================================
window.setKF = function(koersId) {
  window._activeKF = koersId;
  window._filterFT = '';
  const pills = document.querySelectorAll('.pill-filter');
  pills.forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    el.classList.toggle('active',
      koersId === null ? oc.includes('null') : oc.includes("'" + koersId + "'")
    );
  });
  const ftEl = document.getElementById('ft');
  if (ftEl) {
    // rebuild ploegen dropdown via renderRennerList
  }
  renderRennerList();
};

window.toggleRenner = async function(rennerId) {
  const comp = window._activeComp || 'normal';
  const team = state.myTeams[comp];
  if (!team) return;
  const sel  = team.renner_ids;
  const isIn = sel.includes(rennerId);
  if (isIn) {
    await sb.from('user_team_renners').delete()
      .eq('team_id', team.id).eq('renner_id', rennerId);
    team.renner_ids = sel.filter(id => id !== rennerId);
  } else {
    await sb.from('user_team_renners').insert({ team_id: team.id, renner_id: rennerId });
    team.renner_ids = [...sel, rennerId];
  }
  renderRennerList();
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
  const comp = window._activeComp || 'normal';
  const team = state.myTeams[comp];
  if (!team) return;
  await sb.from('user_team_renners').delete()
    .eq('team_id', team.id).eq('renner_id', rennerId);
  team.renner_ids = team.renner_ids.filter(id => id !== rennerId);
  renderMijnPloeg();
};

window.resetPloeg = async function() {
  if (!confirm('Wis je volledige selectie?')) return;
  const comp = window._activeComp || 'normal';
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
