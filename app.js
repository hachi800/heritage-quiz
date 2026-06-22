'use strict';

const WRONG_IDS_KEY = 'wrongQuestionIds';
const STATS_KEY     = 'statsByCategory';

let allQuestions = [];
let session      = null;

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('questions.json');
    allQuestions = await res.json();
  } catch (e) {
    allQuestions = [];
    document.getElementById('screen-top').innerHTML =
      '<p style="padding:40px;color:#dc2626;text-align:center">問題データの読み込みに失敗しました。<br>ローカルサーバー経由でアクセスしてください。</p>';
    return;
  }
  renderTop();
}

// ─── LocalStorage ────────────────────────────────────────────────────────────

function getWrongIds() {
  try { return JSON.parse(localStorage.getItem(WRONG_IDS_KEY)) || []; }
  catch { return []; }
}

function saveWrongIds(ids) {
  localStorage.setItem(WRONG_IDS_KEY, JSON.stringify(ids));
}

function getStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
  catch { return {}; }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ─── Top ──────────────────────────────────────────────────────────────────────

function renderTop() {
  renderStats();
  renderCategoryButtons();
  renderReviewButton();
  showScreen('screen-top');
}

function renderStats() {
  const stats      = getStats();
  const categories = uniqueCategories();
  const section    = document.getElementById('stats-section');

  const hasData = categories.some(c => stats[c] && stats[c].total > 0);
  if (!hasData) { section.innerHTML = ''; return; }

  const rows = categories
    .filter(c => stats[c] && stats[c].total > 0)
    .map(c => {
      const s    = stats[c];
      const rate = Math.round((s.correct / s.total) * 100);
      const bar  = `<div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;margin-top:4px">
        <div style="width:${rate}%;height:100%;background:var(--gold);border-radius:99px"></div></div>`;
      return `<li class="stats-item">
        <div style="flex:1;min-width:0">
          <span class="stats-cat">${c}</span>
          <span class="stats-rate"> ${rate}%（${s.total}問中${s.correct}問正解）</span>
          ${bar}
        </div>
      </li>`;
    }).join('');

  section.innerHTML = `<h2>学習進捗</h2><ul class="stats-list">${rows}</ul>`;
}

function renderCategoryButtons() {
  const list = document.getElementById('category-list');
  list.innerHTML = uniqueCategories().map(cat =>
    `<button class="btn-category" data-cat="${escHtml(cat)}">${escHtml(cat)}</button>`
  ).join('');

  list.querySelectorAll('.btn-category').forEach(btn => {
    btn.addEventListener('click', () => startQuiz('category', btn.dataset.cat));
  });
}

function renderReviewButton() {
  const wrongIds = getWrongIds();
  const btn      = document.getElementById('btn-review');
  const hint     = document.getElementById('review-hint');
  const label    = document.getElementById('review-label');

  if (wrongIds.length === 0) {
    btn.disabled       = true;
    hint.textContent   = '復習対象の問題はありません';
    label.textContent  = '復習モード（間違えた問題）';
  } else {
    btn.disabled       = false;
    hint.textContent   = '';
    label.textContent  = `復習モード（${wrongIds.length}問）`;
  }
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQuiz(mode, category) {
  let pool = [];

  if (mode === 'all') {
    pool = shuffle([...allQuestions]);
  } else if (mode === 'category') {
    pool = shuffle(allQuestions.filter(q => q.category === category));
  } else if (mode === 'review') {
    const wrongIds = getWrongIds();
    pool = shuffle(allQuestions.filter(q => wrongIds.includes(q.id)));
  }

  if (pool.length === 0) { alert('出題できる問題がありません。'); return; }

  session = { mode, category, questions: pool, currentIndex: 0, answers: [] };
  showScreen('screen-quiz');
  renderQuestion();
}

function renderQuestion() {
  const q     = session.questions[session.currentIndex];
  const total = session.questions.length;
  const cur   = session.currentIndex + 1;

  document.getElementById('progress-text').textContent = `${cur} / ${total}`;
  document.getElementById('progress-bar').style.width  = `${(cur / total) * 100}%`;
  document.getElementById('question-category').textContent = q.category;
  document.getElementById('question-text').textContent     = q.question;

  const LABELS = ['A', 'B', 'C', 'D'];
  const choicesEl = document.getElementById('choices');
  choicesEl.innerHTML = q.choices.map((choice, i) =>
    `<button class="btn-choice" data-index="${i}">
      <span class="choice-label">${LABELS[i]}</span>
      <span class="choice-text">${escHtml(choice)}</span>
    </button>`
  ).join('');

  choicesEl.querySelectorAll('.btn-choice').forEach(btn => {
    btn.addEventListener('click', () => selectAnswer(parseInt(btn.dataset.index, 10)));
  });

  document.getElementById('explanation-box').classList.add('hidden');
  document.getElementById('btn-next').classList.add('hidden');
}

function selectAnswer(selectedIndex) {
  const q       = session.questions[session.currentIndex];
  const correct = selectedIndex === q.answer;

  session.answers.push({
    questionId:   q.id,
    question:     q.question,
    category:     q.category,
    choices:      q.choices,
    selectedIndex,
    correctIndex: q.answer,
    correct,
    explanation:  q.explanation
  });

  // Update wrong IDs
  const wrongIds = getWrongIds();
  if (correct) {
    const idx = wrongIds.indexOf(q.id);
    if (idx !== -1) wrongIds.splice(idx, 1);
  } else {
    if (!wrongIds.includes(q.id)) wrongIds.push(q.id);
  }
  saveWrongIds(wrongIds);

  // Update stats
  const stats = getStats();
  if (!stats[q.category]) stats[q.category] = { total: 0, correct: 0 };
  stats[q.category].total++;
  if (correct) stats[q.category].correct++;
  saveStats(stats);

  // Mark choices
  document.querySelectorAll('.btn-choice').forEach(btn => {
    btn.disabled = true;
    const i = parseInt(btn.dataset.index, 10);
    if (i === q.answer)                     btn.classList.add('correct');
    if (i === selectedIndex && !correct)    btn.classList.add('wrong');
  });

  // Show explanation
  const label = document.getElementById('explanation-label');
  label.textContent = correct ? '✓ 正解！' : '✗ 不正解';
  label.className   = 'explanation-label ' + (correct ? 'correct' : 'wrong');
  document.getElementById('explanation-text').textContent = q.explanation;
  document.getElementById('explanation-box').classList.remove('hidden');

  // Show next button
  const isLast  = session.currentIndex === session.questions.length - 1;
  const btnNext = document.getElementById('btn-next');
  btnNext.textContent = isLast ? '結果を見る' : '次の問題へ →';
  btnNext.classList.remove('hidden');
}

function nextQuestion() {
  if (session.currentIndex < session.questions.length - 1) {
    session.currentIndex++;
    renderQuestion();
  } else {
    showResult();
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────

function showResult() {
  const total   = session.answers.length;
  const correct = session.answers.filter(a => a.correct).length;
  const rate    = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('result-score').textContent = `${correct} / ${total}`;
  document.getElementById('result-rate').textContent  = `正答率 ${rate}%`;

  const resultBar = document.getElementById('result-bar');
  const card      = document.getElementById('result-card');
  setTimeout(() => { resultBar.style.width = `${rate}%`; }, 50);

  card.classList.remove('excellent', 'failing');
  if (rate >= 80) card.classList.add('excellent');
  else if (rate < 50) card.classList.add('failing');

  const LABELS = ['A', 'B', 'C', 'D'];
  const wrong  = session.answers.filter(a => !a.correct);
  const section = document.getElementById('wrong-answers-section');

  if (wrong.length === 0) {
    section.innerHTML = '<p class="perfect-msg">🎉 全問正解です！</p>';
  } else {
    section.innerHTML = `<h2>間違えた問題（${wrong.length}問）</h2>` +
      wrong.map(a => `
        <div class="wrong-answer-card">
          <p class="wrong-question">${escHtml(a.question)}</p>
          <p class="wrong-selected">あなたの答え: ${LABELS[a.selectedIndex]}. ${escHtml(a.choices[a.selectedIndex])}</p>
          <p class="wrong-correct">正解: ${LABELS[a.correctIndex]}. ${escHtml(a.choices[a.correctIndex])}</p>
          <p class="wrong-exp">${escHtml(a.explanation)}</p>
        </div>
      `).join('');
  }

  showScreen('screen-result');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueCategories() {
  return [...new Set(allQuestions.map(q => q.category))];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('btn-all').addEventListener('click',    () => startQuiz('all'));
document.getElementById('btn-review').addEventListener('click', () => startQuiz('review'));
document.getElementById('btn-back').addEventListener('click',   () => renderTop());
document.getElementById('btn-next').addEventListener('click',   () => nextQuestion());
document.getElementById('btn-retry').addEventListener('click',  () => startQuiz(session.mode, session.category));
document.getElementById('btn-home').addEventListener('click',   () => renderTop());
document.getElementById('btn-reset').addEventListener('click',  () => {
  if (!confirm('学習進捗（正答率・復習リスト）をすべてリセットしますか？')) return;
  localStorage.removeItem(WRONG_IDS_KEY);
  localStorage.removeItem(STATS_KEY);
  renderTop();
});

// ─── Service Worker ───────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(e => console.warn('SW registration failed:', e));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
