# Predisposizione per Worker Cloudflare + KV/D1 (fase successiva alla V1.0)

Questo documento descrive come la V1.0 è già predisposta per l'aggiunta della
sincronizzazione cloud, in modo da limitare gli interventi quando si
implementerà davvero il backend.

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
