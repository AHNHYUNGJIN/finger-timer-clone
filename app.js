/**
 * Finger Timer Clone - Core JavaScript Application
 * Simulates Yu-Mao Feng's Finger Timer for Speedcubing & Sport Stacking.
 */

// --- Application States ---
const States = {
    IDLE: 'IDLE',               // Waiting to be used
    INSPECTION: 'INSPECTION',   // WCA Inspection countdown active
    HOLDING: 'HOLDING',         // Fingers placed on pads, waiting for green light (Red LED)
    READY: 'READY',             // Armed and ready, green light active. Starts on release
    RUNNING: 'RUNNING',         // Active timing stopwatch
    STOPPED: 'STOPPED'          // Timer stopped, showing final time, records updated
};

let currentState = States.IDLE;

// --- State Variables ---
let leftActive = false;
let rightActive = false;
let holdingTimeoutId = null;
let timerIntervalId = null;

let startTime = 0;
let elapsedTime = 0;
let runningTimerStart = 0; // Performance timer anchor

// --- Inspection Mode Variables ---
let inspectionTimeLimit = 0; // in seconds (0 = disabled)
let inspectionIntervalId = null;
let inspectionTimeLeft = 0;
let inspectionStartTime = 0;
let inspectionPenalty = 0; // 0: None, 2: +2 seconds, 3: DNF

// --- History & Stats Data ---
let history = [];
let personalBest = null;

// --- App Settings ---
const settings = {
    precision: 3,          // 2 for 0.01s, 3 for 0.001s
    inspection: 0,         // 0: None, 15: WCA 15s, etc.
    soundEnabled: true,
    puzzleType: '333',     // '333', '222', '444', 'stack', 'none'
    kbMode: 'dual'         // 'dual' for left/right shift/F/J, 'space' for spacebar
};

// --- Web Audio Context ---
let audioCtx = null;

// --- DOM Elements ---
const DOM = {
    timerText: document.getElementById('timer-text'),
    inspectionAlert: document.getElementById('inspection-alert'),
    
    padLeft: document.getElementById('pad-left'),
    padRight: document.getElementById('pad-right'),
    ledLeft: document.getElementById('led-left'),
    ledRight: document.getElementById('led-right'),
    
    scrambleText: document.getElementById('scramble-text'),
    scrambleType: document.getElementById('scramble-type'),
    
    // Header Stats
    statPb: document.getElementById('stat-pb'),
    statAo5: document.getElementById('stat-ao5'),
    statAo12: document.getElementById('stat-ao12'),
    
    // Actions Buttons
    btnScrambleRefresh: document.getElementById('btn-scramble-refresh'),
    btnSettings: document.getElementById('btn-settings'),
    btnHistory: document.getElementById('btn-history'),
    
    // Settings Modal Inputs
    modalSettings: document.getElementById('modal-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    radioPrecision2: document.getElementById('precision-2'),
    radioPrecision3: document.getElementById('precision-3'),
    selectInspection: document.getElementById('select-inspection'),
    toggleSound: document.getElementById('toggle-sound'),
    selectPuzzle: document.getElementById('select-puzzle'),
    radioKbDual: document.getElementById('kb-dual'),
    radioKbSpace: document.getElementById('kb-space'),
    
    // History Modal Elements
    modalHistory: document.getElementById('modal-history'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    btnClearAll: document.getElementById('btn-clear-all'),
    historyItems: document.getElementById('history-items'),
    noRecordsMsg: document.getElementById('no-records-msg'),
    histCount: document.getElementById('hist-count'),
    histPb: document.getElementById('hist-pb'),
    histMean: document.getElementById('hist-mean'),
    
    // Fade Targets during active solve
    fadeElements: document.querySelectorAll('.fade-target'),
    controlInfoText: document.getElementById('control-info-text')
};

// --- Sound Synthesizer (Web Audio API) ---
function playBeep(frequency, duration) {
    if (!settings.soundEnabled) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime); // Low volume for comfort
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn('Audio synthesis failed:', e);
    }
}

// --- Initialize App ---
function init() {
    loadSettings();
    loadHistory();
    generateScramble();
    setupEventListeners();
    updateStatsDashboard();
    
    // Show keyboard mapping depending on settings
    updateKeyboardHints();
}

// --- LocalStorage Logic ---
function loadSettings() {
    const saved = localStorage.getItem('fingerTimer_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(settings, parsed);
            
            // Sync settings to DOM
            if (settings.precision === 2) DOM.radioPrecision2.checked = true;
            else DOM.radioPrecision3.checked = true;
            
            DOM.selectInspection.value = settings.inspection.toString();
            DOM.toggleSound.checked = settings.soundEnabled;
            DOM.selectPuzzle.value = settings.puzzleType;
            
            if (settings.kbMode === 'dual') DOM.radioKbDual.checked = true;
            else DOM.radioKbSpace.checked = true;
        } catch (e) {
            console.error("Failed to parse settings:", e);
        }
    }
    inspectionTimeLimit = settings.inspection;
}

function saveSettings() {
    localStorage.setItem('fingerTimer_settings', JSON.stringify(settings));
    inspectionTimeLimit = settings.inspection;
    updateKeyboardHints();
}

function loadHistory() {
    const saved = localStorage.getItem('fingerTimer_history');
    if (saved) {
        try {
            history = JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse history:", e);
            history = [];
        }
    }
}

function saveHistory() {
    localStorage.setItem('fingerTimer_history', JSON.stringify(history));
    updateStatsDashboard();
}

// --- Keyboard Hint Update ---
function updateKeyboardHints() {
    const leftHint = DOM.padLeft.querySelector('.keyboard-hint');
    const rightHint = DOM.padRight.querySelector('.keyboard-hint');
    
    if (settings.kbMode === 'dual') {
        leftHint.textContent = 'Shift (L) / F';
        rightHint.textContent = 'Shift (R) / J';
        DOM.controlInfoText.textContent = '양쪽 Shift 키(또는 F, J)를 동시에 누르고 계세요.';
    } else {
        leftHint.textContent = 'Spacebar';
        rightHint.textContent = 'Spacebar';
        DOM.controlInfoText.textContent = '스페이스바를 길게 누르고 계세요.';
    }
}

// --- Scramble Generator ---
const ScrambleMoves = {
    '333': ['U', 'D', 'R', 'L', 'F', 'B'],
    '222': ['U', 'R', 'F'],
    '444': ['U', 'D', 'R', 'L', 'F', 'B', 'Uw', 'Dw', 'Rw', 'Lw', 'Fw', 'Bw']
};

function generateScramble() {
    const type = settings.puzzleType;
    if (type === 'none') {
        DOM.scrambleText.textContent = "타이머 사용 준비 완료";
        DOM.scrambleType.textContent = "무제한 모드";
        return;
    }
    
    if (type === 'stack') {
        DOM.scrambleType.textContent = "스포츠 스태킹";
        const stackingWorkouts = [
            "3-3-3 Stack (3개-3개-3개 쌓기)",
            "3-6-3 Stack (3개-6개-3개 쌓기)",
            "Cycle Stack (사이클 쌓기: 3-6-3 -> 6-6 -> 1-10-1)",
            "3-3-3 Cycle 연습",
            "3-6-3 Cycle 연습"
        ];
        const randomWorkout = stackingWorkouts[Math.floor(Math.random() * stackingWorkouts.length)];
        DOM.scrambleText.textContent = randomWorkout;
        return;
    }
    
    // Cube scramble generation
    let moves = ScrambleMoves[type] || ScrambleMoves['333'];
    let length = 22; // 3x3x3 Default
    
    if (type === '222') {
        length = 11;
        DOM.scrambleType.textContent = "2x2x2 Cube";
    } else if (type === '444') {
        length = 40;
        DOM.scrambleType.textContent = "4x4x4 Cube";
    } else {
        DOM.scrambleType.textContent = "3x3x3 Cube";
    }
    
    let scramble = [];
    let lastMove = '';
    let lastAxis = ''; // U/D, R/L, F/B share axes to prevent U D U
    
    const getAxis = (move) => {
        const base = move.replace('w', '');
        if (base === 'U' || base === 'D') return 'UD';
        if (base === 'R' || base === 'L') return 'RL';
        if (base === 'F' || base === 'B') return 'FB';
        return '';
    };

    for (let i = 0; i < length; i++) {
        let possibleMoves = moves.filter(m => m !== lastMove && getAxis(m) !== lastAxis);
        if (possibleMoves.length === 0) possibleMoves = moves.filter(m => m !== lastMove);
        
        const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        
        // Add modifier (', 2, or none)
        const modifier = ['', "'", '2'][Math.floor(Math.random() * 3)];
        scramble.push(move + modifier);
        
        lastMove = move;
        lastAxis = getAxis(move);
    }
    
    DOM.scrambleText.textContent = scramble.join(' ');
}

// --- Format Time ---
function formatTime(ms, precision = settings.precision) {
    if (ms === 'DNF') return 'DNF';
    if (ms < 0) return '00.000';
    
    const secondsTotal = ms / 1000;
    const minutes = Math.floor(secondsTotal / 60);
    const seconds = Math.floor(secondsTotal % 60);
    const milliseconds = Math.round((secondsTotal % 1) * 1000);
    
    let secondsStr = seconds.toString();
    let millisecondsStr = milliseconds.toString().padStart(3, '0');
    
    // Trim to precision
    if (precision === 2) {
        millisecondsStr = millisecondsStr.substring(0, 2);
    }
    
    if (minutes > 0) {
        secondsStr = seconds.toString().padStart(2, '0');
        return `${minutes}:${secondsStr}.${millisecondsStr}`;
    } else {
        // Under a minute
        return `${secondsStr}.${millisecondsStr}`;
    }
}

// --- Stopwatch Loops ---
function updateDisplayLoop() {
    if (currentState !== States.RUNNING) return;
    
    const current = performance.now();
    elapsedTime = current - runningTimerStart;
    DOM.timerText.textContent = formatTime(elapsedTime);
    
    requestAnimationFrame(updateDisplayLoop);
}

// --- WCA Inspection Loop ---
function startInspection() {
    currentState = States.INSPECTION;
    inspectionTimeLeft = inspectionTimeLimit;
    inspectionStartTime = Date.now();
    inspectionPenalty = 0;
    
    DOM.inspectionAlert.style.display = 'block';
    DOM.inspectionAlert.textContent = 'INSPECTION';
    DOM.timerText.textContent = inspectionTimeLeft.toString();
    DOM.timerText.style.color = 'var(--text-main)';
    
    playBeep(440, 0.08); // Start beep
    
    inspectionIntervalId = setInterval(() => {
        const passedSeconds = Math.floor((Date.now() - inspectionStartTime) / 1000);
        inspectionTimeLeft = inspectionTimeLimit - passedSeconds;
        
        if (inspectionTimeLeft > 0) {
            DOM.timerText.textContent = inspectionTimeLeft.toString();
            
            // Beeps on warning points (8s, 12s)
            if (inspectionTimeLeft === 7) {
                // 8 seconds warning (7 left)
                playBeep(440, 0.15);
                DOM.timerText.style.color = 'var(--color-accent)';
            } else if (inspectionTimeLeft === 3) {
                // 12 seconds warning (3 left)
                playBeep(520, 0.15);
                DOM.timerText.style.color = 'var(--color-hold)';
            }
        } else if (inspectionTimeLeft <= 0 && inspectionTimeLeft > -2) {
            // Over 15s but under 17s: +2 penalty
            DOM.timerText.textContent = '+2';
            DOM.timerText.style.color = 'var(--color-hold)';
            inspectionPenalty = 2;
            
            if (inspectionTimeLeft === 0) playBeep(220, 0.3);
        } else {
            // Over 17s: DNF
            clearInterval(inspectionIntervalId);
            DOM.timerText.textContent = 'DNF';
            DOM.timerText.style.color = 'var(--color-hold)';
            DOM.inspectionAlert.textContent = 'DNF (TIME OUT)';
            inspectionPenalty = 3;
            currentState = States.STOPPED;
            
            saveSolveRecord('DNF');
        }
    }, 100);
}

// --- Trigger Timer Start/Stop ---
function onPadsPressed() {
    if (currentState === States.RUNNING) {
        // STOP TIMER
        const end = performance.now();
        elapsedTime = end - runningTimerStart;
        clearInterval(timerIntervalId);
        
        // Check inspection penalty
        let finalTime = elapsedTime;
        if (inspectionPenalty === 2) {
            finalTime += 2000;
        }
        
        currentState = States.STOPPED;
        playBeep(600, 0.05);
        
        // Show all UI elements back
        DOM.fadeElements.forEach(el => el.classList.remove('fade-out'));
        DOM.timerText.classList.remove('state-running');
        
        DOM.timerText.textContent = inspectionPenalty === 2 ? formatTime(finalTime) + " (+2)" : formatTime(finalTime);
        
        // Save
        saveSolveRecord(inspectionPenalty === 2 ? finalTime : (inspectionPenalty === 3 ? 'DNF' : elapsedTime));
        generateScramble();
        return;
    }
    
    if (currentState === States.IDLE || currentState === States.STOPPED || currentState === States.INSPECTION) {
        // Begin Holding transition
        currentState = States.HOLDING;
        
        // Update DOM for LEDs and Pads
        setElementsState('state-hold');
        
        // Beep initial touch
        playBeep(520, 0.03);
        
        // Set timeout to arm the timer (0.5s requirement)
        holdingTimeoutId = setTimeout(() => {
            if (currentState === States.HOLDING) {
                currentState = States.READY;
                setElementsState('state-ready');
                playBeep(880, 0.1); // Ready chirp
                
                // If in inspection, freeze count
                if (inspectionIntervalId) {
                    clearInterval(inspectionIntervalId);
                }
                
                DOM.timerText.textContent = "00.000";
            }
        }, 500); // 0.5 seconds hold required
    }
}

function onPadsReleased() {
    if (currentState === States.HOLDING) {
        // Finger released too early, abort starting
        clearTimeout(holdingTimeoutId);
        setElementsState('inactive');
        
        if (inspectionIntervalId) {
            // Go back to inspection countdown
            currentState = States.INSPECTION;
            DOM.timerText.style.color = 'var(--text-muted)';
        } else {
            currentState = States.IDLE;
            DOM.timerText.textContent = formatTime(elapsedTime);
        }
    } else if (currentState === States.READY) {
        // START THE TIMER
        clearTimeout(holdingTimeoutId);
        
        if (inspectionIntervalId) {
            clearInterval(inspectionIntervalId);
            inspectionIntervalId = null;
        }
        DOM.inspectionAlert.style.display = 'none';
        
        currentState = States.RUNNING;
        runningTimerStart = performance.now();
        
        // UI fade-out for total focus
        DOM.fadeElements.forEach(el => el.classList.add('fade-out'));
        DOM.timerText.classList.add('state-running');
        setElementsState('inactive');
        
        requestAnimationFrame(updateDisplayLoop);
    }
}

// Utility to set colors and glow on active pads and LEDs
function setElementsState(stateClass) {
    // Remove old state classes
    const classes = ['state-hold', 'state-ready'];
    
    classes.forEach(c => {
        DOM.padLeft.classList.remove(c);
        DOM.padRight.classList.remove(c);
        DOM.ledLeft.classList.remove(c);
        DOM.ledRight.classList.remove(c);
        DOM.timerText.classList.remove(c);
    });
    
    // Add new state if specified
    if (stateClass && stateClass !== 'inactive') {
        DOM.padLeft.classList.add(stateClass);
        DOM.padRight.classList.add(stateClass);
        DOM.ledLeft.classList.add(stateClass);
        DOM.ledRight.classList.add(stateClass);
        DOM.timerText.classList.add(stateClass);
    }
}

// --- History & Stats Computations ---
function saveSolveRecord(timeVal) {
    const record = {
        id: Date.now(),
        time: timeVal, // Milliseconds or 'DNF'
        scramble: DOM.scrambleText.textContent,
        date: formatDate(new Date())
    };
    
    history.unshift(record); // Add to beginning
    saveHistory();
}

function formatDate(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function deleteHistoryRecord(id) {
    history = history.filter(item => item.id !== id);
    saveHistory();
    renderHistoryTable();
}

function clearAllHistory() {
    if (confirm("정말로 모든 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
        history = [];
        saveHistory();
        renderHistoryTable();
        closeModal(DOM.modalHistory);
    }
}

function updateStatsDashboard() {
    const validSolves = history.filter(item => item.time !== 'DNF');
    
    // PB (Personal Best)
    if (validSolves.length > 0) {
        personalBest = Math.min(...validSolves.map(item => item.time));
        DOM.statPb.textContent = formatTime(personalBest);
        DOM.histPb.textContent = formatTime(personalBest);
    } else {
        personalBest = null;
        DOM.statPb.textContent = '--.---';
        DOM.histPb.textContent = '--.---';
    }
    
    // Rolling Ao5 (Average of 5)
    // Formula: average of last 5 solves excluding the best and worst. DNF counts as worst.
    DOM.statAo5.textContent = calculateAverageOfN(history, 5);
    
    // Rolling Ao12
    DOM.statAo12.textContent = calculateAverageOfN(history, 12);
    
    // History Overview
    DOM.histCount.textContent = history.length;
    DOM.histMean.textContent = calculateMean(history);
}

function calculateMean(historyList) {
    const validSolves = historyList.filter(item => item.time !== 'DNF');
    if (validSolves.length === 0) return '--.---';
    const sum = validSolves.reduce((acc, curr) => acc + curr.time, 0);
    return formatTime(sum / validSolves.length);
}

function calculateAverageOfN(historyList, n) {
    if (historyList.length < n) return '--.---';
    
    // Take the last N solves (most recent solves are at the front of our history list)
    const recentN = historyList.slice(0, n);
    
    // Sort solves. DNF is counted as infinity (worst)
    const times = recentN.map(item => item.time === 'DNF' ? Infinity : item.time);
    
    // Find index of min and max
    const maxIdx = times.indexOf(Math.max(...times));
    const minIdx = times.indexOf(Math.min(...times));
    
    // Sum times excluding min and max
    let sum = 0;
    let validCount = 0;
    let dnfCount = 0;
    
    for (let i = 0; i < n; i++) {
        if (i === maxIdx || i === minIdx) continue;
        if (times[i] === Infinity) {
            dnfCount++;
        } else {
            sum += times[i];
            validCount++;
        }
    }
    
    // If there is more than 1 DNF in the remaining elements (or if the excluded max was also DNF), it's DNF
    const totalDnfCount = recentN.filter(item => item.time === 'DNF').length;
    if (totalDnfCount >= 2) return 'DNF';
    
    return formatTime(sum / (n - 2));
}

// --- UI / Modal Handlers ---
function openModal(modalEl) {
    modalEl.classList.add('open');
}

function closeModal(modalEl) {
    modalEl.classList.remove('open');
}

function renderHistoryTable() {
    DOM.historyItems.innerHTML = '';
    
    if (history.length === 0) {
        DOM.noRecordsMsg.style.display = 'block';
        return;
    }
    
    DOM.noRecordsMsg.style.display = 'none';
    
    history.forEach((record, index) => {
        const tr = document.createElement('tr');
        
        const noTd = document.createElement('td');
        noTd.textContent = history.length - index;
        
        const timeTd = document.createElement('td');
        timeTd.textContent = record.time === 'DNF' ? 'DNF' : formatTime(record.time);
        timeTd.style.fontFamily = 'var(--font-digital)';
        timeTd.style.fontWeight = 'bold';
        if (record.time !== 'DNF' && record.time === personalBest) {
            timeTd.classList.add('text-gold');
        }
        
        const scrambleTd = document.createElement('td');
        scrambleTd.className = 'td-scramble';
        scrambleTd.textContent = record.scramble;
        scrambleTd.title = record.scramble;
        
        const dateTd = document.createElement('td');
        dateTd.textContent = record.date;
        
        const actionTd = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-record-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = () => deleteHistoryRecord(record.id);
        actionTd.appendChild(deleteBtn);
        
        tr.appendChild(noTd);
        tr.appendChild(timeTd);
        tr.appendChild(scrambleTd);
        tr.appendChild(dateTd);
        tr.appendChild(actionTd);
        
        DOM.historyItems.appendChild(tr);
    });
}

// --- Touch & Key Event Handling ---
function setupEventListeners() {
    // 1. Touch & Mouse Events for Pads
    
    // Left Pad
    const pressLeft = (e) => {
        if (e) e.preventDefault();
        if (leftActive) return;
        leftActive = true;
        checkPadsCombinedTrigger();
    };
    const releaseLeft = (e) => {
        if (e) e.preventDefault();
        if (!leftActive) return;
        leftActive = false;
        checkPadsCombinedRelease();
    };
    
    DOM.padLeft.addEventListener('mousedown', pressLeft);
    DOM.padLeft.addEventListener('mouseup', releaseLeft);
    DOM.padLeft.addEventListener('mouseleave', releaseLeft);
    DOM.padLeft.addEventListener('touchstart', pressLeft, { passive: false });
    DOM.padLeft.addEventListener('touchend', releaseLeft, { passive: false });
    
    // Right Pad
    const pressRight = (e) => {
        if (e) e.preventDefault();
        if (rightActive) return;
        rightActive = true;
        checkPadsCombinedTrigger();
    };
    const releaseRight = (e) => {
        if (e) e.preventDefault();
        if (!rightActive) return;
        rightActive = false;
        checkPadsCombinedRelease();
    };
    
    DOM.padRight.addEventListener('mousedown', pressRight);
    DOM.padRight.addEventListener('mouseup', releaseRight);
    DOM.padRight.addEventListener('mouseleave', releaseRight);
    DOM.padRight.addEventListener('touchstart', pressRight, { passive: false });
    DOM.padRight.addEventListener('touchend', releaseRight, { passive: false });

    // Helper functions for combined trigger conditions
    function checkPadsCombinedTrigger() {
        if (settings.kbMode === 'space') {
            // In space mode, either pad triggers both
            leftActive = true;
            rightActive = true;
            onPadsPressed();
        } else {
            // Dual hand mode
            if (leftActive && rightActive) {
                onPadsPressed();
            }
        }
    }
    
    function checkPadsCombinedRelease() {
        if (settings.kbMode === 'space') {
            leftActive = false;
            rightActive = false;
            onPadsReleased();
        } else {
            // Released either hand -> triggers release code
            if (!leftActive || !rightActive) {
                onPadsReleased();
            }
        }
    }

    // 2. Keyboard Event Listeners
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return; // Prevent key repeat loops
        
        // Escape: stop everything, close modals
        if (e.key === 'Escape') {
            closeModal(DOM.modalSettings);
            closeModal(DOM.modalHistory);
            
            if (currentState === States.RUNNING) {
                clearInterval(timerIntervalId);
                currentState = States.STOPPED;
                DOM.fadeElements.forEach(el => el.classList.remove('fade-out'));
                DOM.timerText.classList.remove('state-running');
                setElementsState('inactive');
            }
            return;
        }

        // If a modal is open, disable timer typing triggers
        if (DOM.modalSettings.classList.contains('open') || DOM.modalHistory.classList.contains('open')) {
            return;
        }

        if (settings.kbMode === 'space') {
            if (e.code === 'Space') {
                e.preventDefault();
                leftActive = true;
                rightActive = true;
                onPadsPressed();
            }
        } else {
            // Dual shift mode
            if (e.code === 'ShiftLeft' || e.code === 'KeyF') {
                e.preventDefault();
                leftActive = true;
                checkPadsCombinedTrigger();
            }
            if (e.code === 'ShiftRight' || e.code === 'KeyJ') {
                e.preventDefault();
                rightActive = true;
                checkPadsCombinedTrigger();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (settings.kbMode === 'space') {
            if (e.code === 'Space') {
                e.preventDefault();
                leftActive = false;
                rightActive = false;
                onPadsReleased();
            }
        } else {
            // Dual shift mode
            if (e.code === 'ShiftLeft' || e.code === 'KeyF') {
                leftActive = false;
                checkPadsCombinedRelease();
            }
            if (e.code === 'ShiftRight' || e.code === 'KeyJ') {
                rightActive = false;
                checkPadsCombinedRelease();
            }
        }
    });

    // 3. Central inspection mode click trigger
    DOM.timerText.addEventListener('click', () => {
        if (currentState === States.IDLE || currentState === States.STOPPED) {
            if (inspectionTimeLimit > 0) {
                startInspection();
            }
        }
    });

    // 4. Modal Triggers
    DOM.btnSettings.addEventListener('click', () => {
        if (currentState === States.RUNNING) return;
        openModal(DOM.modalSettings);
    });
    DOM.btnCloseSettings.addEventListener('click', () => {
        closeModal(DOM.modalSettings);
    });
    
    DOM.btnHistory.addEventListener('click', () => {
        if (currentState === States.RUNNING) return;
        renderHistoryTable();
        openModal(DOM.modalHistory);
    });
    DOM.btnCloseHistory.addEventListener('click', () => {
        closeModal(DOM.modalHistory);
    });
    DOM.btnClearAll.addEventListener('click', clearAllHistory);
    
    DOM.btnScrambleRefresh.addEventListener('click', () => {
        if (currentState === States.RUNNING) return;
        generateScramble();
    });

    // 5. Settings Inputs Handlers
    DOM.radioPrecision2.addEventListener('change', () => {
        settings.precision = 2;
        saveSettings();
        updateStatsDashboard();
        DOM.timerText.textContent = formatTime(elapsedTime);
    });
    DOM.radioPrecision3.addEventListener('change', () => {
        settings.precision = 3;
        saveSettings();
        updateStatsDashboard();
        DOM.timerText.textContent = formatTime(elapsedTime);
    });
    
    DOM.selectInspection.addEventListener('change', (e) => {
        settings.inspection = parseInt(e.target.value);
        saveSettings();
    });
    
    DOM.toggleSound.addEventListener('change', (e) => {
        settings.soundEnabled = e.target.checked;
        saveSettings();
    });
    
    DOM.selectPuzzle.addEventListener('change', (e) => {
        settings.puzzleType = e.target.value;
        saveSettings();
        generateScramble();
    });
    
    DOM.radioKbDual.addEventListener('change', () => {
        settings.kbMode = 'dual';
        saveSettings();
    });
    DOM.radioKbSpace.addEventListener('change', () => {
        settings.kbMode = 'space';
        saveSettings();
    });
    
    // Close modals on clicking overlay outside container
    window.addEventListener('click', (e) => {
        if (e.target === DOM.modalSettings) closeModal(DOM.modalSettings);
        if (e.target === DOM.modalHistory) closeModal(DOM.modalHistory);
    });
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);
