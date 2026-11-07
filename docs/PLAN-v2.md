# NetBreach v2 – Erweiterungsplan

## Grundsätze

- Alle Zahlen in `src/core/config.ts` (neue Abschnitte: `exploits`, `cryptoMarket`,
  `contracts`, `worldEvents`, `rivals`, `botnet`, `collective`, `achievements`, `minigame`).
- Neue Systeme als eigene Module unter `src/core/systems/`, damit `simulation.ts`
  nur die Reihenfolge orchestriert. Kein System kennt das DOM → headless testbar.
- Zufall über einen gespeicherten Seed (`state.rng`, mulberry32) → der Balancing-Bot
  ist reproduzierbar, Spielstände sind deterministisch fortsetzbar.
- `SAVE_VERSION` 1 → 2. `deserialize()` füllt alle neuen Felder aus
  `createInitialState()` auf (tiefes Mergen der neuen Unterobjekte).

## Neue / geänderte Dateien

| Datei | Änderung |
|---|---|
| `core/config.ts` | neue Ziele, Nodes, Forschung (Tier 9–11), alle neuen System-Werte |
| `core/types.ts` | `Cost.models`, neue Port-Arten `bot` + `shield`, neue State-Felder |
| `core/state.ts` | Standardwerte, Modifikatoren aus Ereignissen/Erfolgen/Kollektiv |
| `core/save.ts` | Migration v1 → v2 |
| `core/simulation.ts` | Tick-Reihenfolge, Kern-Phasen, Botnetz, Labor, Blackout, Sperren |
| `core/systems/rng.ts` | Seed-Zufall |
| `core/systems/exploits.ts` | Herstellung, Lager, Verbrauch beim Hack-Start |
| `core/systems/crypto.ts` | Kurs (Random Walk mit Rückkehr zum Mittel), Verlauf, Tausch |
| `core/systems/contracts.ts` | Auftrags-Board, Fortschritt, Belohnungen |
| `core/systems/worldEvents.ts` | Ereignisse + Modifikatoren |
| `core/systems/rivals.ts` | Angriffsplanung, Countdown, Abwehr, Schaden, Rückverfolgung |
| `core/systems/achievements.ts` | Erfolge prüfen, Boni |
| `core/game.ts` | neue Aktionen (Tauschen, Aufträge, Exploit-Auswahl, Kollektiv, Minispiel) |
| `core/offline.ts` | `offline: true` → keine Angriffe/neuen Ereignisse/Auftrags-Timer |
| `nodes/definitions.ts` | 5 neue Node-Typen, Ports `bot` (lime) und `shield` (rot) |
| `ui/panel.ts` | neue Tabs: Aufträge, Krypto, Erfolge, Statistik; Kollektiv im Identitäts-Tab |
| `ui/hud.ts` | News-Ticker, Modelle, Rivalen-Countdown |
| `ui/cryptoChart.ts` | Kurs-Diagramm (SVG) |
| `ui/minigame.ts` | Terminal-Minispiel (Modal) |
| `ui/nodeview.ts`, `ui/inspector.ts` | Darstellung der neuen Nodes, Kern-Phasen |
| `scripts/balance.ts` | mehrere Läufe mit Prestige, nutzt alle neuen Systeme |

## Neue Daten im State

```ts
models, exploits: Record<family, number>, exploitAuto: Record<family, boolean>
crypto market: { price, history[], t }
contracts: { offers: Contract[], nextIn }
worldEvents: { active: {id, left, family?}[], nextIn }
rival: { nextIn, warning: {left, strength} | null, track, located, level }
blackout: number                       // Sekunden Stromausfall
collective: { shares, sharesTotal, founded, upgrades }
achievements: string[]
stats: { hacks, money, raids, playTime, contracts, repelled, exploits, minigames, cores, dataSold }  // lebenslang
rng: number
NodeInstance: devices? (Botnetz), locked? (Sekunden gesperrt), craft? (Exploit-Familie)
HackJob: phase?, exploit?, minigame?
```

## Tick-Reihenfolge (simulation.ts)

1. Timer: Razzia, Blackout, Node-Sperren
2. **Welt** (`worldEvents`, `crypto`, `contracts`, `rivals` – Letztere nur online)
3. `computeRuntime`: Strom (Blackout schaltet Netzteile ohne USV ab) → Kühlung →
   GPU → **Botnetz-OPS** → Bandbreite → Proxy → Script → **Firewall/Honeypot** → Rechner
4. Hacks: Exploit beim Start, **Kern-Phasen** (OPS → GPU → Bandbreite), Belohnungen
   inkl. Modelle, Botnetz-Wachstum, Blackout-Effekt, Auftrags-Fortschritt
5. Datenfluss Rechner → Speicher → Markt/**Honeypot (Köder)**/**Malware-Labor**
6. **Malware-Labor** stellt Exploits her, Miner, **Botnetz-Verfall**
7. Trace (Ereignis-Multiplikator), Razzia
8. Erfolge prüfen

## Reihenfolge der Umsetzung (je Build + Balance + Commit)

neue Ziele → neue Nodes → Exploits & Kryptokurs → Aufträge → Ereignisse →
Rivalen → Kollektiv & Erfolge → Minispiel
