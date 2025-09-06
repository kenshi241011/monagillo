document.addEventListener('DOMContentLoaded', () => {
    // ▼▼ TU CONFIGURACIÓN DE FIREBASE ▼▼
    const firebaseConfig = {
      apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
      authDomain: "simulador-apuestas-uni.firebaseapp.com",
      projectId: "simulador-apuestas-uni",
      storageBucket: "simulador-apuestas-uni.firebasestorage.app",
      messagingSenderId: "1089950371477",
      appId: "1:10899503711477:web:3e7fdc7fa16ad8e5c6559c"
    };
    // ▲▲ ----------------------------- ▲▲

    // --- INICIALIZACIÓN ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // --- DATOS DEL PARTIDO ---
    const SINGLE_MATCH = {
        id: 1,
        home: "Alianza Lima",
        away: "Universitario de Deportes"
    };

    // --- VARIABLES DE ESTADO ---
    let balance = 0;
    let betsHistory = [];
    let betSlipSelections = []; 
    let countdownInterval = null; // <--- NUEVO: Variable para el temporizador

    // --- ELEMENTOS DEL DOM ---
    const streamContainerEl = document.getElementById('stream-container');
    const balanceAmountEl = document.getElementById('balance-amount');
    const matchesContainerEl = document.getElementById('matches-container');
    const propBetsContainerEl = document.getElementById('prop-bets-container');
    const slipContentEl = document.getElementById('slip-content');
    const historyListEl = document.getElementById('history-list');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const depositBtn = document.getElementById('deposit-btn');
    const depositModal = document.getElementById('deposit-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const userIdDisplay = document.getElementById('user-id-display');

    // --- GESTIÓN DE AUTENTICACIÓN ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            userEmailEl.textContent = user.displayName || user.email;
            loadData();
            listenForLiveMatch();
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- LÓGICA DEL TEMPORIZADOR (NUEVO) ---
    function startBettingTimer(durationInSeconds) {
        if (countdownInterval) {
            clearInterval(countdownInterval); // Limpia cualquier contador anterior
        }

        const timerDisplay = document.getElementById('betting-timer');
        if (!timerDisplay) return;

        let timer = durationInSeconds;
        
        countdownInterval = setInterval(() => {
            let minutes = parseInt(timer / 60, 10);
            let seconds = parseInt(timer % 60, 10);

            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;

            timerDisplay.textContent = `Tiempo para apostar: ${minutes}:${seconds}`;

            if (--timer < 0) {
                clearInterval(countdownInterval);
                timerDisplay.textContent = "El tiempo para apostar ha terminado.";
                disableBetting();
            }
        }, 1000);
    }

    function disableBetting() {
        document.querySelectorAll('.odds-buttons button').forEach(button => {
            button.disabled = true;
        });
        slipContentEl.innerHTML = `<p>Las apuestas para este evento están cerradas.</p>`;
    }
    
    // --- LÓGICA DE LA APLICACIÓN ---
    function listenForLiveMatch() {
        db.collection('liveMatch').doc('current').onSnapshot(doc => {
            streamContainerEl.innerHTML = '';
            matchesContainerEl.innerHTML = '';
            if (propBetsContainerEl) propBetsContainerEl.innerHTML = '';
            betSlipSelections = [];
            updateBetSlip();
            
            if (countdownInterval) clearInterval(countdownInterval); // Limpia el timer si el partido termina

            if (doc.exists && doc.data().status === 'live') {
                const data = doc.data();
                if (data.streamUrl) {
                    const channelName = getChannelFromUrl(data.streamUrl);
                    if (channelName) {
                        streamContainerEl.innerHTML = `<iframe src="https://player.kick.com/${channelName}" style="border:none; width:100%; height:400px;" allowfullscreen="true" scrolling="no"></iframe>`;
                    }
                }
                createMatchElement(data.odds || {});
                startBettingTimer(90); // <--- Inicia el contador de 90 segundos (1 minuto y medio)
            } else {
                streamContainerEl.innerHTML = '<p style="text-align:center; padding: 20px;">La transmisión ha finalizado o no está disponible.</p>';
            }
        });
    }
    
    function getChannelFromUrl(url) {
        try { const path = new URL(url).pathname; return path.split('/').pop(); }
        catch (e) { return null; }
    }

    function loadData() {
        if (!currentUser) return;
        db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
            balance = doc.exists ? doc.data().balance : 1000;
            betsHistory = doc.exists ? doc.data().history || [] : [];
            updateUI();
        });
    }

    function createMatchElement(odds) {
        const matchEl = document.createElement('div');
        matchEl.className = 'match';
        matchEl.innerHTML = `
            <div class="match-teams">${SINGLE_MATCH.home} vs ${SINGLE_MATCH.away}</div>
            <div id="betting-timer" class="betting-timer"></div> <p class="market-title">Resultado del Partido</p>
            <div class="odds-buttons" data-market="main_result">
                <button data-type="1" data-value="${odds['1'] || 0}" data-selection="${SINGLE_MATCH.home} (Gana)">1 - ${(odds['1'] || 0).toFixed(2)}</button>
                <button data-type="X" data-value="${odds['X'] || 0}" data-selection="Empate">X - ${(odds['X'] || 0).toFixed(2)}</button>
                <button data-type="2" data-value="${odds['2'] || 0}" data-selection="${SINGLE_MATCH.away} (Gana)">2 - ${(odds['2'] || 0).toFixed(2)}</button>
            </div>
        `;
        matchesContainerEl.appendChild(matchEl);

        if (odds['fg1'] && propBetsContainerEl) {
            const propBetEl = document.createElement('div');
            propBetEl.className = 'match';
            propBetEl.innerHTML = `
                <p class="market-title">¿Quién anota el primer gol?</p>
                <div class="odds-buttons" data-market="first_goal">
                    <button data-type="fg1" data-value="${odds['fg1']}" data-selection="Primer Gol: ${SINGLE_MATCH.home}"> ${SINGLE_MATCH.home} - ${odds['fg1'].toFixed(2)}</button>
                    <button data-type="fg2" data-value="${odds['fg2']}" data-selection="Primer Gol: ${SINGLE_MATCH.away}"> ${SINGLE_MATCH.away} - ${odds['fg2'].toFixed(2)}</button>
                </div>
            `;
            propBetsContainerEl.appendChild(propBetEl);
        }
    }

    // El resto de las funciones (handleOddClick, updateBetSlip, placeBet, etc.) no necesitan cambios
    function handleOddClick(e) {
        const target = e.target.closest('button');
        if (!target || target.disabled) return; // No hacer nada si el botón está deshabilitado

        const market = target.parentElement.dataset.market;
        const selection = {
            market: market,
            type: target.dataset.type,
            selection: target.dataset.selection,
            odd: parseFloat(target.dataset.value)
        };

        const existingSelectionIndex = betSlipSelections.findIndex(s => s.market === market);
        
        if (target.classList.contains('selected')) {
            target.classList.remove('selected');
            betSlipSelections = betSlipSelections.filter(s => s.type !== selection.type);
        } else {
            if (existingSelectionIndex > -1) {
                const oldSelectionType = betSlipSelections[existingSelectionIndex].type;
                document.querySelector(`button[data-type="${oldSelectionType}"]`).classList.remove('selected');
                betSlipSelections.splice(existingSelectionIndex, 1);
            }
            target.classList.add('selected');
            betSlipSelections.push(selection);
        }
        updateBetSlip();
    }

    function updateBetSlip() {
        if (betSlipSelections.length === 0) {
            slipContentEl.innerHTML = `<p>Selecciona una o más cuotas.</p>`;
            return;
        }

        let totalOdd = 1;
        let selectionsHTML = '';
        betSlipSelections.forEach(sel => {
            totalOdd *= sel.odd;
            selectionsHTML += `
                <div class="bet-info-item">
                    <p class="selection-name">${sel.selection}</p>
                    <p>Cuota: ${sel.odd.toFixed(2)}</p>
                </div>
            `;
        });

        slipContentEl.innerHTML = `
            ${selectionsHTML}
            <div id="slip-summary">
                <p>Cuota Total: <strong>${totalOdd.toFixed(2)}</strong></p>
            </div>
            <input type="number" id="bet-amount" placeholder="Monto (ej. 50)">
            <p>Ganancia Potencial: <strong id="potential-winnings">S/ 0.00</strong></p>
            <button id="place-bet-btn" disabled>Apostar</button>
        `;

        const betAmountInput = document.getElementById('bet-amount');
        const placeBetBtn = document.getElementById('place-bet-btn');

        placeBetBtn.addEventListener('click', placeBet);
        betAmountInput.addEventListener('input', () => {
            const amount = parseFloat(betAmountInput.value) || 0;
            placeBetBtn.disabled = !(amount > 0 && amount <= balance);
            document.getElementById('potential-winnings').textContent = `S/ ${(amount * totalOdd).toFixed(2)}`;
        });
    }

    async function placeBet() {
        const amount = parseFloat(document.getElementById('bet-amount').value);
        if (!amount || amount <= 0 || amount > balance || betSlipSelections.length === 0) {
            alert("Monto inválido, saldo insuficiente o no hay selecciones.");
            return;
        }

        const totalOdd = betSlipSelections.reduce((acc, sel) => acc * sel.odd, 1);
        const combinedSelectionName = betSlipSelections.map(s => s.selection).join(' + ');

        try {
            await db.collection('liveBets').add({
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                amount: amount,
                odd: totalOdd,
                selections: betSlipSelections, 
                selection: combinedSelectionName, 
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            const newBalance = balance - amount;
            await db.collection('users').doc(currentUser.uid).update({ balance: newBalance });

            alert(`Apuesta combinada realizada por S/ ${amount.toFixed(2)}.`);
            betSlipSelections = [];
            document.querySelectorAll('.odds-buttons button.selected').forEach(btn => btn.classList.remove('selected'));
            updateBetSlip();

        } catch (error) {
            console.error("Error al realizar la apuesta:", error);
            alert("Hubo un problema al registrar tu apuesta.");
        }
    }
    
    function updateUI() {
        balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
    }
    
    document.body.addEventListener('click', handleOddClick);
    logoutBtn.addEventListener('click', () => auth.signOut());
    depositBtn.addEventListener('click', () => {
        if (currentUser) userIdDisplay.value = currentUser.uid;
        depositModal.classList.remove('hidden');
    });
    closeModalBtn.addEventListener('click', () => {
        depositModal.classList.add('hidden');
    });
});