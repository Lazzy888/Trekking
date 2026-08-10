// ============================================================
// Trekking v1.4 — config.js
// Copyright (c) 2026 Lazzaro Serva - Centola
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================
//
// Sincronizzazione di gruppo (Worker Cloudflare + KV). Disattiva di
// default: finché SYNC_ENABLED resta false, tutto funziona come prima,
// 100% locale. Per attivarla, dopo aver distribuito il Worker (vedi
// /trekking-sync-worker/README.md):
//   1. imposta SYNC_ENABLED = true
//   2. incolla l'indirizzo del Worker in API_BASE_URL
//   3. incolla la chiave pubblica VAPID in VAPID_PUBLIC_KEY

const APP_VERSION = '1.4.1';

const SYNC_ENABLED = true;
const API_BASE_URL = 'https://trekking-sync.algoritmosoftware.workers.dev'; // es. 'https://trekking-sync.<account>.workers.dev'
const VAPID_PUBLIC_KEY = 'BGC2t5shh9vXILbN3nzNFR0EevFQUvvZWzdg323w4pnYSMSm-MYff7jvJ69xy7A-_7SJisgKFLuJYHRiatMJZls'; // chiave pubblica generata da generate-vapid-keys.mjs

// Ogni quanti millisecondi la vista Gruppo interroga il Worker per nuovi
// messaggi e posizioni, quando la sincronizzazione è attiva e la vista è
// aperta. Nessun polling se SYNC_ENABLED è false o il gruppo non ha un
// codice attivo.
const SYNC_POLL_MS = 15000;

// Dopo quanti minuti senza aggiornamento una posizione live viene
// considerata "vecchia" e mostrata in grigio sulla mappa invece che a colori.
const POSIZIONE_STANTIA_MIN = 20;

// Percorso del file JSON con le escursioni demo, caricabile in modalità
// APPEND dalle Impostazioni ("Carica escursioni di esempio").
const DEMO_DATA_URL = './demo/trekking-demo-escursioni.json';

// Durata dello splash screen d'ingresso (millisecondi).
const SPLASH_DURATION_MS = 3000;

// Ruoli previsti nel modello dati (il ruolo 'admin' non ha ancora
// effetti operativi in v1.3: resta disponibile per un futuro pannello
// di moderazione lato Worker).
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

// ============================================================
// METEO AUTOMATICO — Open-Meteo (gratuito, senza chiave API)
// ============================================================
// Geocoding: converte il nome del luogo di partenza in coordinate.
const GEOCODING_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';
// Previsioni giornaliere per le coordinate ottenute (o quelle del primo
// punto della traccia GPX, se già importata).
const METEO_API_URL = 'https://api.open-meteo.com/v1/forecast';

// Ogni quante ore una previsione già scaricata viene considerata "vecchia"
// e va rinnovata automaticamente riaprendo la scheda escursione.
const METEO_CACHE_ORE = 6;

// Mappatura essenziale dei codici meteo WMO (usati da Open-Meteo) in
// icona + descrizione breve in italiano.
const METEO_WMO = {
  0: ['☀️', 'Sereno'], 1: ['🌤️', 'Prevalentemente sereno'], 2: ['⛅', 'Parzialmente nuvoloso'], 3: ['☁️', 'Coperto'],
  45: ['🌫️', 'Nebbia'], 48: ['🌫️', 'Nebbia con brina'],
  51: ['🌦️', 'Pioviggine debole'], 53: ['🌦️', 'Pioviggine'], 55: ['🌧️', 'Pioviggine intensa'],
  61: ['🌧️', 'Pioggia debole'], 63: ['🌧️', 'Pioggia'], 65: ['🌧️', 'Pioggia intensa'],
  71: ['🌨️', 'Neve debole'], 73: ['🌨️', 'Neve'], 75: ['❄️', 'Neve intensa'],
  80: ['🌦️', 'Rovesci deboli'], 81: ['🌧️', 'Rovesci'], 82: ['⛈️', 'Rovesci forti'],
  95: ['⛈️', 'Temporale'], 96: ['⛈️', 'Temporale con grandine'], 99: ['⛈️', 'Temporale forte con grandine'],
};
function descrizioneMeteo(codice) { return METEO_WMO[codice] || ['❔', 'Non disponibile']; }

// ============================================================
// STATO DEL SENTIERO — campo curato manualmente (capogruppo/admin)
// ============================================================
const STATO_SENTIERO_OPZIONI = [
  { key: 'aperto',     label: '🟢 Aperto / condizioni regolari' },
  { key: 'attenzione', label: '🟡 Attenzione / tratti difficoltosi' },
  { key: 'chiuso',     label: '🔴 Chiuso / impraticabile' },
];
