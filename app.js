// ============================================================
// Trekking v1.5 — app.js
// Copyright (c) 2026 Lazzaro Serva - Centola
// Via Tasso, 28 – 84051 CENTOLA (SA) – Italia
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================

// ── Utility condivise ──
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Stato applicazione ──
let state = {
  view: 'percorsi',
  filtroPercorsi: 'attive', // 'attive' | 'archiviate'
  escursioneAttivaId: null,
  escursioni: [],
  partecipanti: [],
  equipaggiamento: [],
  waypoints: [],
  settings: { tema: 'giorno', fontScale: 'normale' },
  sync: { partecipanteId: null, nomeLocale: '', messaggi: [], posizioni: [], ultimoPoll: 0, condividoPosizione: false, pushAttivo: false },
  isAdmin: false,           // vero se su questo dispositivo è attiva la modalità Amministratore
  adminRecordExists: false, // vero se una password amministratore è già stata impostata (su questo device o importata)
};

let syncPollTimer = null;
let posizioneWatchId = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ============================================================
// AVVIO
// ============================================================
async function initApp() {
  state.settings.tema = await settingGet('tema', 'giorno');
  state.settings.fontScale = await settingGet('fontScale', 'normale');
  applyTheme();

  state.sync.partecipanteId = await getPartecipanteIdLocale();
  state.sync.nomeLocale = await getNomeLocale();

  state.escursioni = await dbGetAll(STORES.escursioni);
  state.escursioni.sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  if (state.escursioni.length && !state.escursioneAttivaId) {
    state.escursioneAttivaId = state.escursioni[0].id;
  }

  const adminRec = await dbGet(STORES.admin, 'admin');
  state.adminRecordExists = !!adminRec;
  if (adminRec && sessionStorage.getItem('trekking_admin_session') === '1') {
    state.isAdmin = true;
  }
  aggiornaAdminBadge();

  bindNav();
  bindGlobalUI();
  await refreshEscursioneCorrelati();
  render();
}

// ============================================================
// AMMINISTRATORE — password unica, hash locale (SubtleCrypto SHA-256),
// nessun account/server: la password (con hash+salt) viaggia tra device
// solo tramite l'esportazione/importazione dati (vedi storage.js).
// ============================================================
async function hashPassword(pw, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function adminImpostaPassword(pw) {
  const salt = uuid();
  const hash = await hashPassword(pw, salt);
  await dbSave(STORES.admin, { id: 'admin', salt, hash });
  state.isAdmin = true;
  state.adminRecordExists = true;
  sessionStorage.setItem('trekking_admin_session', '1');
}

async function adminAccedi(pw) {
  const rec = await dbGet(STORES.admin, 'admin');
  if (!rec) throw new Error('Nessuna password amministratore impostata su questo dispositivo.');
  const hash = await hashPassword(pw, rec.salt);
  if (hash !== rec.hash) throw new Error('Password amministratore errata.');
  state.isAdmin = true;
  sessionStorage.setItem('trekking_admin_session', '1');
}

function adminEsci() {
  state.isAdmin = false;
  sessionStorage.removeItem('trekking_admin_session');
}

function aggiornaAdminBadge() {
  const b = $('#adminBadge');
  if (b) b.classList.toggle('hidden', !state.isAdmin);
}

function applyTheme() {
  document.body.classList.toggle('tema-notte', state.settings.tema === 'notte');
  document.body.dataset.fontScale = state.settings.fontScale;
}

async function refreshEscursioneCorrelati() {
  if (!state.escursioneAttivaId) {
    state.partecipanti = []; state.equipaggiamento = []; state.waypoints = [];
    return;
  }
  state.partecipanti = await dbGetByIndex(STORES.partecipanti, 'escursioneId', state.escursioneAttivaId);
  state.equipaggiamento = await dbGetByIndex(STORES.equipaggiamento, 'escursioneId', state.escursioneAttivaId);
  state.waypoints = await dbGetByIndex(STORES.waypoints, 'escursioneId', state.escursioneAttivaId);
}

// ============================================================
// NAVIGAZIONE
// ============================================================
function bindNav() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      $$('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
}

function render() {
  fermaSyncPolling();
  const main = $('#main');
  main.innerHTML = '';
  if (state.view === 'percorsi') renderPercorsi(main);
  else if (state.view === 'bacheca') renderBacheca(main);
  else if (state.view === 'attrezzatura') renderAttrezzatura(main);
  else if (state.view === 'gruppo') renderGruppo(main);
  else if (state.view === 'impostazioni') renderImpostazioni(main);
}

// ============================================================
// VISTA: PERCORSI E ITINERARI
// ============================================================
function renderPercorsi(main) {
  const elenco = state.escursioni.filter(e => state.filtroPercorsi === 'archiviate' ? !!e.archiviata : !e.archiviata);
  const candidata = state.escursioni.find(e => e.id === state.escursioneAttivaId);
  const attiva = candidata && (state.filtroPercorsi === 'archiviate' ? !!candidata.archiviata : !candidata.archiviata) ? candidata : null;

  const wrap = document.createElement('div');
  wrap.className = 'view-percorsi';

  wrap.innerHTML = `
    <div class="section-head">
      <h2>🥾 Percorsi e Itinerari</h2>
      <div class="section-head-actions">
        <button class="btn-secondary" id="btnItinerariPredefiniti">📚 Itinerari predefiniti</button>
        <button class="btn-primary" id="btnNuovaEscursione">+ Nuova escursione</button>
      </div>
    </div>
    <div class="tab-row">
      <button class="tab-btn ${state.filtroPercorsi === 'attive' ? 'active' : ''}" data-f="attive">🥾 Attive</button>
      <button class="tab-btn ${state.filtroPercorsi === 'archiviate' ? 'active' : ''}" data-f="archiviate">🗄️ Archiviate</button>
    </div>
    <div class="escursioni-list" id="escursioniList"></div>
    ${attiva ? renderEscursioneDettaglioHtml(attiva)
      : `<p class="empty-hint">${elenco.length ? 'Seleziona un\'escursione dall\'elenco qui sopra.' : (state.filtroPercorsi === 'archiviate' ? 'Nessuna escursione archiviata.' : 'Nessuna escursione attiva. Creane una o passa alle Archiviate.')}</p>`}
  `;
  main.appendChild(wrap);

  $$('.tab-row .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filtroPercorsi = btn.dataset.f;
      render();
    });
  });

  const list = $('#escursioniList');
  elenco.forEach(e => {
    const card = document.createElement('button');
    card.className = 'escursione-chip' + (e.id === state.escursioneAttivaId ? ' active' : '');
    card.textContent = `${e.nome || 'Senza nome'} · ${e.difficolta || '-'}`;
    card.addEventListener('click', async () => {
      state.escursioneAttivaId = e.id;
      await refreshEscursioneCorrelati();
      render();
    });
    list.appendChild(card);
  });

  $('#btnNuovaEscursione').addEventListener('click', apriModalNuovaEscursione);
  $('#btnItinerariPredefiniti').addEventListener('click', apriModalItinerariPredefiniti);

  if (attiva) bindEscursioneDettaglio(attiva);
}

// ── Cancellazione definitiva di un'escursione e di tutti i dati collegati ──
async function eliminaEscursioneDefinitivamente(escursioneId) {
  const [part, equip, way, bach] = await Promise.all([
    dbGetByIndex(STORES.partecipanti, 'escursioneId', escursioneId),
    dbGetByIndex(STORES.equipaggiamento, 'escursioneId', escursioneId),
    dbGetByIndex(STORES.waypoints, 'escursioneId', escursioneId),
    dbGetByIndex(STORES.bacheca, 'escursioneId', escursioneId),
  ]);
  await Promise.all([
    ...part.map(p => dbDelete(STORES.partecipanti, p.id)),
    ...equip.map(x => dbDelete(STORES.equipaggiamento, x.id)),
    ...way.map(x => dbDelete(STORES.waypoints, x.id)),
    ...bach.map(x => dbDelete(STORES.bacheca, x.id)),
  ]);
  await dbDelete(STORES.escursioni, escursioneId);
}

function renderEscursioneDettaglioHtml(e) {
  const meteoInfo = e.meteoNote ? `<p class="meteo-note">🌦️ ${esc(e.meteoNote)}</p>` : '';
  return `
    <div class="escursione-detail">
      <div class="ed-head">
        <h3>${esc(e.nome || 'Senza nome')}</h3>
        <span class="badge diff-${esc(e.difficolta || 'T')}">${esc(e.difficolta || '-')}</span>
      </div>
      <div class="ed-meta">
        <span>📍 ${esc(e.partenza || '-')} → ${esc(e.arrivo || '-')}</span>
        <span>⏱ ${esc(e.durataStimata || '-')}</span>
        <span>⛰ +${esc(e.dislivelloPos || 0)}m / -${esc(e.dislivelloNeg || 0)}m</span>
        <span>📏 ${esc(e.lunghezzaKm || '-')} km</span>
      </div>
      ${meteoInfo}
      ${renderMeteoBoxHtml(e)}
      ${renderStatoSentieroBoxHtml(e)}
      <div id="mapPreview" class="map-preview">${e.tracciaGpx ? '<div id="leafletMap"></div>' : '<p class="empty-hint">Nessuna traccia GPX importata.</p>'}</div>
      ${e.tracciaGpx ? '<div class="elevation-box"><canvas id="elevationChart" height="90"></canvas></div>' : ''}
      <div class="ed-actions">
        <button class="btn-secondary" id="btnImportGpx">📥 Importa GPX/KML</button>
        <button class="btn-secondary" id="btnDownloadOffline">⬇️ Rendi disponibile offline</button>
        <button class="btn-secondary" id="btnCondividiEscursione">🔗 Condividi</button>
        <button class="btn-secondary" id="btnAggiungiWaypoint">📍 Punto d'interesse</button>
        <button class="btn-secondary" id="btnVaiEquipaggiamento">🧭 Equipaggiamento richiesto</button>
      </div>
      <input type="file" id="gpxFileInput" accept=".gpx,.kml" style="display:none">
      ${renderWaypointsListHtml()}
      <div class="section-head"><h4>🗄️ Archivio</h4></div>
      ${e.archiviata ? `
        <p class="hint-sync">Archiviata il ${e.archiviataIl ? new Date(e.archiviataIl).toLocaleString('it-IT') : '-'}. Il percorso e tutti i dati collegati restano salvati finché non li elimini definitivamente.</p>
        <div class="ed-actions">
          <button class="btn-secondary" id="btnRipristinaEscursione">↩️ Ripristina tra le attive</button>
          <button class="btn-danger-inline" id="btnEliminaEscursione">🗑️ Elimina definitivamente</button>
        </div>
      ` : `
        <p class="hint">Archivia un'escursione conclusa per toglierla dall'elenco Attive senza perdere il percorso: resta consultabile in Archiviate, da cui potrai anche eliminarla definitivamente.</p>
        <button class="btn-secondary" id="btnArchiviaEscursione">🗄️ Archivia questa escursione</button>
      `}
    </div>
  `;
}

// ============================================================
// METEO AUTOMATICO (Open-Meteo, geocoding + previsioni giornaliere)
// ============================================================
function renderMeteoBoxHtml(e) {
  const cache = e.meteoCache;
  if (!cache || !cache.giorno) {
    return `
      <div class="meteo-box" id="meteoBox">
        <button class="btn-secondary" id="btnAggiornaMeteo">🌦️ Scarica previsioni meteo</button>
        <p class="hint">Richiede una connessione internet al momento della richiesta. Usa il nome del luogo di partenza (o la traccia GPX, se già importata) per individuare le coordinate.</p>
      </div>`;
  }
  const [icona, testo] = descrizioneMeteo(cache.giorno.codice);
  const vecchia = (Date.now() - cache.ts) > METEO_CACHE_ORE * 3600 * 1000;
  return `
    <div class="meteo-box" id="meteoBox">
      <div class="meteo-oggi">
        <span class="meteo-icona">${icona}</span>
        <div>
          <strong>${esc(testo)}</strong>
          <div class="meteo-dettagli">🌡 ${cache.giorno.tempMin}° / ${cache.giorno.tempMax}°C · 🌧 ${cache.giorno.pioggiaMm} mm · 💨 ${cache.giorno.ventoMax} km/h</div>
          <div class="meteo-data">Previsione per ${esc(cache.giorno.data)} — ${esc(cache.luogo || '')}${vecchia ? ' · <span class="meteo-stantia">dati non aggiornati di recente</span>' : ''}</div>
        </div>
      </div>
      <button class="btn-link" id="btnAggiornaMeteo">🔄 Aggiorna previsioni</button>
    </div>`;
}

async function aggiornaMeteo(e) {
  try {
    let lat = e.meteoCache?.lat, lon = e.meteoCache?.lon, luogo = e.meteoCache?.luogo;

    // Preferisci le coordinate del primo punto della traccia GPX, se presente.
    if (e.tracciaGpx) {
      const punti = JSON.parse(e.tracciaGpx);
      if (punti.length) { lat = punti[0].lat; lon = punti[0].lon; luogo = e.partenza || 'Punto di partenza traccia'; }
    }
    if ((lat === undefined || lon === undefined) && e.partenza) {
      const res = await fetch(`${GEOCODING_API_URL}?name=${encodeURIComponent(e.partenza)}&count=1&language=it&format=json`);
      if (!res.ok) throw new Error('Geocoding non riuscito.');
      const json = await res.json();
      if (!json.results || !json.results.length) throw new Error(`Località "${e.partenza}" non trovata.`);
      lat = json.results[0].latitude; lon = json.results[0].longitude;
      luogo = [json.results[0].name, json.results[0].admin1].filter(Boolean).join(', ');
    }
    if (lat === undefined || lon === undefined) throw new Error('Inserisci un luogo di partenza o importa una traccia GPX.');

    const data = e.data || new Date().toISOString().slice(0, 10);
    const url = `${METEO_API_URL}?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto&start_date=${data}&end_date=${data}`;
    const res2 = await fetch(url);
    if (!res2.ok) throw new Error('Servizio meteo non raggiungibile.');
    const meteo = await res2.json();
    if (!meteo.daily || !meteo.daily.time || !meteo.daily.time.length) throw new Error('Nessuna previsione disponibile per questa data (oltre 16 giorni?).');

    e.meteoCache = {
      lat, lon, luogo, ts: Date.now(),
      giorno: {
        data: meteo.daily.time[0],
        codice: meteo.daily.weathercode[0],
        tempMin: Math.round(meteo.daily.temperature_2m_min[0]),
        tempMax: Math.round(meteo.daily.temperature_2m_max[0]),
        pioggiaMm: meteo.daily.precipitation_sum[0],
        ventoMax: Math.round(meteo.daily.windspeed_10m_max[0]),
      },
    };
    await dbSave(STORES.escursioni, e);
    render();
  } catch (err) {
    alert('Impossibile aggiornare il meteo: ' + err.message);
  }
}

// ============================================================
// STATO DEL SENTIERO — curato manualmente, con badge colorato
// ============================================================
function renderStatoSentieroBoxHtml(e) {
  const s = e.statoSentiero;
  const opz = STATO_SENTIERO_OPZIONI.find(o => o.key === (s?.categoria || 'aperto')) || STATO_SENTIERO_OPZIONI[0];
  return `
    <div class="stato-sentiero-box stato-${s?.categoria || 'aperto'}">
      <div class="ss-head">
        <span class="ss-badge">${opz.label}</span>
        <button class="btn-link" id="btnModificaStatoSentiero">✏️ Aggiorna</button>
      </div>
      ${s?.nota ? `<p class="ss-nota">${esc(s.nota)}</p>` : ''}
      ${s?.aggiornatoIl ? `<p class="ss-data">Aggiornato il ${new Date(s.aggiornatoIl).toLocaleString('it-IT')}${s.aggiornatoDa ? ' da ' + esc(s.aggiornatoDa) : ''}</p>` : ''}
    </div>`;
}

function apriModalStatoSentiero(e) {
  apriModal('🚧 Stato del sentiero', `
    <label>Stato</label>
    <select id="fSSCategoria">${STATO_SENTIERO_OPZIONI.map(o => `<option value="${o.key}" ${e.statoSentiero?.categoria === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
    <label>Note (opzionale)</label>
    <textarea id="fSSNota" placeholder="es. frana al km 3, deviazione segnalata">${esc(e.statoSentiero?.nota || '')}</textarea>
    ${syncAttivaPer(e) ? '<p class="hint">🔔 Salvando, verrà inviato automaticamente un avviso urgente (push) a tutto il gruppo.</p>' : ''}
    <button class="btn-primary" id="btnSalvaStatoSentiero">Salva</button>
  `);
  $('#btnSalvaStatoSentiero').addEventListener('click', async () => {
    const categoria = $('#fSSCategoria').value;
    const nota = $('#fSSNota').value.trim();
    e.statoSentiero = { categoria, nota, aggiornatoIl: Date.now(), aggiornatoDa: state.sync.nomeLocale || 'Tu' };
    await dbSave(STORES.escursioni, e);
    if (syncAttivaPer(e)) {
      const opz = STATO_SENTIERO_OPZIONI.find(o => o.key === categoria);
      const testo = `Stato sentiero aggiornato: ${opz.label}${nota ? ' — ' + nota : ''}`;
      try {
        await syncInviaMessaggio(e.codiceGruppo, { id: uuid(), autore: state.sync.nomeLocale || 'Anonimo', testo, urgente: true });
        await dbSave(STORES.bacheca, { id: uuid(), escursioneId: e.id, testo, data: Date.now(), autore: state.sync.nomeLocale || 'Tu' });
      } catch (err) { /* stato salvato comunque in locale; l'avviso al gruppo verrà ritentato al prossimo aggiornamento manuale */ }
    }
    chiudiModal();
    render();
  });
}

function renderWaypointsListHtml() {
  if (!state.waypoints.length) return '';
  const icone = Object.fromEntries(WAYPOINT_TIPI.map(t => [t.key, t.label.split(' ')[0]]));
  return `
    <div class="waypoints-box">
      <h4>📍 Punti d'interesse</h4>
      <ul class="waypoints-list">
        ${state.waypoints.map(w => `
          <li data-id="${w.id}">
            <span>${icone[w.tipo] || '📍'} <strong>${esc(w.nome)}</strong>${w.note ? ` — ${esc(w.note)}` : ''}</span>
            <button class="btn-rimuovi-waypoint" data-id="${w.id}" aria-label="Rimuovi">✕</button>
          </li>`).join('')}
      </ul>
    </div>
  `;
}

function bindEscursioneDettaglio(e) {
  $('#btnImportGpx').addEventListener('click', () => $('#gpxFileInput').click());
  $('#gpxFileInput').addEventListener('change', ev => importaGpx(e, ev.target.files[0]));
  $('#btnDownloadOffline').addEventListener('click', () => scaricaOffline(e));
  $('#btnCondividiEscursione').addEventListener('click', () => condividiEscursione(e));
  $('#btnAggiungiWaypoint').addEventListener('click', () => apriModalWaypoint(e));
  $('#btnAggiornaMeteo').addEventListener('click', () => aggiornaMeteo(e));
  $('#btnModificaStatoSentiero').addEventListener('click', () => apriModalStatoSentiero(e));
  $('#btnVaiEquipaggiamento').addEventListener('click', () => {
    state.view = 'attrezzatura';
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'attrezzatura'));
    render();
  });
  $$('.btn-rimuovi-waypoint').forEach(btn => {
    btn.addEventListener('click', async () => {
      await dbDelete(STORES.waypoints, btn.dataset.id);
      state.waypoints = state.waypoints.filter(w => w.id !== btn.dataset.id);
      render();
    });
  });
  const btnArchivia = $('#btnArchiviaEscursione');
  if (btnArchivia) btnArchivia.addEventListener('click', async () => {
    if (!confirm(`Archiviare "${e.nome || 'questa escursione'}"? Resterà salvata con il suo percorso: potrai ripristinarla o eliminarla definitivamente dalla scheda Archiviate.`)) return;
    e.archiviata = true; e.archiviataIl = Date.now();
    await dbSave(STORES.escursioni, e);
    state.escursioni = await dbGetAll(STORES.escursioni);
    render();
  });
  const btnRipristina = $('#btnRipristinaEscursione');
  if (btnRipristina) btnRipristina.addEventListener('click', async () => {
    e.archiviata = false;
    await dbSave(STORES.escursioni, e);
    state.escursioni = await dbGetAll(STORES.escursioni);
    state.filtroPercorsi = 'attive';
    render();
  });
  const btnElimina = $('#btnEliminaEscursione');
  if (btnElimina) btnElimina.addEventListener('click', async () => {
    if (!confirm(`Eliminare definitivamente "${e.nome || 'questa escursione'}"? L'operazione non è reversibile: verranno cancellati anche gruppo, equipaggiamento, punti d'interesse e note collegati a questa escursione.`)) return;
    await eliminaEscursioneDefinitivamente(e.id);
    state.escursioni = await dbGetAll(STORES.escursioni);
    if (state.escursioneAttivaId === e.id) {
      state.escursioneAttivaId = state.escursioni.find(x => !x.archiviata)?.id || null;
      await refreshEscursioneCorrelati();
    }
    render();
  });
  if (e.tracciaGpx) {
    disegnaMappa(e);
    disegnaProfiloAltimetrico(e);
  }
}

// ============================================================
// PUNTI D'INTERESSE (waypoint: acqua, rifugio, panorama, pericolo)
// ============================================================
function apriModalWaypoint(escursione) {
  apriModal('📍 Nuovo punto d\'interesse', `
    <label>Tipo</label>
    <select id="fWTipo">${WAYPOINT_TIPI.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}</select>
    <label>Nome</label>
    <input type="text" id="fWNome" placeholder="es. Fontana del Vallone">
    <div class="form-row">
      <div><label>Latitudine</label><input type="number" id="fWLat" step="0.00001" placeholder="es. 40.05123"></div>
      <div><label>Longitudine</label><input type="number" id="fWLon" step="0.00001" placeholder="es. 15.45678"></div>
    </div>
    <button class="btn-secondary" id="btnUsaPosizioneAttuale">📡 Usa posizione attuale</button>
    <label>Note (opzionale)</label>
    <input type="text" id="fWNote" placeholder="es. acqua non potabile in estate">
    <button class="btn-primary" id="btnSalvaWaypoint">Salva punto</button>
  `);
  $('#btnUsaPosizioneAttuale').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Geolocalizzazione non disponibile su questo dispositivo.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      $('#fWLat').value = pos.coords.latitude.toFixed(5);
      $('#fWLon').value = pos.coords.longitude.toFixed(5);
    }, () => alert('Impossibile ottenere la posizione. Verifica i permessi GPS.'), { enableHighAccuracy: true, timeout: 10000 });
  });
  $('#btnSalvaWaypoint').addEventListener('click', async () => {
    const nome = $('#fWNome').value.trim();
    const lat = parseFloat($('#fWLat').value);
    const lon = parseFloat($('#fWLon').value);
    if (!nome) { alert('Inserisci un nome per il punto.'); return; }
    if (isNaN(lat) || isNaN(lon)) { alert('Inserisci coordinate valide (o usa "Posizione attuale").'); return; }
    const w = await dbSave(STORES.waypoints, {
      id: uuid(), escursioneId: escursione.id,
      tipo: $('#fWTipo').value, nome, lat, lon,
      note: $('#fWNote').value.trim(),
    });
    state.waypoints.push(w);
    chiudiModal();
    render();
  });
}

// ============================================================
// PROFILO ALTIMETRICO (canvas, dai punti trkpt del GPX)
// ============================================================
function disegnaProfiloAltimetrico(e) {
  const canvas = document.getElementById('elevationChart');
  if (!canvas || !e.tracciaGpx) return;
  const points = JSON.parse(e.tracciaGpx);
  if (points.length < 2) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 90;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Distanza cumulativa (asse X) e quota (asse Y)
  let distKm = 0;
  const xs = [0];
  for (let i = 1; i < points.length; i++) {
    distKm += haversineKm(points[i - 1], points[i]);
    xs.push(distKm);
  }
  const eles = points.map(p => p.ele || 0);
  const eleMin = Math.min(...eles), eleMax = Math.max(...eles);
  const eleRange = Math.max(1, eleMax - eleMin);
  const pad = 8;

  const styles = getComputedStyle(document.body);
  const colorLine = styles.getPropertyValue('--primary').trim() || '#2e5339';
  const colorFill = styles.getPropertyValue('--primary-l').trim() || '#4c7a52';

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (xs[i] / distKm) * (w - pad * 2);
    const y = h - pad - ((p.ele - eleMin) / eleRange) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(w - pad, h - pad);
  ctx.lineTo(pad, h - pad);
  ctx.closePath();
  ctx.fillStyle = colorFill + '33';
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (xs[i] / distKm) * (w - pad * 2);
    const y = h - pad - ((p.ele - eleMin) / eleRange) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = colorLine;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = styles.getPropertyValue('--text2').trim() || '#445446';
  ctx.font = '11px ' + (styles.getPropertyValue('--font').trim() || 'sans-serif');
  ctx.fillText(`${Math.round(eleMin)}m`, 2, h - 2);
  ctx.fillText(`${Math.round(eleMax)}m`, 2, 11);
}

function apriModalNuovaEscursione() {
  apriModal('Nuova escursione', `
    <label>Nome escursione</label>
    <input type="text" id="fNome" placeholder="es. Anello del Monte Bulgheria">
    <label>Punto di partenza</label>
    <input type="text" id="fPartenza">
    <label>Punto di arrivo</label>
    <input type="text" id="fArrivo">
    <label>Data</label>
    <input type="date" id="fData">
    <div class="form-row">
      <div><label>Durata stimata</label><input type="text" id="fDurata" placeholder="es. 5h"></div>
      <div><label>Difficoltà</label>
        <select id="fDifficolta">${DIFFICOLTA_SCALA.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div><label>Dislivello + (m)</label><input type="number" id="fDislPos" value="0"></div>
      <div><label>Dislivello - (m)</label><input type="number" id="fDislNeg" value="0"></div>
    </div>
    <label>Quota massima (m) — usata per i consigli attrezzatura</label>
    <input type="number" id="fQuotaMax" value="0">
    <label class="checkbox-line"><input type="checkbox" id="fFerrata"> Presenza tratti di ferrata/esposti</label>
    <label class="checkbox-line"><input type="checkbox" id="fSenzaAcqua"> Nessuna fonte d'acqua sul percorso</label>
    <button class="btn-primary" id="btnSalvaEscursione">Salva escursione</button>
  `);
  $('#btnSalvaEscursione').addEventListener('click', async () => {
    const nome = $('#fNome').value.trim();
    if (!nome) { alert('Inserisci un nome per l\'escursione.'); return; }
    await creaEEattivaEscursione({
      nome,
      partenza: $('#fPartenza').value.trim(),
      arrivo: $('#fArrivo').value.trim(),
      data: $('#fData').value,
      durataStimata: $('#fDurata').value.trim(),
      difficolta: $('#fDifficolta').value,
      dislivelloPos: Number($('#fDislPos').value) || 0,
      dislivelloNeg: Number($('#fDislNeg').value) || 0,
      quotaMax: Number($('#fQuotaMax').value) || 0,
      ferrata: $('#fFerrata').checked,
      senzaAcqua: $('#fSenzaAcqua').checked,
      lunghezzaKm: 0,
      tracciaGpx: null,
    });
    chiudiModal();
    render();
  });
}

// ── Crea, salva, seleziona e genera la checklist per una nuova escursione.
// Usata sia dal form manuale sia dagli itinerari predefiniti. ──
async function creaEEattivaEscursione(datiBase) {
  const nuova = { id: uuid(), ...datiBase };
  const salvata = await dbSave(STORES.escursioni, nuova);
  state.escursioni.push(salvata);
  state.escursioneAttivaId = salvata.id;
  await generaChecklistIntelligente(salvata);
  await refreshEscursioneCorrelati();
  return salvata;
}

// ============================================================
// ITINERARI PREDEFINITI (libreria curata, sola lettura)
// ============================================================
function apriModalItinerariPredefiniti() {
  apriModal('📚 Itinerari predefiniti', `
    <p class="hint">Percorsi consigliati, pronti da usare come base per una nuova escursione. Non includono una traccia GPX: importala a parte se disponibile.</p>
    <div class="itinerari-predef-list">
      ${ITINERARI_PREDEFINITI.map((it, i) => `
        <div class="itinerario-predef-card">
          <div class="ipc-head">
            <strong>${esc(it.nome)}</strong>
            <span class="badge diff-${esc(it.difficolta)}">${esc(it.difficolta)}</span>
          </div>
          <div class="ipc-meta">
            <span>📏 ${esc(it.lunghezzaKm)} km</span>
            <span>⏱ ${esc(it.durataStimata)}</span>
            <span>⛰ +${esc(it.dislivelloPos)}m</span>
          </div>
          <p class="ipc-desc">${esc(it.descrizione)}</p>
          <button class="btn-secondary btn-usa-itinerario" data-idx="${i}">Usa questo percorso</button>
        </div>
      `).join('')}
    </div>
  `);
  $$('.btn-usa-itinerario').forEach(btn => {
    btn.addEventListener('click', async () => {
      const it = ITINERARI_PREDEFINITI[Number(btn.dataset.idx)];
      await creaEEattivaEscursione({
        nome: it.nome, partenza: it.partenza, arrivo: it.arrivo, data: '',
        durataStimata: it.durataStimata, difficolta: it.difficolta,
        dislivelloPos: it.dislivelloPos, dislivelloNeg: it.dislivelloNeg,
        quotaMax: it.quotaMax, ferrata: it.ferrata, senzaAcqua: it.senzaAcqua,
        lunghezzaKm: it.lunghezzaKm, tracciaGpx: null,
      });
      chiudiModal();
      render();
    });
  });
}

// ── Import traccia (GPX o KML) — parsing minimale trkpt/coordinates ──
async function importaGpx(escursione, file) {
  if (!file) return;
  const text = await file.text();
  const isKml = /\.kml$/i.test(file.name || '') || /<kml[\s>]/i.test(text);
  const points = isKml ? parseKmlPoints(text) : parseGpxPoints(text);
  if (!points.length) { alert(`Nessun punto traccia trovato nel file ${isKml ? 'KML' : 'GPX'}.`); return; }

  let km = 0, dislPos = 0, dislNeg = 0, quotaMax = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1], points[i]);
    const de = points[i].ele - points[i - 1].ele;
    if (de > 0) dislPos += de; else dislNeg += Math.abs(de);
    if (points[i].ele > quotaMax) quotaMax = points[i].ele;
  }

  escursione.tracciaGpx = JSON.stringify(points);
  escursione.lunghezzaKm = Math.round(km * 10) / 10;
  escursione.dislivelloPos = Math.round(dislPos);
  escursione.dislivelloNeg = Math.round(dislNeg);
  escursione.quotaMax = Math.round(quotaMax);

  const salvata = await dbSave(STORES.escursioni, escursione);
  const idx = state.escursioni.findIndex(x => x.id === salvata.id);
  state.escursioni[idx] = salvata;
  await generaChecklistIntelligente(salvata);
  await refreshEscursioneCorrelati();
  render();
}

function parseGpxPoints(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  return Array.from(xml.getElementsByTagName('trkpt')).map(p => ({
    lat: parseFloat(p.getAttribute('lat')),
    lon: parseFloat(p.getAttribute('lon')),
    ele: parseFloat(p.getElementsByTagName('ele')[0]?.textContent || '0'),
  }));
}

// Legge tutti i nodi <coordinates> del KML (LineString di uno o più
// Placemark/Track) e li concatena in un'unica traccia, nel formato
// lon,lat[,quota] separato da spazi previsto dallo standard KML.
function parseKmlPoints(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const punti = [];
  Array.from(xml.getElementsByTagName('coordinates')).forEach(nodo => {
    const testo = (nodo.textContent || '').trim();
    if (!testo) return;
    testo.split(/\s+/).forEach(tupla => {
      const parti = tupla.split(',');
      if (parti.length < 2) return;
      const lon = parseFloat(parti[0]);
      const lat = parseFloat(parti[1]);
      const ele = parseFloat(parti[2] || '0');
      if (!isNaN(lat) && !isNaN(lon)) punti.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
    });
  });
  return punti;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function disegnaMappa(e) {
  if (typeof L === 'undefined' || !e.tracciaGpx) return;
  const points = JSON.parse(e.tracciaGpx);
  const el = document.getElementById('leafletMap');
  if (!el) return;
  const map = L.map(el).setView([points[0].lat, points[0].lon], 13);

  // Due layer alternativi: OpenTopoMap (di serie) mostra curve di livello e
  // molti sentieri escursionistici, molto più leggibile in montagna della
  // mappa stradale standard; "Standard" resta disponibile dal selettore
  // in alto a destra per chi preferisce la vista città/strade.
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Mappa: © OpenTopoMap (CC-BY-SA) — dati © OpenStreetMap',
    maxZoom: 17,
  });
  const standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  });
  topo.addTo(map);
  L.control.layers({ 'Topografica': topo, 'Standard': standard }, null, { collapsed: true }).addTo(map);

  const latlngs = points.map(p => [p.lat, p.lon]);
  const line = L.polyline(latlngs, { color: '#2e5339', weight: 4 }).addTo(map);

  const iconePerTipo = { acqua: '💧', rifugio: '🏠', panorama: '🌄', pericolo: '⚠️' };
  state.waypoints.forEach(w => {
    if (isNaN(w.lat) || isNaN(w.lon)) return;
    L.marker([w.lat, w.lon], {
      icon: L.divIcon({ html: `<span class="wp-marker">${iconePerTipo[w.tipo] || '📍'}</span>`, className: '', iconSize: [26, 26] }),
    }).addTo(map).bindPopup(`<strong>${esc(w.nome)}</strong>${w.note ? `<br>${esc(w.note)}` : ''}`);
  });

  map.fitBounds(line.getBounds(), { padding: [16, 16] });
}

async function scaricaOffline(e) {
  // In V1.0 i dati (traccia, checklist) sono già in IndexedDB quindi
  // già disponibili offline. Qui avvisiamo l'utente e, se possibile,
  // pre-carichiamo le tile della mappa visibile nella cache del SW.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_ROUTE_ASSETS' });
  }
  alert('Percorso e checklist sono già salvati sul dispositivo e disponibili senza rete. Le tile della mappa visualizzata vengono messe in cache automaticamente.');
}

async function condividiEscursione(e) {
  const testo = `Escursione: ${e.nome}\nDa ${e.partenza} a ${e.arrivo}\nData: ${e.data || 'da definire'}\nDifficoltà: ${e.difficolta}`;
  if (navigator.share) {
    try { await navigator.share({ title: e.nome, text: testo }); } catch (_) {}
  } else {
    await navigator.clipboard.writeText(testo);
    alert('Dettagli escursione copiati negli appunti.');
  }
}

// ============================================================
// CHECKLIST INTELLIGENTE (Attrezzatura + Equipaggiamento richiesto)
// ============================================================
const CHECKLIST_BASE = [
  { nome: 'Zaino', categoria: 'personale-obbligatorio' },
  { nome: 'Scarponi da trekking', categoria: 'personale-obbligatorio' },
  { nome: 'Acqua (min. 1.5L)', categoria: 'personale-obbligatorio' },
  { nome: 'Bastoncini', categoria: 'personale-consigliato' },
  { nome: 'Kit primo soccorso personale', categoria: 'personale-obbligatorio' },
  { nome: 'Cibo/snack', categoria: 'personale-obbligatorio' },
];

const CHECKLIST_GRUPPO_BASE = [
  { nome: 'Kit primo soccorso di gruppo', categoria: 'gruppo-condiviso' },
  { nome: 'Corda/imbragatura', categoria: 'gruppo-condiviso' },
  { nome: 'Fornello da campo', categoria: 'gruppo-condiviso' },
];

async function generaChecklistIntelligente(escursione) {
  const esistenti = await dbGetByIndex(STORES.equipaggiamento, 'escursioneId', escursione.id);
  const nomiEsistenti = new Set(esistenti.map(v => v.nome));

  const daAggiungere = [...CHECKLIST_BASE, ...CHECKLIST_GRUPPO_BASE];

  if ((escursione.quotaMax || 0) > 2000) {
    daAggiungere.push(
      { nome: 'Strato termico pesante', categoria: 'personale-consigliato', motivo: 'quota >2000m' },
      { nome: 'Guanti', categoria: 'personale-consigliato', motivo: 'quota >2000m' },
      { nome: 'Cappello/Balaclava', categoria: 'personale-consigliato', motivo: 'quota >2000m' },
      { nome: 'Ramponcini', categoria: 'personale-consigliato', motivo: 'quota >2000m' },
    );
  }
  if (escursione.ferrata) {
    daAggiungere.push(
      { nome: 'Kit da ferrata', categoria: 'personale-obbligatorio', motivo: 'tratti esposti/ferrata' },
      { nome: 'Imbrago', categoria: 'personale-obbligatorio', motivo: 'tratti esposti/ferrata' },
      { nome: 'Casco', categoria: 'personale-obbligatorio', motivo: 'tratti esposti/ferrata' },
    );
  }
  if (escursione.senzaAcqua) {
    daAggiungere.push(
      { nome: 'Riserva idrica extra', categoria: 'personale-obbligatorio', motivo: 'nessuna fonte d\'acqua sul percorso' },
    );
  }
  // Equipaggiamento per emergenze — sempre presente
  daAggiungere.push(
    { nome: 'Fischietto', categoria: 'emergenza' },
    { nome: 'Telo termico', categoria: 'emergenza' },
  );

  const ops = [];
  daAggiungere.forEach(item => {
    if (!nomiEsistenti.has(item.nome)) {
      ops.push(dbSave(STORES.equipaggiamento, {
        id: uuid(),
        escursioneId: escursione.id,
        nome: item.nome,
        categoria: item.categoria,
        motivo: item.motivo || null,
        assegnatoA: null,
        spuntato: false,
      }));
    }
  });
  await Promise.all(ops);
}

// ============================================================
// VISTA: BACHECA (informazioni generali del gruppo, non legate a una
// singola escursione) — pubblicazione riservata all'amministratore,
// lettura aperta a tutti.
// ============================================================
function renderBacheca(main) {
  const wrap = document.createElement('div');
  wrap.className = 'view-bacheca';
  wrap.innerHTML = `
    <div class="section-head"><h2>📣 Bacheca</h2></div>
    <p class="hint">Informazioni utili per tutto il gruppo, valide per tutte le uscite: regole, numeri utili, comunicazioni generali. Per gli avvisi legati a una singola escursione (orari, meteo, percorso) usa invece "📋 Note per questa escursione" nella sezione Gruppo.</p>
    ${state.isAdmin ? `
      <div class="bacheca-box">
        <textarea id="fBachecaGlobale" placeholder="Scrivi un'informazione per il gruppo…"></textarea>
        <button class="btn-secondary" id="btnPubblicaBachecaGlobale">Pubblica</button>
      </div>
    ` : `<p class="hint-sync">🔒 Sola lettura: solo l'amministratore del gruppo può pubblicare o eliminare gli avvisi in questa bacheca. Vai in Impostazioni → 👑 Amministratore per accedere.</p>`}
    <ul class="bacheca-list" id="bachecaGlobaleList"></ul>
  `;
  main.appendChild(wrap);

  if (state.isAdmin) {
    $('#btnPubblicaBachecaGlobale').addEventListener('click', async () => {
      const testo = $('#fBachecaGlobale').value.trim();
      if (!testo) return;
      await dbSave(STORES.bachecaGlobale, { id: uuid(), testo, data: Date.now(), autore: 'Amministratore' });
      $('#fBachecaGlobale').value = '';
      caricaBachecaGlobale();
    });
  }
  caricaBachecaGlobale();
}

async function caricaBachecaGlobale() {
  const voci = await dbGetAll(STORES.bachecaGlobale);
  voci.sort((a, b) => b.data - a.data);
  const list = $('#bachecaGlobaleList');
  if (!list) return;
  list.innerHTML = voci.map(v => `
    <li data-id="${v.id}">
      <span><strong>${esc(v.autore || 'Amministratore')}:</strong> ${esc(v.testo)} <span class="data">${new Date(v.data).toLocaleString('it-IT')}</span></span>
      ${state.isAdmin ? `<button class="btn-elimina-avviso" data-id="${v.id}" aria-label="Elimina avviso">✕</button>` : ''}
    </li>`).join('') || '<p class="empty-hint">Nessun avviso pubblicato.</p>';
  if (state.isAdmin) {
    $$('#bachecaGlobaleList .btn-elimina-avviso').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Eliminare questo avviso?')) return;
        await dbDelete(STORES.bachecaGlobale, btn.dataset.id);
        caricaBachecaGlobale();
      });
    });
  }
}

// ============================================================
// VISTA: ATTREZZATURA / EQUIPAGGIAMENTO RICHIESTO
// ============================================================
function renderAttrezzatura(main) {
  const attiva = state.escursioni.find(e => e.id === state.escursioneAttivaId);
  const wrap = document.createElement('div');
  wrap.className = 'view-attrezzatura';

  if (!attiva) {
    wrap.innerHTML = '<p class="empty-hint">Seleziona o crea un\'escursione nella sezione Percorsi per vedere l\'equipaggiamento consigliato.</p>';
    main.appendChild(wrap);
    return;
  }

  const categorie = [
    { key: 'personale-obbligatorio', label: '🔴 Personale — Obbligatorio' },
    { key: 'personale-consigliato', label: '🟡 Personale — Consigliato' },
    { key: 'gruppo-condiviso', label: '🟢 Di gruppo — Condiviso' },
    { key: 'emergenza', label: '🆘 Emergenza' },
  ];

  wrap.innerHTML = `
    <div class="section-head">
      <h2>🎒 Attrezzatura e Consigli — ${esc(attiva.nome)}</h2>
    </div>
    ${!state.isAdmin ? '<p class="hint-sync">🔒 Sola lettura: la gestione dell\'attrezzatura (spunte, assegnazioni, pesi) è riservata all\'amministratore del gruppo. Vai in Impostazioni → 👑 Amministratore per accedere.</p>' : ''}
    <p class="hint">Checklist generata automaticamente in base al percorso (quota max ${esc(attiva.quotaMax || 0)}m${attiva.ferrata ? ', tratti di ferrata' : ''}${attiva.senzaAcqua ? ', nessuna fonte d\'acqua' : ''}).</p>
    ${categorie.map(cat => renderCategoriaChecklist(cat)).join('')}
    <div class="section-head">
      <h3>💡 Consigli di sicurezza</h3>
    </div>
    <ul class="tips-list">
      <li>Segui sempre le norme CAI per la frequentazione della montagna.</li>
      <li>Comunica sempre il percorso e l'orario di rientro a qualcuno che resta a casa.</li>
      <li>In caso di maltempo improvviso, valuta il rientro verso il punto di sicurezza più vicino.</li>
      <li>Idratati regolarmente e fai pause anche in assenza di sete.</li>
    </ul>
  `;
  main.appendChild(wrap);

  categorie.forEach(cat => bindCategoriaChecklist(cat.key));
  if (!state.isAdmin) {
    $$('.view-attrezzatura input, .view-attrezzatura select').forEach(el => { el.disabled = true; });
  }
}

function renderCategoriaChecklist(cat) {
  const voci = state.equipaggiamento.filter(v => v.categoria === cat.key);
  if (!voci.length) return '';
  return `
    <div class="checklist-cat">
      <h4>${cat.label}</h4>
      <ul class="checklist" data-cat="${cat.key}">
        ${voci.map(v => `
          <li data-id="${v.id}">
            <label>
              <input type="checkbox" class="chk-spunta" ${v.spuntato ? 'checked' : ''}>
              ${esc(v.nome)}${v.motivo ? `<span class="motivo"> · ${esc(v.motivo)}</span>` : ''}
            </label>
            ${cat.key === 'gruppo-condiviso' ? `
              <div class="peso-riga">
                ${renderAssegnaSelect(v)}
                <input type="number" class="inp-peso-voce" min="0" step="0.1" placeholder="kg" value="${v.pesoKg || ''}">
              </div>` : ''}
          </li>`).join('')}
      </ul>
    </div>
  `;
}

function renderAssegnaSelect(v) {
  const opzioni = state.partecipanti.map(p =>
    `<option value="${p.id}" ${v.assegnatoA === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  return `<select class="sel-assegna">
    <option value="">Non assegnato</option>${opzioni}
  </select>`;
}

function bindCategoriaChecklist(catKey) {
  $$(`.checklist[data-cat="${catKey}"] li`).forEach(li => {
    const id = li.dataset.id;
    const chk = li.querySelector('.chk-spunta');
    chk.addEventListener('change', async () => {
      const voce = state.equipaggiamento.find(v => v.id === id);
      voce.spuntato = chk.checked;
      await dbSave(STORES.equipaggiamento, voce);
    });
    const sel = li.querySelector('.sel-assegna');
    if (sel) {
      sel.addEventListener('change', async () => {
        const voce = state.equipaggiamento.find(v => v.id === id);
        voce.assegnatoA = sel.value || null;
        await dbSave(STORES.equipaggiamento, voce);
      });
    }
    const inpPeso = li.querySelector('.inp-peso-voce');
    if (inpPeso) {
      inpPeso.addEventListener('change', async () => {
        const voce = state.equipaggiamento.find(v => v.id === id);
        voce.pesoKg = Number(inpPeso.value) || 0;
        await dbSave(STORES.equipaggiamento, voce);
      });
    }
  });
}

// ============================================================
// VISTA: GRUPPO (partecipanti, ruoli, sicurezza)
// ============================================================
function renderGruppo(main) {
  const attiva = state.escursioni.find(e => e.id === state.escursioneAttivaId);
  const wrap = document.createElement('div');
  wrap.className = 'view-gruppo';

  if (!attiva) {
    wrap.innerHTML = '<p class="empty-hint">Seleziona o crea un\'escursione nella sezione Percorsi per gestire il gruppo.</p>';
    main.appendChild(wrap);
    return;
  }

  const sincronizzato = syncAttivaPer(attiva);

  wrap.innerHTML = `
    <div class="section-head">
      <h2>👥 Gruppo — ${esc(attiva.nome)}</h2>
      <button class="btn-primary" id="btnAggiungiPartecipante">+ Partecipante</button>
    </div>

    ${renderSyncBoxHtml(attiva, sincronizzato)}

    <ul class="partecipanti-list">
      ${state.partecipanti.map(p => `
        <li data-id="${p.id}">
          <div class="p-nome">${esc(p.nome)}</div>
          <div class="p-ruolo">${esc(p.ruolo)}</div>
          <select class="p-stato">
            <option value="partecipa" ${p.stato === 'partecipa' ? 'selected' : ''}>✅ Partecipa</option>
            <option value="incerto" ${p.stato === 'incerto' ? 'selected' : ''}>❓ Incerto</option>
            <option value="non-puo" ${p.stato === 'non-puo' ? 'selected' : ''}>❌ Non può</option>
          </select>
        </li>`).join('') || '<p class="empty-hint">Nessun partecipante ancora aggiunto.</p>'}
    </ul>

    ${renderPesoZainoHtml()}

    <div class="section-head"><h3>📍 Punto di ritrovo</h3></div>
    <div class="ritrovo-box">
      <input type="text" id="fRitrovoLuogo" placeholder="Luogo" value="${esc(attiva.ritrovoLuogo || '')}">
      <input type="time" id="fRitrovoOrario" value="${esc(attiva.ritrovoOrario || '')}">
      <button class="btn-secondary" id="btnSalvaRitrovo">Salva</button>
    </div>

    ${sincronizzato ? renderPosizioneLiveBoxHtml(attiva) : ''}

    ${renderChatGlobaleHtml()}

    <div class="section-head"><h3>${sincronizzato ? '💬 Chat in tempo reale (sync)' : '📋 Note per questa escursione'}</h3></div>
    <div class="bacheca-box">
      <textarea id="fAvviso" placeholder="${sincronizzato ? 'Scrivi un messaggio per il gruppo…' : 'Scrivi una nota per questa escursione (cambio orario, meteo, modifiche percorso)…'}"></textarea>
      ${sincronizzato ? '<label class="checkbox-line"><input type="checkbox" id="fUrgente"> ⚠️ Urgente (invia anche una notifica push a tutto il gruppo)</label>' : ''}
      <button class="btn-secondary" id="btnPubblicaAvviso">${sincronizzato ? 'Invia' : 'Pubblica'}</button>
      ${sincronizzato
        ? `<div class="sync-poll-row"><button class="btn-link" id="btnRefreshChat">🔄 Aggiorna ora</button><span class="hint-sync" id="chatStatoSync"></span></div>`
        : '<p class="hint-sync">📡 Nessuna sincronizzazione attiva in questa DEMO: le note restano solo su questo dispositivo, legate a questa escursione. Per informazioni generali del gruppo usa la sezione 📣 Bacheca.</p>'}
      <ul class="bacheca-list" id="bachecaList"></ul>
    </div>

    <div class="section-head"><h3>🆘 Sicurezza</h3></div>
    <button class="btn-danger" id="btnSOS">🆘 Invia posizione SOS</button>
    <p class="hint-sync">Genera un SMS con le tue coordinate GPS attuali verso il numero di emergenza che imposterai.</p>
    <button class="btn-secondary" id="btnLinkMonitoraggio">🔗 Link monitoraggio per chi resta a casa</button>
    <p class="hint-sync">Crea un link di sola lettura con itinerario, punto di ritrovo e orario stimato di rientro, da inviare a chi non partecipa. Non richiede rete né account: i dati sono contenuti nel link stesso.</p>
  `;
  main.appendChild(wrap);

  $('#btnAggiungiPartecipante').addEventListener('click', apriModalPartecipante);
  $$('.p-stato').forEach(sel => {
    sel.addEventListener('change', async (ev) => {
      const id = ev.target.closest('li').dataset.id;
      const p = state.partecipanti.find(x => x.id === id);
      p.stato = ev.target.value;
      await dbSave(STORES.partecipanti, p);
    });
  });
  $('#btnSalvaRitrovo').addEventListener('click', async () => {
    attiva.ritrovoLuogo = $('#fRitrovoLuogo').value.trim();
    attiva.ritrovoOrario = $('#fRitrovoOrario').value;
    await dbSave(STORES.escursioni, attiva);
    alert('Punto di ritrovo salvato.');
  });
  $('#btnPubblicaAvviso').addEventListener('click', async () => {
    const testo = $('#fAvviso').value.trim();
    if (!testo) return;
    const urgente = sincronizzato && $('#fUrgente') ? $('#fUrgente').checked : false;
    await dbSave(STORES.bacheca, { id: uuid(), escursioneId: attiva.id, testo, data: Date.now(), autore: state.sync.nomeLocale || 'Tu' });
    $('#fAvviso').value = '';
    if (sincronizzato) {
      try {
        await syncInviaMessaggio(attiva.codiceGruppo, { id: uuid(), autore: state.sync.nomeLocale || 'Anonimo', testo, urgente });
      } catch (err) {
        alert('Messaggio salvato solo in locale: impossibile contattare il Worker (' + err.message + ').');
      }
      await aggiornaSyncGruppo(attiva, true);
    }
    caricaBacheca(attiva.id);
  });
  $('#btnSOS').addEventListener('click', inviaSOS);
  $('#btnLinkMonitoraggio').addEventListener('click', () => generaLinkMonitoraggio(attiva));
  bindSyncBox(attiva);
  if (sincronizzato) {
    bindPosizioneLiveBox(attiva);
    $('#btnRefreshChat').addEventListener('click', () => aggiornaSyncGruppo(attiva, true));
    avviaSyncPolling(attiva);
  }
  caricaBacheca(attiva.id);
  bindChatGlobale();
}

// ============================================================
// CHAT DEL GRUPPO — locale, aperta a tutti i partecipanti (a differenza
// della Bacheca, riservata all'amministratore). In questa DEMO resta sul
// singolo dispositivo: si allinea tra device solo con l'esportazione/
// importazione dati in Impostazioni, finché non viene richiesta la
// sincronizzazione in tempo reale dedicata al gruppo.
// ============================================================
function renderChatGlobaleHtml() {
  return `
    <div class="section-head"><h3>💬 Chat del gruppo</h3></div>
    <div class="bacheca-box">
      <p class="hint">Aperta a tutti i partecipanti (a differenza della Bacheca, riservata all'amministratore). In questa versione DEMO resta solo su questo dispositivo: usa "Esporta dati"/"Importa dati" in Impostazioni per condividerla con un altro device.</p>
      <input type="text" id="fChatAutore" placeholder="Il tuo nome" value="${esc(state.sync.nomeLocale || '')}">
      <textarea id="fChatGlobale" placeholder="Scrivi un messaggio per il gruppo…"></textarea>
      <button class="btn-secondary" id="btnInviaChatGlobale">Invia</button>
      <ul class="bacheca-list" id="chatGlobaleList"></ul>
    </div>
  `;
}

function bindChatGlobale() {
  $('#btnInviaChatGlobale').addEventListener('click', async () => {
    const testo = $('#fChatGlobale').value.trim();
    if (!testo) return;
    const autore = $('#fChatAutore').value.trim() || 'Anonimo';
    if (autore !== state.sync.nomeLocale) {
      state.sync.nomeLocale = autore;
      await setNomeLocale(autore);
    }
    await dbSave(STORES.chatGlobale, { id: uuid(), testo, autore, data: Date.now() });
    $('#fChatGlobale').value = '';
    caricaChatGlobale();
  });
  caricaChatGlobale();
}

async function caricaChatGlobale() {
  const voci = await dbGetAll(STORES.chatGlobale);
  voci.sort((a, b) => b.data - a.data);
  const list = $('#chatGlobaleList');
  if (!list) return;
  list.innerHTML = voci.map(v => `
    <li data-id="${v.id}">
      <span><strong>${esc(v.autore || 'Anonimo')}:</strong> ${esc(v.testo)} <span class="data">${new Date(v.data).toLocaleString('it-IT')}</span></span>
      <button class="btn-elimina-avviso" data-id="${v.id}" aria-label="Elimina messaggio">✕</button>
    </li>`).join('') || '<p class="empty-hint">Nessun messaggio ancora. Scrivi il primo!</p>';
  $$('#chatGlobaleList .btn-elimina-avviso').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Eliminare questo messaggio?')) return;
      await dbDelete(STORES.chatGlobale, btn.dataset.id);
      caricaChatGlobale();
    });
  });
}

// ============================================================
// SINCRONIZZAZIONE DI GRUPPO (Worker Cloudflare) — attivazione,
// chat in tempo reale, posizione live, notifiche push.
// ============================================================
function renderSyncBoxHtml(attiva, sincronizzato) {
  if (!SYNC_ENABLED) return '';
  if (!sincronizzato) {
    return `
      <div class="sync-box">
        <h3>🔄 Sincronizzazione di gruppo</h3>
        <p class="hint">Attivala per condividere in tempo reale chat, posizione live e notifiche push con chi partecipa a questa escursione. Richiede rete al momento dell'attivazione e dell'invio; i dati (messaggi, posizione GPS) vengono inviati al Worker e restano leggibili a chiunque conosca il codice gruppo.</p>
        <button class="btn-primary" id="btnAttivaSync">🔄 Attiva sincronizzazione</button>
      </div>`;
  }
  return `
    <div class="sync-box sync-box-attiva">
      <h3>🔄 Sincronizzazione attiva</h3>
      <p class="hint">Codice gruppo: <strong class="codice-gruppo">${esc(attiva.codiceGruppo)}</strong> — condividilo con chi partecipa perché possa collegarsi.</p>
      <div class="sync-box-actions">
        <button class="btn-secondary" id="btnCondividiCodice">🔗 Condividi codice</button>
        <button class="btn-secondary" id="btnAttivaPush">🔔 Notifiche push</button>
      </div>
    </div>`;
}

function bindSyncBox(attiva) {
  const btnAttiva = $('#btnAttivaSync');
  if (btnAttiva) {
    btnAttiva.addEventListener('click', async () => {
      let nome = state.sync.nomeLocale;
      if (!nome) {
        nome = prompt('Come vuoi essere identificato/a nel gruppo?', '') || '';
        if (!nome.trim()) { alert('Inserisci un nome per continuare.'); return; }
        state.sync.nomeLocale = nome.trim();
        await setNomeLocale(state.sync.nomeLocale);
      }
      const codice = generaCodiceGruppo();
      try {
        await syncJoin(codice, state.sync.partecipanteId, state.sync.nomeLocale);
      } catch (err) {
        alert('Impossibile contattare il Worker: verifica API_BASE_URL in config.js e la connessione. (' + err.message + ')');
        return;
      }
      attiva.codiceGruppo = codice;
      await dbSave(STORES.escursioni, attiva);
      render();
    });
  }
  const btnCondividi = $('#btnCondividiCodice');
  if (btnCondividi) {
    btnCondividi.addEventListener('click', () => {
      const testo = `Unisciti al gruppo "${attiva.nome}" su Trekking: codice ${attiva.codiceGruppo}`;
      if (navigator.share) navigator.share({ text: testo }).catch(() => {});
      else navigator.clipboard.writeText(testo).then(() => alert('Codice copiato negli appunti.'));
    });
  }
  const btnPush = $('#btnAttivaPush');
  if (btnPush) {
    btnPush.addEventListener('click', async () => {
      try {
        await attivaPushPerGruppo(attiva.codiceGruppo, state.sync.partecipanteId);
        state.sync.pushAttivo = true;
        alert('Notifiche push attivate per questo gruppo.');
      } catch (err) {
        alert('Impossibile attivare le notifiche: ' + err.message);
      }
    });
  }
}

function renderPosizioneLiveBoxHtml(attiva) {
  const altre = state.sync.posizioni.filter(p => p.partecipanteId !== state.sync.partecipanteId);
  return `
    <div class="section-head"><h3>📡 Posizione live</h3></div>
    <div class="posizione-live-box">
      <label class="checkbox-line">
        <input type="checkbox" id="fCondividiPosizione" ${state.sync.condividoPosizione ? 'checked' : ''}>
        Condividi la mia posizione con il gruppo durante l'escursione
      </label>
      <p class="hint">Invia le tue coordinate ogni circa 30 secondi finché questa casella resta attiva e l'app è aperta. Le posizioni scadono da sole dopo 4 ore.</p>
      <ul class="posizioni-list" id="posizioniLiveList">
        ${altre.map(p => `<li>${esc(p.nome)} — aggiornato ${Math.round((Date.now() - p.ts) / 60000)} min fa</li>`).join('') || '<li class="empty-hint">Nessuna posizione condivisa dal gruppo per ora.</li>'}
      </ul>
    </div>`;
}

function bindPosizioneLiveBox(attiva) {
  const chk = $('#fCondividiPosizione');
  if (!chk) return;
  chk.addEventListener('change', () => {
    state.sync.condividoPosizione = chk.checked;
    if (chk.checked) avviaCondivisionePosizione(attiva);
    else fermaCondivisionePosizione();
  });
  if (state.sync.condividoPosizione) avviaCondivisionePosizione(attiva);
}

function avviaCondivisionePosizione(attiva) {
  if (!navigator.geolocation || posizioneWatchId !== null) return;
  posizioneWatchId = navigator.geolocation.watchPosition(async (pos) => {
    try {
      await syncInviaPosizione(attiva.codiceGruppo, {
        partecipanteId: state.sync.partecipanteId,
        nome: state.sync.nomeLocale || 'Anonimo',
        lat: pos.coords.latitude, lon: pos.coords.longitude,
      });
    } catch (_) { /* riprova al prossimo aggiornamento di posizione */ }
  }, () => { /* permesso negato o GPS non disponibile: la casella resta spuntata, riprova da sola */ },
  { enableHighAccuracy: true, maximumAge: 25000, timeout: 20000 });
}
function fermaCondivisionePosizione() {
  if (posizioneWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(posizioneWatchId);
    posizioneWatchId = null;
  }
}

// ── Polling periodico (chat + posizioni) mentre la vista Gruppo è aperta ──
function avviaSyncPolling(attiva) {
  aggiornaSyncGruppo(attiva, false);
  syncPollTimer = setInterval(() => aggiornaSyncGruppo(attiva, false), SYNC_POLL_MS);
}
function fermaSyncPolling() {
  if (syncPollTimer) { clearInterval(syncPollTimer); syncPollTimer = null; }
}

async function aggiornaSyncGruppo(attiva, forzaIndicatore) {
  const stato = $('#chatStatoSync');
  if (stato && forzaIndicatore) stato.textContent = '⏳ Aggiornamento…';
  try {
    const [nuoviMessaggi, posizioni] = await Promise.all([
      syncFetchMessaggi(attiva.codiceGruppo, state.sync.ultimoPoll),
      syncFetchPosizioni(attiva.codiceGruppo),
    ]);
    state.sync.posizioni = posizioni;
    if (nuoviMessaggi.length) {
      state.sync.ultimoPoll = Math.max(...nuoviMessaggi.map(m => m.data));
      // I messaggi arrivati dal Worker (anche da altri dispositivi) vengono
      // salvati anche in locale, così restano leggibili offline.
      for (const m of nuoviMessaggi) {
        if (m.autore === (state.sync.nomeLocale || 'Anonimo')) continue; // già salvato localmente all'invio
        await dbSave(STORES.bacheca, { id: m.id, escursioneId: attiva.id, testo: m.testo, autore: m.autore, data: m.data });
      }
      caricaBacheca(attiva.id);
    }
    const listaPos = $('#posizioniLiveList');
    if (listaPos) {
      const altre = posizioni.filter(p => p.partecipanteId !== state.sync.partecipanteId);
      listaPos.innerHTML = altre.map(p => `<li>${esc(p.nome)} — aggiornato ${Math.round((Date.now() - p.ts) / 60000)} min fa</li>`).join('') || '<li class="empty-hint">Nessuna posizione condivisa dal gruppo per ora.</li>';
    }
    if (stato) stato.textContent = '✅ Aggiornato ' + new Date().toLocaleTimeString('it-IT');
  } catch (err) {
    if (stato) stato.textContent = '⚠️ Worker non raggiungibile';
  }
}

// ============================================================
// PESO ZAINO — calcolatore e bilanciamento tra i partecipanti
// ============================================================
function renderPesoZainoHtml() {
  if (!state.partecipanti.length) return '';
  const righe = state.partecipanti.map(p => {
    const pesoAssegnato = state.equipaggiamento
      .filter(v => v.categoria === 'gruppo-condiviso' && v.assegnatoA === p.id)
      .reduce((tot, v) => tot + (v.pesoKg || 0), 0);
    const totale = (p.pesoKg || 0) + pesoAssegnato;
    return { nome: p.nome, personale: p.pesoKg || 0, gruppo: pesoAssegnato, totale };
  });
  const totali = righe.map(r => r.totale).filter(t => t > 0);
  const sbilanciato = totali.length > 1 && (Math.max(...totali) - Math.min(...totali)) > PESO_SBILANCIAMENTO_KG;

  return `
    <div class="section-head"><h3>⚖️ Peso zaino</h3></div>
    <div class="peso-zaino-box">
      <table class="peso-zaino-table">
        <thead><tr><th>Partecipante</th><th>Personale</th><th>Di gruppo</th><th>Totale</th></tr></thead>
        <tbody>
          ${righe.map(r => `
            <tr>
              <td>${esc(r.nome)}</td>
              <td>${r.personale} kg</td>
              <td>${r.gruppo.toFixed(1)} kg</td>
              <td><strong>${r.totale.toFixed(1)} kg</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="hint">Il "peso personale" si imposta aggiungendo o modificando il partecipante; il "peso di gruppo" somma le voci di equipaggiamento condiviso assegnate a quella persona in Attrezzatura (inserisci il peso di ciascuna voce nel campo "kg" accanto all'assegnazione).</p>
      ${sbilanciato ? `<p class="peso-warning">⚠️ Il carico è sbilanciato tra i partecipanti (scarto oltre ${PESO_SBILANCIAMENTO_KG} kg). Valutate di ridistribuire l'equipaggiamento di gruppo.</p>` : ''}
    </div>
  `;
}

// ============================================================
// LINK DI MONITORAGGIO ("resto a casa") — sola lettura, nessun backend
// ============================================================
function generaLinkMonitoraggio(e) {
  const payload = {
    nome: e.nome, partenza: e.partenza, arrivo: e.arrivo, data: e.data,
    durataStimata: e.durataStimata, difficolta: e.difficolta,
    lunghezzaKm: e.lunghezzaKm, dislivelloPos: e.dislivelloPos,
    ritrovoLuogo: e.ritrovoLuogo || '', ritrovoOrario: e.ritrovoOrario || '',
    partecipanti: state.partecipanti.map(p => p.nome),
    generatoIl: new Date().toISOString(),
  };
  let b64;
  try {
    b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch (err) {
    alert('Impossibile generare il link.');
    return;
  }
  const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}monitoraggio.html?d=${b64}`;

  if (navigator.share) {
    navigator.share({ title: `Monitoraggio: ${e.nome}`, text: 'Segui la nostra escursione', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('Link di monitoraggio copiato negli appunti. Invialo a chi resta a casa.');
    }).catch(() => {
      apriModal('Link monitoraggio', `<p class="hint">Copia questo link:</p><input type="text" readonly value="${esc(url)}" onclick="this.select()">`);
    });
  }
}

async function caricaBacheca(escursioneId) {
  const voci = await dbGetByIndex(STORES.bacheca, 'escursioneId', escursioneId);
  voci.sort((a, b) => b.data - a.data);
  const list = $('#bachecaList');
  if (!list) return;
  list.innerHTML = voci.map(v => `
    <li data-id="${v.id}">
      <span>${v.autore ? `<strong>${esc(v.autore)}:</strong> ` : ''}${esc(v.testo)} <span class="data">${new Date(v.data).toLocaleString('it-IT')}</span></span>
      <button class="btn-elimina-avviso" data-id="${v.id}" aria-label="Elimina avviso">✕</button>
    </li>`).join('');

  const attiva = state.escursioni.find(e => e.id === escursioneId);
  $$('.btn-elimina-avviso').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Eliminare questo avviso?')) return;
      const id = btn.dataset.id;
      await dbDelete(STORES.bacheca, id);
      if (attiva && syncAttivaPer(attiva)) {
        try { await syncEliminaMessaggio(attiva.codiceGruppo, id); }
        catch (err) { /* rimosso solo in locale: il Worker verrà allineato al prossimo giro se si ripubblica */ }
      }
      caricaBacheca(escursioneId);
    });
  });
}

function apriModalPartecipante() {
  apriModal('Nuovo partecipante', `
    <label>Nome</label>
    <input type="text" id="fPNome">
    <label>Ruolo</label>
    <select id="fPRuolo">${RUOLI_PARTECIPANTE.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
    <label>Peso zaino personale stimato (kg, opzionale)</label>
    <input type="number" id="fPPeso" min="0" step="0.5" placeholder="es. 8">
    <button class="btn-primary" id="btnSalvaPartecipante">Salva</button>
  `);
  $('#btnSalvaPartecipante').addEventListener('click', async () => {
    const nome = $('#fPNome').value.trim();
    if (!nome) { alert('Inserisci un nome.'); return; }
    const p = await dbSave(STORES.partecipanti, {
      id: uuid(), escursioneId: state.escursioneAttivaId,
      nome, ruolo: $('#fPRuolo').value, stato: 'incerto',
      pesoKg: Number($('#fPPeso').value) || 0,
    });
    state.partecipanti.push(p);
    chiudiModal();
    render();
  });
}

function inviaSOS() {
  if (!navigator.geolocation) { alert('Geolocalizzazione non disponibile su questo dispositivo.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    const testo = encodeURIComponent(`SOS - Ho bisogno di aiuto. Coordinate: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (WGS84). https://maps.google.com/?q=${latitude},${longitude}`);
    window.location.href = `sms:?body=${testo}`;
  }, () => {
    alert('Impossibile ottenere la posizione. Verifica i permessi GPS.');
  }, { enableHighAccuracy: true, timeout: 10000 });
}

// ── Blocco Amministratore (Impostazioni) ──
function renderAdminBlockHtml() {
  if (state.isAdmin) {
    return `
      <p class="hint-sync">🔑 <strong>Modalità Amministratore ATTIVA</strong> su questo dispositivo. Puoi gestire 📣 Bacheca e 🎒 Attrezzatura.</p>
      <button class="btn-secondary" id="btnAdminEsci">Esci dalla modalità amministratore</button>
      <button class="btn-secondary" id="btnAdminCambiaPassword">Cambia password amministratore</button>
    `;
  }
  if (!state.adminRecordExists) {
    return `
      <p class="hint">Nessuna password amministratore impostata. Chi la sceglie per primo diventa l'unico amministratore del gruppo, con accesso in scrittura a 📣 Bacheca e 🎒 Attrezzatura. La password (con tutti gli altri dati) può essere trasferita ad altri dispositivi tramite "⬇️ Esporta dati"/"⬆️ Importa dati" qui sotto.</p>
      <label>Nuova password amministratore</label>
      <input type="password" id="fNuovaPasswordAdmin" placeholder="Almeno 4 caratteri">
      <button class="btn-primary" id="btnImpostaPasswordAdmin">Imposta password e diventa amministratore</button>
    `;
  }
  return `
    <p class="hint">Password amministratore già impostata per questo gruppo (un solo amministratore).</p>
    <label>Password amministratore</label>
    <input type="password" id="fPasswordAdmin" placeholder="Password">
    <button class="btn-primary" id="btnAccediAdmin">Accedi come amministratore</button>
  `;
}

// ============================================================
// VISTA: IMPOSTAZIONI
// ============================================================
function renderImpostazioni(main) {
  const wrap = document.createElement('div');
  wrap.className = 'view-impostazioni';
  wrap.innerHTML = `
    <div class="section-head"><h2>⚙️ Impostazioni</h2></div>

    <div class="settings-block">
      <label>Tema</label>
      <select id="fTema">
        <option value="giorno" ${state.settings.tema === 'giorno' ? 'selected' : ''}>☀️ Giorno</option>
        <option value="notte" ${state.settings.tema === 'notte' ? 'selected' : ''}>🌙 Notte (montagna/rifugio)</option>
      </select>
    </div>
    <div class="settings-block">
      <label>Dimensione testo</label>
      <select id="fFont">
        <option value="normale" ${state.settings.fontScale === 'normale' ? 'selected' : ''}>Normale</option>
        <option value="grande" ${state.settings.fontScale === 'grande' ? 'selected' : ''}>Grande</option>
      </select>
    </div>

    <div class="settings-block">
      <h3>Dati e backup</h3>
      <button class="btn-secondary" id="btnEsporta">⬇️ Esporta dati (JSON)</button>
      <button class="btn-secondary" id="btnImporta">⬆️ Importa dati (JSON)</button>
      <input type="file" id="importFile" accept="application/json" style="display:none">
      <button class="btn-secondary" id="btnDemo">🧭 Carica escursioni di esempio (demo)</button>
      <p class="hint-sync">Aggiunge 3 escursioni dimostrative complete (percorsi, gruppo, equipaggiamento, avvisi) in modalità append, senza toccare i tuoi dati esistenti.</p>
    </div>

    <div class="settings-block">
      <h3>🧪 Versione DEMO</h3>
      <p class="hint-sync">Questa è una <strong>PWA DEMO</strong>: tutti i dati (percorsi, gruppo, bacheca, chat, amministratore) restano solo su questo dispositivo. Nessuna sincronizzazione automatica tra i telefoni del gruppo. Per allineare i dati tra due device usa "Esporta dati"/"Importa dati" qui sotto.</p>
      <p class="hint-sync">Una sincronizzazione in tempo reale (chat, posizione live, notifiche push) dedicata al tuo gruppo può essere attivata su richiesta esplicita all'autore: <a href="${esc(CONTATTO_AUTORE_URL)}" target="_blank" rel="noopener">${esc(CONTATTO_AUTORE_URL)}</a></p>
    </div>

    <div class="settings-block">
      <h3>👑 Amministratore</h3>
      <div id="adminBlock">${renderAdminBlockHtml()}</div>
    </div>

    <div class="settings-block">
      <h3>☁️ Sincronizzazione cloud</h3>
      ${SYNC_ENABLED
        ? `<p class="hint-sync">Sincronizzazione configurata (Worker: <code>${esc(API_BASE_URL)}</code>). Attivala per una singola escursione dalla sezione Gruppo: genera un codice da condividere con i partecipanti per chat, posizione live e notifiche push.</p>`
        : '<p class="hint-sync">Disattivata in questa DEMO (vedi sopra). La sezione Gruppo funziona tutta offline: bacheca, chat e attrezzatura restano locali finché non richiedi l\'attivazione dedicata.</p>'}
      ${state.sync.nomeLocale ? `<p class="hint-sync">Il tuo nome nel gruppo: <strong>${esc(state.sync.nomeLocale)}</strong>. <button class="btn-link" id="btnCambiaNomeLocale">cambia</button></p>` : ''}
    </div>

    <div class="settings-block">
      <button class="btn-secondary" id="btnClearCache">🔄 Svuota cache e aggiorna app</button>
    </div>

    <div class="settings-block">
      <button class="btn-secondary" id="btnManuale">❓ Manuale d'uso</button>
    </div>
  `;
  main.appendChild(wrap);

  $('#fTema').addEventListener('change', async (e) => {
    state.settings.tema = e.target.value;
    await settingSet('tema', e.target.value);
    applyTheme();
  });
  $('#fFont').addEventListener('change', async (e) => {
    state.settings.fontScale = e.target.value;
    await settingSet('fontScale', e.target.value);
    applyTheme();
  });
  $('#btnEsporta').addEventListener('click', async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `trekking-backup-${Date.now()}.json` });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  });
  $('#btnDemo').addEventListener('click', async () => {
    if (!confirm('Aggiungere 3 escursioni di esempio ai tuoi dati? I dati esistenti non verranno toccati.')) return;
    try {
      const res = await fetch(DEMO_DATA_URL);
      if (!res.ok) throw new Error('File demo non trovato.');
      const json = await res.json();
      await importAllData(json);
      state.escursioni = await dbGetAll(STORES.escursioni);
      await refreshEscursioneCorrelati();
      alert('Escursioni di esempio aggiunte. Le trovi nella sezione Percorsi.');
      render();
    } catch (err) {
      alert('Impossibile caricare i dati demo: ' + err.message);
    }
  });
  $('#btnImporta').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      await importAllData(json);
      state.escursioni = await dbGetAll(STORES.escursioni);
      await refreshEscursioneCorrelati();
      const adminRec = await dbGet(STORES.admin, 'admin');
      state.adminRecordExists = !!adminRec;
      alert('Dati importati correttamente.');
      render();
    } catch (err) {
      alert('File non valido: ' + err.message);
    }
  });
  $('#btnClearCache').addEventListener('click', async () => {
    if (!confirm('Svuotare la cache e aggiornare l\'app? I dati salvati non verranno toccati.')) return;
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    location.reload();
  });
  $('#btnManuale').addEventListener('click', apriManuale);

  const btnImpostaAdmin = $('#btnImpostaPasswordAdmin');
  if (btnImpostaAdmin) btnImpostaAdmin.addEventListener('click', async () => {
    const pw = $('#fNuovaPasswordAdmin').value;
    if (!pw || pw.length < 4) { alert('Scegli una password di almeno 4 caratteri.'); return; }
    await adminImpostaPassword(pw);
    aggiornaAdminBadge();
    alert('Password impostata: sei ora l\'amministratore del gruppo su questo dispositivo.');
    render();
  });
  const btnAccediAdmin = $('#btnAccediAdmin');
  if (btnAccediAdmin) btnAccediAdmin.addEventListener('click', async () => {
    try {
      await adminAccedi($('#fPasswordAdmin').value);
      aggiornaAdminBadge();
      render();
    } catch (err) {
      alert(err.message);
    }
  });
  const btnEsciAdmin = $('#btnAdminEsci');
  if (btnEsciAdmin) btnEsciAdmin.addEventListener('click', () => {
    adminEsci();
    aggiornaAdminBadge();
    render();
  });
  const btnCambiaPasswordAdmin = $('#btnAdminCambiaPassword');
  if (btnCambiaPasswordAdmin) btnCambiaPasswordAdmin.addEventListener('click', async () => {
    const pw = prompt('Nuova password amministratore (almeno 4 caratteri):');
    if (!pw || pw.length < 4) return;
    await adminImpostaPassword(pw);
    alert('Password amministratore aggiornata.');
  });

  const btnCambiaNome = $('#btnCambiaNomeLocale');
  if (btnCambiaNome) {
    btnCambiaNome.addEventListener('click', async () => {
      const nome = prompt('Il tuo nome nel gruppo:', state.sync.nomeLocale) || '';
      if (!nome.trim()) return;
      state.sync.nomeLocale = nome.trim();
      await setNomeLocale(state.sync.nomeLocale);
      render();
    });
  }
}

// ============================================================
// MODALI GENERICHE
// ============================================================
function apriModal(titolo, contenutoHtml) {
  $('#modalTitolo').textContent = titolo;
  $('#modalBody').innerHTML = contenutoHtml;
  $('#modalGenerico').classList.remove('hidden');
}
function chiudiModal() {
  $('#modalGenerico').classList.add('hidden');
}

function apriManuale() {
  $('#modalHelp').classList.remove('hidden');
}

function bindGlobalUI() {
  $('#closeModalGenerico').addEventListener('click', chiudiModal);
  $('#closeHelp').addEventListener('click', () => $('#modalHelp').classList.add('hidden'));
  $('#helpBtn').addEventListener('click', apriManuale);
}

// ── Splash screen d'ingresso ──
function gestisciSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('splash-hide');
    setTimeout(() => splash.remove(), 550); // combacia con la transizione CSS
  }, SPLASH_DURATION_MS);
}

// ── Avvio ──
document.addEventListener('DOMContentLoaded', () => {
  gestisciSplash();
  initApp();
});

// ── Registrazione Service Worker + banner aggiornamento ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      if (reg.waiting) mostraBannerAggiornamento(reg);
      reg.addEventListener('updatefound', () => {
        const nuovo = reg.installing;
        nuovo.addEventListener('statechange', () => {
          if (nuovo.state === 'installed' && navigator.serviceWorker.controller) {
            mostraBannerAggiornamento(reg);
          }
        });
      });
    }).catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

function mostraBannerAggiornamento(reg) {
  const banner = $('#updateBanner');
  banner.classList.add('visible');
  $('#updateNowBtn').onclick = () => reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  $('#updateDismissBtn').onclick = () => banner.classList.remove('visible');
}
