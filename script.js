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

     // --- INICIALIZACIÓN DE FIREBASE ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // --- DATOS DEL PARTIDO ---
    const SINGLE_MATCH = {
        id: 1,
        home: "Alianza Lima",
        away: "Universitario"
    };

    // --- VARIABLES DE ESTADO ---
    let balance = 0;
    let betsHistory = [];
    let betSlipSelections = []; // Para apuestas combinadas

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
            userEmailEl.textContent = user.displayName;
            loadData();
            listenForLiveMatch();
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- LÓGICA DE TIEMPO REAL ---
    function listenForLiveMatch() {
        const liveMatchRef = db.collection('liveMatch').doc('current');
        liveMatchRef.onSnapshot(doc => {
            if (streamContainerEl) streamContainerEl.innerHTML = '';
            if (matchesContainerEl) matchesContainerEl.innerHTML = '';
            if (propBetsContainerEl) propBetsContainerEl.innerHTML = '';

            if (doc.exists && doc.data().streamUrl && doc.data().status === 'live') {
                const data = doc.data();
                const channelName = getChannelFromUrl(data.streamUrl);
                if (channelName && streamContainerEl) {
                    streamContainerEl.innerHTML = `
                        <iframe src="https://player.kick.com/${channelName}"
                            style="border:none; width:100%; height:400px;"
                            allowfullscreen="true" scrolling="no">
                        </iframe>`;
                    const odds = data.odds || { '1': 1.85, 'X': 3.20, '2': 2.50, 'fg1': 1.90, 'fg2': 1.90 };
                    createMatchElement(SINGLE_MATCH.id, SINGLE_MATCH.home, SINGLE_MATCH.away, odds);
                }
            } else {
                if (streamContainerEl) streamContainerEl.innerHTML = '<p style="text-align:center; padding: 20px;">No hay transmisión programada.</p>';
            }
        });
    }

    function getChannelFromUrl(url) {
        try {
            const path = new URL(url).pathname;
            return path.split('/').pop();
        } catch (e) { return null; }
    }

    function loadData() {
        if (!currentUser) return;
        const userDocRef = db.collection('users').doc(currentUser.uid);
        userDocRef.onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                balance = data.balance;
                betsHistory = data.history || [];
                currentUser.role = data.role || 'user';
            } else {
                balance = 0;
                betsHistory = [];
                currentUser.role = 'user';
                saveData(true);
            }
            updateUI();
        });
    }

    async function saveData(isInitialSetup = false) {
        if (!currentUser) return;
        const userDocRef = db.collection('users').doc(currentUser.uid);
        const dataToSave = {
            balance: balance,
            history: betsHistory
        };
        if (isInitialSetup) {
            dataToSave.role = 'user';
        }
        await userDocRef.set(dataToSave, { merge: true });
    }

    // --- CREACIÓN DE ELEMENTOS ---
    function createMatchElement(id, home, away, odds) {
        const matchEl = document.createElement('div');
        matchEl.className = 'match';
        matchEl.dataset.marketId = 'main_result';
        matchEl.innerHTML = `
            <div class="match-teams">${home} vs ${away}</div>
            <div class="odds-buttons">
                <button data-type="1" data-value="${odds['1']}" data-selection="${home} (Gana)">1 - ${odds['1'].toFixed(2)}</button>
                <button data-type="X" data-value="${odds['X']}" data-selection="Empate">X - ${odds['X'].toFixed(2)}</button>
                <button data-type="2" data-value="${odds['2']}" data-selection="${away} (Gana)">2 - ${odds['2'].toFixed(2)}</button>
            </div>
        `;
        matchesContainerEl.appendChild(matchEl);

        if (odds.fg1 && odds.fg2) {
            const propBetEl = document.createElement('div');
            propBetEl.className = 'match prop-bet';
            propBetEl.dataset.marketId = 'first_goal';
            propBetEl.innerHTML = `
                <div class="match-teams">¿Quién anota el primer gol?</div>
                <div class="odds-buttons">
                    <button data-type="fg1" data-value="${odds.fg1}" data-selection="Primer Gol: ${home}">${home} - ${odds.fg1.toFixed(2)}</button>
                    <button data-type="fg2" data-value="${odds.fg2}" data-selection="Primer Gol: ${away}">${away} - ${odds.fg2.toFixed(2)}</button>
                </div>
            `;
            propBetsContainerEl.appendChild(propBetEl);
        }
    }

    // --- LÓGICA DE SELECCIÓN DE APUESTAS (PARA COMBINADAS) ---
    function handleOddClick(e) {
        if (balance <= 0) { alert("No tienes saldo suficiente."); return; }
        const target = e.target;
        if (target.tagName !== 'BUTTON') return;

        const betData = {
            marketId: target.closest('.match').dataset.marketId,
            selection: target.dataset.selection,
            odd: parseFloat(target.dataset.value),
            type: target.dataset.type
        };

        const existingBetIndex = betSlipSelections.findIndex(bet => bet.marketId === betData.marketId);

        if (existingBetIndex > -1) {
            if (betSlipSelections[existingBetIndex].type === betData.type) {
                betSlipSelections.splice(existingBetIndex, 1);
            } else {
                betSlipSelections[existingBetIndex] = betData;
            }
        } else {
            betSlipSelections.push(betData);
        }
        
        updateSelectedButtons();
        updateBetSlip();
    }

    function updateSelectedButtons() {
        document.querySelectorAll('.odds-buttons button').forEach(button => {
            const isSelected = betSlipSelections.some(bet => bet.type === button.dataset.type);
            button.classList.toggle('selected', isSelected);
        });
    }

    // --- CUPÓN DE APUESTA (PARA COMBINADAS) ---
    function updateBetSlip() {
        if (betSlipSelections.length === 0) {
            slipContentEl.innerHTML = `<p>Selecciona una o más cuotas para empezar.</p>`;
            return;
        }

        let itemsHTML = '';
        let totalOdd = 1;

        betSlipSelections.forEach(bet => {
            itemsHTML += `<div class="bet-info-item"><p class="selection-name">${bet.selection}</p><p>Cuota: ${bet.odd.toFixed(2)}</p></div>`;
            totalOdd *= bet.odd;
        });

        slipContentEl.innerHTML = `
            ${itemsHTML}
            <div id="slip-summary">
                <p><strong>Selecciones:</strong> ${betSlipSelections.length}</p>
                <p><strong>Cuota Total:</strong> ${totalOdd.toFixed(2)}</p>
            </div>
            <input type="number" id="bet-amount" placeholder="Monto a apostar">
            <p>Ganancia Potencial: <strong id="potential-winnings">S/ 0.00</strong></p>
            <button id="place-bet-btn" disabled>Apostar</button>
        `;
        
        const betAmountInput = document.getElementById('bet-amount');
        const placeBetBtn = document.getElementById('place-bet-btn');
        placeBetBtn.addEventListener('click', placeBet);
        betAmountInput.addEventListener('input', () => {
            const amount = parseFloat(betAmountInput.value);
            const isAmountValid = amount > 0 && amount <= balance;
            if (isAmountValid) {
                document.getElementById('potential-winnings').textContent = `S/ ${(amount * totalOdd).toFixed(2)}`;
                placeBetBtn.disabled = false;
            } else {
                document.getElementById('potential-winnings').textContent = `S/ 0.00`;
                placeBetBtn.disabled = true;
            }
        });
    }

    // --- REALIZAR APUESTA (PARA COMBINADAS) ---
    async function placeBet() {
        const amount = parseFloat(document.getElementById('bet-amount').value);
        if (!amount || betSlipSelections.length === 0 || amount <= 0 || amount > balance) {
            alert("Cupón inválido o saldo insuficiente.");
            return;
        }
        
        try {
            balance -= amount;
            const totalOdd = betSlipSelections.reduce((total, bet) => total * bet.odd, 1);
            
            await db.collection('liveBets').add({
                userId: currentUser.uid,
                userName: currentUser.displayName,
                selections: betSlipSelections,
                totalOdd: totalOdd,
                amount: amount,
                timestamp: new Date()
            });

            betsHistory.unshift({
                selections: betSlipSelections,
                totalOdd: totalOdd,
                amount: amount,
                timestamp: new Date().toLocaleString('es-PE'),
                status: 'Pendiente'
            });

            await saveData();
            updateUI();
            alert(`Apuesta combinada de ${betSlipSelections.length} selecciones realizada con éxito.`);
            
            betSlipSelections = [];
            updateSelectedButtons();
            updateBetSlip();
        } catch (error) {
            console.error("Error al realizar la apuesta:", error);
            alert("Hubo un problema al registrar tu apuesta.");
            balance += amount;
        }
    }
    
    // `updateUI` MODIFICADO PARA HISTORIAL DE COMBINADAS
    function updateUI() {
        balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
        historyListEl.innerHTML = '';
        betsHistory.forEach(bet => {
            const li = document.createElement('li');
            
            let selectionsText = 'Apuesta Simple';
            if (bet.selections && bet.selections.length > 1) {
                selectionsText = `Combinada (${bet.selections.length} selecciones)`;
            } else if (bet.selections && bet.selections.length === 1) {
                selectionsText = bet.selections[0].selection;
            } else if (bet.selection) {
                selectionsText = bet.selection;
            }

            let resultHTML = '';
            if (bet.status === 'Pendiente') {
                resultHTML = `<span style="color: #ffc107; font-weight: bold;">Pendiente</span>`;
            } else {
                const resultClass = bet.won ? 'won' : 'lost';
                const winnings = bet.won ? bet.amount * (bet.totalOdd || bet.odd) - bet.amount : bet.amount;
                const sign = bet.won ? '+' : '-';
                resultHTML = `<span class="history-outcome ${resultClass}">${sign} S/ ${winnings.toFixed(2)}</span>`;
            }

            li.innerHTML = `
                <div class="history-header">
                    <span>Apostado: S/ ${bet.amount.toFixed(2)} a "${selectionsText}"</span>
                    ${resultHTML}
                </div>
                <small style="color: #888;">${bet.timestamp}</small>
            `;
            historyListEl.appendChild(li);
        });
        const adminLink = document.getElementById('admin-link');
        if (currentUser && currentUser.role === 'admin' && !adminLink) {
            const link = document.createElement('a');
            link.href = 'admin.html';
            link.textContent = 'Panel de Administrador';
            link.id = 'admin-link';
            link.className = 'auth-button secondary-button';
            link.style.textDecoration = 'none';
            logoutBtn.parentNode.insertBefore(link, logoutBtn);
        }
    }

    // --- EVENT LISTENERS ---
    if(logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut().catch(error => console.error(error)));
    if(matchesContainerEl) matchesContainerEl.addEventListener('click', handleOddClick);
    if(propBetsContainerEl) propBetsContainerEl.addEventListener('click', handleOddClick);
    
    if(depositBtn) {
        depositBtn.addEventListener('click', () => {
            if (currentUser) {
                userIdDisplay.value = currentUser.uid;
            }
            depositModal.classList.remove('hidden');
        });
    }

    if(closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            depositModal.classList.add('hidden');
        });
    }
});