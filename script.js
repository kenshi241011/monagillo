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
     // ▲▲ ---------------------------------------------------- ▲▲

    // --- INICIALIZACIÓN DE FIREBASE ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // --- DATOS DEL PARTIDO POR DEFECTO ---
    const SINGLE_MATCH = {
        id: 1,
        home: "Alianza Lima",
        away: "Universitario de Deportes"
    };

    // --- VARIABLES DE ESTADO ---
    let balance = 0;
    let betsHistory = [];
    let currentBet = null;

    // --- ELEMENTOS DEL DOM ---
    const streamContainerEl = document.getElementById('stream-container');
    const balanceAmountEl = document.getElementById('balance-amount');
    const matchesContainerEl = document.getElementById('matches-container');
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
            listenForLiveMatch(); // Inicia la escucha para ver si hay un partido en vivo
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- LÓGICA DE TIEMPO REAL Y SIMULACIÓN ---
    function listenForLiveMatch() {
        const liveMatchRef = db.collection('liveMatch').doc('current');
        liveMatchRef.onSnapshot(doc => {
            if (streamContainerEl) streamContainerEl.innerHTML = '';
            if (matchesContainerEl) matchesContainerEl.innerHTML = '';

            if (doc.exists && doc.data().streamUrl && doc.data().status === 'live') {
                // CASO 1: HAY PARTIDO EN VIVO TRANSMITIDO POR EL ADMIN
                const data = doc.data();
                const channelName = getChannelFromUrl(data.streamUrl);
                if (channelName && streamContainerEl) {
                    const parentDomain = "apuestas-monagilloperdido-f7706f.netlify.app"; // dominio de Netlify
                    streamContainerEl.innerHTML = `
                     <iframe
                     src="https://player.twitch.tv/?channel=${channelName}&parent=${parentDomain}&autoplay=true"
                     frameborder="0"
                     allowfullscreen="true"
                     scrolling="no"
                        width="100%"
                        height="400">
                    </iframe>`;
                    const odds = data.odds || { '1': 1.85, 'X': 3.20, '2': 2.50 };
                    createMatchElement(SINGLE_MATCH.id, SINGLE_MATCH.home, SINGLE_MATCH.away, odds);
                }
            } else {
                // CASO 2: NO HAY PARTIDO EN VIVO, SE MUESTRA EL SIMULADO
                if (streamContainerEl) streamContainerEl.innerHTML = '<p style="text-align:center; padding: 10px; background-color: #f0f2f5; border-radius: 8px;">No hay transmisión en vivo. Puedes apostar en el siguiente partido simulado:</p>';
                displaySingleMatch();
            }
        });
    }

    // Función para el partido simulado por defecto
    function displaySingleMatch() {
        const odds = {
            '1': (Math.random() * 2 + 1.5).toFixed(2),
            'X': (Math.random() * 1.5 + 2.8).toFixed(2),
            '2': (Math.random() * 3 + 2.0).toFixed(2)
        };
        createMatchElement(SINGLE_MATCH.id, SINGLE_MATCH.home, SINGLE_MATCH.away, odds);
    }

    function getChannelFromUrl(url) {
        try {
            const path = new URL(url).pathname;
            return path.split('/').pop();
        } catch (e) { return null; }
    }

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
                balance = 1000;
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
    
    function createMatchElement(id, home, away, odds) {
        const matchEl = document.createElement('div');
        matchEl.className = 'match';
        matchEl.innerHTML = `
            <div class="match-teams">${home} vs ${away}</div>
            <div class="odds-buttons">
                <button data-type="1" data-value="${odds['1'] || 0}" data-selection="${home} (Gana)">1 - ${(odds['1'] || 0).toFixed(2)}</button>
                <button data-type="X" data-value="${odds['X'] || 0}" data-selection="Empate">X - ${(odds['X'] || 0).toFixed(2)}</button>
                <button data-type="2" data-value="${odds['2'] || 0}" data-selection="${away} (Gana)">2 - ${(odds['2'] || 0).toFixed(2)}</button>
            </div>
        `;
        matchesContainerEl.appendChild(matchEl);
    }

    function handleOddClick(e) {
        if (balance <= 0) {
            alert("No tienes saldo para apostar.");
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
            currentBet = { teams: `${SINGLE_MATCH.home} vs ${SINGLE_MATCH.away}`, selection: target.dataset.selection, odd: parseFloat(target.dataset.value), type: target.dataset.type };
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
        const amountInput = document.getElementById('bet-amount');
        if (!amountInput) return;
        const amount = parseFloat(amountInput.value);
        if (!amount || !currentBet || amount <= 0 || amount > balance) {
            alert("Monto inválido o saldo insuficiente.");
            return;
        }
        
        try {
            balance -= amount;
            const liveBetRef = db.collection('liveBets').doc();
            await liveBetRef.set({
                userId: currentUser.uid,
                userName: currentUser.displayName,
                selection: currentBet.selection,
                amount: amount,
                odd: currentBet.odd,
                timestamp: new Date()
            });
            betsHistory.unshift({
                selection: currentBet.selection,
                amount: amount,
                odd: currentBet.odd,
                timestamp: new Date().toLocaleString('es-PE'),
                status: 'Pendiente'
            });
            await saveData();
            updateUI();
            alert(`Apuesta realizada: S/ ${amount.toFixed(2)} a "${currentBet.selection}".`);
            currentBet = null;
            document.querySelectorAll('.odds-buttons button').forEach(btn => btn.classList.remove('selected'));
            updateBetSlip();
        } catch (error) {
            console.error("Error al realizar la apuesta:", error);
            alert("Hubo un problema al registrar tu apuesta.");
            balance += amount; // Devolvemos el saldo si hay error
        }
    }
    
    function updateUI() {
        balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
        historyListEl.innerHTML = '';
        betsHistory.forEach(bet => {
            const li = document.createElement('li');
            let resultHTML = '';
            if (bet.status === 'Pendiente') {
                resultHTML = `<span style="color: #ffc107; font-weight: bold;">Pendiente</span>`;
            } else {
                const resultClass = bet.won ? 'won' : 'lost';
                const winnings = bet.won ? bet.amount * bet.odd - bet.amount : bet.amount;
                const sign = bet.won ? '+' : '-';
                resultHTML = `<span class="history-outcome ${resultClass}">${sign} S/ ${winnings.toFixed(2)}</span>`;
            }
            li.innerHTML = `
                <div class="history-header">
                    <span>Apostado: S/ ${bet.amount.toFixed(2)} a "${bet.selection}"</span>
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