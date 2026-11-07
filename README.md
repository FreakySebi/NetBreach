# NetBreach

Ein node-basiertes Hacking-Tycoon/Incremental-Spiel für den Browser.
Platziere Hardware auf einer Arbeitsfläche, verbinde sie mit Kabeln und baue
Ketten auf: hacken → Daten speichern → im Darknet verkaufen → aufrüsten.

TypeScript + HTML5 Canvas + Vite, komplett clientseitig, Spielstand in `localStorage`.

**Sofort spielen:** `npm run build` erzeugt eine einzige Datei `dist/index.html` (JS und CSS
eingebettet), die per Doppelklick im Browser läuft – kein Server nötig.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver (http://localhost:5173)
npm run build      # Typecheck + Einzeldatei-Build nach dist/index.html
npm run preview    # Build lokal ansehen
npm run balance    # Headless-Bot spielt bis zu 40 h über mehrere Identitäten
npm run balance -- 10 42   # … 10 Stunden mit Zufalls-Seed 42
```

## Spielablauf

1. **Freelance-Job** anklicken → erstes Geld → **Laptop** kaufen.
2. Am Laptop ein Ziel wählen und **▶ HACK STARTEN**. Hack-Dauer = Security ÷ Rechenleistung.
3. Mit dem Ertrag **CPU-Kerne** und **RAM** kaufen → schneller und schwerere Ziele.
4. **Forschung** schaltet neue Nodes frei: Festplatte + Darknet-Markt (Daten verkaufen),
   Router, Netzteil, Gaming-PC, Kühlung, VPN/Proxy, Hack-Scripts, Botnetz, GPU, Miner, Firewall,
   Honeypot, Malware-Labor, Server, Rechenzentrum, Quanten-Rechner …
5. **Trace** steigt beim Start jedes Hacks. Bei 100 % gibt es eine Razzia (Geld-, Daten- und
   Kryptoverlust, 30 s offline). VPNs und Proxy-Ketten senken den Zuwachs.
6. **Hack-Scripts** hacken automatisch, auch offline (bis zu 8 h, gedeckelt). Sie pausieren ab
   85 % Trace und lösen nie selbst eine Razzia aus – im Spätspiel ist Tarnung daher der Engpass.
7. **Neue Identität** (Prestige) ab 10 Mio. € im Lauf: Ghost-Tokens geben dauerhafte Boni und Perks.
8. **Kollektiv gründen** (zweite Prestige-Ebene) ab 3 Identitätswechseln und 30 Tokens.

## Hack-Ziele

19 Ziele von der Webcam bis zum Kern. Jedes Ziel gehört zu einer **Exploit-Familie**
(IoT, Web, Konzern, Finanz, Staat, KI).

| Ziel | Besonderheit |
|---|---|
| Webcam, Smart-Home-Hub | lassen angeschlossene **Botnetze** wachsen |
| Mobilfunk-Netz, Logistik-Konzern, Geheimdienst-Relais | Zwischenziele im Midgame |
| Stromnetz-Leitstelle | löst einen **Blackout** aus: Netzteile ohne USV-Upgrade fallen 20 s aus |
| Zentralbank | sehr viel Geld, **extremer Trace** |
| KI-Forschungslabor | liefert **KI-Modelle** (◇) für späte Forschung und einen Dauer-Bonus |
| Orbitale Raumstation | nur mit Quanten-Rechnern (RAM) |
| **Der Kern** | finales Ziel in **3 Phasen**: Rechenleistung → GPU-Cracking → Bandbreite. Erst ab **3 Identitätswechseln** und der Forschung „Kern-Protokolle“ |
| Rivalen-Netz | erscheint, wenn Honeypots einen angreifenden Rivalen geortet haben |

## Nodes

Rechner (Laptop, Gaming-PC, Server-Rack, Quanten-Rechner), GPU, Router, Glasfaser,
Speicher (Festplatte, SSD, Rechenzentrum), Darknet-Markt, Krypto-Miner, Netzteil, Kühlung,
VPN, Proxy, Hack-Script und neu:

| Node | Ports | Funktion |
|---|---|---|
| **Firewall** | Strom, Kühlung | Abwehrwert gegen Rivalen-Angriffe (wirkt netzwerkweit) |
| **Honeypot** | Strom, Daten (Köder) | braucht Köder-Daten, gibt passiv Ruf, verfolgt Angreifer zurück, zählt zur Abwehr |
| **Botnetz** | Bots (Ausgang) | infizierte Geräte als OPS-Quelle für Rechner; wächst durch Webcam-/Smart-Home-Hacks, verliert laufend Geräte |
| **Malware-Labor** | Strom, Kühlung, GPU, Daten | stellt Exploits einer gewählten Familie aus Daten + Rechenleistung her |
| **Quanten-Rechner** | wie Server | Endgame-Rechner mit extremem Strom- und Kühlbedarf |

Kabelfarben: Daten (cyan), Strom (gelb), Kühlung (blau), Bandbreite (grün), GPU (magenta),
Proxy (violett), Script (orange), Botnetz (lime). Rot blinkende Nodes zeigen Engpässe
(Puffer/Speicher voll, kein Strom, Blackout, überhitzt, Überlast, gesperrt).

## Systeme

- **Exploits:** Werden im Malware-Labor hergestellt und beim Hack-Start verbraucht:
  Security −60 % und Trace −50 % für ein Ziel ihrer Familie. Im Tab „Ziele“ lässt sich der
  automatische Verbrauch pro Familie abschalten.
- **Kryptokurs:** Schwankt als Random Walk mit Rückkehr zum Mittel. Tab „Krypto“ zeigt das
  Kurs-Diagramm; Kauf/Verkauf zum aktuellen Kurs mit 2 % Gebühr.
- **Aufträge:** Board mit bis zu 3 zufälligen Aufträgen (z. B. „Hacke 5× die Uni in 10 Minuten“,
  „Verkaufe Daten ohne Razzia“, „Halte den Trace unter 25 %“). Belohnung: Geld, Krypto, Ruf oder
  seltene Exploits. Das Zeitlimit startet mit der Annahme.
- **Ereignisse:** Der News-Ticker unter der Ressourcenleiste zeigt zeitlich begrenzte Ereignisse:
  Polizei-Großrazzia, Zero-Day geleakt, Kryptocrash, Krypto-Hype, Hardware-Sale, Datenleck, Admins im Urlaub.
- **Rivalen:** Ab 1.500 Ruf greift eine Hackergruppe in unregelmäßigen Abständen an (45 s Warnung
  mit Countdown im Ticker). Ist die Abwehr zu schwach, werden Nodes gesperrt, Daten und Geld gestohlen.
  Abwehren gibt Ruf; Honeypots orten den Rivalen, danach kann man ihn selbst hacken.
- **Aktives Hacken (optional):** Bei einem laufenden manuellen Hack im Inspector „⌨ Aktiv hacken“:
  drei Befehle unter Zeitdruck abtippen. Erfolg −60 % Restzeit, Misserfolg +8 % Trace.
- **Erfolge & Statistik:** 23 Erfolge (einige mit kleinen Dauer-Boni) und eine Statistik-Seite
  für den Lauf und die gesamte Spielzeit.

## Offline-Fortschritt

Beim Laden (und wenn der Tab im Hintergrund war) wird die verstrichene Zeit nachgerechnet,
gedeckelt auf 8 h (Perks verlängern). Scripts hacken weiter, Daten fließen, der Kryptokurs
schwankt, Botnetze verlieren Geräte und Ereignisse laufen aus. Es gibt offline **keine**
Razzien, keine Rivalen-Angriffe und keine neuen Ereignisse; das Auftrags-Board ist eingefroren.

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

## Balancing

**Alle** Zahlen stehen in [`src/core/config.ts`](src/core/config.ts):
Node-Preise und -Werte, Upgrade-Kosten (`cost * growth ^ level`, Standard 1.15),
Hack-Ziele, Forschung, Trace/Razzia, Offline-Deckel, Prestige und Perks sowie die Abschnitte
`exploits`, `cryptoMarket`, `contracts`, `worldEvents`, `rivals`, `collective`, `achievements`
und `minigame`.

`npm run balance` spielt das Spiel headless mit einer gierigen Strategie über mehrere
Identitäten und gibt aus, wann jedes Ziel freigeschaltet und zum ersten Mal gehackt wurde
und wann der Kern fällt. Stand der Balance (Seeds 1234, 42, 7): Lauf 1 dauert 1,3–1,8 h,
alle 19 Ziele werden erreicht, Der Kern fällt nach 3–4 Identitätswechseln (Lauf 4–5)
nach 13–23 h Spielzeit – nie früher, weil er erst ab 3 Identitätswechseln angreifbar ist.

## Spielstände

Spielstände tragen eine Version (`SAVE_VERSION`, aktuell 2). Ältere Stände werden beim Laden
automatisch migriert: fehlende Felder kommen aus `createInitialState()`.

## Struktur

```
src/core           Game-Loop, State, Simulation, Config, Speichern, Offline, Formatierung
src/core/systems   Exploits, Kryptokurs, Aufträge, Ereignisse, Rivalen, Erfolge, Zufall
src/nodes          Port-Layouts der Node-Typen, abgeleitete Werte (Stats/Kosten)
src/ui             Kamera, Canvas-Renderer, Eingabe, Ressourcenleiste, Panel, Inspector, Minispiel
scripts            Balancing-Bot
docs               Architektur-Pläne (v1 und v2)
```

Die Simulation in `src/core` kennt kein DOM und läuft daher auch headless (siehe Bot).
In der Browser-Konsole sind das Spielobjekt als `netbreach` und die Config als
`netbreachConfig` erreichbar.
