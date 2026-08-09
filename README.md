# Trekking — Pianifica con il gruppo

PWA offline-first per la pianificazione di escursioni di gruppo tra amici:
percorsi e itinerari, attrezzatura, equipaggiamento condiviso, gestione
gruppo e sicurezza.

| | |
|---|---|
| **Versione** | 1.2 |
| **Autore** | Lazzaro Serva — [graficaesiti.it](http://www.graficaesiti.it/) |
| **Licenza** | Privata — Tutti i diritti riservati |
| **Tecnologie** | HTML5, CSS3, JavaScript vanilla, IndexedDB, Service Worker, Leaflet |

## Struttura repository

```
trekking/
├── index.html            ← markup + modali (form, manuale d'uso)
├── style.css              ← tema trekking, accessibile
├── config.js               ← flag di configurazione (SYNC_ENABLED, ruoli...)
├── storage.js              ← livello di persistenza IndexedDB, sync-ready
├── app.js                  ← logica applicativa (percorsi, attrezzatura, gruppo, impostazioni)
├── service-worker.js       ← cache offline, banner di aggiornamento
├── manifest.json            ← configurazione PWA
├── monitoraggio.html        ← pagina statica di sola lettura per il link "resto a casa"
├── assets/
│   ├── icon-192.png / icon-512.png            ← icone "any" (arrotondate + ombra)
│   ├── icon-192-maskable.png / icon-512-maskable.png  ← icone "maskable" (full-bleed)
│   ├── apple-touch-icon.png                   ← icona iOS (senza trasparenza)
│   ├── favicon.ico / favicon-64.png
│   └── source/                                ← icona originale e master ad alta risoluzione
├── demo/
│   └── trekking-demo-escursioni.json          ← 3 escursioni di esempio (import in append)
├── ARCHITETTURA-SYNC.md    ← predisposizione per Worker Cloudflare + KV/D1
├── LICENSE
├── AUTHORS
├── CHANGELOG
└── README.md
```

## Funzionalità V1.0

- **Percorsi e Itinerari**: creazione escursione, import traccia GPX,
  calcolo automatico di lunghezza/dislivelli, mappa interattiva offline-ready,
  condivisione rapida.
- **Attrezzatura e Consigli**: checklist base + checklist intelligente
  (quota, ferrate, disponibilità acqua), consigli di sicurezza.
- **Equipaggiamento richiesto**: personale obbligatorio/consigliato, di
  gruppo condiviso, emergenza — con assegnazione "chi porta cosa".
- **Gruppo**: partecipanti, ruoli, stato presenza, punto di ritrovo,
  bacheca avvisi locale, SOS con coordinate GPS via SMS.
- **Offline-first**: tutti i dati restano sul dispositivo (IndexedDB),
  Service Worker cache-first, nessun account richiesto.
- **Splash screen** animato (~3s) con dati fissi dell'autore, set icone
  completo (any/maskable/apple-touch/favicon) e dati demo importabili in
  append da `demo/trekking-demo-escursioni.json`.

## Roadmap (fase successiva)

- Sincronizzazione cloud multi-dispositivo tramite Worker Cloudflare +
  storage KV/D1 (schema già predisposto, vedi `ARCHITETTURA-SYNC.md`)
- Pannello amministratore (ruolo `admin` già previsto nel modello dati)
- Notifiche push da backend, posizione live condivisa tra i partecipanti

## Deploy

App statica: pubblicabile su Cloudflare Pages o GitHub Pages senza build
step. Assicurarsi che `manifest.json`, `service-worker.js` e `assets/`
siano serviti dalla root dello scope dell'app.

## Privacy

Nessun dato lascia il dispositivo in questa versione. Dettagli completi
nel manuale d'uso in-app (pulsante ❓) e in `ARCHITETTURA-SYNC.md` per la
fase di sincronizzazione futura.
