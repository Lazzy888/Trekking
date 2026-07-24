// ============================================================
// Trekking v1.0 — config.js
// Copyright (c) 2026 Lazzaro Serva - Centola
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================
//
// Unico punto in cui si attiverà la sincronizzazione cloud
// (Worker Cloudflare + KV/D1) quando sarà pronta. In V1.0 resta
// disattivata: tutti i dati restano sul dispositivo.

const APP_VERSION = '1.0';

// Passare a true quando il Worker sarà disponibile.
const SYNC_ENABLED = false;

// URL del Worker Cloudflare (da valorizzare in fase di deploy del backend).
const API_BASE_URL = ''; // es. 'https://trekking-sync.tuoaccount.workers.dev'

// Ruoli previsti nel modello dati (il ruolo 'admin' non ha ancora
// effetti in V1.0: sarà usato dal pannello amministratore futuro
// per inviare indicazioni al gruppo tramite il Worker).
const RUOLI_PARTECIPANTE = [
  'capogruppo', 'capofila', 'scopa',
  'responsabile-sicurezza', 'responsabile-attrezzatura',
  'admin', 'membro',
];

const DIFFICOLTA_SCALA = ['T', 'E', 'EE', 'EEA'];
