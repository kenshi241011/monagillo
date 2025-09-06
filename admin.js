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

    // --- ELEMENTOS DEL DOM ---
    const adminContent = document.getElementById('admin-content');
    const statusMessage = document.getElementById('status-message');
    const updateStreamBtn = document.getElementById('update-stream-btn');
    const stopStreamBtn = document.getElementById('stop-stream-btn');
    const openBetsBtn = document.getElementById('open-bets-btn');
    const closeBetsBtn = document.getElementById('close-bets-btn');
    const settleBetsBtn = document.getElementById('settle-bets-btn');
    const winnerSelector = document.getElementById('winner-selector');
    const liveBetsList = document.getElementById('live-bets-list');
    // ... (otros elementos que no cambian)

    auth.onAuthStateChanged(user => {
        if (user) {
            db.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists && doc.data().role === 'admin') {
                    statusMessage.classList.add('hidden');
                    adminContent.classList.remove('hidden');
                    listenForLiveBets();
                } else {
                    window.location.href = 'index.html';
                }
            });
        } else {
            window.location.href = 'login.html';
        }
    });

    // Iniciar o actualizar la transmisión
    updateStreamBtn.addEventListener('click', () => {
        const url = document.getElementById('stream-url').value.trim();
        const odds = {
            '1': parseFloat(document.getElementById('odds-1').value) || 0,
            'X': parseFloat(document.getElementById('odds-X').value) || 0,
            '2': parseFloat(document.getElementById('odds-2').value) || 0,
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
    
    // Pagar apuestas (LÓGICA SIMPLIFICADA)
    settleBetsBtn.addEventListener('click', async () => {
        const mainWinner = winnerSelector.value;
        if (!mainWinner) {
            alert("Por favor, selecciona un resultado final para el partido.");
            return;
        }
        if (!confirm(`¿Estás seguro de que el resultado es el correcto?`)) return;

        try {
            await liveMatchRef.update({ status: 'finished', betting_status: 'closed' });
            const betsSnapshot = await db.collection('liveBets').get();
            if (betsSnapshot.empty) {
                alert("No hay apuestas pendientes para pagar.");
                return;
            }

            const batch = db.batch();
            let winnersCount = 0;
            let totalPaid = 0;

            betsSnapshot.forEach(doc => {
                const bet = doc.data();
                // Lógica de pago simple
                if (bet.type === mainWinner) {
                    const winnings = bet.amount * bet.odd;
                    batch.update(db.collection('users').doc(bet.userId), { 
                        balance: firebase.firestore.FieldValue.increment(winnings) 
                    });
                    winnersCount++;
                    totalPaid += winnings;
                }
                batch.delete(doc.ref);
            });

            await batch.commit();
            alert(`¡Proceso completado!\n- Se pagaron ${winnersCount} apuestas ganadoras.\n- Monto total pagado: S/ ${totalPaid.toFixed(2)}`);
        } catch (error) {
            console.error("Error al pagar las apuestas:", error);
            alert("Ocurrió un error durante el pago automático.");
        }
    });

    // El resto de funciones (abrir/cerrar apuestas, finalizar stream, buscar/acreditar usuario, etc.)
    // se mantienen como estaban en la versión anterior.
    
    // --- CÓDIGO RESTANTE (SIN CAMBIOS) ---
    function listenForLiveBets() {
        db.collection('liveBets').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
            const liveBetsList = document.getElementById('live-bets-list');
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
    
    // Lógica para buscar y acreditar saldo (sin cambios)
    const searchBtn = document.getElementById('search-btn');
    searchBtn.addEventListener('click', async () => {
        const searchInput = document.getElementById('search-user-id');
        const userIdToFind = searchInput.value.trim();
        if (!userIdToFind) return alert("Ingresa un ID.");
        
        try {
            const doc = await db.collection('users').doc(userIdToFind).get();
            if (doc.exists) {
                const user = { id: doc.id, ...doc.data() };
                document.getElementById('user-name-info').textContent = user.displayName || user.id;
                document.getElementById('user-balance-info').textContent = (user.balance || 0).toFixed(2);
                document.getElementById('user-info').classList.remove('hidden');
                
                const creditBtn = document.getElementById('credit-btn');
                creditBtn.onclick = async () => {
                    const amount = parseFloat(document.getElementById('deposit-amount-admin').value);
                    if (isNaN(amount) || amount <= 0) return alert("Monto inválido.");
                    await db.collection('users').doc(user.id).update({ 
                        balance: firebase.firestore.FieldValue.increment(amount) 
                    });
                    alert('Saldo acreditado.');
                    searchBtn.click(); // Recargar datos
                };
            } else {
                alert("Usuario no encontrado.");
            }
        } catch (error) {
            console.error("Error al buscar usuario:", error);
        }
    });
});