// ============================================================
// Trekking v1.2 — config.js
// Copyright (c) 2026 Lazzaro Serva - Centola
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================
//
// Unico punto in cui si attiverà la sincronizzazione cloud
// (Worker Cloudflare + KV/D1) quando sarà pronta. In V1.0 resta
// disattivata: tutti i dati restano sul dispositivo.

const APP_VERSION = '1.2';

// Percorso del file JSON con le escursioni demo, caricabile in modalità
// APPEND dalle Impostazioni ("Carica escursioni di esempio").
const DEMO_DATA_URL = './demo/trekking-demo-escursioni.json';

// Durata dello splash screen d'ingresso (millisecondi).
const SPLASH_DURATION_MS = 3000;

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

// Scarto massimo (kg) tollerato tra il partecipante più carico e quello
// meno carico prima che il calcolatore peso zaino mostri l'avviso di
// sbilanciamento (sezione Gruppo → ⚖️ Peso zaino).
const PESO_SBILANCIAMENTO_KG = 3;

// Categorie disponibili per i punti d'interesse (waypoint) sulla mappa.
const WAYPOINT_TIPI = [
  { key: 'acqua',    label: '💧 Fonte d\'acqua' },
  { key: 'rifugio',  label: '🏠 Rifugio/punto di appoggio' },
  { key: 'panorama', label: '🌄 Punto panoramico' },
  { key: 'pericolo', label: '⚠️ Pericolo/via di fuga' },
];

// Itinerari predefiniti — libreria curata mostrata in Percorsi accanto
// alle escursioni create dall'utente. "Usa questo percorso" ne clona i
// dati in una nuova escursione modificabile (nessuna traccia GPX inclusa:
// l'utente la importa a parte se disponibile).
const ITINERARI_PREDEFINITI = [
  {
    nome: 'Anello del Monte Bulgheria', partenza: 'San Giovanni a Piro',
    arrivo: 'San Giovanni a Piro', durataStimata: '6h', difficolta: 'E',
    dislivelloPos: 950, dislivelloNeg: 950, quotaMax: 1225, lunghezzaKm: 12,
    ferrata: false, senzaAcqua: true,
    descrizione: 'Anello panoramico sul Cilento con vista sul golfo di Policastro. Nessuna fonte d\'acqua lungo il percorso.',
  },
  {
    nome: 'Sentiero del Pertuso', partenza: 'Casaletto Spartano',
    arrivo: 'Casaletto Spartano', durataStimata: '4h', difficolta: 'E',
    dislivelloPos: 450, dislivelloNeg: 450, quotaMax: 620, lunghezzaKm: 8,
    ferrata: false, senzaAcqua: false,
    descrizione: 'Percorso nella gola del fiume Bussento, adatto a gruppi con partecipanti meno esperti.',
  },
  {
    nome: 'Monte Cervati da Piaggine', partenza: 'Piaggine',
    arrivo: 'Piaggine', durataStimata: '7h', difficolta: 'EE',
    dislivelloPos: 1100, dislivelloNeg: 1100, quotaMax: 1898, lunghezzaKm: 14,
    ferrata: false, senzaAcqua: true,
    descrizione: 'Vetta più alta della Campania. Tratto finale su cresta esposta al vento, quota elevata.',
  },
  {
    nome: 'Via Ferrata del Vallone delle Ripe', partenza: 'Ottati',
    arrivo: 'Ottati', durataStimata: '5h', difficolta: 'EEA',
    dislivelloPos: 500, dislivelloNeg: 500, quotaMax: 950, lunghezzaKm: 5,
    ferrata: true, senzaAcqua: true,
    descrizione: 'Percorso attrezzato: obbligatorio kit da ferrata completo (imbrago, casco, set da ferrata).',
  },
];
