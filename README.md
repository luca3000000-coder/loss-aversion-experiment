# Loss Aversion Experiment

Live-Experiment für Behavioral-Finance-Vortrag zum Thema **Loss Aversion** (Kahneman & Tversky, Prospect Theory).

## Was macht die App?

- 6 Entscheidungsrunden mit abwechselnd Gewinn- und Verlustrunden.
- Teilnehmer:innen starten mit 100 € Guthaben und wählen pro Runde zwischen **Sicher** und **Risiko**.
- Ein echter Münzwurf im Raum entscheidet bei allen, die "Risiko" gewählt haben, über das Ergebnis.
- Das Presenter-Dashboard zeigt live alle Entscheidungen, den Verlauf und am Ende eine didaktische Auswertung mit Loss-Aversion-Interpretation.

## Runden

| Runde | Typ | Sicher | Risiko |
|-------|-----|--------|--------|
| 1 | Gewinn | +20 € | +40 € @ 50% |
| 2 | Verlust | −20 € | −40 € @ 50% |
| 3 | Gewinn | +20 € | +40 € @ 50% |
| 4 | Verlust | −20 € | −40 € @ 50% |
| 5 | Gewinn | +20 € | +40 € @ 50% |
| 6 | Verlust | −20 € | −40 € @ 50% |

**Münzwurf-Konvention:** Kopf = Risiko zahlt sich aus (voller Gewinn bzw. 0 € statt Verlust) · Zahl = Risiko geht schlecht aus (0 € statt Gewinn bzw. voller Verlust).

## Lokal ausführen

```bash
npm install
npm start
```

Dann öffnen:

- `http://localhost:3000/` – Landing
- `http://localhost:3000/participant.html` – Teilnehmer:innen-Ansicht
- `http://localhost:3000/presenter.html` – Presenter-Dashboard

**Presenter-Passwort** (Default): `loss2026`
Ändern via Umgebungsvariable `PRESENTER_PASSWORD`.

## Deployment

### Render.com (empfohlen, kostenlos)

1. Repo auf GitHub pushen.
2. Auf [render.com](https://render.com) einloggen → **New → Web Service**.
3. Repo verbinden. Render liest `render.yaml` automatisch.
4. Nach dem Deployment findest du das Passwort unter **Environment** (`PRESENTER_PASSWORD`).
5. Die öffentliche URL (z. B. `https://loss-aversion-experiment.onrender.com`) teilt ihr mit dem Kurs — am einfachsten als QR-Code auf der ersten Folie.

> Der kostenlose Render-Plan "schläft" nach Inaktivität. **Wichtig:** Ruft die URL einmal ca. 1 Minute vor dem Experiment auf, damit der Server wach ist.

### Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub**.
2. Repo wählen. Railway erkennt Node.js automatisch.
3. Unter **Variables** `PRESENTER_PASSWORD` setzen (sonst Default `loss2026`).
4. Unter **Settings → Networking** eine Public URL generieren.

### Fly.io, Heroku, etc.

`Procfile` ist dabei. Node 18+ genügt. Nur `npm install` + `npm start` nötig.

## Ablauf im Vortrag

1. **Vor der Stunde:** App deployen, QR-Code für die Teilnehmer-URL erzeugen, Server warmhalten.
2. **Einstieg:** Folie mit QR-Code + URL zeigen. Teilnehmer joinen mit Spitznamen.
3. **Presenter öffnet Dashboard,** loggt sich ein, wartet bis alle in der Lobby sind.
4. **Runde starten** → Teilnehmer entscheiden auf dem Handy → Presenter sieht live den Stand.
5. Wenn fast alle entschieden haben → **Entscheidungen schließen**.
6. **Echten Münzwurf** im Raum machen → Ergebnis ins Dashboard eintragen (Kopf/Zahl).
7. Alle Teilnehmer sehen ihr Rundenergebnis sofort, das Dashboard zeigt aggregierte Zahlen.
8. **Nächste Runde** → wiederholen bis Runde 6.
9. **Gesamtauswertung** mit didaktischer Interpretation (Reflection Effect / Loss Aversion).

## Troubleshooting

- **"Das Experiment hat bereits begonnen":** Ein Teilnehmer versucht nach Rundenstart zu joinen. Lösung: Entweder das Experiment über **Zurücksetzen** komplett neu starten oder die Person zuschauen lassen.
- **Nicht jeder hat entschieden:** Beim "Entscheidungen schließen" werden nicht-votierende Teilnehmer als **Sicher** gewertet (konservativer Default).
- **Teilnehmer hat WLAN-Abbruch:** Verbindet sich der Socket automatisch wieder, der Spitzname in der Session-Storage sorgt dafür, dass der:die Teilnehmer:in im Spiel bleibt. **Wichtig:** Der Browser-Tab darf nicht komplett geschlossen werden.

## Tech-Stack

- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** Vanilla JS + HTML + CSS (kein Build-Step)
- **State:** In-Memory (Neustart = Reset, für einmaliges Live-Experiment völlig ausreichend)

## Lizenz

Intern für den Vortrag. Keine Haftung für ökonomische oder emotionale Verluste der Teilnehmer:innen. :-)
