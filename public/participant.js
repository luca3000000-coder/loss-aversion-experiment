// Participant client logic
const socket = io();

const screens = {
  join: document.getElementById('screen-join'),
  lobby: document.getElementById('screen-lobby'),
  decide: document.getElementById('screen-decide'),
  flip: document.getElementById('screen-flip'),
  result: document.getElementById('screen-result'),
  finished: document.getElementById('screen-finished')
};

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) {
    el.hidden = (k !== name);
  }
}

// --- Join ---
const joinForm = document.getElementById('join-form');
const nicknameInput = document.getElementById('nickname');
const joinError = document.getElementById('join-error');

let me = null;
let latestState = null;
let latestPersonal = null;

// Restore nickname from previous attempt in this tab
const saved = sessionStorage.getItem('nickname');
if (saved) nicknameInput.value = saved;

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;
  joinError.hidden = true;
  socket.emit('participant_join', { nickname }, (res) => {
    if (!res.ok) {
      const msgMap = {
        game_already_started: 'Das Experiment hat bereits begonnen.',
        invalid_nickname: 'Bitte gib einen Spitznamen ein.',
        nickname_taken: 'Dieser Spitzname ist schon vergeben. Nimm einen anderen.'
      };
      joinError.textContent = msgMap[res.reason] || 'Beitritt fehlgeschlagen.';
      joinError.hidden = false;
      return;
    }
    me = res.me;
    sessionStorage.setItem('nickname', nickname);
    document.getElementById('lobby-nickname').textContent = nickname;
    render();
  });
});

// --- Decision buttons ---
const btnSafe = document.getElementById('btn-safe');
const btnRisk = document.getElementById('btn-risk');

btnSafe.addEventListener('click', () => submitDecision('safe'));
btnRisk.addEventListener('click', () => submitDecision('risk'));

function submitDecision(choice) {
  btnSafe.disabled = true;
  btnRisk.disabled = true;
  socket.emit('participant_decision', { choice }, (res) => {
    if (!res.ok) {
      btnSafe.disabled = false;
      btnRisk.disabled = false;
      alert('Fehler: ' + res.reason);
    }
  });
}

// --- Socket events ---
socket.on('state_update', (s) => {
  latestState = s;
  render();
});

socket.on('personal_update', (p) => {
  latestPersonal = p;
  render();
});

socket.on('game_reset', () => {
  me = null;
  latestPersonal = null;
  sessionStorage.removeItem('nickname');
  showScreen('join');
});

// --- Render ---
function formatMoney(n) {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n} €`;
}

function render() {
  if (!me) {
    showScreen('join');
    return;
  }
  if (!latestState) return;

  const s = latestState;
  const p = latestPersonal?.me;
  const balance = p ? p.balance : 100;

  // Update all balance displays
  document.getElementById('balance').textContent = `${balance} €`;
  document.getElementById('balance-decide').textContent = `${balance} €`;
  document.getElementById('balance-flip').textContent = `${balance} €`;
  document.getElementById('balance-result').textContent = `${balance} €`;
  document.getElementById('balance-final').textContent = `${balance} €`;

  document.getElementById('lobby-count').textContent = s.participantCount;

  // Update total rounds display (e.g. "Runde 1 von X")
  const roundTotalEl = document.getElementById('round-total');
  if (roundTotalEl && s.totalRounds) {
    roundTotalEl.textContent = s.totalRounds;
  }

  if (s.phase === 'lobby') {
    showScreen('lobby');
    document.getElementById('lobby-title').textContent = 'Du bist dabei!';
    document.getElementById('lobby-text').textContent = 'Warte, bis die Präsentation startet.';
    return;
  }

  if (s.phase === 'finished') {
    renderFinished();
    showScreen('finished');
    return;
  }

  if (s.phase === 'deciding') {
    renderDecideScreen(s);
    showScreen('decide');
    return;
  }

  if (s.phase === 'awaiting_flip') {
    showScreen('flip');
    return;
  }

  if (s.phase === 'round_done') {
    renderResult(s);
    showScreen('result');
    return;
  }
}

function renderDecideScreen(s) {
  const round = s.round;
  if (!round) return;

  document.getElementById('round-num').textContent = round.n;
  const badge = document.getElementById('round-type-badge');
  if (round.type === 'gain') {
    badge.textContent = 'Gewinnrunde';
    badge.className = 'round-type gain';
    document.getElementById('decision-headline').textContent = 'Sicherer Gewinn oder Risiko?';
    document.getElementById('decision-sub').textContent = 'Du kannst in dieser Runde Geld gewinnen.';
    document.getElementById('safe-amount').textContent = `+${round.safe} €`;
    document.getElementById('risk-amount').textContent = `+${round.risk} €`;
    document.getElementById('btn-safe').querySelector('.option-hint').textContent = 'Garantiert';
    document.getElementById('btn-risk').querySelector('.option-hint').textContent = `50% Chance · sonst 0 €`;
  } else {
    badge.textContent = 'Verlustrunde';
    badge.className = 'round-type loss';
    document.getElementById('decision-headline').textContent = 'Sicherer Verlust oder Risiko?';
    document.getElementById('decision-sub').textContent = 'Du wirst in dieser Runde Geld verlieren.';
    document.getElementById('safe-amount').textContent = `−${round.safe} €`;
    document.getElementById('risk-amount').textContent = `−${round.risk} €`;
    document.getElementById('btn-safe').querySelector('.option-hint').textContent = 'Garantiert';
    document.getElementById('btn-risk').querySelector('.option-hint').textContent = `50% Chance · sonst 0 €`;
  }

  // If already decided, show confirmation
  const already = latestPersonal?.alreadyDecided;
  const confirmed = document.getElementById('decision-confirmed');
  if (already) {
    document.getElementById('btn-safe').disabled = true;
    document.getElementById('btn-risk').disabled = true;
    document.getElementById('btn-safe').classList.toggle('selected', latestPersonal.currentChoice === 'safe');
    document.getElementById('btn-risk').classList.toggle('selected', latestPersonal.currentChoice === 'risk');
    document.getElementById('chosen-label').textContent =
      latestPersonal.currentChoice === 'safe' ? 'Sicher' : 'Risiko';
    confirmed.hidden = false;
  } else {
    document.getElementById('btn-safe').disabled = false;
    document.getElementById('btn-risk').disabled = false;
    document.getElementById('btn-safe').classList.remove('selected');
    document.getElementById('btn-risk').classList.remove('selected');
    confirmed.hidden = true;
  }
}

function renderResult(s) {
  const p = latestPersonal?.me;
  if (!p || !p.decisions.length) return;
  const last = p.decisions[p.decisions.length - 1];

  const title = document.getElementById('result-title');
  const outcome = document.getElementById('result-outcome');
  const detail = document.getElementById('result-detail');
  const flip = document.getElementById('result-flip');
  const icon = document.getElementById('result-icon');

  outcome.textContent = formatMoney(last.outcome);
  outcome.className = 'result-outcome ' + (last.outcome > 0 ? 'positive' : last.outcome < 0 ? 'negative' : 'neutral');

  const choiceLabel = last.choice === 'safe' ? 'Sicher' : 'Risiko';
  detail.textContent = `Du hast "${choiceLabel}" gewählt.`;

  if (last.choice === 'risk') {
    const won = last.outcome !== 0 && last.type === 'gain' || (last.type === 'loss' && last.outcome === 0);
    flip.textContent = `Münzwurf: ${last.coinFlip === 'heads' ? 'Kopf' : 'Zahl'} — ${won ? 'Glück gehabt!' : 'Pech gehabt.'}`;
  } else {
    flip.textContent = `Münzwurf: ${last.coinFlip === 'heads' ? 'Kopf' : 'Zahl'} (nicht relevant für deine Wahl)`;
  }

  if (last.outcome > 0) icon.textContent = '💰';
  else if (last.outcome < 0) icon.textContent = '📉';
  else icon.textContent = '⚖️';

  title.textContent = `Runde ${last.roundNumber} · ${last.type === 'gain' ? 'Gewinnrunde' : 'Verlustrunde'}`;
}

function renderFinished() {
  const p = latestPersonal?.me;
  const summary = document.getElementById('personal-summary');
  if (!p) { summary.innerHTML = ''; return; }

  const riskCount = p.decisions.filter(d => d.choice === 'risk').length;
  const gainRisk = p.decisions.filter(d => d.type === 'gain' && d.choice === 'risk').length;
  const lossRisk = p.decisions.filter(d => d.type === 'loss' && d.choice === 'risk').length;
  const totalPL = p.balance - 100;
  const totalRounds = (latestState && latestState.totalRounds) || p.decisions.length || 6;
  const gainRounds = p.decisions.filter(d => d.type === 'gain').length || Math.floor(totalRounds / 2);
  const lossRounds = p.decisions.filter(d => d.type === 'loss').length || Math.floor(totalRounds / 2);

  summary.innerHTML = `
    <div class="summary-row"><span>Gesamt-Gewinn/Verlust</span><strong class="${totalPL >= 0 ? 'pos' : 'neg'}">${totalPL >= 0 ? '+' : ''}${totalPL} €</strong></div>
    <div class="summary-row"><span>Risiko-Entscheidungen</span><strong>${riskCount} / ${totalRounds}</strong></div>
    <div class="summary-row"><span>davon in Gewinnrunden</span><strong>${gainRisk} / ${gainRounds}</strong></div>
    <div class="summary-row"><span>davon in Verlustrunden</span><strong>${lossRisk} / ${lossRounds}</strong></div>
  `;
}
