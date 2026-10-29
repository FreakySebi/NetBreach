# NetBreach – Architektur & Datenmodell

## Architektur

```
src/
  main.ts            Bootstrap: Game erzeugen, UI verdrahten, Loop starten
  style.css          Terminal-/Neon-Design
  core/
    config.ts        ALLE Balancing-Werte (Preise, Wachstum, Hack-Ziele, Forschung, Perks)
    types.ts         Typen für State, Nodes, Verbindungen, Ressourcen
    state.ts         Initialer State, Modifikatoren (Forschung + Prestige)
    format.ts        Zahlen (1.2K, 3.4M …) und Bytes (MB/GB/TB)
    economy.ts       Kostenformel base * growth^n, Bezahlen
    simulation.ts    tick(state, dt): Strom, Kühlung, Hacks, Datenfluss, Trace, Razzia
    game.ts          Game-Klasse: Loop (fester Takt), Aktionen, Events
    save.ts          localStorage, Export/Import, Offline-Nachberechnung
  nodes/
    definitions.ts   Port-Layouts & Kategorien je Node-Typ
    stats.ts         Abgeleitete Werte einer Node-Instanz (Level → Werte)
  ui/
    camera.ts        Pan/Zoom, Welt↔Bildschirm-Koordinaten
    renderer.ts      Canvas: Raster, Nodes, Kabel, Pakete, Floating-Text
    input.ts         Maus: Nodes ziehen, Kabel ziehen, Buttons, Zoom
    hud.ts           Ressourcenleiste oben + Trace-Leiste + nächstes Ziel
    panel.ts         Rechtes Panel: Shop, Ziele, Forschung, Identität, System
    inspector.ts     Detailfenster des gewählten Nodes (Upgrades, Ziel, Verkauf)
    toast.ts         Benachrichtigungen / Modals
```

Die Simulation (`core/`) kennt kein DOM → sie ist headless testbar
(Balancing-Bot in `scripts/`).

## Datenmodell

```ts
GameState {
  money, crypto, reputation, trace          // Ressourcen (Daten liegen in Nodes)
  nodes: NodeInstance[]
  connections: Connection[]
  research: string[]                        // abgeschlossene Forschung
  prestige: { tokens, tokensTotal, perks, identities }
  run: { money, data, hacks, crypto }       // Statistik dieses Laufs
  raidTimer, savedAt, camera, …
}

NodeInstance {
  id, type, x, y
  levels: Record<upgradeId, number>         // Upgrade-Stufen
  targetId?, job?: { targetId, progress, required }
  buffer: number                            // gespeicherte Daten in MB
}

Connection { id, from, fromPort, to, toPort } // Ausgang → Eingang, gleicher PortKind
```

Port-Arten: `data` (gestohlene Daten), `power` (Watt), `cool` (Kühlleistung),
`net` (Bandbreite), `accel` (GPU-Rechenleistung), `proxy` (Anonymisierung,
verkettbar), `script` (Automatisierung).

## Simulation pro Tick (10 Hz)

1. Abgeleitete Werte aller Nodes aus Config + Levels
2. Strom: Netzteil-Kapazität / Bedarf aller angeschlossenen Verbraucher → Leistungsfaktor
3. Kühlung: (eingebaut + Kühler-Anteil) / Wärmelast → Drosselung bei Überhitzung
4. GPU-Boost, Bandbreite (Router), Stealth (Proxy-Kette `1 - Π(1 - s)`), Script
5. Hacks: Fortschritt += Rechenleistung · dt; Dauer = Security / Leistung
   → Belohnung: Geld, Daten (in Puffer), Reputation, Krypto, Trace
6. Datenfluss: Rechner → Speicher → Markt, limitiert durch Bandbreite/Durchsatz;
   Engpässe (Puffer/Speicher voll) werden als Flag markiert → Node blinkt rot
7. Miner, Trace-Abbau, Razzia bei 100 %

## Ausbaustufen (je ein Commit)

1. MVP: Freelance-Klick → Laptop → Webcam-Hack → Geld → CPU-Kern → schneller
2. Kabel, Datenspeicher, Darknet-Markt, animierte Pakete, Engpass-Anzeige
3. Strom, Kühlung, GPU, Router
4. Trace/Razzia, VPN & Proxy-Ketten
5. Forschungsbaum, Script-Automatisierung
6. Offline-Fortschritt, Export/Import, Prestige („Neue Identität“)
7. Balancing-Bot, Feinschliff
