document.addEventListener('DOMContentLoaded', () => {

    // ▼▼ TU CONFIGURACIÓN DE FIREBASE (YA ESTÁ BIEN) ▼▼
    const firebaseConfig = {
      apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
      authDomain: "simulador-apuestas-uni.firebaseapp.com",
      projectId: "simulador-apuestas-uni",
      storageBucket: "simulador-apuestas-uni.firebasestorage.app",
      messagingSenderId: "1089950371477",
      appId: "1:1089950371477:web:3e7fdc7fa16ad8e5c6559c"
    };
    // ▲▲ ----------------------------------------- ▲▲

    // --- INICIALIZACIÓN DE FIREBASE ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // --- PARTIDO ÚNICO DEFINIDO ---
    const SINGLE_MATCH = {
        id: 1,
        home: "Alianza Lima ",
        away: "Universitario de Deportes"
    };

    // --- VARIABLES DE ESTADO ---
    let balance = 0;
    let betsHistory = [];
    let currentBet = null; // Para una sola apuesta

    // --- ELEMENTOS DEL DOM (VERSIÓN LIMPIA) ---
    const balanceAmountEl = document.getElementById('balance-amount');
    const matchesContainerEl = document.getElementById('matches-container');
    const slipContentEl = document.getElementById('slip-content');
    const historyListEl = document.getElementById('history-list');
    const resetBalanceBtn = document.getElementById('reset-balance');
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
            displaySingleMatch(); // Mostramos el partido cuando el usuario se loguea
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- FUNCIONES DEL SIMULADOR ---

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
        }, error => console.error("Error al escuchar datos:", error));
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
    
    function displaySingleMatch() {
        matchesContainerEl.innerHTML = '';
        const odds = {
            home: (Math.random() * 2 + 1.5).toFixed(2),
            draw: (Math.random() * 1.5 + 2.8).toFixed(2),
            away: (Math.random() * 3 + 2.0).toFixed(2)
        };
        createMatchElement(SINGLE_MATCH.id, SINGLE_MATCH.home, SINGLE_MATCH.away, odds);
    }

    function createMatchElement(id, home, away, odds) {
        const matchEl = document.createElement('div');
        matchEl.className = 'match';
        matchEl.dataset.matchId = id;
        matchEl.innerHTML = `
            <div class="match-teams">${home} vs ${away}</div>
            <div class="odds-buttons">
                <button data-type="1" data-value="${odds.home}" data-teams="${home} vs ${away}" data-selection="${home} (Gana)">1 - ${odds.home}</button>
                <button data-type="X" data-value="${odds.draw}" data-teams="${home} vs ${away}" data-selection="Empate">X - ${odds.draw}</button>
                <button data-type="2" data-value="${odds.away}" data-teams="${home} vs ${away}" data-selection="${away} (Gana)">2 - ${odds.away}</button>
            </div>
        `;
        matchesContainerEl.appendChild(matchEl);
    }
    
    function handleOddClick(e) {
        if (balance <= 0) {
            alert("No tienes saldo suficiente para realizar una apuesta.");
            return;
        }
        const target = e.target;
        if (target.tagName !== 'BUTTON') return;
        if (target.classList.contains('selected')) {
            target.classList.remove('selected');
            currentBet = null;
        } else {
            document.querySelectorAll('.odds-buttons button').forEach(btn => btn.classList.remove('selected'));
            target.classList.add('selected');
            currentBet = { teams: target.dataset.teams, selection: target.dataset.selection, odd: parseFloat(target.dataset.value), type: target.dataset.type };
        }
        updateBetSlip();
    }

    function updateBetSlip() {
        if (!currentBet) {
            slipContentEl.innerHTML = `<p>Selecciona una cuota para empezar.</p>`;
            return;
        }
        slipContentEl.innerHTML = `
            <div class="bet-info">
                <strong>${currentBet.teams}</strong><br>
                <span>Tu Selección: ${currentBet.selection}</span><br>
                <strong>Cuota: ${currentBet.odd.toFixed(2)}</strong>
            </div>
            <input type="number" id="bet-amount" placeholder="Monto a apostar (ej. 50)">
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
                document.getElementById('potential-winnings').textContent = `S/ ${(amount * currentBet.odd).toFixed(2)}`;
                placeBetBtn.disabled = false;
            } else {
                document.getElementById('potential-winnings').textContent = `S/ 0.00`;
                placeBetBtn.disabled = true;
            }
        });
    }

    async function placeBet() {
        const amount = parseFloat(document.getElementById('bet-amount').value);
        if (!amount || !currentBet || amount <= 0 || amount > balance) return;
        balance -= amount;
        const oddsButtons = document.querySelectorAll('.odds-buttons button');
        const odds = {
            '1': parseFloat(oddsButtons[0].dataset.value),
            'X': parseFloat(oddsButtons[1].dataset.value),
            '2': parseFloat(oddsButtons[2].dataset.value)
        };
        const result = simulateMatch(odds);
        const won = currentBet.type === result.winner;
        let outcomeMessage = '';
        if (won) {
            const winnings = amount * currentBet.odd;
            balance += winnings;
            outcomeMessage = `¡GANASTE! Recibes S/ ${winnings.toFixed(2)}`;
        } else {
            let resultText = '';
            switch(result.winner) {
                case '1': resultText = `victoria para ${SINGLE_MATCH.home}`; break;
                case 'X': resultText = 'un empate'; break;
                case '2': resultText = `victoria para ${SINGLE_MATCH.away}`; break;
            }
            outcomeMessage = `PERDISTE. El resultado fue ${resultText}.`;
        }
        betsHistory.unshift({
            selection: currentBet.selection,
            amount,
            won,
            odd: currentBet.odd,
            timestamp: new Date().toLocaleString('es-PE')
        });
        await saveData();
        updateUI();
        alert(outcomeMessage);
        currentBet = null;
        updateBetSlip();
        displaySingleMatch();
    }

    function simulateMatch(odds) {
        const prob1 = 1 / odds['1'];
        const probX = 1 / odds['X'];
        const prob2 = 1 / odds['2'];
        const totalProb = prob1 + probX + prob2;
        const normProb1 = prob1 / totalProb;
        const normProbX = probX / totalProb;
        const random = Math.random();
        let winner;
        if (random < normProb1) {
            winner = '1';
        } else if (random < normProb1 + normProbX) {
            winner = 'X';
        } else {
            winner = '2';
        }
        return { winner };
    }

    function updateUI() {
        balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
        historyListEl.innerHTML = '';
        betsHistory.forEach(bet => {
            const li = document.createElement('li');
            const resultClass = bet.won ? 'won' : 'lost';
            const winnings = bet.won ? bet.amount * bet.odd - bet.amount : bet.amount;
            const sign = bet.won ? '+' : '-';
            li.innerHTML = `
                <div class="history-header">
                    <span>Apostado: S/ ${bet.amount.toFixed(2)} a "${bet.selection}"</span>
                    <span class="history-outcome ${resultClass}">${sign} S/ ${winnings.toFixed(2)}</span>
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
    
    async function resetData() {
        if (confirm("¿Estás seguro de que quieres reiniciar tu saldo e historial a S/ 1,000?")) {
            balance = 0;
            betsHistory = [];
            currentBet = null;
            await saveData();
            updateUI();
            updateBetSlip();
            displaySingleMatch();
        }
    }
    
    // --- EVENT LISTENERS ---
    logoutBtn.addEventListener('click', () => auth.signOut().catch(error => console.error(error)));
    resetBalanceBtn.addEventListener('click', resetData);
    matchesContainerEl.addEventListener('click', handleOddClick);
    
    depositBtn.addEventListener('click', () => {
        if (currentUser) {
            userIdDisplay.value = currentUser.uid;
        }
        depositModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        depositModal.classList.add('hidden');
    });
});