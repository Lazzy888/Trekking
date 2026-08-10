// ============================================================
// Trekking v1.4 — sync.js
// Copyright (c) 2026 Lazzaro Serva - Centola
// Via Tasso, 28 – 84051 CENTOLA (SA) – Italia
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================
//
// Comunicazione con il Worker Cloudflare "trekking-sync" (vedi
// /trekking-sync-worker). Attiva solo se SYNC_ENABLED è true in
// config.js e l'escursione ha un codiceGruppo. Nessuna di queste
// funzioni tocca IndexedDB: chi la chiama in app.js si occupa di
// tenere allineata anche la copia locale.
// ============================================================

// ── Identità locale del dispositivo (un id stabile, non un account) ──
async function getPartecipanteIdLocale() {
  let id = await settingGet('partecipanteIdLocale', null);
  if (!id) { id = uuid(); await settingSet('partecipanteIdLocale', id); }
  return id;
}
async function getNomeLocale() {
  return settingGet('nomeLocale', '');
}
async function setNomeLocale(nome) {
  return settingSet('nomeLocale', nome);
}

// ── Codice gruppo: 6 caratteri alfanumerici maiuscoli, facili da leggere a voce ──
function generaCodiceGruppo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // esclude 0/O/1/I ambigui
  let c = '';
  for (let i = 0; i < 6; i++) c += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return c;
}

function syncAttivaPer(escursione) {
  return !!(SYNC_ENABLED && API_BASE_URL && escursione && escursione.codiceGruppo);
}

async function apiFetch(codiceGruppo, percorso, opzioni) {
  const res = await fetch(`${API_BASE_URL}/api/gruppo/${encodeURIComponent(codiceGruppo)}/${percorso}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opzioni,
  });
  if (!res.ok) throw new Error(`Worker: risposta ${res.status}`);
  return res.json();
}

// ── Presenza ──
async function syncJoin(codiceGruppo, partecipanteId, nome) {
  return apiFetch(codiceGruppo, 'join', { method: 'POST', body: JSON.stringify({ partecipanteId, nome }) });
}

// ── Chat / bacheca ──
async function syncFetchMessaggi(codiceGruppo, since) {
  const r = await apiFetch(codiceGruppo, `messaggi?since=${since || 0}`);
  return r.messaggi || [];
}
async function syncInviaMessaggio(codiceGruppo, { id, autore, testo, urgente }) {
  return apiFetch(codiceGruppo, 'messaggi', { method: 'POST', body: JSON.stringify({ id, autore, testo, urgente: !!urgente }) });
}
async function syncEliminaMessaggio(codiceGruppo, id) {
  return apiFetch(codiceGruppo, `messaggi/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Posizione live ──
async function syncInviaPosizione(codiceGruppo, { partecipanteId, nome, lat, lon }) {
  return apiFetch(codiceGruppo, 'posizione', { method: 'POST', body: JSON.stringify({ partecipanteId, nome, lat, lon }) });
}
async function syncFetchPosizioni(codiceGruppo) {
  const r = await apiFetch(codiceGruppo, 'posizioni');
  return r.posizioni || [];
}

// ── Notifiche push ──
function urlBase64ToUint8Array(base64url) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function attivaPushPerGruppo(codiceGruppo, partecipanteId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Le notifiche push non sono supportate su questo dispositivo/browser.');
  }
  if (!VAPID_PUBLIC_KEY) throw new Error('Chiave VAPID non configurata (vedi config.js).');
  const permesso = await Notification.requestPermission();
  if (permesso !== 'granted') throw new Error('Permesso notifiche negato.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await apiFetch(codiceGruppo, 'push/subscribe', {
    method: 'POST', body: JSON.stringify({ partecipanteId, subscription: sub.toJSON() }),
  });
  return true;
}

async function disattivaPushPerGruppo(codiceGruppo, partecipanteId) {
  await apiFetch(codiceGruppo, 'push/unsubscribe', {
    method: 'POST', body: JSON.stringify({ partecipanteId }),
  });
}
