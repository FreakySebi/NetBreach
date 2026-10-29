# NetBreach

Ein node-basiertes Hacking-Tycoon/Incremental-Spiel für den Browser.
Platziere Hardware auf einer Arbeitsfläche, verbinde sie mit Kabeln und baue
Ketten auf: hacken → Daten speichern → im Darknet verkaufen → aufrüsten.

TypeScript + HTML5 Canvas + Vite, komplett clientseitig, Spielstand in `localStorage`.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver (http://localhost:5173)
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
npm run balance    # Headless-Bot spielt 4 h und protokolliert Meilensteine
npm run balance -- 8   # … oder 8 Stunden
```

## Spielablauf

1. **Freelance-Job** anklicken → erstes Geld → **Laptop** kaufen.
2. Am Laptop ein Ziel wählen und **▶ HACK STARTEN**. Hack-Dauer = Security ÷ Rechenleistung.
3. Mit dem Ertrag **CPU-Kerne** und **RAM** kaufen → schneller und schwerere Ziele.
4. **Forschung** schaltet neue Nodes frei: Festplatte + Darknet-Markt (Daten verkaufen),
   Router, Netzteil, Gaming-PC, Kühlung, VPN/Proxy, Hack-Scripts, GPU, Miner, Server, Rechenzentrum …
5. **Trace** steigt mit jedem Hack. Bei 100 % gibt es eine Razzia (Geld-, Daten- und Kryptoverlust,
   30 s offline). VPNs und Proxy-Ketten senken den Zuwachs.
6. **Hack-Scripts** hacken automatisch, auch offline (bis zu 8 h, gedeckelt).
7. **Neue Identität** (Prestige) ab 10 M € im Lauf: Ghost-Tokens geben dauerhafte Boni und Perks.

## Steuerung

| Aktion | Eingabe |
|---|---|
| Arbeitsfläche verschieben | leere Fläche ziehen (oder mittlere Maustaste) |
| Zoom | Mausrad, Buttons `− + ⌖` unten rechts |
| Node verschieben / auswählen | Node ziehen / anklicken |
| Kabel verbinden | vom Ausgang (rechts) zum Eingang (links) gleicher Farbe ziehen |
| Kabel umstecken | Kabel am Eingang greifen und neu ziehen |
| Kabel entfernen | Rechtsklick aufs Kabel oder auswählen + `Entf` |
| Auswahl aufheben | `Esc` |

Kabelfarben: Daten (cyan), Strom (gelb), Kühlung (blau), Bandbreite (grün), GPU (magenta),
Proxy (violett), Script (orange). Rot blinkende Nodes zeigen Engpässe
(Puffer/Speicher voll, kein Strom, überhitzt, Überlast).

## Balancing

**Alle** Zahlen stehen in [`src/core/config.ts`](src/core/config.ts):
Node-Preise und -Werte, Upgrade-Kosten (`cost * growth ^ level`, Standard 1.15),
Hack-Ziele, Forschung, Trace/Razzia, Offline-Deckel, Prestige und Perks.
Nach Änderungen zeigt `npm run balance`, wie sich die Progression verschiebt.

## Struktur

```
src/core   Game-Loop, State, Simulation, Config, Speichern, Offline, Formatierung
src/nodes  Port-Layouts der Node-Typen, abgeleitete Werte (Stats/Kosten)
src/ui     Kamera, Canvas-Renderer, Eingabe, Ressourcenleiste, Panel, Inspector
scripts    Balancing-Bot
docs       Architektur-Plan
```

Die Simulation in `src/core` kennt kein DOM und läuft daher auch headless (siehe Bot).
In der Browser-Konsole ist das Spielobjekt als `netbreach` erreichbar.
