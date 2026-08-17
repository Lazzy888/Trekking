# Trekking DEMO — Pianifica con il gruppo

PWA offline-first per la pianificazione di escursioni di gruppo tra amici:
percorsi e itinerari, attrezzatura (gestita dall'amministratore), bacheca
del gruppo, chat locale, gestione partecipanti e sicurezza, archiviazione
delle uscite concluse.

**Versione DEMO**: tutti i dati restano sul dispositivo in uso, nessuna
sincronizzazione automatica tra i telefoni del gruppo. Il codice per una
sincronizzazione di gruppo in tempo reale (chat live, posizione condivisa,
notifiche push) è già pronto in `sync.js` e nel Worker separato
`/trekking-sync-worker`, ma va attivato solo su una copia dell'app dedicata
a un gruppo specifico, su richiesta esplicita all'autore.

| | |
|---|---|
| **Versione** | 1.5.0 (DEMO) |
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
├── sync.js                  ← comunicazione con il Worker Cloudflare (chat, posizione, push)
├── service-worker.js       ← cache offline, banner di aggiornamento, notifiche push
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
  bacheca/chat, SOS con coordinate GPS via SMS, calcolatore peso zaino,
  link di monitoraggio per chi resta a casa.
- **Sincronizzazione di gruppo (facoltativa)**: chat in tempo reale,
  posizione GPS live dei partecipanti e notifiche push (Web Push
  standard, VAPID), tramite il Worker Cloudflare in
  `/trekking-sync-worker` (progetto separato — vedi il suo README per il
  deploy). Disattivata di default: senza configurarla, tutto resta
  locale come nelle versioni precedenti.
- **Meteo automatico**: previsioni giornaliere per data e luogo di
  partenza (o coordinate della traccia GPX), tramite il servizio
  gratuito Open-Meteo (nessuna chiave API richiesta).
- **Stato del sentiero**: badge aperto/attenzione/chiuso con note,
  curato manualmente da chi organizza; se la sincronizzazione di gruppo
  è attiva, aggiornarlo avvisa subito tutto il gruppo.
- **Offline-first**: tutti i dati restano sul dispositivo (IndexedDB),
  Service Worker cache-first, nessun account richiesto.
- **Splash screen** animato (~3s) con dati fissi dell'autore, set icone
  completo (any/maskable/apple-touch/favicon) e dati demo importabili in
  append da `demo/trekking-demo-escursioni.json`.

## Roadmap (fase successiva)

- Pannello amministratore per il Worker (ruolo `admin` già previsto nel
  modello dati) — moderazione chat, invio avvisi broadcast senza passare
  da un messaggio.
- Storage D1 (relazionale) al posto del solo KV, se il volume di dati
  dovesse crescere oltre un uso "gruppo di amici".

## Deploy

App statica: pubblicabile su Cloudflare Pages o GitHub Pages senza build
step. Assicurarsi che `manifest.json`, `service-worker.js` e `assets/`
siano serviti dalla root dello scope dell'app.

## Privacy

Per impostazione predefinita nessun dato lascia il dispositivo. Se la
sincronizzazione di gruppo viene attivata (facoltativa, escursione per
escursione), messaggi chat, posizione GPS live e registrazione notifiche
push vengono inviati al Worker Cloudflare configurato. Dettagli completi
nel manuale d'uso in-app (pulsante ❓), in `ARCHITETTURA-SYNC.md` e nel
README di `/trekking-sync-worker`.
