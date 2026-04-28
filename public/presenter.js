// Presenter dashboard logic
const socket = io();

const screens = {
  login: document.getElementById('screen-login'),
  dashboard: document.getElementById('screen-dashboard')
};

const joinUrlEl = document.getElementById('join-url');
joinUrlEl.textContent = `${window.location.protocol}//${window.location.host}/participant.html`;

// --- Login ---
const loginForm = document.getElementById('login-form');
const pwInput = document.getElementById('pw');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.hidden = true;
  socket.emit('presenter_join', { password: pwInput.value }, (res) => {
    if (!res.ok) {
      loginError.textContent = 'Falsches Passwort.';
      loginError.hidden = false;
      return;
    }
    sessionStorage.setItem('presenter', '1');
    screens.login.hidden = true;
    screens.dashboard.hidden = false;
  });
});

// --- Round count selector ---
const roundCountInput = document.getElementById('round-count-input');
const lobbyRoundConfig = document.getElementById('lobby-round-config');

// Populate select with even numbers 2..20
for (let i = 2; i <= 20; i += 2) {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = i + ' Runden';
  if (i === 6) opt.selected = true;
  roundCountInput.appendChild(opt);
}

roundCountInput.addEventListener('change', () => {
  const count = parseInt(roundCountInput.value, 10);
  socket.emit('presenter_set_rounds', { count }, (res) => {
    if (!res || !res.ok) {
      alert('Konnte Rundenanzahl nicht ändern: ' + (res && res.reason));
    }
  });
});

// --- Control buttons ---
document.getElementById('btn-start-round').addEventListener('click', () => {
  socket.emit('presenter_start_round', {}, (res) => {
    if (!res.ok) alert('Fehler: ' + res.reason);
  });
});

document.getElementById('btn-close-decisions').addEventListener('click', () => {
  if (!confirm('Entscheidungsfenster jetzt schließen? Alle, die noch nicht entschieden haben, werden als "Sicher" gewertet.')) return;
  socket.emit('presenter_close_decisions', {}, (res) => {
    if (!res.ok) alert('Fehler: ' + res.reason);
  });
});

document.getElementById('btn-heads').addEventListener('click', () => submitCoin('heads'));
document.getElementById('btn-tails').addEventListener('click', () => submitCoin('tails'));

function submitCoin(result) {
  socket.emit('presenter_coin_flip', { result }, (res) => {
    if (!res.ok) alert('Fehler: ' + res.reason);
  });
}

document.getElementById('btn-next-round').addEventListener('click', () => {
  socket.emit('presenter_start_round', {}, (res) => {
    if (!res.ok) alert('Fehler: ' + res.reason);
  });
});

document.getElementById('btn-show-final').addEventListener('click', () => {
  document.getElementById('final-panel').hidden = false;
  document.getElementById('final-panel').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('Komplettes Experiment zurücksetzen? Alle Daten gehen verloren.')) return;
  socket.emit('presenter_reset', {}, (res) => {
    if (res.ok) {
      document.getElementById('final-panel').hidden = true;
    }
  });
});

// --- State ---
let latestPresenter = null;

socket.on('presenter_update', (d) => {
  latestPresenter = d;
  render();
});

socket.on('state_update', () => {
  // presenter_update covers everything, nothing extra to do here
});

// --- Render ---
let ROUND_COUNT = 6;

function render() {
  if (!latestPresenter) return;
  const d = latestPresenter;

  // Sync round count from server
  ROUND_COUNT = d.totalRounds;
  if (roundCountInput && roundCountInput.value !== String(d.totalRounds)) {
    roundCountInput.value = d.totalRounds;
  }
  if (lobbyRoundConfig) {
    lobbyRoundConfig.hidden = d.phase !== 'lobby';
  }

  document.getElementById('participant-count').textContent = d.participantCount;

  // Phase badge
  const badge = document.getElementById('phase-badge');
  const phaseLabels = {
    lobby: 'Lobby',
    deciding: 'Entscheidung läuft',
    awaiting_flip: 'Warte auf Münzwurf',
    round_done: 'Runde abgeschlossen',
    finished: 'Experiment beendet'
  };
  badge.textContent = phaseLabels[d.phase] || d.phase;
  badge.className = 'phase-badge phase-' + d.phase;

  // Round header
  const roundDisplay = document.getElementById('round-display');
  const roundTypeDisplay = document.getElementById('round-type-display');
  const roundDetails = document.getElementById('round-details');

  if (d.round) {
    roundDisplay.textContent = `Runde ${d.round.n} / ${ROUND_COUNT}`;
    roundTypeDisplay.textContent = d.round.type === 'gain' ? 'Gewinnrunde' : 'Verlustrunde';
    roundTypeDisplay.className = 'round-type ' + d.round.type;
    const sign = d.round.type === 'gain' ? '+' : '−';
    roundDetails.innerHTML = `
      <p><strong>Sicher:</strong> ${sign}${d.round.safe} €</p>
      <p><strong>Risiko:</strong> ${sign}${d.round.risk} € mit 50% Wahrscheinlichkeit, sonst 0 €</p>
    `;
  } else {
    roundDisplay.textContent = d.phase === 'finished' ? 'Alle Runden abgeschlossen' : 'Runde –';
    roundTypeDisplay.textContent = '';
    roundTypeDisplay.className = 'round-type';
    roundDetails.innerHTML = d.phase === 'finished'
      ? '<p class="muted">Experiment beendet. Zeige die Auswertung.</p>'
      : '<p class="muted">Starte die erste Runde, wenn alle Teilnehmer:innen beigetreten sind.</p>';
  }

  // Control buttons based on phase
  const btnStart = document.getElementById('btn-start-round');
  const btnClose = document.getElementById('btn-close-decisions');
  const coinBox = document.getElementById('coin-flip-box');
  const btnNext = document.getElementById('btn-next-round');
  const btnShowFinal = document.getElementById('btn-show-final');

  btnStart.hidden = true;
  btnClose.hidden = true;
  coinBox.hidden = true;
  btnNext.hidden = true;
  btnShowFinal.hidden = true;

  if (d.phase === 'lobby') {
    btnStart.hidden = false;
    btnStart.textContent = 'Runde 1 starten';
    btnStart.disabled = d.participantCount === 0;
    if (d.participantCount === 0) {
      btnStart.title = 'Warte, bis mindestens ein Teilnehmer beigetreten ist.';
    }
  } else if (d.phase === 'deciding') {
    btnClose.hidden = false;
    const voted = d.decisionsThisRound.safe + d.decisionsThisRound.risk;
    btnClose.textContent = `Entscheidungen schließen (${voted} / ${d.participantCount})`;
  } else if (d.phase === 'awaiting_flip') {
    coinBox.hidden = false;
  } else if (d.phase === 'round_done') {
    if (d.currentRoundIndex + 1 >= ROUND_COUNT) {
      btnShowFinal.hidden = false;
      // also allow going to final via clicking - but first show final panel auto
      document.getElementById('final-panel').hidden = false;
    } else {
      btnNext.hidden = false;
      btnNext.textContent = `Runde ${d.currentRoundIndex + 2} starten →`;
    }
  } else if (d.phase === 'finished') {
    btnShowFinal.hidden = false;
    document.getElementById('final-panel').hidden = false;
  }

  // Live decisions
  const voted = d.decisionsThisRound.safe + d.decisionsThisRound.risk;
  const total = Math.max(voted, d.participantCount);
  const safePct = total > 0 ? Math.round(100 * d.decisionsThisRound.safe / total) : 0;
  const riskPct = total > 0 ? Math.round(100 * d.decisionsThisRound.risk / total) : 0;
  document.getElementById('bar-safe').style.width = safePct + '%';
  document.getElementById('bar-risk').style.width = riskPct + '%';
  document.getElementById('count-safe').textContent = d.decisionsThisRound.safe;
  document.getElementById('count-risk').textContent = d.decisionsThisRound.risk;
  document.getElementById('decisions-meta').textContent =
    `${voted} von ${d.participantCount} haben entschieden`;

  // Last round text
  if (d.coinFlip && d.phase !== 'deciding' && d.phase !== 'awaiting_flip') {
    const lastBox = document.getElementById('last-round-result');
    lastBox.hidden = false;
    const lastIdx = d.phase === 'finished' ? ROUND_COUNT - 1 : d.currentRoundIndex;
    const lastRound = d.roundStats[lastIdx];
    const flipLabel = d.coinFlip === 'heads' ? 'Kopf (Gewinn)' : 'Zahl (Verlust)';
    document.getElementById('last-round-text').innerHTML =
      `Runde ${lastRound.round.n} (${lastRound.round.type === 'gain' ? 'Gewinn' : 'Verlust'}): Münzwurf <strong>${flipLabel}</strong> · Sicher: ${lastRound.safe} · Risiko: ${lastRound.risk}`;
  } else {
    document.getElementById('last-round-result').hidden = true;
  }

  // History grid
  renderHistory(d);

  // Final panel content
  renderFinal(d);
}

function renderHistory(d) {
  const grid = document.getElementById('history-grid');
  const rows = d.roundStats.map((rs) => {
    const total = rs.safe + rs.risk;
    const riskPct = total > 0 ? Math.round(100 * rs.risk / total) : 0;
    const played = total > 0;
    return `
      <div class="history-cell ${played ? 'played' : 'unplayed'} ${rs.round.type}">
        <div class="hc-head">
          <span class="hc-round">R${rs.round.n}</span>
          <span class="hc-type">${rs.round.type === 'gain' ? 'Gewinn' : 'Verlust'}</span>
        </div>
        <div class="hc-body">
          ${played
            ? `<div class="hc-pct">${riskPct}% Risiko</div>
               <div class="hc-sub">${rs.risk} Risiko · ${rs.safe} Sicher</div>`
            : `<div class="hc-sub muted">—</div>`
          }
        </div>
      </div>
    `;
  }).join('');
  grid.innerHTML = rows;
}

function renderFinal(d) {
  const gain = d.aggregate.gain;
  const loss = d.aggregate.loss;
  const gainTotal = gain.safe + gain.risk;
  const lossTotal = loss.safe + loss.risk;
  const gainRiskPct = gainTotal > 0 ? Math.round(100 * gain.risk / gainTotal) : 0;
  const lossRiskPct = lossTotal > 0 ? Math.round(100 * loss.risk / lossTotal) : 0;

  document.getElementById('gain-risk-pct').textContent = gainRiskPct + '%';
  document.getElementById('loss-risk-pct').textContent = lossRiskPct + '%';
  document.getElementById('gain-risk-count').textContent = gain.risk;
  document.getElementById('gain-total').textContent = gainTotal;
  document.getElementById('loss-risk-count').textContent = loss.risk;
  document.getElementById('loss-total').textContent = lossTotal;

  const diff = lossRiskPct - gainRiskPct;
  const diffEl = document.getElementById('diff-value');
  const diffHint = document.getElementById('diff-hint');
  if (gainTotal === 0 && lossTotal === 0) {
    diffEl.textContent = '–';
    diffHint.textContent = 'Noch keine Daten';
  } else {
    diffEl.textContent = (diff > 0 ? '+' : '') + diff + ' %-Pkt.';
    if (diff > 0) {
      diffEl.className = 'stat-big diff-positive';
      diffHint.textContent = 'Risikofreudiger im Verlustbereich → Loss Aversion!';
    } else if (diff < 0) {
      diffEl.className = 'stat-big diff-negative';
      diffHint.textContent = 'Risikofreudiger im Gewinnbereich (atypisch)';
    } else {
      diffEl.className = 'stat-big';
      diffHint.textContent = 'Kein Unterschied erkennbar';
    }
  }

  drawChart(d);
  renderInterpretation(gainRiskPct, lossRiskPct, diff);
  renderLeaderboard(d);
}

function renderInterpretation(gainPct, lossPct, diff) {
  const box = document.getElementById('interpretation-text');
  let verdict;
  if (diff >= 15) {
    verdict = `<p class="verdict positive"><strong>Klarer Loss-Aversion-Effekt erkennbar.</strong> In Verlustrunden habt ihr ${diff} Prozentpunkte häufiger Risiko gewählt als in Gewinnrunden. Das entspricht den Befunden von Kahneman &amp; Tversky (1979).</p>`;
  } else if (diff > 0) {
    verdict = `<p class="verdict"><strong>Tendenz zu Loss Aversion sichtbar.</strong> In Verlustrunden wurde Risiko ${diff} Prozentpunkte häufiger gewählt. Der Effekt ist vorhanden, aber moderat.</p>`;
  } else if (diff === 0) {
    verdict = `<p class="verdict"><strong>Kein Unterschied messbar.</strong> In dieser Stichprobe wurde im Gewinn- und Verlustbereich gleich häufig Risiko gewählt.</p>`;
  } else {
    verdict = `<p class="verdict negative"><strong>Atypisches Muster.</strong> Hier wurde im Gewinnbereich häufiger Risiko gewählt — das Gegenteil des Loss-Aversion-Effekts.</p>`;
  }

  box.innerHTML = `
    ${verdict}
    <p><strong>Was ist Loss Aversion?</strong> Nach der <em>Prospect Theory</em> (Kahneman &amp; Tversky, 1979) empfinden Menschen Verluste etwa doppelt so stark wie gleich große Gewinne. Als Konsequenz werden Entscheider:innen:</p>
    <ul>
      <li><strong>im Gewinnbereich risikoavers</strong> — der sichere Gewinn wird dem Risiko vorgezogen (<span class="inline-pct">${gainPct}% Risiko</span> bei euch).</li>
      <li><strong>im Verlustbereich risikofreudig</strong> — man nimmt das Risiko in Kauf, um dem sicheren Verlust zu entgehen (<span class="inline-pct">${lossPct}% Risiko</span> bei euch).</li>
    </ul>
    <p>Dieser <em>Reflection Effect</em> lässt sich anhand eurer Daten gut diskutieren: Obwohl die Erwartungswerte identisch sind, wird je nach Framing (Gewinn vs. Verlust) anders entschieden.</p>
  `;
}

function drawChart(d) {
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const padding = { top: 30, right: 20, bottom: 50, left: 50 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  // Axes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.lineTo(padding.left + plotW, padding.top + plotH);
  ctx.stroke();

  // Y ticks (0, 25, 50, 75, 100)
  ctx.fillStyle = '#64748b';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = padding.top + plotH - (pct / 100) * plotH;
    ctx.fillText(pct + '%', padding.left - 8, y + 4);
    ctx.strokeStyle = pct === 0 ? '#cbd5e1' : '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  // Bars
  const bars = d.roundStats;
  const barW = plotW / bars.length * 0.6;
  const gap = plotW / bars.length;

  bars.forEach((rs, i) => {
    const total = rs.safe + rs.risk;
    const pct = total > 0 ? rs.risk / total : 0;
    const x = padding.left + gap * i + (gap - barW) / 2;
    const h = pct * plotH;
    const y = padding.top + plotH - h;

    ctx.fillStyle = rs.round.type === 'gain' ? '#3b82f6' : '#ef4444';
    ctx.fillRect(x, y, barW, h);

    // Label
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px system-ui, sans-serif';
    if (total > 0) {
      ctx.fillText(Math.round(pct * 100) + '%', x + barW / 2, y - 6);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`R${rs.round.n}`, x + barW / 2, padding.top + plotH + 18);
    ctx.fillText(rs.round.type === 'gain' ? 'Gewinn' : 'Verlust', x + barW / 2, padding.top + plotH + 34);
  });

  // Y axis title
  ctx.save();
  ctx.translate(14, padding.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Anteil Risiko-Entscheidungen', 0, 0);
  ctx.restore();
}

function renderLeaderboard(d) {
  const tbody = document.getElementById('leaderboard-body');
  const sorted = [...d.participants].sort((a, b) => b.balance - a.balance);
  tbody.innerHTML = sorted.map((p, idx) => {
    const gainRisk = p.decisions.filter(x => x.type === 'gain' && x.choice === 'risk').length;
    const lossRisk = p.decisions.filter(x => x.type === 'loss' && x.choice === 'risk').length;
    const totalGain = p.decisions.filter(x => x.type === 'gain').length;
    const totalLoss = p.decisions.filter(x => x.type === 'loss').length;
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
    return `
      <tr>
        <td>${medal}</td>
        <td>${escapeHtml(p.nickname)}</td>
        <td><strong>${p.balance} €</strong></td>
        <td>${gainRisk} / ${totalGain}</td>
        <td>${lossRisk} / ${totalLoss}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
