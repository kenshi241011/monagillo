document.addEventListener('DOMContentLoaded', () => {
    // ▼▼ CONFIGURACIÓN DE FIREBASE ▼▼
    const firebaseConfig = {
      apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
      authDomain: "simulador-apuestas-uni.firebaseapp.com",
      projectId: "simulador-apuestas-uni",
      storageBucket: "simulador-apuestas-uni.firebasestorage.app",
      messagingSenderId: "1089950371477",
      appId: "1:1089950371477:web:3e7fdc7fa16ad8e5c6559c"
    };
 
    // --- INICIALIZACIÓN ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const liveMatchRef = db.collection('liveMatch').doc('current');
    let searchedUser = null;

    // --- ELEMENTOS DEL DOM ---
    const adminContent = document.getElementById('admin-content');
    const statusMessage = document.getElementById('status-message');
    const updateStreamBtn = document.getElementById('update-stream-btn');
    const stopStreamBtn = document.getElementById('stop-stream-btn');
    const openBetsBtn = document.getElementById('open-bets-btn');
    const closeBetsBtn = document.getElementById('close-bets-btn');
    const settleBetsBtn = document.getElementById('settle-bets-btn');
    const winnerSelector = document.getElementById('winner-selector');
    const bttsSelector = document.getElementById('btts-selector');
    const liveBetsList = document.getElementById('live-bets-list');
    const toastNotification = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    const searchInput = document.getElementById('search-user-id');
    const searchBtn = document.getElementById('search-btn');
    const userInfo = document.getElementById('user-info');
    const userNameInfo = document.getElementById('user-name-info');
    const userBalanceInfo = document.getElementById('user-balance-info');
    const depositAmountAdmin = document.getElementById('deposit-amount-admin');
    const creditBtn = document.getElementById('credit-btn');

    // --- GESTIÓN DE AUTENTICACIÓN Y PERMISOS DE ADMIN ---
    auth.onAuthStateChanged(user => {
        if (user) {
            db.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists && doc.data().role === 'admin') {
                    statusMessage.classList.add('hidden');
                    adminContent.classList.remove('hidden');
                    listenForLiveBets();
                } else {
                    alert("Acceso denegado. Serás redirigido a la página principal.");
                    window.location.href = 'index.html';
                }
            });
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- LÓGICA DE CONTROL DEL PARTIDO ---
    updateStreamBtn.addEventListener('click', () => {
        const url = document.getElementById('stream-url').value.trim();
        const odds = {
            '1': parseFloat(document.getElementById('odds-1').value) || 0,
            'X': parseFloat(document.getElementById('odds-X').value) || 0,
            '2': parseFloat(document.getElementById('odds-2').value) || 0,
            'btts_yes': parseFloat(document.getElementById('odds-btts-yes').value) || 0,
            'btts_no': parseFloat(document.getElementById('odds-btts-no').value) || 0,
        };
        if (!url) {
            alert("Por favor, ingresa la URL de tu canal.");
            return;
        }
        liveMatchRef.set({
            streamUrl: url,
            status: 'live',
            odds: odds,
            betting_status: 'open'
        }, { merge: true }).then(() => {
            alert("¡Transmisión iniciada y apuestas abiertas!");
        });
    });
    
    openBetsBtn.addEventListener('click', () => {
        liveMatchRef.update({ betting_status: 'open' }).then(() => alert("Se han abierto las apuestas."));
    });

    closeBetsBtn.addEventListener('click', () => {
        liveMatchRef.update({ betting_status: 'closed' }).then(() => alert("Se han cerrado las apuestas."));
    });

    stopStreamBtn.addEventListener('click', () => {
        liveMatchRef.update({
            streamUrl: null,
            status: 'finished',
            betting_status: 'closed'
        }).then(() => alert("¡Transmisión finalizada!"));
    });

    // --- LÓGICA DE PAGO DE APUESTAS (PARA COMBINADAS) ---
    settleBetsBtn.addEventListener('click', async () => {
        const mainWinner = winnerSelector.value;
        const bttsWinner = bttsSelector.value;

        if (!mainWinner || !bttsWinner) {
            alert("Por favor, selecciona un resultado para AMBOS mercados.");
            return;
        }
        if (!confirm(`¿Estás seguro de los resultados? Esta acción es irreversible.`)) return;

        try {
            await liveMatchRef.update({ status: 'finished', betting_status: 'closed' });
            const betsSnapshot = await db.collection('liveBets').get();
            if (betsSnapshot.empty) {
                alert("No hay apuestas pendientes para pagar.");
                return;
            }

            let winnersCount = 0;
            let totalPaid = 0;
            const userHistoryUpdates = {};

            betsSnapshot.forEach(doc => {
                const bet = doc.data();
                const isWinner = bet.selections.every(sel => {
                    if (sel.market === 'main_result') return sel.type === mainWinner;
                    if (sel.market === 'btts') return sel.type === bttsWinner;
                    return false;
                });

                if (!userHistoryUpdates[bet.userId]) {
                    userHistoryUpdates[bet.userId] = { history: [], winnings: 0 };
                }

                userHistoryUpdates[bet.userId].history.push({ 
                    betId: bet.betId, 
                    newStatus: isWinner ? 'Ganada' : 'Perdida' 
                });
                
                if (isWinner) {
                    const winnings = bet.amount * bet.odd;
                    userHistoryUpdates[bet.userId].winnings += winnings;
                    winnersCount++;
                    totalPaid += winnings;
                }
            });

            const batch = db.batch();

            for (const userId in userHistoryUpdates) {
                const userDocRef = db.collection('users').doc(userId);
                const userDoc = await userDocRef.get();
                if (!userDoc.exists) continue;

                let currentHistory = userDoc.data().history || [];
                userHistoryUpdates[userId].history.forEach(update => {
                    const betIndex = currentHistory.findIndex(h => h.betId === update.betId);
                    if (betIndex > -1) {
                        currentHistory[betIndex].status = update.newStatus;
                    }
                });

                batch.update(userDocRef, {
                    history: currentHistory,
                    balance: firebase.firestore.FieldValue.increment(userHistoryUpdates[userId].winnings)
                });
            }
            
            betsSnapshot.forEach(doc => batch.delete(doc.ref));

            await batch.commit();
            alert(`¡Proceso completado!\n- Se actualizaron los historiales.\n- Se pagaron ${winnersCount} apuestas ganadoras.\n- Monto total pagado: S/ ${totalPaid.toFixed(2)}`);

        } catch (error) {
            console.error("Error al pagar las apuestas:", error);
            alert("Ocurrió un error durante el pago automático.");
        }
    });

    // --- FUNCIONES ADICIONALES ---
    function listenForLiveBets() {
        db.collection('liveBets').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added' && liveBetsList.children.length > 0 && liveBetsList.children[0].textContent !== 'Aún no se han realizado apuestas.') {
                    const bet = change.doc.data();
                    toastMessage.innerHTML = `<strong>${bet.userName}</strong> apostó S/ ${bet.amount.toFixed(2)}`;
                    toastNotification.classList.add('show');
                    setTimeout(() => toastNotification.classList.remove('show'), 5000);
                }
            });

            liveBetsList.innerHTML = '';
            if (snapshot.empty) {
                liveBetsList.innerHTML = '<li>Aún no se han realizado apuestas.</li>';
                return;
            }
            snapshot.forEach(doc => {
                const bet = doc.data();
                const li = document.createElement('li');
                li.innerHTML = `
                    <div>
                        <span class="bet-user">${bet.userName}</span>
                        <span class="bet-details">apostó S/ ${bet.amount.toFixed(2)} a "${bet.selection}"</span>
                    </div>
                    <small>${bet.timestamp?.toDate().toLocaleTimeString() || 'ahora'}</small>
                `;
                liveBetsList.appendChild(li);
            });
        });
    }
    
    async function searchUser() {
        const userIdToFind = searchInput.value.trim();
        if (!userIdToFind) return alert("Ingresa un ID.");
        userInfo.classList.add('hidden');
        searchedUser = null;
        try {
            const doc = await db.collection('users').doc(userIdToFind).get();
            if (doc.exists) {
                searchedUser = { id: doc.id, ...doc.data() };
                userNameInfo.textContent = searchedUser.displayName || doc.id;
                userBalanceInfo.textContent = (searchedUser.balance || 0).toFixed(2);
                userInfo.classList.remove('hidden');
            } else {
                alert("Usuario no encontrado.");
            }
        } catch (error) {
            console.error("Error al buscar usuario:", error);
        }
    }
    searchBtn.addEventListener('click', searchUser);

    async function creditBalance() {
        if (!searchedUser) return alert("Primero busca un usuario.");
        const amount = parseFloat(depositAmountAdmin.value);
        if (isNaN(amount) || amount <= 0) return alert("Monto inválido.");
        try {
            await db.collection('users').doc(searchedUser.id).update({ 
                balance: firebase.firestore.FieldValue.increment(amount) 
            });
            const newBalance = (searchedUser.balance || 0) + amount;
            alert(`¡Saldo acreditado! Nuevo saldo para ${searchedUser.displayName || 'el usuario'} es S/ ${newBalance.toFixed(2)}`);
            userBalanceInfo.textContent = newBalance.toFixed(2);
            searchedUser.balance = newBalance;
            depositAmountAdmin.value = '';
        } catch (error) {
            console.error("Error al acreditar saldo:", error);
        }
    }
    creditBtn.addEventListener('click', creditBalance);
});