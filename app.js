/* ================================================================
   SIÊU TRẮC NGHIỆM — v1.0
   Bước 1: Chọn số câu + Đếm giờ + Progress + Kết quả chi tiết
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

/* Đồng bộ khi OS đổi theme (chỉ khi người dùng chưa tự chọn) */
try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('quizTheme')) {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
} catch (e) { /* Safari cũ */ }

/* ============ STATE ============ */
const state = {
    fullQuestions: [],       // toàn bộ 100 câu
    selectedQuestions: [],   // câu đã chọn
    userAnswers: [],         // đáp án người dùng (chỉ số gốc 0-3, hoặc null)
    locked: [],              // câu đã nộp (true = khóa)
    optionOrders: [],        // thứ tự đáp án đã xào cho từng câu (giữ nguyên suốt bài)
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
/**
 * Chọn N câu từ 100 câu, phân bố đều theo 10 nhóm (mỗi nhóm 10 câu).
 * VD: N=20 → mỗi nhóm lấy 2 câu.
 */
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

    // Meta
    $('tagDang').textContent = q.dang || 'Chung';
    $('tagMucdo').textContent = q.mucdo || '';
    $('tagMucdo').className = `tag tag-mucdo mucdo-${(q.mucdo || '').replace(/\s+/g, '')}`;

    // Question text
    $('questionText').textContent = q.de || '';

    // Answers (chỉ xào 1 lần cho mỗi câu, lưu lại thứ tự để không đổi khi render lại)
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

        if (!isLocked) {
            div.addEventListener('click', () => onSelectAnswer(origIdx, div));
        }
        container.appendChild(div);
    });

    // Feedback hint
    if (isLocked) {
        const isCorrect = userIdx === correctIdx;
        const explain = q.giai_thich || '';
        $('statusHint').innerHTML = isCorrect
            ? `🎉 <strong>ĐÚNG!</strong> ${escapeHtml(explain)}`
            : `❌ <strong>SAI!</strong> Đáp án đúng là <strong>${q.dap_an.toUpperCase()}</strong>. ${escapeHtml(explain)}`;
    } else {
        $('statusHint').innerHTML = '✅ Hãy chọn đáp án và bấm <strong>GỬI CÂU TRẢ LỜI</strong>.';
    }

    // Buttons
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
            // Scroll đến câu hỏi trên mobile
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
    const pct = total ? Math.round((correct / total) * 100) : 0;

    let comment = '';
    if (pct === 100) comment = '🏆 TUYỆT VỜI! Điểm tuyệt đối!';
    else if (pct >= 80) comment = '🌟 GIỎI! Kiến thức vững vàng.';
    else if (pct >= 60) comment = '📚 KHÁ! Cần củng cố thêm.';
    else if (pct >= 40) comment = '📖 TRUNG BÌNH! Hãy ôn lại bài.';
    else comment = '🌱 CẦN CỐ GẮNG! Đừng nản nhé!';

    const scoreClass = pct >= 60 ? 'good' : pct >= 40 ? 'mid' : 'poor';

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

    // Phân tích theo mức độ
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

    // Phân tích theo chủ đề
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

    // Review
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

    // Actions
    html += `
        <div class="result-actions">
            <button class="btn-secondary btn-primary" id="restartBtn">🔄 LÀM BÀI MỚI</button>
            <button class="btn-secondary" id="retryWrongBtn">🔁 LÀM LẠI CÂU SAI</button>
            <button class="btn-secondary" id="exitBtn">🏠 THOÁT</button>
        </div>`;

    resultArea.innerHTML = html;
    resultArea.classList.remove('hidden');
    quizArea.classList.add('hidden');

    $('restartBtn').addEventListener('click', resetAndSetup);
    $('retryWrongBtn').addEventListener('click', retryWrongAnswers);
    $('exitBtn').addEventListener('click', resetAndSetup);

    // (Chuẩn bị cho bước 2: lưu lịch sử)
    saveHistory({ correct, total, date: Date.now() });
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
    const name = $('studentName').value.trim();
    if (!name) { alert('Vui lòng nhập tên của bạn!'); return; }

    state.studentName = name;
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

/* ============ (Chuẩn bị bước 2) ============ */
function saveHistory(record) {
    try {
        const hist = JSON.parse(localStorage.getItem('quizHistory') || '[]');
        hist.unshift({
            ...record,
            subject: state.currentSubject,
            subjectName: SUBJECT_NAMES[state.currentSubject],
            grade: state.currentGrade,
            name: state.studentName
        });
        hist.length = Math.min(hist.length, 50);
        localStorage.setItem('quizHistory', JSON.stringify(hist));
    } catch (e) { /* ignore */ }
}

/* ============ EVENTS ============ */
$('startGameBtn').addEventListener('click', startQuiz);
$('submitBtn').addEventListener('click', handleSubmit);
$('nextBtn').addEventListener('click', goNext);
$('finishBtn').addEventListener('click', () => {
    const unanswered = state.userAnswers.filter((a, i) => !state.locked[i] && a === null).length;
    const unsubmitted = state.locked.filter(l => !l).length;
    let msg = 'Bạn có chắc muốn nộp bài?';
    if (unsubmitted > 0) msg = `Bạn còn ${unsubmitted} câu chưa nộp. Vẫn nộp bài?`;
    if (confirm(msg)) finishQuiz();
});

// Cho phép nhấn Enter ở input tên để bắt đầu
$('studentName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startQuiz();
});

// Nút chuyển dark/light mode
$('themeToggle').addEventListener('click', toggleTheme);

/* ============ INIT ============ */
resetAndSetup();