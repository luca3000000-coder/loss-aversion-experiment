// Loss Aversion Experiment - Backend
// Node.js + Express + Socket.IO
// Single in-memory game session. Restart server to reset.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const PRESENTER_PASSWORD = process.env.PRESENTER_PASSWORD || 'loss2026';

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Experiment configuration ----------
const STARTING_BALANCE = 100;
const DEFAULT_TOTAL_ROUNDS = 6;
const MIN_TOTAL_ROUNDS = 2;
const MAX_TOTAL_ROUNDS = 20;

// Build rounds dynamically. Always alternates gain/loss starting with gain.
function buildRounds(totalRounds) {
  const list = [];
  for (let i = 0; i < totalRounds; i++) {
    list.push({
      n: i + 1,
      type: i % 2 === 0 ? 'gain' : 'loss',
      safe: 20,
      risk: 40
    });
  }
  return list;
}

let TOTAL_ROUNDS = DEFAULT_TOTAL_ROUNDS;
let ROUNDS = buildRounds(TOTAL_ROUNDS);

// ---------- State machine ----------
// phase values:
//   'lobby'        - participants can join, no round active yet
//   'deciding'     - current round open for decisions
//   'awaiting_flip'- decisions closed, presenter must submit coin flip
//   'round_done'   - round results revealed, waiting to advance
//   'finished'     - all rounds done
let state = freshState();

function freshState() {
  return {
    phase: 'lobby',
    currentRoundIndex: -1, // -1 before first round starts, 0..5 during, TOTAL_ROUNDS after last
    coinFlip: null,        // 'heads' | 'tails' for current round
    participants: new Map(), // socketId -> participant
    decisionsByRound: Array.from({ length: TOTAL_ROUNDS }, () => ({
      safe: 0,
      risk: 0,
      entries: [] // { socketId, nickname, choice }
    })),
    presenterSockets: new Set()
  };
}

function createParticipant(socketId, nickname) {
  return {
    socketId,
    nickname,
    balance: STARTING_BALANCE,
    decisions: [], // per round: { roundIndex, choice, outcomeAmount, balanceAfter }
    joinedAt: Date.now()
  };
}

// ---------- Helpers ----------
function publicParticipant(p) {
  return {
    socketId: p.socketId,
    nickname: p.nickname,
    balance: p.balance,
    decisions: p.decisions
  };
}

function publicState() {
  const round = state.currentRoundIndex >= 0 && state.currentRoundIndex < TOTAL_ROUNDS
    ? ROUNDS[state.currentRoundIndex]
    : null;

  const currentDec = state.currentRoundIndex >= 0 && state.currentRoundIndex < TOTAL_ROUNDS
    ? state.decisionsByRound[state.currentRoundIndex]
    : null;

  return {
    phase: state.phase,
    totalRounds: TOTAL_ROUNDS,
    currentRoundIndex: state.currentRoundIndex,
    round: round,
    coinFlip: state.coinFlip,
    participantCount: state.participants.size,
    decisionsThisRound: currentDec
      ? { safe: currentDec.safe, risk: currentDec.risk }
      : { safe: 0, risk: 0 }
  };
}

function getPersonalView(socketId) {
  const p = state.participants.get(socketId);
  if (!p) return null;
  // Has the participant made a decision this round?
  let alreadyDecided = false;
  let currentChoice = null;
  if (state.currentRoundIndex >= 0 && state.currentRoundIndex < TOTAL_ROUNDS) {
    const entry = state.decisionsByRound[state.currentRoundIndex].entries
      .find(e => e.socketId === socketId);
    if (entry) {
      alreadyDecided = true;
      currentChoice = entry.choice;
    }
  }
  return {
    me: publicParticipant(p),
    alreadyDecided,
    currentChoice
  };
}

function broadcastStateToAll() {
  io.emit('state_update', publicState());
  // Each participant also gets personal view
  for (const socketId of state.participants.keys()) {
    io.to(socketId).emit('personal_update', getPersonalView(socketId));
  }
  // Presenters get extended data
  for (const socketId of state.presenterSockets) {
    io.to(socketId).emit('presenter_update', presenterView());
  }
}

function presenterView() {
  const participants = Array.from(state.participants.values()).map(publicParticipant);
  // Full aggregated stats per round
  const roundStats = state.decisionsByRound.map((d, idx) => ({
    roundIndex: idx,
    round: ROUNDS[idx],
    safe: d.safe,
    risk: d.risk,
    total: d.safe + d.risk
  }));

  // Aggregate: gain rounds vs loss rounds - how often risk chosen
  const gainStats = { safe: 0, risk: 0 };
  const lossStats = { safe: 0, risk: 0 };
  ROUNDS.forEach((r, idx) => {
    const d = state.decisionsByRound[idx];
    if (r.type === 'gain') {
      gainStats.safe += d.safe;
      gainStats.risk += d.risk;
    } else {
      lossStats.safe += d.safe;
      lossStats.risk += d.risk;
    }
  });

  return {
    ...publicState(),
    participants,
    roundStats,
    aggregate: {
      gain: gainStats,
      loss: lossStats
    }
  };
}

// ---------- Round / game control ----------
function startRound() {
  // Move to next round
  const next = state.currentRoundIndex + 1;
  if (next >= TOTAL_ROUNDS) {
    state.phase = 'finished';
    state.currentRoundIndex = TOTAL_ROUNDS;
    broadcastStateToAll();
    return { ok: false, reason: 'already_finished' };
  }
  state.currentRoundIndex = next;
  state.phase = 'deciding';
  state.coinFlip = null;
  broadcastStateToAll();
  return { ok: true };
}

function closeDecisions() {
  if (state.phase !== 'deciding') return { ok: false, reason: 'not_deciding' };
  // Any participant who hasn't decided is defaulted to 'safe' (conservative fallback).
  const idx = state.currentRoundIndex;
  const dec = state.decisionsByRound[idx];
  for (const p of state.participants.values()) {
    const already = dec.entries.find(e => e.socketId === p.socketId);
    if (!already) {
      dec.entries.push({ socketId: p.socketId, nickname: p.nickname, choice: 'safe' });
      dec.safe += 1;
    }
  }
  state.phase = 'awaiting_flip';
  broadcastStateToAll();
  return { ok: true };
}

function submitCoinFlip(result) {
  if (state.phase !== 'awaiting_flip') return { ok: false, reason: 'not_awaiting_flip' };
  if (result !== 'heads' && result !== 'tails') return { ok: false, reason: 'invalid_result' };

  state.coinFlip = result;
  const idx = state.currentRoundIndex;
  const round = ROUNDS[idx];
  const dec = state.decisionsByRound[idx];

  // Convention: heads = win (full 40€ gain for gain round / 0€ loss for loss round)
  //             tails = lose (0€ for gain round / full 40€ loss for loss round)
  // Safe choice: always +20 (gain) or -20 (loss).
  // Risky choice: heads -> full amount in favorable direction, tails -> 0.
  const sign = round.type === 'gain' ? 1 : -1;

  for (const entry of dec.entries) {
    const p = state.participants.get(entry.socketId);
    if (!p) continue;
    let outcome = 0;
    if (entry.choice === 'safe') {
      outcome = sign * round.safe;
    } else {
      // risky
      if (result === 'heads') {
        // favorable: in gain round => +40; in loss round => 0 (avoided loss)
        outcome = round.type === 'gain' ? round.risk : 0;
      } else {
        // unfavorable: in gain round => 0; in loss round => -40
        outcome = round.type === 'gain' ? 0 : -round.risk;
      }
    }
    p.balance += outcome;
    p.decisions.push({
      roundIndex: idx,
      roundNumber: round.n,
      type: round.type,
      choice: entry.choice,
      coinFlip: result,
      outcome,
      balanceAfter: p.balance
    });
  }

  state.phase = 'round_done';
  broadcastStateToAll();
  return { ok: true };
}

function advanceRound() {
  if (state.phase !== 'round_done') return { ok: false, reason: 'not_round_done' };
  if (state.currentRoundIndex + 1 >= TOTAL_ROUNDS) {
    state.phase = 'finished';
    state.currentRoundIndex = TOTAL_ROUNDS;
    broadcastStateToAll();
    return { ok: true, finished: true };
  }
  return startRound();
}

function resetGame() {
  state = freshState();
  // Reconnect any still-connected sockets as "observers" - they need to rejoin.
  io.emit('game_reset');
  broadcastStateToAll();
}

function setRoundCount(count) {
  if (state.phase !== 'lobby') return { ok: false, reason: 'not_in_lobby' };
  count = Number(count);
  if (!Number.isInteger(count)
      || count < MIN_TOTAL_ROUNDS
      || count > MAX_TOTAL_ROUNDS
      || count % 2 !== 0) {
    return { ok: false, reason: 'invalid_count' };
  }
  TOTAL_ROUNDS = count;
  ROUNDS = buildRounds(TOTAL_ROUNDS);
  state.decisionsByRound = Array.from({ length: TOTAL_ROUNDS }, () => ({
    safe: 0,
    risk: 0,
    entries: []
  }));
  broadcastStateToAll();
  return { ok: true, totalRounds: TOTAL_ROUNDS };
}

// ---------- Socket handlers ----------
io.on('connection', (socket) => {
  // Initial state push for any new connection
  socket.emit('state_update', publicState());

  socket.on('participant_join', ({ nickname }, ack) => {
    if (state.phase !== 'lobby') {
      ack && ack({ ok: false, reason: 'game_already_started' });
      return;
    }
    const trimmed = (nickname || '').toString().trim().slice(0, 24);
    if (!trimmed) {
      ack && ack({ ok: false, reason: 'invalid_nickname' });
      return;
    }
    // Prevent duplicate nicknames
    for (const p of state.participants.values()) {
      if (p.nickname.toLowerCase() === trimmed.toLowerCase()) {
        ack && ack({ ok: false, reason: 'nickname_taken' });
        return;
      }
    }
    const participant = createParticipant(socket.id, trimmed);
    state.participants.set(socket.id, participant);
    socket.data.role = 'participant';
    ack && ack({ ok: true, me: publicParticipant(participant) });
    broadcastStateToAll();
  });

  socket.on('participant_decision', ({ choice }, ack) => {
    if (state.phase !== 'deciding') {
      ack && ack({ ok: false, reason: 'not_deciding' });
      return;
    }
    if (!state.participants.has(socket.id)) {
      ack && ack({ ok: false, reason: 'not_joined' });
      return;
    }
    if (choice !== 'safe' && choice !== 'risk') {
      ack && ack({ ok: false, reason: 'invalid_choice' });
      return;
    }
    const idx = state.currentRoundIndex;
    const dec = state.decisionsByRound[idx];
    // Prevent double vote
    const existing = dec.entries.find(e => e.socketId === socket.id);
    if (existing) {
      ack && ack({ ok: false, reason: 'already_decided' });
      return;
    }
    const p = state.participants.get(socket.id);
    dec.entries.push({ socketId: socket.id, nickname: p.nickname, choice });
    dec[choice] += 1;
    ack && ack({ ok: true });
    broadcastStateToAll();
  });

  socket.on('presenter_join', ({ password }, ack) => {
    if (password !== PRESENTER_PASSWORD) {
      ack && ack({ ok: false, reason: 'wrong_password' });
      return;
    }
    state.presenterSockets.add(socket.id);
    socket.data.role = 'presenter';
    ack && ack({ ok: true });
    socket.emit('presenter_update', presenterView());
  });

  socket.on('presenter_start_round', (_, ack) => {
    if (!state.presenterSockets.has(socket.id)) {
      ack && ack({ ok: false, reason: 'not_authorized' });
      return;
    }
    // Only allowed from lobby or round_done
    if (state.phase !== 'lobby' && state.phase !== 'round_done') {
      ack && ack({ ok: false, reason: 'invalid_phase' });
      return;
    }
    if (state.phase === 'round_done') {
      const result = advanceRound();
      ack && ack(result);
    } else {
      const result = startRound();
      ack && ack(result);
    }
  });

  socket.on('presenter_close_decisions', (_, ack) => {
    if (!state.presenterSockets.has(socket.id)) {
      ack && ack({ ok: false, reason: 'not_authorized' });
      return;
    }
    ack && ack(closeDecisions());
  });

  socket.on('presenter_coin_flip', ({ result }, ack) => {
    if (!state.presenterSockets.has(socket.id)) {
      ack && ack({ ok: false, reason: 'not_authorized' });
      return;
    }
    ack && ack(submitCoinFlip(result));
  });

  socket.on('presenter_reset', (_, ack) => {
    if (!state.presenterSockets.has(socket.id)) {
      ack && ack({ ok: false, reason: 'not_authorized' });
      return;
    }
    resetGame();
    ack && ack({ ok: true });
  });

  socket.on('presenter_set_rounds', ({ count }, ack) => {
    if (!state.presenterSockets.has(socket.id)) {
      ack && ack({ ok: false, reason: 'not_authorized' });
      return;
    }
    ack && ack(setRoundCount(count));
  });

  socket.on('disconnect', () => {
    if (state.presenterSockets.has(socket.id)) {
      state.presenterSockets.delete(socket.id);
    }
    // Keep participants in state even after disconnect so they can rejoin;
    // but only if game hasn't started yet we remove them, otherwise keep data.
    if (state.participants.has(socket.id)) {
      if (state.phase === 'lobby') {
        state.participants.delete(socket.id);
        broadcastStateToAll();
      } else {
        // Mark as disconnected but keep record
        const p = state.participants.get(socket.id);
        p.disconnected = true;
        broadcastStateToAll();
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Loss Aversion Experiment running on http://localhost:${PORT}`);
  console.log(`Presenter password: ${PRESENTER_PASSWORD}`);
});
