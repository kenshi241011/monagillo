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
    let currentBet = null;
    let countdownInterval = null;

    // --- ELEMENTOS DEL DOM ---
    const streamContainerEl = document.getElementById('stream-container');
    const balanceAmountEl = document.getElementById('balance-amount');
    const matchesContainerEl = document.getElementById('matches-container');
    const slipContentEl = document.getElementById('slip-content');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const depositBtn = document.getElementById('deposit-btn');
    const depositModal = document.getElementById('deposit-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const userIdDisplay = document.getElementById('user-id-display');

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            userEmailEl.textContent = user.displayName || user.email;
            loadUserData(); // <--- CAMBIO AQUÍ: Llamamos a la función mejorada
            listenForLiveMatch();
        } else {
            window.location.href = 'login.html';
        }
    });

    // <--- CAMBIO AQUÍ: FUNCIÓN MEJORADA PARA CARGAR DATOS Y VERIFICAR ROL DE ADMIN ---
    function loadUserData() {
        if (!currentUser) return;
        db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                balance = data.balance || 0;
                // Lógica para mostrar el botón de admin
                displayAdminLink(data.role);
            } else {
                // Si el usuario no existe en la BD, se le asigna un saldo inicial
                balance = 1000;
                db.collection('users').doc(currentUser.uid).set({
                    balance: balance,
                    role: 'user', // Rol por defecto
                    displayName: currentUser.displayName,
                    email: currentUser.email
                });
            }
            balanceAmountEl.textContent = `S/ ${balance.toFixed(2)}`;
        });
    }
    
    // <--- CAMBIO AQUÍ: NUEVA FUNCIÓN PARA MOSTRAR EL BOTÓN DE ADMIN ---
    function displayAdminLink(role) {
        const existingLink = document.getElementById('admin-link');
        if (role === 'admin') {
            if (!existingLink) { // Solo crea el botón si no existe
                const link = document.createElement('a');
                link.href = 'admin.html';
                link.textContent = 'Panel de Administrador';
                link.id = 'admin-link';
                link.className = 'auth-button secondary-button'; // Clases para que se vea como un botón
                link.style.textDecoration = 'none';
                link.style.textAlign = 'center';
                link.style.display = 'block';
                
                // Inserta el botón antes del de "Cerrar Sesión"
                logoutBtn.parentNode.insertBefore(link, logoutBtn);
            }
        } else {
            // Si el usuario no es admin y el link existe, lo quita
            if (existingLink) {
                existingLink.remove();
            }
        }
    }

    // El resto del código no tiene cambios
    
    function disableBetting() {
        document.querySelectorAll('.odds-buttons button').forEach(button => {
            button.disabled = true;
        });
        slipContentEl.innerHTML = `<p>Las apuestas para este evento están cerradas.</p>`;
    }

    function enableBetting() {
        document.querySelectorAll('.odds-buttons button').forEach(button => {
            button.disabled = false;
        });
        slipContentEl.innerHTML = `<p>Selecciona una cuota.</p>`;
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

    function listenForLiveMatch() {
        db.collection('liveMatch').doc('current').onSnapshot(doc => {
            streamContainerEl.innerHTML = '';
            matchesContainerEl.innerHTML = '';
            currentBet = null;
            updateBetSlip();
            if (countdownInterval) clearInterval(countdownInterval);

            if (doc.exists && doc.data().status === 'live') {
                const data = doc.data();
                if (data.streamUrl) {
                    const channelName = getChannelFromUrl(data.streamUrl);
                    if (channelName) {
                        streamContainerEl.innerHTML = `<iframe src="https://player.kick.com/${channelName}" style="border:none; width:100%; height:400px;" allowfullscreen="true" scrolling="no"></iframe>`;
                    }
                }
                createMatchElement(data.odds || {});
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

    function handleOddClick(e) {
        const target = e.target.closest('button');
        if (!target || !target.closest('.odds-buttons') || target.disabled) return;

        if (target.classList.contains('selected')) {
            target.classList.remove('selected');
            currentBet = null;
        } else {
            document.querySelectorAll('.odds-buttons button').forEach(btn => btn.classList.remove('selected'));
            target.classList.add('selected');
            currentBet = {
                teams: `${SINGLE_MATCH.home} vs ${SINGLE_MATCH.away}`,
                selection: target.dataset.selection,
                odd: parseFloat(target.dataset.value),
                type: target.dataset.type
            };
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
            const amount = parseFloat(betAmountInput.value) || 0;
            const isAmountValid = amount > 0 && amount <= balance;
            placeBetBtn.disabled = !isAmountValid;
            document.getElementById('potential-winnings').textContent = `S/ ${(amount * currentBet.odd).toFixed(2)}`;
        });
    }

    async function placeBet() {
        const amount = parseFloat(document.getElementById('bet-amount').value);
        if (!amount || !currentBet || amount <= 0 || amount > balance) {
            alert("Monto inválido o saldo insuficiente.");
            return;
        }
        try {
            await db.collection('liveBets').add({
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                amount: amount,
                odd: currentBet.odd,
                selection: currentBet.selection,
                type: currentBet.type,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            const newBalance = balance - amount;
            await db.collection('users').doc(currentUser.uid).update({ balance: newBalance });
            alert(`Apuesta realizada por S/ ${amount.toFixed(2)}.`);
            currentBet = null;
            document.querySelectorAll('.odds-buttons button.selected').forEach(btn => btn.classList.remove('selected'));
            updateBetSlip();
        } catch (error) {
            console.error("Error al realizar la apuesta:", error);
            alert("Hubo un problema al registrar tu apuesta.");
        }
    }

    function getChannelFromUrl(url) {
      try { const path = new URL(url).pathname; return path.split('/').pop(); }
      catch(e) { return null; }
    }

    document.body.addEventListener('click', e => {
        if(e.target.closest('.odds-buttons')) {
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