/* ================================================================
   SIÊU TRẮC NGHIỆM — v1.4
   Thêm mới (KHÔNG xóa gì):
     - 📜 Trang Lịch sử làm bài
     - ⌨️  Phím tắt
     - ∑  KaTeX render công thức
     - 🏆 Đăng ký / Đăng nhập + Rank + EXP (kiểu Elo)
     - ✏️  Tự dùng username làm tên học sinh (không bắt nhập lại)
     - ⚖️  Giảm một nửa mức trừ EXP (trừ 5/câu, trần -50)
   ================================================================ */

/* ============ THEME (DARK/LIGHT MODE) ============ */
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try {
        localStorage.setItem('quizTheme', next);
    } catch (e) { /* ignore */ }
}

try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('quizTheme')) {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
} catch (e) { /* Safari cũ */ }

/* ============ STATE ============ */
const state = {
    fullQuestions: [],
    selectedQuestions: [],
    userAnswers: [],
    locked: [],
    optionOrders: [],
    currentIndex: 0,
    quizActive: false,
    currentGrade: '6',
    currentSubject: 'toan',
    studentName: '',
    timeLeft: 0,
    timerInterval: null
};

/* ============ CONFIG ============ */
const FILE_MAP = {
    toan: 'toan',
    nguvan: 'nguvan',
    tienganh: 'tienganh',
    khtn: 'khtn',
    lichsu_dialy: 'sudia',
    gdcd: 'congdan',
    congnghe: 'congnghe',
    tinhoc: 'tinhoc'
};

const SUBJECT_NAMES = {
    toan: 'Toán', nguvan: 'Ngữ văn', tienganh: 'Tiếng Anh',
    khtn: 'KHTN', lichsu_dialy: 'Lịch sử & Địa lý',
    gdcd: 'GDCD', congnghe: 'Công nghệ', tinhoc: 'Tin học'
};

const LETTERS = ['a', 'b', 'c', 'd'];

/* ============ RANK SYSTEM ============ */
const RANKS = [
    { level: 1, name: 'Đồng',      icon: '🥉', minExp: 0,    color: '#cd7f32', cssClass: 'rank-1' },
    { level: 2, name: 'Bạc',       icon: '🥈', minExp: 100,  color: '#c0c0c0', cssClass: 'rank-2' },
    { level: 3, name: 'Vàng',      icon: '🥇', minExp: 250,  color: '#ffd700', cssClass: 'rank-3' },
    { level: 4, name: 'Bạch Kim',  icon: '💎', minExp: 500,  color: '#e5e4e2', cssClass: 'rank-4' },
    { level: 5, name: 'Kim Cương', icon: '💠', minExp: 900,  color: '#b9f2ff', cssClass: 'rank-5' },
    { level: 6, name: 'Huyền Thoại', icon: '👑', minExp: 1500, color: '#a855f7', cssClass: 'rank-6' }
];

function getRankByExp(exp) {
    let result = RANKS[0];
    for (const r of RANKS) {
        if (exp >= r.minExp) result = r;
        else break;
    }
    return result;
}

function getNextRank(exp) {
    const cur = getRankByExp(exp);
    return RANKS.find(r => r.level === cur.level + 1) || null;
}

/**
 * Tính EXP thay đổi từ 1 bài làm.
 * Quy tắc (ĐÃ GIẢM MỘT NỬA MỨC TRỪ so với bản trước):
 *  - correct > wrong  → +10 EXP cho mỗi câu chênh lệch (tối thiểu +10)
 *  - correct < wrong  → −5 EXP cho mỗi câu chênh lệch (tối đa −50)
 *  - correct = wrong  → 0 EXP
 */
function computeExpDelta(correct, wrong) {
    const diff = correct - wrong;
    if (diff > 0) {
        const delta = Math.max(10, diff * 10);
        return { delta, correct, wrong, reason: `Đúng ${correct}, sai ${wrong} → +${delta} EXP` };
    } else if (diff < 0) {
        // Giảm một nửa mức trừ: mỗi câu sai nhiều hơn đúng chỉ trừ 5 EXP (thay vì 10)
        // Trần trừ tối đa cũng giảm còn -50 (thay vì -100)
        const delta = Math.max(-50, Math.ceil(diff * 5));
        return { delta, correct, wrong, reason: `Đúng ${correct}, sai ${wrong} → ${delta} EXP` };
    }
    return { delta: 0, correct, wrong, reason: `Đúng ${correct}, sai ${wrong} → 0 EXP` };
}

/* ============ USER / AUTH SYSTEM ============ */
const USERS_KEY = 'quizUsers';
const CURRENT_USER_KEY = 'quizCurrentUser';

function loadUsers() {
    try {
        const raw = localStorage.getItem(USERS_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) { /* ignore */ }
}

function hashPassword(pw) {
    try {
        return btoa(unescape(encodeURIComponent(pw)));
    } catch (e) {
        return pw;
    }
}

function normalizeUsername(name) {
    return String(name || '').trim().toLowerCase();
}

function getCurrentUser() {
    try {
        const username = localStorage.getItem(CURRENT_USER_KEY);
        if (!username) return null;
        const users = loadUsers();
        const u = users[username];
        if (!u) return null;
        return { username, ...u };
    } catch (e) {
        return null;
    }
}

function setCurrentUser(username) {
    try {
        localStorage.setItem(CURRENT_USER_KEY, username);
    } catch (e) { /* ignore */ }
}

function clearCurrentUser() {
    try {
        localStorage.removeItem(CURRENT_USER_KEY);
    } catch (e) { /* ignore */ }
}

function updateCurrentUser(patch) {
    try {
        const username = localStorage.getItem(CURRENT_USER_KEY);
        if (!username) return;
        const users = loadUsers();
        if (!users[username]) return;
        users[username] = { ...users[username], ...patch };
        saveUsers(users);
    } catch (e) { /* ignore */ }
}

function migrateOldHistoryToUser(username) {
    try {
        const oldRaw = localStorage.getItem('quizHistory');
        if (!oldRaw) return;
        const oldHist = JSON.parse(oldRaw);
        if (!Array.isArray(oldHist) || oldHist.length === 0) return;

        const users = loadUsers();
        if (!users[username]) return;
        if (!users[username].history || users[username].history.length === 0) {
            users[username].history = oldHist.slice(0, 50);
            saveUsers(users);
        }
        localStorage.removeItem('quizHistory');
    } catch (e) { /* ignore */ }
}

/* ============ DOM ============ */
const $ = (id) => document.getElementById(id);
const setupPanel = $('setupPanel');
const quizArea = $('quizArea');
const resultArea = $('resultArea');

/* ============ HELPERS ============ */
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/* ============ KATEX RENDER ============ */
function renderMath(container) {
    if (!container) return;
    if (typeof renderMathInElement !== 'function') return;
    try {
        renderMathInElement(container, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$',  right: '$',  display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false,
            errorColor: '#f43f5e',
            macros: { '\\RR': '\\mathbb{R}' }
        });
    } catch (e) { /* ignore */ }
}

/* ============ LOAD DATA ============ */
async function loadQuestions(grade, subject) {
    const prefix = FILE_MAP[subject];
    if (!prefix) throw new Error(`Không tìm thấy môn: ${subject}`);
    const file = `${prefix}${grade}.json`;
    const resp = await fetch(file);
    if (!resp.ok) throw new Error(`Không tải được file ${file}`);
    const data = await resp.json();
    if (!Array.isArray(data.cauhoi)) throw new Error(`File ${file} thiếu mảng "cauhoi"`);
    return data.cauhoi;
}

/* ============ PICK QUESTIONS ============ */
function pickQuestions(fullList, count) {
    if (!fullList?.length) return [];
    if (count >= fullList.length) {
        return shuffleInPlace([...fullList]);
    }
    const GROUP_SIZE = 10;
    const groups = Math.ceil(fullList.length / GROUP_SIZE);
    const base = Math.floor(count / groups);
    const extra = count % groups;
    const result = [];

    for (let g = 0; g < groups; g++) {
        const start = g * GROUP_SIZE;
        const groupItems = fullList.slice(start, start + GROUP_SIZE);
        shuffleInPlace(groupItems);
        const take = base + (g < extra ? 1 : 0);
        if (take > 0) result.push(...groupItems.slice(0, take));
    }
    return shuffleInPlace(result);
}

/* ============ TIMER ============ */
function startTimer() {
    stopTimer();
    const el = $('timerDisplay');

    if (state.timeLeft <= 0) {
        el.textContent = '∞';
        el.classList.remove('warning');
        return;
    }
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();
        if (state.timeLeft <= 0) {
            stopTimer();
            finishQuiz(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const el = $('timerDisplay');
    if (state.timeLeft <= 0) {
        el.textContent = '∞';
        return;
    }
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    el.textContent = `⏱️ ${m}:${String(s).padStart(2, '0')}`;
    el.classList.toggle('warning', state.timeLeft <= 60);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

/* ============ RENDER ============ */
function renderCurrentQuestion() {
    const q = state.selectedQuestions[state.currentIndex];
    if (!q) return;

    $('tagDang').textContent = q.dang || 'Chung';
    $('tagMucdo').textContent = q.mucdo || '';
    $('tagMucdo').className = `tag tag-mucdo mucdo-${(q.mucdo || '').replace(/\s+/g, '')}`;

    $('questionText').textContent = q.de || '';
    renderMath($('questionText'));

    const isLocked = !!state.locked[state.currentIndex];
    const correctIdx = LETTERS.indexOf(q.dap_an);
    const userIdx = state.userAnswers[state.currentIndex];

    let order = state.optionOrders[state.currentIndex];
    if (!order) {
        order = [0, 1, 2, 3];
        shuffleInPlace(order);
        state.optionOrders[state.currentIndex] = order;
    }

    const container = $('answersContainer');
    container.innerHTML = '';
    order.forEach((origIdx, displayIdx) => {
        const text = q[LETTERS[origIdx]] ?? '';
        const div = document.createElement('div');
        div.className = 'answer-option';
        div.dataset.idx = origIdx;

        if (!isLocked && userIdx === origIdx) div.classList.add('selected');

        if (isLocked) {
            div.style.pointerEvents = 'none';
            if (origIdx === correctIdx) div.classList.add('feedback-correct');
            if (origIdx === userIdx && userIdx !== correctIdx) div.classList.add('feedback-wrong');
        }

        div.innerHTML = `
            <span class="prefix">${'ABCD'[displayIdx]}</span>
            <span class="answer-text">${escapeHtml(text)}</span>
        `;
        renderMath(div.querySelector('.answer-text'));

        if (!isLocked) {
            div.addEventListener('click', () => onSelectAnswer(origIdx, div));
        }
        container.appendChild(div);
    });

    if (isLocked) {
        const isCorrect = userIdx === correctIdx;
        const explain = q.giai_thich || '';
        $('statusHint').innerHTML = isCorrect
            ? `🎉 <strong>ĐÚNG!</strong> ${escapeHtml(explain)}`
            : `❌ <strong>SAI!</strong> Đáp án đúng là <strong>${q.dap_an.toUpperCase()}</strong>. ${escapeHtml(explain)}`;
        renderMath($('statusHint'));
    } else {
        $('statusHint').innerHTML = '✅ Hãy chọn đáp án và bấm <strong>GỬI CÂU TRẢ LỜI</strong>.';
    }

    $('submitBtn').classList.toggle('hidden', isLocked);
    $('submitBtn').disabled = false;
    $('nextBtn').classList.toggle('hidden', !isLocked);

    updateProgress();
    updateQuestionNav();
}

function onSelectAnswer(origIdx, div) {
    if (!state.quizActive) return;
    if (state.locked[state.currentIndex]) return;

    document.querySelectorAll('.answer-option').forEach(el => el.classList.remove('selected'));
    div.classList.add('selected');
    state.userAnswers[state.currentIndex] = origIdx;
    $('statusHint').innerHTML = '📌 Đã chọn, bấm <strong>GỬI CÂU TRẢ LỜI</strong> để xác nhận.';
}

function updateProgress() {
    const total = state.selectedQuestions.length;
    const cur = state.currentIndex + 1;
    $('progressText').textContent = `Câu ${cur}/${total}`;
    $('progressFill').style.width = `${(cur / total) * 100}%`;
}

function updateQuestionNav() {
    const nav = $('questionNav');
    nav.innerHTML = '';
    state.selectedQuestions.forEach((q, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'nav-dot';
        dot.textContent = idx + 1;
        if (idx === state.currentIndex) dot.classList.add('current');

        if (state.locked[idx]) {
            const userIdx = state.userAnswers[idx];
            const correctIdx = LETTERS.indexOf(q.dap_an);
            dot.classList.add(userIdx === correctIdx ? 'correct' : 'wrong');
        }

        dot.addEventListener('click', () => {
            if (!state.quizActive) return;
            state.currentIndex = idx;
            renderCurrentQuestion();
            document.querySelector('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        nav.appendChild(dot);
    });
}

function updateScoreUI() {
    let correct = 0;
    state.selectedQuestions.forEach((q, i) => {
        if (state.locked[i] && state.userAnswers[i] !== null) {
            if (state.userAnswers[i] === LETTERS.indexOf(q.dap_an)) correct++;
        }
    });
    $('scoreDisplay').textContent = `Điểm: ${correct}/${state.selectedQuestions.length}`;
}

/* ============ SUBMIT ============ */
function handleSubmit() {
    if (!state.quizActive) return;
    const idx = state.userAnswers[state.currentIndex];
    if (idx === null) {
        $('statusHint').innerHTML = '⚠️ Bạn chưa chọn đáp án!';
        const hint = $('statusHint');
        hint.classList.remove('shake');
        void hint.offsetWidth;
        hint.classList.add('shake');
        return;
    }

    const submitBtn = $('submitBtn');
    const card = document.querySelector('.question-card');
    const selectedEl = document.querySelector('.answer-option.selected');

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    if (card) card.classList.add('submitting');
    if (selectedEl) selectedEl.classList.add('submitting');

    setTimeout(() => {
        state.locked[state.currentIndex] = true;

        submitBtn.classList.remove('loading');
        if (card) card.classList.remove('submitting');

        renderCurrentQuestion();

        const q = state.selectedQuestions[state.currentIndex];
        const correctIdx = LETTERS.indexOf(q.dap_an);
        const isCorrect = idx === correctIdx;

        const newCard = document.querySelector('.question-card');
        if (newCard) newCard.classList.add(isCorrect ? 'flash-correct' : 'flash-wrong');

        const hint = $('statusHint');
        hint.classList.remove('hint-anim');
        void hint.offsetWidth;
        hint.classList.add('hint-anim');

        const chosenEl = document.querySelector(`.answer-option[data-idx="${idx}"]`);
        if (chosenEl) spawnBurst(chosenEl, isCorrect);
        if (isCorrect) spawnConfetti(chosenEl);

        updateScoreUI();
        const scoreEl = $('scoreDisplay');
        scoreEl.classList.remove('bump');
        void scoreEl.offsetWidth;
        scoreEl.classList.add('bump');

        setTimeout(() => {
            if (newCard) newCard.classList.remove('flash-correct', 'flash-wrong');
            hint.classList.remove('hint-anim');
            scoreEl.classList.remove('bump');
        }, 900);
    }, 350);
}

/* ============ HIỆU ỨNG BURST & CONFETTI ============ */
function spawnBurst(el, isCorrect) {
    const rect = el.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'burst-icon ' + (isCorrect ? 'burst-correct' : 'burst-wrong');
    burst.textContent = isCorrect ? '✓' : '✗';
    burst.style.left = (rect.left + rect.width - 44) + 'px';
    burst.style.top = (rect.top + rect.height / 2 - 22) + 'px';
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 900);
}

function spawnConfetti(sourceEl) {
    if (!sourceEl) return;
    const rect = sourceEl.getBoundingClientRect();
    const colors = ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fbbf24'];
    for (let i = 0; i < 14; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-piece';
        p.style.left = (rect.left + rect.width / 2) + 'px';
        p.style.top = (rect.top + rect.height / 2) + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 80;
        p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
        p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
        p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        p.style.setProperty('--delay', (Math.random() * 0.08) + 's');
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1100);
    }
}

function goNext() {
    if (state.currentIndex + 1 < state.selectedQuestions.length) {
        state.currentIndex++;
        renderCurrentQuestion();
        document.querySelector('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        finishQuiz();
    }
}

/* ============ FINISH ============ */
function finishQuiz(timeUp = false) {
    if (!state.quizActive) return;
    stopTimer();
    state.quizActive = false;

    let correct = 0;
    const byTopic = {};
    const byLevel = {};

    state.selectedQuestions.forEach((q, i) => {
        const correctIdx = LETTERS.indexOf(q.dap_an);
        const isCorrect = state.locked[i] && state.userAnswers[i] === correctIdx;
        if (isCorrect) correct++;

        const topic = q.dang || 'Chung';
        byTopic[topic] = byTopic[topic] || { total: 0, correct: 0 };
        byTopic[topic].total++;
        if (isCorrect) byTopic[topic].correct++;

        const level = q.mucdo || 'Chung';
        byLevel[level] = byLevel[level] || { total: 0, correct: 0 };
        byLevel[level].total++;
        if (isCorrect) byLevel[level].correct++;
    });

    const total = state.selectedQuestions.length;
    const wrong = total - correct;
    const pct = total ? Math.round((correct / total) * 100) : 0;

    let comment = '';
    if (pct === 100) comment = '🏆 TUYỆT VỜI! Điểm tuyệt đối!';
    else if (pct >= 80) comment = '🌟 GIỎI! Kiến thức vững vàng.';
    else if (pct >= 60) comment = '📚 KHÁ! Cần củng cố thêm.';
    else if (pct >= 40) comment = '📖 TRUNG BÌNH! Hãy ôn lại bài.';
    else comment = '🌱 CẦN CỐ GẮNG! Đừng nản nhé!';

    const scoreClass = pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'poor';

    /* ===== TÍNH EXP + CẬP NHẬT RANK ===== */
    const expChange = computeExpDelta(correct, wrong);
    let newExp = null;
    let oldRank = null;
    let newRank = null;
    let rankChanged = false;

    const currentUser = getCurrentUser();
    if (currentUser) {
        const oldExp = currentUser.exp || 0;
        oldRank = getRankByExp(oldExp);

        newExp = Math.max(0, oldExp + expChange.delta);
        newRank = getRankByExp(newExp);
        rankChanged = newRank.level !== oldRank.level;

        const history = (currentUser.history || []).slice();
        const historyRecord = {
            correct, total, wrong,
            date: Date.now(),
            subject: state.currentSubject,
            subjectName: SUBJECT_NAMES[state.currentSubject],
            grade: state.currentGrade,
            name: state.studentName,
            expDelta: newExp - oldExp
        };
        history.unshift(historyRecord);
        history.length = Math.min(history.length, 50);

        updateCurrentUser({ exp: newExp, history });
        refreshUserBar();
    }

    let html = `
        <div class="result-header">
            ${timeUp ? '<div class="time-up-banner">⏰ HẾT GIỜ!</div>' : ''}
            <h2>📊 KẾT QUẢ BÀI THI</h2>
            <p class="result-student">Học sinh: <strong>${escapeHtml(state.studentName)}</strong></p>
            <p class="result-subject">${SUBJECT_NAMES[state.currentSubject]} — Khối ${state.currentGrade}</p>
        </div>
        <div class="final-score ${scoreClass}">
            ${correct}/${total}
            <span class="final-pct">(${pct}%)</span>
        </div>
        <p class="result-comment">${comment}</p>
    `;

    if (currentUser && newExp !== null) {
        const deltaStr = expChange.delta > 0 ? `+${expChange.delta}` :
                         expChange.delta < 0 ? `${expChange.delta}` : '0';
        const deltaClass = expChange.delta > 0 ? 'positive' :
                           expChange.delta < 0 ? 'negative' : 'zero';
        html += `
            <div class="result-section">
                <h3>🏆 EXP & RANK</h3>
                <div class="breakdown">
                    <div class="breakdown-row">
                        <span class="breakdown-label">Kết quả</span>
                        <div class="breakdown-bar">
                            <div class="breakdown-fill ${expChange.delta >= 0 ? 'good' : 'poor'}" style="width:${Math.min(100, Math.abs(expChange.delta))}%"></div>
                        </div>
                        <span class="breakdown-stat exp-toast-${deltaClass}">${deltaStr} EXP</span>
                    </div>
                    <div class="breakdown-row">
                        <span class="breakdown-label">EXP hiện tại</span>
                        <div class="breakdown-bar"><div class="breakdown-fill good" style="width:${Math.min(100, (newExp / 1500) * 100)}%"></div></div>
                        <span class="breakdown-stat">${newExp} EXP</span>
                    </div>
                    <div class="breakdown-row">
                        <span class="breakdown-label">Rank</span>
                        <div class="breakdown-bar"><div class="breakdown-fill good" style="width:${rankChanged ? 100 : 0}%"></div></div>
                        <span class="breakdown-stat">${oldRank.icon} ${oldRank.name}${rankChanged ? ' → ' + newRank.icon + ' ' + newRank.name : ''}</span>
                    </div>
                </div>
            </div>
        `;
    }

    html += `<div class="result-section"><h3>📈 Phân tích theo mức độ</h3><div class="breakdown">`;
    ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'].forEach(level => {
        if (!byLevel[level]) return;
        const d = byLevel[level];
        const p = Math.round((d.correct / d.total) * 100);
        const color = p >= 70 ? 'good' : p >= 40 ? 'mid' : 'poor';
        html += `
            <div class="breakdown-row">
                <span class="breakdown-label">${level}</span>
                <div class="breakdown-bar"><div class="breakdown-fill ${color}" style="width:${p}%"></div></div>
                <span class="breakdown-stat">${d.correct}/${d.total} (${p}%)</span>
            </div>`;
    });
    html += `</div></div>`;

    html += `<div class="result-section"><h3>📚 Phân tích theo chủ đề</h3><div class="breakdown">`;
    Object.entries(byTopic).forEach(([topic, d]) => {
        const p = Math.round((d.correct / d.total) * 100);
        const color = p >= 70 ? 'good' : p >= 40 ? 'mid' : 'poor';
        html += `
            <div class="breakdown-row">
                <span class="breakdown-label">${escapeHtml(topic)}</span>
                <div class="breakdown-bar"><div class="breakdown-fill ${color}" style="width:${p}%"></div></div>
                <span class="breakdown-stat">${d.correct}/${d.total}</span>
            </div>`;
    });
    html += `</div></div>`;

    html += `<div class="result-section"><h3>🔍 Xem lại bài làm</h3><div class="review-list">`;
    state.selectedQuestions.forEach((q, i) => {
        const correctIdx = LETTERS.indexOf(q.dap_an);
        const userIdx = state.userAnswers[i];
        const isCorrect = state.locked[i] && userIdx === correctIdx;
        const userLetter = userIdx !== null ? LETTERS[userIdx].toUpperCase() : null;
        const userText = userIdx !== null ? (q[LETTERS[userIdx]] ?? '') : '';
        const correctText = q[q.dap_an] ?? '';

        html += `
            <div class="review-item ${isCorrect ? 'correct' : 'wrong'}">
                <div class="review-num">Câu ${i + 1}.</div>
                <div class="review-body">
                    <div class="review-q">${escapeHtml(q.de)}</div>
                    <div class="review-your">
                        ${userLetter
                            ? `<span class="badge ${isCorrect ? 'bg-good' : 'bg-bad'}">${isCorrect ? '✓' : '✗'}</span>
                               Bạn chọn <strong>${userLetter}</strong>. ${escapeHtml(userText)}`
                            : `<span class="badge bg-mid">—</span> <em>Chưa trả lời</em>`}
                    </div>
                    ${!isCorrect ? `<div class="review-correct">✅ Đáp án đúng: <strong>${q.dap_an.toUpperCase()}</strong>. ${escapeHtml(correctText)}</div>` : ''}
                    <div class="review-explain">💡 ${escapeHtml(q.giai_thich || '')}</div>
                </div>
            </div>`;
    });
    html += `</div></div>`;

    html += `
        <div class="result-actions">
            <button class="btn-secondary btn-primary" id="restartBtn">🔄 LÀM BÀI MỚI</button>
            <button class="btn-secondary" id="retryWrongBtn">🔁 LÀM LẠI CÂU SAI</button>
            <button class="btn-secondary" id="exitBtn">🏠 THOÁT</button>
        </div>`;

    resultArea.innerHTML = html;
    resultArea.classList.remove('hidden');
    quizArea.classList.add('hidden');

    renderMath(resultArea);

    $('restartBtn').addEventListener('click', resetAndSetup);
    $('retryWrongBtn').addEventListener('click', retryWrongAnswers);
    $('exitBtn').addEventListener('click', resetAndSetup);

    if (currentUser && newExp !== null && expChange.delta !== 0) {
        showExpToast(expChange.delta, newExp, newRank);
    }
}

/* ============ HIỂN THỊ TOAST EXP ============ */
function showExpToast(delta, newExp, newRank) {
    const toast = document.createElement('div');
    toast.className = 'exp-toast ' + (delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'zero');
    const sign = delta > 0 ? '+' : '';
    toast.textContent = `${sign}${delta} EXP • ${newExp} EXP • ${newRank.icon} ${newRank.name}`;
    document.body.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

/* ============ RETRY WRONG ============ */
function retryWrongAnswers() {
    const wrong = [];
    state.selectedQuestions.forEach((q, i) => {
        const correctIdx = LETTERS.indexOf(q.dap_an);
        if (!state.locked[i] || state.userAnswers[i] !== correctIdx) wrong.push(q);
    });
    if (wrong.length === 0) {
        alert('🎉 Bạn không có câu sai nào!');
        return;
    }
    state.selectedQuestions = wrong;
    state.userAnswers = new Array(wrong.length).fill(null);
    state.locked = new Array(wrong.length).fill(false);
    state.optionOrders = new Array(wrong.length).fill(null);
    state.currentIndex = 0;
    state.quizActive = true;
    state.timeLeft = 0;

    resultArea.classList.add('hidden');
    quizArea.classList.remove('hidden');
    $('timerDisplay').textContent = '∞';
    $('timerDisplay').classList.remove('warning');
    updateTimerDisplay();
    startQuizUI();
}

/* ============ START ============ */
async function startQuiz() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        alert('Vui lòng đăng nhập trước khi làm bài!');
        return;
    }

    // Dùng username làm tên học sinh
    state.studentName = currentUser.username;

    state.currentGrade = $('gradeSelect').value;
    state.currentSubject = $('subjectSelect').value;
    const count = parseInt($('questionCount').value, 10);
    state.timeLeft = parseInt($('timeLimit').value, 10);

    const btn = $('startGameBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang tải ngân hàng đề...';

    try {
        state.fullQuestions = await loadQuestions(state.currentGrade, state.currentSubject);
        if (state.fullQuestions.length < 10) throw new Error('Dữ liệu câu hỏi không đủ (cần ≥ 10 câu)');

        const realCount = Math.min(count, state.fullQuestions.length);
        state.selectedQuestions = pickQuestions(state.fullQuestions, realCount);
        state.userAnswers = new Array(realCount).fill(null);
        state.locked = new Array(realCount).fill(false);
        state.optionOrders = new Array(realCount).fill(null);
        state.currentIndex = 0;
        state.quizActive = true;

        setupPanel.classList.add('hidden');
        quizArea.classList.remove('hidden');
        resultArea.classList.add('hidden');

        $('studentNameDisplay').textContent = state.studentName;
        startTimer();
        startQuizUI();
    } catch (err) {
        console.error(err);
        alert(`❌ ${err.message}\nKiểm tra file JSON có trong thư mục chưa.`);
    } finally {
        btn.disabled = false;
        btn.textContent = '🎯 BẮT ĐẦU LÀM BÀI';
    }
}

function startQuizUI() {
    renderCurrentQuestion();
    updateScoreUI();
    updateProgress();
}

/* ============ RESET ============ */
function resetAndSetup() {
    stopTimer();
    state.quizActive = false;
    setupPanel.classList.remove('hidden');
    quizArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    $('statusHint').innerHTML = '';
}

/* ============================================================
   📜 LỊCH SỬ (theo user)
   ============================================================ */

function switchTab(tabName) {
    setupPanel.classList.add('hidden');
    quizArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    $('historyArea').classList.add('hidden');

    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));

    if (tabName === 'history') {
        $('historyArea').classList.remove('hidden');
        $('tabHistory').classList.add('active');
        renderHistory();
    } else {
        $('tabQuiz').classList.add('active');
        if (state.quizActive) {
            quizArea.classList.remove('hidden');
        } else {
            setupPanel.classList.remove('hidden');
        }
    }
}

function loadHistory() {
    const u = getCurrentUser();
    return (u && Array.isArray(u.history)) ? u.history : [];
}

function saveHistory(record) {
    const u = getCurrentUser();
    if (!u) return;
    const history = (u.history || []).slice();
    history.unshift(record);
    history.length = Math.min(history.length, 50);
    updateCurrentUser({ history });
}

function renderHistory() {
    const hist = loadHistory();
    const filterSubject = $('historyFilterSubject').value;
    const filterGrade = $('historyFilterGrade').value;
    const sortMode = $('historySort').value;

    let filtered = hist.slice();
    if (filterSubject !== 'all') filtered = filtered.filter(h => h.subject === filterSubject);
    if (filterGrade !== 'all') filtered = filtered.filter(h => String(h.grade) === String(filterGrade));

    if (sortMode === 'date_desc') filtered.sort((a, b) => b.date - a.date);
    else if (sortMode === 'date_asc') filtered.sort((a, b) => a.date - b.date);
    else if (sortMode === 'score_desc') filtered.sort((a, b) => (b.correct / b.total) - (a.correct / a.total));
    else if (sortMode === 'score_asc') filtered.sort((a, b) => (a.correct / a.total) - (b.correct / b.total));

    renderHistoryStats(filtered);

    const listEl = $('historyList');
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="history-empty">
                <span class="empty-icon">📭</span>
                Chưa có bài làm nào được lưu.<br>
                Hãy bắt đầu làm bài để xem lịch sử tại đây!
            </div>`;
        return;
    }

    listEl.innerHTML = filtered.map((h, idx) => {
        const pct = Math.round((h.correct / h.total) * 100);
        const cls = pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'poor';
        const dateStr = new Date(h.date).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const expStr = (typeof h.expDelta === 'number' && h.expDelta !== 0)
            ? `<span style="color:${h.expDelta > 0 ? 'var(--success)' : 'var(--danger)'};font-weight:800">${h.expDelta > 0 ? '+' : ''}${h.expDelta} EXP</span>`
            : '';
        return `
            <div class="history-item ${cls}">
                <div class="history-main">
                    <div class="history-name">👤 ${escapeHtml(h.name || 'Ẩn danh')} — ${escapeHtml(h.subjectName || h.subject)} (Khối ${h.grade})</div>
                    <div class="history-meta">
                        <span>🕒 ${dateStr}</span>
                        <span>📝 ${h.total} câu</span>
                        ${expStr ? `<span>${expStr}</span>` : ''}
                    </div>
                </div>
                <div class="history-score ${cls}">
                    ${h.correct}/${h.total}
                    <small>${pct}%</small>
                </div>
                <div class="history-actions">
                    <button class="btn-secondary" data-action="detail" data-idx="${idx}">🔍 Xem</button>
                    <button class="btn-danger" data-action="delete" data-idx="${idx}">🗑️ Xóa</button>
                </div>
            </div>`;
    }).join('');

    listEl.querySelectorAll('button[data-action]').forEach(btn => {
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.idx, 10);
        const record = filtered[idx];

        if (action === 'delete') {
            btn.addEventListener('click', () => {
                if (!confirm('Xóa lần làm bài này khỏi lịch sử?')) return;
                deleteHistoryRecord(record);
                renderHistory();
            });
        } else if (action === 'detail') {
            btn.addEventListener('click', () => {
                showHistoryDetail(record);
            });
        }
    });
}

function renderHistoryStats(list) {
    const statsEl = $('historyStats');
    if (list.length === 0) {
        statsEl.innerHTML = '';
        return;
    }
    const totalAttempts = list.length;
    const avgPct = Math.round(list.reduce((s, h) => s + (h.correct / h.total) * 100, 0) / totalAttempts);
    const best = Math.max(...list.map(h => Math.round((h.correct / h.total) * 100)));
    const totalCorrect = list.reduce((s, h) => s + h.correct, 0);
    const totalQ = list.reduce((s, h) => s + h.total, 0);

    statsEl.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${totalAttempts}</div>
            <div class="stat-label">Lần làm bài</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avgPct}%</div>
            <div class="stat-label">Điểm TB</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${best}%</div>
            <div class="stat-label">Cao nhất</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalCorrect}/${totalQ}</div>
            <div class="stat-label">Câu đúng</div>
        </div>
    `;
}

function deleteHistoryRecord(record) {
    const u = getCurrentUser();
    if (!u) return;
    let history = (u.history || []).slice();
    const idx = history.findIndex(h =>
        h.date === record.date &&
        h.name === record.name &&
        h.subject === record.subject &&
        String(h.grade) === String(record.grade) &&
        h.correct === record.correct &&
        h.total === record.total
    );
    if (idx !== -1) {
        history.splice(idx, 1);
        updateCurrentUser({ history });
    }
}

function showHistoryDetail(record) {
    const pct = Math.round((record.correct / record.total) * 100);
    const cls = pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'poor';
    const dateStr = new Date(record.date).toLocaleString('vi-VN');

    const html = `
        <div class="result-header">
            <h2>📄 CHI TIẾT BÀI LÀM</h2>
            <p class="result-student">Học sinh: <strong>${escapeHtml(record.name || 'Ẩn danh')}</strong></p>
            <p class="result-subject">${escapeHtml(record.subjectName || record.subject)} — Khối ${record.grade}</p>
            <p class="result-subject">🕒 ${dateStr}</p>
        </div>
        <div class="final-score ${cls}">
            ${record.correct}/${record.total}
            <span class="final-pct">(${pct}%)</span>
        </div>
        ${typeof record.expDelta === 'number' && record.expDelta !== 0 ? `
        <p class="result-comment" style="color:${record.expDelta > 0 ? 'var(--success)' : 'var(--danger)'}">
            ${record.expDelta > 0 ? '+' : ''}${record.expDelta} EXP
        </p>` : ''}
        <div class="result-actions">
            <button class="btn-secondary btn-primary" id="backToHistoryBtn">⬅️ QUAY LẠI LỊCH SỬ</button>
        </div>
    `;

    resultArea.innerHTML = html;
    resultArea.classList.remove('hidden');
    $('historyArea').classList.add('hidden');
    $('setupPanel').classList.add('hidden');
    $('quizArea').classList.add('hidden');
    document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
    $('tabHistory').classList.add('active');

    $('backToHistoryBtn').addEventListener('click', () => {
        resultArea.classList.add('hidden');
        $('historyArea').classList.remove('hidden');
        renderHistory();
    });
}

/* ============================================================
   🏆 USER BAR
   ============================================================ */

function refreshUserBar() {
    const u = getCurrentUser();
    if (!u) {
        $('userBar').classList.add('hidden');
        return;
    }
    const exp = u.exp || 0;
    const rank = getRankByExp(exp);
    const next = getNextRank(exp);

    $('userBar').classList.remove('hidden');
    $('userNameDisplay').textContent = u.username;

    const rankIconEl = $('rankIcon');
    rankIconEl.textContent = rank.icon;
    rankIconEl.className = 'rank-icon ' + rank.cssClass;
    rankIconEl.style.color = rank.color;

    $('rankName').textContent = rank.name;
    $('rankName').style.color = rank.color;

    $('rankExp').textContent = next
        ? `${exp} / ${next.minExp} EXP`
        : `${exp} EXP (MAX)`;

    const fillPct = next
        ? Math.min(100, ((exp - rank.minExp) / (next.minExp - rank.minExp)) * 100)
        : 100;
    $('rankFill').style.width = fillPct + '%';
    $('rankFill').style.background = `linear-gradient(90deg, ${rank.color}, ${next ? next.color : rank.color})`;
}

/* ============================================================
   🔑 AUTH UI
   ============================================================ */

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    if (tab === 'login') {
        $('authTabLogin').classList.add('active');
        $('loginForm').classList.remove('hidden');
        $('registerForm').classList.add('hidden');
    } else {
        $('authTabRegister').classList.add('active');
        $('registerForm').classList.remove('hidden');
        $('loginForm').classList.add('hidden');
    }
    $('loginMsg').textContent = '';
    $('loginMsg').className = 'auth-msg';
    $('registerMsg').textContent = '';
    $('registerMsg').className = 'auth-msg';
}

function showAuthMessage(target, type, text) {
    const el = $(target);
    el.className = 'auth-msg ' + type;
    el.textContent = text;
}

function handleLogin(e) {
    e.preventDefault();
    const usernameRaw = $('loginUsername').value.trim();
    const password = $('loginPassword').value;
    if (!usernameRaw || !password) {
        showAuthMessage('loginMsg', 'error', '⚠️ Vui lòng nhập đầy đủ tên và mật khẩu!');
        return;
    }
    const username = normalizeUsername(usernameRaw);
    const users = loadUsers();
    if (!users[username]) {
        showAuthMessage('loginMsg', 'error', '❌ Tên đăng nhập không tồn tại!');
        return;
    }
    if (users[username].passwordHash !== hashPassword(password)) {
        showAuthMessage('loginMsg', 'error', '❌ Mật khẩu không đúng!');
        return;
    }
    setCurrentUser(username);
    migrateOldHistoryToUser(username);
    showAuthMessage('loginMsg', 'success', '✅ Đăng nhập thành công!');
    setTimeout(() => {
        enterMainApp();
        $('loginUsername').value = '';
        $('loginPassword').value = '';
        $('loginMsg').textContent = '';
        $('loginMsg').className = 'auth-msg';
    }, 500);
}

function handleRegister(e) {
    e.preventDefault();
    const usernameRaw = $('registerUsername').value.trim();
    const pw1 = $('registerPassword').value;
    const pw2 = $('registerPassword2').value;

    if (!usernameRaw || !pw1 || !pw2) {
        showAuthMessage('registerMsg', 'error', '⚠️ Vui lòng nhập đầy đủ thông tin!');
        return;
    }
    if (pw1.length < 4) {
        showAuthMessage('registerMsg', 'error', '⚠️ Mật khẩu phải có ít nhất 4 ký tự!');
        return;
    }
    if (pw1 !== pw2) {
        showAuthMessage('registerMsg', 'error', '❌ Mật khẩu nhập lại không khớp!');
        return;
    }
    const username = normalizeUsername(usernameRaw);
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        showAuthMessage('registerMsg', 'error', '⚠️ Tên chỉ gồm chữ thường, số, gạch dưới, 3–30 ký tự!');
        return;
    }

    const users = loadUsers();
    if (users[username]) {
        showAuthMessage('registerMsg', 'error', '❌ Tên này đã có người sử dụng, hãy chọn tên khác!');
        return;
    }

    users[username] = {
        passwordHash: hashPassword(pw1),
        createdAt: Date.now(),
        exp: 0,
        history: []
    };
    saveUsers(users);
    setCurrentUser(username);
    migrateOldHistoryToUser(username);

    showAuthMessage('registerMsg', 'success', '✅ Đăng ký thành công! Đang vào...');
    setTimeout(() => {
        enterMainApp();
        $('registerUsername').value = '';
        $('registerPassword').value = '';
        $('registerPassword2').value = '';
        $('registerMsg').textContent = '';
        $('registerMsg').className = 'auth-msg';
    }, 600);
}

function enterMainApp() {
    $('authArea').classList.add('hidden');
    $('mainApp').classList.remove('hidden');
    $('userBar').classList.remove('hidden');
    refreshUserBar();
    resetAndSetup();
    switchTab('quiz');
}

function handleLogout() {
    if (!confirm('Bạn có chắc muốn đăng xuất?')) return;
    clearCurrentUser();
    $('mainApp').classList.add('hidden');
    $('userBar').classList.add('hidden');
    $('authArea').classList.remove('hidden');
    switchAuthTab('login');
    resetAndSetup();
}

/* ============================================================
   ⌨️ PHÍM TẮT
   ============================================================ */
document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.target && e.target.isContentEditable) return;

    if (!$('authArea').classList.contains('hidden')) return;
    if ($('mainApp').classList.contains('hidden')) return;

    if (!$('historyArea').classList.contains('hidden')) return;
    if (!$('resultArea').classList.contains('hidden')) return;
    if (!state.quizActive) return;

    const key = e.key.toLowerCase();
    const isLocked = !!state.locked[state.currentIndex];

    if (!isLocked) {
        const order = state.optionOrders[state.currentIndex] || [0, 1, 2, 3];
        let displayIdx = -1;
        if (key === 'a' || key === '1') displayIdx = 0;
        else if (key === 'b' || key === '2') displayIdx = 1;
        else if (key === 'c' || key === '3') displayIdx = 2;
        else if (key === 'd' || key === '4') displayIdx = 3;

        if (displayIdx !== -1) {
            e.preventDefault();
            const origIdx = order[displayIdx];
            const el = document.querySelector(`.answer-option[data-idx="${origIdx}"]`);
            if (el) onSelectAnswer(origIdx, el);
            return;
        }
    }

    if (key === 'enter') {
        e.preventDefault();
        if (isLocked) goNext();
        else handleSubmit();
        return;
    }

    if (key === 'arrowleft') {
        e.preventDefault();
        if (state.currentIndex > 0) {
            state.currentIndex--;
            renderCurrentQuestion();
            document.querySelector('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }
    if (key === 'arrowright') {
        e.preventDefault();
        if (state.currentIndex + 1 < state.selectedQuestions.length) {
            state.currentIndex++;
            renderCurrentQuestion();
            document.querySelector('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }

    if (key === 'escape') {
        e.preventDefault();
        if (confirm('Thoát bài làm hiện tại và về màn hình chính?')) {
            resetAndSetup();
            switchTab('quiz');
        }
    }
});

/* ============================================================
   🧭 EVENTS
   ============================================================ */

// Auth tabs
$('authTabLogin').addEventListener('click', () => switchAuthTab('login'));
$('authTabRegister').addEventListener('click', () => switchAuthTab('register'));
$('loginForm').addEventListener('submit', handleLogin);
$('registerForm').addEventListener('submit', handleRegister);
$('logoutBtn').addEventListener('click', handleLogout);

// Tab chính
$('tabQuiz').addEventListener('click', () => switchTab('quiz'));
$('tabHistory').addEventListener('click', () => switchTab('history'));

// History filters
$('historyFilterSubject').addEventListener('change', renderHistory);
$('historyFilterGrade').addEventListener('change', renderHistory);
$('historySort').addEventListener('change', renderHistory);

$('clearHistoryBtn').addEventListener('click', () => {
    if (!confirm('Bạn có chắc muốn XÓA TOÀN BỘ lịch sử làm bài? Hành động này không thể hoàn tác.')) return;
    updateCurrentUser({ history: [] });
    renderHistory();
});

// Quiz events
$('startGameBtn').addEventListener('click', startQuiz);
$('submitBtn').addEventListener('click', handleSubmit);
$('nextBtn').addEventListener('click', goNext);
$('finishBtn').addEventListener('click', () => {
    const unsubmitted = state.locked.filter(l => !l).length;
    let msg = 'Bạn có chắc muốn nộp bài?';
    if (unsubmitted > 0) msg = `Bạn còn ${unsubmitted} câu chưa nộp. Vẫn nộp bài?`;
    if (confirm(msg)) finishQuiz();
});

$('themeToggle').addEventListener('click', toggleTheme);

/* ============ INIT ============ */
(function init() {
    try {
        const savedTheme = localStorage.getItem('quizTheme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (e) { /* ignore */ }

    const u = getCurrentUser();
    if (u) {
        enterMainApp();
    } else {
        $('authArea').classList.remove('hidden');
        $('mainApp').classList.add('hidden');
        $('userBar').classList.add('hidden');
        switchAuthTab('login');
    }
})();
