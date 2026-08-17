// ============================================================
// Trekking v1.5 — storage.js (livello di persistenza)
// Copyright (c) 2026 Lazzaro Serva - Centola
// Via Tasso, 28 – 84051 CENTOLA (SA) – Italia
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================
//
// Astrae la persistenza su IndexedDB. In V1.0 tutto resta locale
// (nessun dato lascia il dispositivo). Ogni record ha già i campi
// "sync-ready" (id, updatedAt, syncStatus) così che in una fase
// successiva sia sufficiente aggiungere le chiamate verso il
// Worker Cloudflare (KV/D1) dentro queste stesse funzioni, senza
// toccare il resto dell'app.
//
// Flag di configurazione (vedi anche config.js):
//   SYNC_ENABLED = false  → V1.0, tutto locale
//   SYNC_ENABLED = true   → attiverà le chiamate fetch verso API_BASE_URL
// ============================================================

const DB_NAME    = 'trekking_db';
const DB_VERSION = 3; // v3: aggiunti "bachecaGlobale", "chatGlobale" e "admin" (v1.5 DEMO)

const STORES = {
  escursioni:      'escursioni',      // percorsi/itinerari
  partecipanti:    'partecipanti',    // membri del gruppo per escursione
  equipaggiamento: 'equipaggiamento', // voci equipaggiamento (personale/gruppo)
  bacheca:         'bacheca',         // note locali per singola escursione (cambio orario, meteo, ecc.)
  waypoints:       'waypoints',       // punti d'interesse su mappa (acqua/rifugio/panorama/pericolo)
  impostazioni:    'impostazioni',    // config app (chiave/valore)
  bachecaGlobale:  'bachecaGlobale',  // avvisi generali del gruppo, non legati a una singola escursione — scritti solo dall'amministratore
  chatGlobale:     'chatGlobale',     // chat locale aperta a tutti i partecipanti del gruppo
  admin:           'admin',           // record singolo con hash+salt della password amministratore
};

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.escursioni)) {
        const s = db.createObjectStore(STORES.escursioni, { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.partecipanti)) {
        const s = db.createObjectStore(STORES.partecipanti, { keyPath: 'id' });
        s.createIndex('escursioneId', 'escursioneId');
      }
      if (!db.objectStoreNames.contains(STORES.equipaggiamento)) {
        const s = db.createObjectStore(STORES.equipaggiamento, { keyPath: 'id' });
        s.createIndex('escursioneId', 'escursioneId');
      }
      if (!db.objectStoreNames.contains(STORES.bacheca)) {
        const s = db.createObjectStore(STORES.bacheca, { keyPath: 'id' });
        s.createIndex('escursioneId', 'escursioneId');
      }
      if (!db.objectStoreNames.contains(STORES.waypoints)) {
        const s = db.createObjectStore(STORES.waypoints, { keyPath: 'id' });
        s.createIndex('escursioneId', 'escursioneId');
      }
      if (!db.objectStoreNames.contains(STORES.impostazioni)) {
        db.createObjectStore(STORES.impostazioni, { keyPath: 'chiave' });
      }
      if (!db.objectStoreNames.contains(STORES.bachecaGlobale)) {
        db.createObjectStore(STORES.bachecaGlobale, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.chatGlobale)) {
        db.createObjectStore(STORES.chatGlobale, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.admin)) {
        db.createObjectStore(STORES.admin, { keyPath: 'id' }); // record singolo, id fisso 'admin'
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDb().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Helper: applica i campi "sync-ready" ad ogni record ──
function withSyncFields(record) {
  return {
    ...record,
    id: record.id || uuid(),
    updatedAt: Date.now(),
    // 'local'   → mai sincronizzato
    // 'pending' → modificato dopo l'ultima sync
    // 'synced'  → allineato col server
    syncStatus: SYNC_ENABLED ? 'pending' : 'local',
  };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================
// API GENERICA per-store (usata da tutti i moduli app.js)
// ============================================================

async function dbSave(storeName, record) {
  const store  = await tx(storeName, 'readwrite');
  const record2 = withSyncFields(record);
  await reqToPromise(store.put(record2));
  // Punto di aggancio futuro: se SYNC_ENABLED, qui si accoderebbe
  // la chiamata verso il Worker (POST /api/<store>) e si aggiornerebbe
  // syncStatus a 'synced' in caso di successo.
  return record2;
}

async function dbGet(storeName, id) {
  const store = await tx(storeName);
  return reqToPromise(store.get(id));
}

async function dbGetAll(storeName) {
  const store = await tx(storeName);
  return reqToPromise(store.getAll());
}

async function dbGetByIndex(storeName, indexName, value) {
  const store = await tx(storeName);
  const index = store.index(indexName);
  return reqToPromise(index.getAll(value));
}

async function dbDelete(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.delete(id));
}

// ── Impostazioni chiave/valore (tema, dimensione testo, ecc.) ──
async function settingGet(chiave, def = null) {
  const store = await tx(STORES.impostazioni);
  const r = await reqToPromise(store.get(chiave));
  return r ? r.valore : def;
}
async function settingSet(chiave, valore) {
  const store = await tx(STORES.impostazioni, 'readwrite');
  return reqToPromise(store.put({ chiave, valore }));
}

// ============================================================
// EXPORT / IMPORT JSON (condivisione locale tra dispositivi in V1.0,
// in attesa della sincronizzazione cloud reale)
// ============================================================

async function exportAllData() {
  const [escursioni, partecipanti, equipaggiamento, bacheca, waypoints, bachecaGlobale, chatGlobale, admin] = await Promise.all([
    dbGetAll(STORES.escursioni),
    dbGetAll(STORES.partecipanti),
    dbGetAll(STORES.equipaggiamento),
    dbGetAll(STORES.bacheca),
    dbGetAll(STORES.waypoints),
    dbGetAll(STORES.bachecaGlobale),
    dbGetAll(STORES.chatGlobale),
    dbGetAll(STORES.admin), // include il record con hash+salt: la password amministratore
                             // viaggia insieme a tutti i dati, come richiesto (un solo amministratore
                             // per gruppo, trasmissibile tra device tramite questo stesso export).
  ]);
  return {
    app: 'trekking', versione: '1.5', esportatoIl: new Date().toISOString(),
    escursioni, partecipanti, equipaggiamento, bacheca, waypoints,
    bachecaGlobale, chatGlobale, admin,
  };
}

async function importAllData(json) {
  if (!json || json.app !== 'trekking') throw new Error('File non valido per Trekking.');
  const ops = [];
  (json.escursioni || []).forEach(r => ops.push(dbSave(STORES.escursioni, r)));
  (json.partecipanti || []).forEach(r => ops.push(dbSave(STORES.partecipanti, r)));
  (json.equipaggiamento || []).forEach(r => ops.push(dbSave(STORES.equipaggiamento, r)));
  (json.bacheca || []).forEach(r => ops.push(dbSave(STORES.bacheca, r)));
  (json.waypoints || []).forEach(r => ops.push(dbSave(STORES.waypoints, r)));
  (json.bachecaGlobale || []).forEach(r => ops.push(dbSave(STORES.bachecaGlobale, r)));
  (json.chatGlobale || []).forEach(r => ops.push(dbSave(STORES.chatGlobale, r)));
  // Il record amministratore è un singleton (id fisso 'admin'): importandolo
  // si eredita l'amministratore del gruppo di provenienza del file, come da
  // requisito "un solo amministratore, trasmissibile tra i device insieme a
  // tutti i dati". Se sul device di arrivo era già stato impostato un
  // amministratore diverso, viene sostituito da quello importato.
  (json.admin || []).forEach(r => ops.push(dbSave(STORES.admin, r)));
  await Promise.all(ops);
}
