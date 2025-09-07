document.addEventListener('DOMContentLoaded', () => {
    // ▼▼ TU CONFIGURACIÓN DE FIREBASE ▼▼
    const firebaseConfig = {
      apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
      authDomain: "simulador-apuestas-uni.firebaseapp.com",
      projectId: "simulador-apuestas-uni",
      storageBucket: "simulador-apuestas-uni.firebasestorage.app",
      messagingSenderId: "1089950371477",
      appId: "1:1089950371477:web:3e7fdc7fa16ad8e5c6559c"
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
    let betSlipSelections = [];
    let countdownInterval = null;

    // --- ELEMENTOS DEL DOM ---
    const streamContainerEl = document.getElementById('stream-container');
    const balanceAmountEl = document.getElementById('balance-amount');
    const matchesContainerEl = document.getElementById('matches-container');
    const additionalMarketsContainerEl = document.getElementById('additional-markets-container');
    const slipContentEl = document.getElementById('slip-content');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const historyListEl = document.getElementById('history-list');
    const depositBtn = document.getElementById('deposit-btn');
    const depositModal = document.getElementById('deposit-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const userIdDisplay = document.getElementById('user-id-display');

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            userEmailEl.textContent = user.displayName || user.email;
            loadUserData();
            listenForLiveMatch();
        } else {
            window.location.href = 'login.html';
        }
    });

    function loadUserData() {
        if (!currentUser) return;
        db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                balance = data.balance || 0;
                displayAdminLink(data.role);
                updateHistoryUI(data.history); // <-- Llamamos a la función
            } else {
                balance = 1000;
                db.collection('users').doc(currentUser.uid).set({
                    balance: balance,
                    role: 'user',
                    displayName: currentUser.displayName,
                    email: currentUser.email,
                    history: []
                });
            }
            balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
        });
    }

    // --- FUNCIÓN DEL HISTORIAL CORREGIDA ---
    function updateHistoryUI(history) {
        historyListEl.innerHTML = '';

        // Verificación para asegurar que el historial es un array
        if (!Array.isArray(history) || history.length === 0) {
            historyListEl.innerHTML = '<li>No tienes apuestas en tu historial.</li>';
            return;
        }

        // Lógica de ordenamiento más segura
        const sortedHistory = history.sort((a, b) => {
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
            return dateB - dateA;
        });

        sortedHistory.forEach(bet => {
            const li = document.createElement('li');
            const betDate = bet.timestamp?.toDate ? bet.timestamp.toDate().toLocaleString('es-PE') : 'Reciente';
            
            let statusClass = '';
            let statusText = bet.status || 'Pendiente';
            if (statusText === 'Ganada' || statusText === 'Pagada') {
                statusClass = 'status-won';
            } else if (statusText === 'Perdida') {
                statusClass = 'status-lost';
            }

            li.innerHTML = `
                <div class="history-header">
                    <span>Apostado: S/ ${bet.amount.toFixed(2)} a "${bet.selection}"</span>
                    <span class="status ${statusClass}" style="font-weight: bold;">${statusText}</span>
                </div>
                <small style="color: #888;">${betDate}</small>
            `;
            historyListEl.appendChild(li);
        });
    }

    function displayAdminLink(role) {
        const existingLink = document.getElementById('admin-link');
        if (role === 'admin') {
            if (!existingLink) {
                const link = document.createElement('a');
                link.href = 'admin.html';
                link.textContent = 'Panel de Administrador';
                link.id = 'admin-link';
                link.className = 'auth-button secondary-button';
                link.style.textDecoration = 'none';
                link.style.textAlign = 'center';
                link.style.display = 'block';
                logoutBtn.parentNode.insertBefore(link, logoutBtn);
            }
        } else {
            if (existingLink) existingLink.remove();
        }
    }

    function listenForLiveMatch() {
        db.collection('liveMatch').doc('current').onSnapshot(doc => {
            matchesContainerEl.innerHTML = '';
            additionalMarketsContainerEl.innerHTML = '';
            betSlipSelections = [];
            updateBetSlip();
            if (countdownInterval) clearInterval(countdownInterval);

            if (doc.exists && doc.data().status === 'live') {
                const data = doc.data();
                if (data.streamUrl) {
                    const channelName = getChannelFromUrl(data.streamUrl);
                    if (channelName) streamContainerEl.innerHTML = `<iframe src="https://player.kick.com/${channelName}" style="border:none; width:100%; height:400px;" allowfullscreen="true" scrolling="no"></iframe>`;
                }
                createMatchElement(data.odds || {});
                createBttsMarket(data.odds || {});
                if (data.betting_status === 'open') {
                    enableBetting();
                    startBettingTimer(90);
                } else {
                    disableBetting();
                    const timerDisplay = document.getElementById('betting-timer');
                    if (timerDisplay) timerDisplay.textContent = "Las apuestas están cerradas por el administrador.";
                }
            } else {
                streamContainerEl.innerHTML = '<p style="text-align:center; padding: 20px;">La transmisión ha finalizado.</p>';
                disableBetting();
            }
        });
    }

    function createMatchElement(odds) {
        const matchEl = document.createElement('div');
        matchEl.className = 'match';
        matchEl.innerHTML = `
            <div class="match-teams">${SINGLE_MATCH.home} vs ${SINGLE_MATCH.away}</div>
            <div id="betting-timer" class="betting-timer"></div>
            <p class="market-title">Resultado del Partido</p>
            <div class="odds-buttons" data-market="main_result">
                <button data-type="1" data-value="${odds['1'] || 0}" data-selection="${SINGLE_MATCH.home} (Gana)">1 - ${(odds['1'] || 0).toFixed(2)}</button>
                <button data-type="X" data-value="${odds['X'] || 0}" data-selection="Empate">X - ${(odds['X'] || 0).toFixed(2)}</button>
                <button data-type="2" data-value="${odds['2'] || 0}" data-selection="${SINGLE_MATCH.away} (Gana)">2 - ${(odds['2'] || 0).toFixed(2)}</button>
            </div>
        `;
        matchesContainerEl.appendChild(matchEl);
    }

    function createBttsMarket(odds) {
        if (!odds.btts_yes) return;
        const bttsEl = document.createElement('div');
        bttsEl.className = 'match';
        bttsEl.innerHTML = `
            <p class="market-title">Ambos Equipos Anotan</p>
            <div class="odds-buttons" data-market="btts">
                <button data-type="btts_yes" data-value="${odds.btts_yes}" data-selection="Ambos Anotan: Sí">Sí - ${odds.btts_yes.toFixed(2)}</button>
                <button data-type="btts_no" data-value="${odds.btts_no}" data-selection="Ambos Anotan: No">No - ${odds.btts_no.toFixed(2)}</button>
            </div>
        `;
        additionalMarketsContainerEl.appendChild(bttsEl);
    }

    function handleOddClick(e) {
        const target = e.target.closest('button');
        if (!target || !target.closest('.odds-buttons') || target.disabled) return;
        
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
        const newBetRef = db.collection('liveBets').doc();
        const betId = newBetRef.id;

        try {
            await newBetRef.set({
                betId: betId,
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                amount: amount,
                odd: totalOdd,
                selections: betSlipSelections,
                selection: combinedSelectionName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            const historyEntry = {
                betId: betId,
                amount: amount,
                odd: totalOdd,
                selection: combinedSelectionName,
                status: 'Pendiente',
                timestamp: new Date()
            };

            await db.collection('users').doc(currentUser.uid).update({
                balance: firebase.firestore.FieldValue.increment(-amount),
                history: firebase.firestore.FieldValue.arrayUnion(historyEntry)
            });

            alert(`Apuesta combinada realizada por S/ ${amount.toFixed(2)}.`);
            betSlipSelections = [];
            document.querySelectorAll('.odds-buttons button.selected').forEach(btn => btn.classList.remove('selected'));
            updateBetSlip();

        } catch (error) {
            console.error("Error al realizar la apuesta:", error);
            alert("Hubo un problema al registrar tu apuesta.");
        }
    }

    function startBettingTimer(durationInSeconds) {
        if (countdownInterval) clearInterval(countdownInterval);
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

    function enableBetting() {
        document.querySelectorAll('.odds-buttons button').forEach(button => button.disabled = false);
        slipContentEl.innerHTML = `<p>Selecciona una o más cuotas.</p>`;
    }

    function disableBetting() {
        document.querySelectorAll('.odds-buttons button').forEach(button => button.disabled = true);
        slipContentEl.innerHTML = `<p>Las apuestas para este evento están cerradas.</p>`;
    }

    function getChannelFromUrl(url) {
        try { const path = new URL(url).pathname; return path.split('/').pop(); }
        catch(e) { return null; }
    }

    document.body.addEventListener('click', e => {
        if (e.target.closest('.odds-buttons')) {
            handleOddClick(e);
        }
    });

    logoutBtn.addEventListener('click', () => auth.signOut());

    depositBtn.addEventListener('click', () => {
        if (currentUser) userIdDisplay.value = currentUser.uid;
        depositModal.classList.remove('hidden');
    });
    
    closeModalBtn.addEventListener('click', () => {
        depositModal.classList.add('hidden');
    });
});