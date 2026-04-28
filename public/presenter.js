<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Presenter · Loss Aversion</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="presenter">

  <!-- LOGIN -->
  <section id="screen-login" class="screen login-screen">
    <div class="login-box">
      <h1>Presenter-Login</h1>
      <p class="subtitle">Passwort zum Starten der Präsentation eingeben.</p>
      <form id="login-form" class="form">
        <label for="pw">Passwort</label>
        <input id="pw" type="password" autocomplete="off" required />
        <button type="submit" class="btn btn-primary">Einloggen</button>
        <p id="login-error" class="error" hidden></p>
      </form>
    </div>
  </section>

  <!-- DASHBOARD -->
  <section id="screen-dashboard" class="dashboard" hidden>

    <header class="dash-header">
      <div>
        <h1>Loss Aversion · Presenter</h1>
        <p class="subtitle" id="join-url-hint">Teilnehmer joinen auf: <strong id="join-url">–</strong></p>
      </div>
      <div class="dash-meta">
        <div><span id="participant-count">0</span> Teilnehmer:innen</div>
        <button id="btn-reset" class="btn btn-ghost small">Experiment zurücksetzen</button>
      </div>
    </header>

    <div class="dash-main">

      <!-- Left column: Round control -->
      <section class="panel panel-control">
        <h2>Rundensteuerung</h2>
        <div class="phase-indicator">
          <span class="phase-label">Phase:</span>
          <span id="phase-badge" class="phase-badge">Lobby</span>
        </div>

        <div id="lobby-round-config" class="round-config" hidden>
          <label for="round-count-input">Anzahl Runden:</label>
          <select id="round-count-input"></select>
          <p class="muted small">Wechselt automatisch Gewinn/Verlust. Nur in der Lobby änderbar.</p>
        </div>

        <div class="round-header">
          <span id="round-display">Runde –</span>
          <span id="round-type-display" class="round-type">–</span>
        </div>

        <div class="round-details" id="round-details">
          <p class="muted">Noch keine Runde aktiv.</p>
        </div>

        <div class="control-buttons">
          <button id="btn-start-round" class="btn btn-primary">Runde 1 starten</button>
          <button id="btn-close-decisions" class="btn btn-secondary" hidden>Entscheidungen schließen</button>

          <div id="coin-flip-box" class="coin-flip-box" hidden>
            <p class="muted">Münzwurf durchgeführt — Ergebnis eingeben:</p>
            <div class="coin-buttons">
              <button id="btn-heads" class="btn btn-coin">🪙 Kopf (Gewinn)</button>
              <button id="btn-tails" class="btn btn-coin">🪙 Zahl (Verlust)</button>
            </div>
            <p class="muted small">Konvention: Kopf = Risiko zahlt sich aus · Zahl = Risiko geht schlecht aus</p>
          </div>

          <button id="btn-next-round" class="btn btn-primary" hidden>Nächste Runde →</button>
          <button id="btn-show-final" class="btn btn-primary" hidden>Auswertung anzeigen</button>
        </div>

        <div id="last-round-result" class="last-result" hidden>
          <h3>Letztes Ergebnis</h3>
          <p id="last-round-text"></p>
        </div>
      </section>

      <!-- Right column: Live stats -->
      <section class="panel panel-stats">
        <h2>Live-Entscheidungen</h2>
        <div id="live-decisions" class="live-decisions">
          <div class="bar-row">
            <div class="bar-label">Sicher</div>
            <div class="bar-track"><div id="bar-safe" class="bar bar-safe" style="width:0%"></div></div>
            <div class="bar-value" id="count-safe">0</div>
          </div>
          <div class="bar-row">
            <div class="bar-label">Risiko</div>
            <div class="bar-track"><div id="bar-risk" class="bar bar-risk" style="width:0%"></div></div>
            <div class="bar-value" id="count-risk">0</div>
          </div>
          <p id="decisions-meta" class="muted small">–</p>
        </div>

        <h2>Verlauf</h2>
        <div id="history-grid" class="history-grid"></div>
      </section>

    </div>

    <!-- FINAL ANALYTICS -->
    <section id="final-panel" class="final-panel" hidden>
      <h2>Gesamt-Auswertung</h2>

      <div class="final-grid">
        <div class="stat-card gain">
          <h3>Gewinnrunden</h3>
          <p class="stat-big"><span id="gain-risk-pct">0%</span></p>
          <p class="muted">Risiko gewählt</p>
          <p class="muted small"><span id="gain-risk-count">0</span> von <span id="gain-total">0</span> Entscheidungen</p>
        </div>
        <div class="stat-card loss">
          <h3>Verlustrunden</h3>
          <p class="stat-big"><span id="loss-risk-pct">0%</span></p>
          <p class="muted">Risiko gewählt</p>
          <p class="muted small"><span id="loss-risk-count">0</span> von <span id="loss-total">0</span> Entscheidungen</p>
        </div>
        <div class="stat-card diff">
          <h3>Differenz</h3>
          <p class="stat-big" id="diff-value">–</p>
          <p class="muted" id="diff-hint">Loss Aversion Indikator</p>
        </div>
      </div>

      <div class="chart-box">
        <h3>Risiko-Wahl pro Runde</h3>
        <canvas id="chart" width="800" height="320"></canvas>
      </div>

      <div class="interpretation">
        <h3>Interpretation · Loss Aversion nach Kahneman &amp; Tversky</h3>
        <div id="interpretation-text" class="interpretation-text">
          <!-- filled dynamically -->
        </div>
      </div>

      <div class="leaderboard">
        <h3>Teilnehmer:innen</h3>
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Name</th>
              <th>Endguthaben</th>
              <th>Risiko (Gewinn)</th>
              <th>Risiko (Verlust)</th>
            </tr>
          </thead>
          <tbody id="leaderboard-body"></tbody>
        </table>
      </div>
    </section>

  </section>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/presenter.js"></script>
</body>
</html>
