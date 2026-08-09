# Sincronizzazione di gruppo — Worker Cloudflare (v1.3, implementata)

**Aggiornamento v1.3:** la sincronizzazione descritta come piano in questo
documento è stata implementata. Questa sezione riassume cosa è stato
realizzato davvero; il resto del documento (sotto) resta come riferimento
storico delle scelte di design fatte in fase di predisposizione (V1.0-1.2).

## Cosa è stato implementato

- **Chat di gruppo** al posto della bacheca locale, con polling ogni
  `SYNC_POLL_MS` (15s di default) mentre la vista Gruppo è aperta, invece
  del Background Sync via Service Worker ipotizzato inizialmente: più
  semplice da mantenere per un gruppo di amici, con un costo in
  freschezza dei dati (15s) ritenuto accettabile.
- **Posizione live**: `navigator.geolocation.watchPosition` invia le
  coordinate al Worker ogni ~30s finché la relativa casella resta
  spuntata; le posizioni scadono da sole dopo 4h (TTL nativo di
  Cloudflare KV, nessun job di pulizia).
- **Notifiche push**: standard Web Push con VAPID, cifratura aes128gcm
  implementata da zero con WebCrypto (nessuna dipendenza npm nel
  Worker). Un messaggio "urgente" nella chat le invia automaticamente a
  tutti gli iscritti del gruppo.
- **Storage**: solo **Cloudflare KV** (niente D1), con chiavi prefissate
  per gruppo (`grp:<codice>:...`). Sufficiente per il volume di dati di
  un gruppo di amici; lo schema D1 più sotto resta un'opzione se servisse
  in futuro un modello relazionale.
- **Nessun account**: un "codice gruppo" di 6 caratteri, generato
  dall'app e condiviso a voce/messaggio, isola i dati di ogni escursione.
  Non è autenticazione forte — scelta consapevole, spiegata nel manuale
  d'uso in-app e nel README del Worker.
- **Ruolo `admin`**: non ancora usato operativamente (nessun pannello di
  moderazione in v1.3); resta nel modello dati per una fase successiva.

Il progetto del Worker è separato dalla PWA, in `/trekking-sync-worker`
(vedi il suo README per deploy, generazione chiavi VAPID ed elenco
endpoint).

## Documento originale (predisposizione V1.0-1.2)

Le sezioni seguenti descrivono come la V1.0 era stata predisposta per
l'aggiunta della sincronizzazione, prima che venisse implementata.
Restano come nota storica del ragionamento fatto.

## 1. Schema dati "sync-ready"

Ogni record salvato tramite `storage.js` riceve automaticamente:

- `id` — UUID generato client-side (`uuid()` in `storage.js`)
- `updatedAt` — timestamp dell'ultima modifica locale
- `syncStatus` — `'local'` (V1.0, mai sincronizzato) / `'pending'` /
  `'synced'` (valori futuri, usati quando `SYNC_ENABLED = true`)

Questo evita una migrazione dei dati quando si passerà alla sync: i record
già scritti in V1.0 sono già nel formato atteso dal backend.

## 2. Livello di astrazione storage

Tutte le operazioni di lettura/scrittura passano da funzioni generiche in
`storage.js` (`dbSave`, `dbGet`, `dbGetAll`, `dbGetByIndex`, `dbDelete`).
Nessun modulo di `app.js` parla direttamente con IndexedDB.

Quando si attiverà la sync, basterà estendere queste funzioni (non i
moduli che le chiamano) per:
1. scrivere sempre in locale (offline-first, invariato)
2. accodare una chiamata `fetch` verso `API_BASE_URL` quando `SYNC_ENABLED`
   è `true` e la rete è disponibile
3. aggiornare `syncStatus` da `pending` a `synced` in caso di successo
4. gestire un Background Sync (Service Worker) per i casi offline

## 3. Config centralizzata

In `config.js`:

```js
const SYNC_ENABLED = false;      // diventerà true al deploy del Worker
const API_BASE_URL = '';         // es. https://trekking-sync.<account>.workers.dev
```

Attivare la sync sarà un cambio di questi due valori più l'estensione del
livello storage — non un refactor dell'interfaccia utente.

## 4. Ruolo amministratore già nel modello

`RUOLI_PARTECIPANTE` in `config.js` include già `'admin'`. In V1.0 questo
ruolo non ha effetti particolari nell'interfaccia; sarà il pannello
amministratore (fase successiva) a usarlo per:

- pubblicare avvisi push a tutto il gruppo tramite il Worker
- modificare/validare percorsi condivisi
- gestire più escursioni/gruppi centralmente

## 5. Bozza schema D1 (relazionale) — solo su carta, da creare al bisogno

```sql
CREATE TABLE escursioni (
  id TEXT PRIMARY KEY,
  nome TEXT, partenza TEXT, arrivo TEXT, data TEXT,
  difficolta TEXT, dislivello_pos INTEGER, dislivello_neg INTEGER,
  lunghezza_km REAL, quota_max INTEGER, traccia_gpx TEXT,
  ritrovo_luogo TEXT, ritrovo_orario TEXT,
  updated_at INTEGER
);

CREATE TABLE partecipanti (
  id TEXT PRIMARY KEY, escursione_id TEXT, nome TEXT,
  ruolo TEXT, stato TEXT, updated_at INTEGER
);

CREATE TABLE equipaggiamento (
  id TEXT PRIMARY KEY, escursione_id TEXT, nome TEXT,
  categoria TEXT, motivo TEXT, assegnato_a TEXT, spuntato INTEGER,
  updated_at INTEGER
);

CREATE TABLE bacheca (
  id TEXT PRIMARY KEY, escursione_id TEXT, testo TEXT,
  autore_id TEXT, data INTEGER
);
```

## 6. Bozza uso KV

- `session:<userId>` — stato sessione rapido/leggero
- `meteo:<escursioneId>` — cache bollettino meteo per la finestra escursione
- `admin-config` — flag e messaggi impostati dal pannello amministratore

Questi punti restano solo una traccia: l'implementazione reale del Worker
verrà affrontata come task dedicato successivo alla V1.0.
