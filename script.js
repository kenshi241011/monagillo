// script.js

document.addEventListener('DOMContentLoaded', () => {

    // ▼▼ PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE ▼▼
    const firebaseConfig = {
  apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
  authDomain: "simulador-apuestas-uni.firebaseapp.com",
  projectId: "simulador-apuestas-uni",
  storageBucket: "simulador-apuestas-uni.firebasestorage.app",
  messagingSenderId: "1089950371477",
  appId: "1:1089950371477:web:3e7fdc7fa16ad8e5c6559c"
};
    // --- INICIALIZACIÓN DE FIREBASE ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // --- LISTA DE PARTIDOS FICTICIOS ---
    const FICTITIOUS_MATCHES = [
        { id: 1, home: "Alianza Lima Stars", away: "Universitario Force" },
        { id: 2, home: "Sporting Cristal Gems", away: "Melgar Dominos" },
        { id: 3, home: "Cienciano Legends", away: "Sport Boys Crew" },
        { id: 4, home: "Cusco FC Imperial", away: "Vallejo Poets" },
        { id: 5, home: "Atlético Grau", away: "ADT Tarma" },
        { id: 6, home: "Deportivo Garcilaso", away: "Carlos Mannucci" }
    ];

    // --- VARIABLES DE ESTADO ---
    let balance = 0;
    let betsHistory = [];
    let betSlipSelections = [];

    // --- ELEMENTOS DEL DOM ---
    const balanceAmountEl = document.getElementById('balance-amount');
    const matchesContainerEl = document.getElementById('matches-container');
    const slipContentEl = document.getElementById('slip-content');
    const historyListEl = document.getElementById('history-list');
    const resetBalanceBtn = document.getElementById('reset-balance');
    const matchSelectorEl = document.getElementById('match-selector');
    const addMatchBtn = document.getElementById('add-match-btn');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const depositBtn = document.getElementById('deposit-btn');
    const depositModal = document.getElementById('deposit-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const confirmDepositBtn = document.getElementById('confirm-deposit-btn');
    const depositAmountInput = document.getElementById('deposit-amount');
    const userIdDisplay = document.getElementById('user-id-display');

    // --- GESTIÓN DE AUTENTICACIÓN ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            userEmailEl.textContent = user.displayName;
            loadData();
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- FUNCIONES DEL SIMULADOR ---

    /**
     * Carga los datos del usuario (saldo e historial) desde Firestore.
     * Si el usuario es nuevo, le asigna un saldo inicial y el rol de 'user'.
     */
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
                balance = 1000;
                betsHistory = [];
                currentUser.role = 'user';
                saveData(true); // El 'true' indica que es el setup inicial
            }
            updateUI();
        }, error => {
            console.error("Error al escuchar datos en tiempo real:", error);
        });
    }

    /**
     * Guarda el estado actual (saldo e historial) en el documento del usuario en Firestore.
     */
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
    
    /**
     * Rellena el menú desplegable con la lista de partidos ficticios.
     */
    function populateMatchSelector() {
        FICTITIOUS_MATCHES.forEach(match => {
            const option = document.createElement('option');
            option.value = match.id;
            option.textContent = `${match.home} vs ${match.away}`;
            matchSelectorEl.appendChild(option);
        });
    }

    /**
     * Añade el partido seleccionado del dropdown al panel de apuestas.
     */
    function addSelectedMatch() {
        const selectedMatchId = parseInt(matchSelectorEl.value);
        const alreadyExists = document.querySelector(`.match[data-match-id='${selectedMatchId}']`);
        if (alreadyExists) {
            alert("Este partido ya ha sido añadido.");
            return;
        }
        const matchData = FICTITIOUS_MATCHES.find(m => m.id === selectedMatchId);
        if (matchData) {
            const odds = {
                home: (Math.random() * 2 + 1.5).toFixed(2),
                draw: (Math.random() * 1.5 + 2.5).toFixed(2),
                away: (Math.random() * 3 + 2.0).toFixed(2),
            };
            createMatchElement(matchData.id, matchData.home, matchData.away, odds);
        }
    }

    /**
     * Crea el elemento HTML para un partido y lo añade al contenedor.
     */
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
    
    /**
     * Maneja los clics en las cuotas de los partidos para añadirlos al cupón.
     */
    function handleOddClick(e) {
        const target = e.target;
        if (target.tagName !== 'BUTTON') return;

        const parentMatch = target.closest('.match');
        const matchId = parentMatch.dataset.matchId;
        const selectionIndex = betSlipSelections.findIndex(bet => bet.matchId === matchId);

        if (target.classList.contains('selected')) {
            target.classList.remove('selected');
            betSlipSelections.splice(selectionIndex, 1);
        } else {
            if (selectionIndex > -1) {
                betSlipSelections.splice(selectionIndex, 1);
            }
            parentMatch.querySelectorAll('.odds-buttons button').forEach(btn => btn.classList.remove('selected'));
            target.classList.add('selected');
            betSlipSelections.push({
                matchId: matchId,
                teams: target.dataset.teams,
                selection: target.dataset.selection,
                odd: parseFloat(target.dataset.value),
                type: target.dataset.type,
            });
        }
        updateBetSlip();
    }

    /**
     * Actualiza la interfaz del cupón de apuestas con las selecciones actuales.
     */
    function updateBetSlip() {
        if (betSlipSelections.length === 0) {
            slipContentEl.innerHTML = `<p>Añade un partido y selecciona una cuota para empezar.</p>`;
            return;
        }

        let slipHTML = '';
        let totalOdd = 1;
        betSlipSelections.forEach(bet => {
            slipHTML += `<div class="bet-info"><strong>${bet.teams}</strong><br><span>Tu Selección: ${bet.selection}</span><br><span>Cuota: ${bet.odd.toFixed(2)}</span></div>`;
            totalOdd *= bet.odd;
        });
        
        slipHTML += `
            <div id="slip-summary">
                <div>${betSlipSelections.length} Selección(es)</div>
                <div>Cuota Total: ${totalOdd.toFixed(2)}</div>
            </div>
            <input type="number" id="bet-amount" placeholder="Monto a apostar (ej. 50)">
            <p>Ganancia Potencial: <strong id="potential-winnings">S/ 0.00</strong></p>
            <button id="place-bet-btn" disabled>Apostar</button>
        `;
        slipContentEl.innerHTML = slipHTML;
        
        const betAmountInput = document.getElementById('bet-amount');
        const placeBetBtn = document.getElementById('place-bet-btn');
        const potentialWinningsEl = document.getElementById('potential-winnings');

        betAmountInput.addEventListener('input', () => {
            const amount = parseFloat(betAmountInput.value);
            const isAmountValid = amount > 0 && amount <= balance;
            if (isAmountValid) {
                potentialWinningsEl.textContent = `S/ ${(amount * totalOdd).toFixed(2)}`;
                placeBetBtn.disabled = false;
            } else {
                potentialWinningsEl.textContent = `S/ 0.00`;
                placeBetBtn.disabled = true;
            }
        });
        placeBetBtn.addEventListener('click', placeBet);
    }

    /**
     * Procesa la apuesta, simula el resultado y actualiza el saldo.
     */
    async function placeBet() {
        const amount = parseFloat(document.getElementById('bet-amount').value);
        if (!amount || amount <= 0 || amount > balance) {
            alert("Monto inválido o no tienes suficiente saldo.");
            return;
        }

        balance -= amount;
        let isAccumulatorWin = true;
        let totalOdd = 1;

        betSlipSelections.forEach(selection => {
            const matchOddsButtons = document.querySelectorAll(`.match[data-match-id='${selection.matchId}'] .odds-buttons button`);
            const odds = {
                '1': parseFloat(matchOddsButtons[0].dataset.value),
                'X': parseFloat(matchOddsButtons[1].dataset.value),
                '2': parseFloat(matchOddsButtons[2].dataset.value),
            };
            const result = simulateMatch(odds);
            if (selection.type !== result.winner) isAccumulatorWin = false;
            totalOdd *= selection.odd;
        });

        let outcomeMessage = '';
        if (isAccumulatorWin) {
            const winnings = amount * totalOdd;
            balance += winnings;
            outcomeMessage = `¡GANASTE! Recibes S/ ${winnings.toFixed(2)}`;
        } else {
            outcomeMessage = `PERDISTE. No acertaste todos los resultados.`;
        }
        
        betsHistory.unshift({
            selections: [...betSlipSelections], amount, won: isAccumulatorWin, totalOdd, timestamp: new Date().toLocaleString('es-PE')
        });
        
        await saveData();
        
        updateUI();
        alert(outcomeMessage);
        
        betSlipSelections = [];
        matchesContainerEl.innerHTML = '';
        updateBetSlip();
    }

    /**
     * Simula el resultado de un partido basado en sus cuotas.
     */
    function simulateMatch(odds) {
        const prob1 = 1 / odds['1'], probX = 1 / odds['X'], prob2 = 1 / odds['2'];
        const totalProb = prob1 + probX + prob2;
        const normProb1 = prob1 / totalProb, normProbX = probX / totalProb;
        const random = Math.random();
        let winner;

        if (random < normProb1) winner = '1';
        else if (random < normProb1 + normProbX) winner = 'X';
        else winner = '2';
        
        return { winner };
    }

    /**
     * Actualiza la interfaz de usuario con el saldo y el historial.
     */
    function updateUI() {
        balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
        historyListEl.innerHTML = '';
        betsHistory.forEach(bet => {
            const li = document.createElement('li');
            const resultClass = bet.won ? 'won' : 'lost';
            const winnings = bet.won ? bet.amount * bet.totalOdd - bet.amount : bet.amount;
            const sign = bet.won ? '+' : '-';

            let selectionsHTML = '<ul class="history-selections">';
            bet.selections.forEach(sel => {
                selectionsHTML += `<li>${sel.teams}: <strong>${sel.selection}</strong> @ ${sel.odd}</li>`;
            });
            selectionsHTML += '</ul>';
            
            li.innerHTML = `
                <div class="history-header">
                    <span>Combinada (${bet.selections.length}) - Apostado: S/ ${bet.amount.toFixed(2)}</span>
                    <span class="history-outcome ${resultClass}">${sign} S/ ${winnings.toFixed(2)}</span>
                </div>
                ${selectionsHTML}
                <small style="color: #888;">${bet.timestamp}</small>
            `;
            historyListEl.appendChild(li);
        });
        
        // Muestra el enlace al panel de admin si el usuario es admin
        const adminLink = document.getElementById('admin-link');
        if (currentUser && currentUser.role === 'admin' && !adminLink) {
            const link = document.createElement('a');
            link.href = 'admin.html';
            link.textContent = 'Panel de Administrador';
            link.id = 'admin-link';
            link.className = 'auth-button secondary-button'; // Reutilizamos estilos
            link.style.textDecoration = 'none';
            logoutBtn.parentNode.insertBefore(link, logoutBtn);
        }
    }
    
    /**
     * Reinicia el saldo del usuario a 1000 y limpia su historial.
     */
    async function resetData() {
        if (confirm("¿Estás seguro de que quieres reiniciar tu saldo e historial a S/ 1,000?")) {
            balance = 0;
            betsHistory = [];
            betSlipSelections = [];
            matchesContainerEl.innerHTML = '';
            await saveData();
            updateUI();
            updateBetSlip();
        }
    }
    
    // --- EVENT LISTENERS ---
    logoutBtn.addEventListener('click', () => auth.signOut().catch(error => console.error(error)));
    addMatchBtn.addEventListener('click', addSelectedMatch);
    resetBalanceBtn.addEventListener('click', resetData);
    matchesContainerEl.addEventListener('click', handleOddClick);
    
    // Listeners para el modal de depósito
    depositBtn.addEventListener('click', () => {
        if (currentUser) {
            userIdDisplay.value = currentUser.uid;
        }
        depositModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        depositModal.classList.add('hidden');
    });

    confirmDepositBtn.addEventListener('click', async () => {
        const amount = parseFloat(depositAmountInput.value);

        if (isNaN(amount) || amount <= 0) {
            alert('Por favor, ingresa un monto válido y positivo.');
            return;
        }
        
        // Esta es la simulación del usuario confirmando su propio depósito.
        // En el flujo de admin, este botón no existiría para el usuario.
        balance += amount;
        await saveData();
        updateUI();

        alert(`¡Recarga exitosa! Se añadieron S/ ${amount.toFixed(2)} a tu saldo.`);
        depositAmountInput.value = '';
        depositModal.classList.add('hidden');
    });

    // --- INICIALIZACIÓN ---
    populateMatchSelector();
});