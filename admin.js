document.addEventListener('DOMContentLoaded', () => {
    // ▼▼ ASEGÚRATE DE QUE TU CONFIGURACIÓN DE FIREBASE ESTÉ PEGADA AQUÍ ▼▼
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
    let adminUser = null;
    let searchedUser = null;

    // --- ELEMENTOS DEL DOM ---
    const adminContent = document.getElementById('admin-content');
    const statusMessage = document.getElementById('status-message');
    // Controles del Stream
    const streamUrlInput = document.getElementById('stream-url');
    const updateStreamBtn = document.getElementById('update-stream-btn');
    const stopStreamBtn = document.getElementById('stop-stream-btn');
    // Feed de Apuestas
    const liveBetsList = document.getElementById('live-bets-list');
    const toastNotification = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    // Pago Automático
    const settleBetsBtn = document.getElementById('settle-bets-btn');
    const winnerSelector = document.getElementById('winner-selector');
    // Búsqueda Manual de Usuario
    const searchInput = document.getElementById('search-user-id');
    const searchBtn = document.getElementById('search-btn');
    const userInfo = document.getElementById('user-info');
    const userNameInfo = document.getElementById('user-name-info');
    const userBalanceInfo = document.getElementById('user-balance-info');
    const depositAmountAdmin = document.getElementById('deposit-amount-admin');
    const creditBtn = document.getElementById('credit-btn');

    // --- REFERENCIA AL DOCUMENTO DEL PARTIDO EN VIVO ---
    const liveMatchRef = db.collection('liveMatch').doc('current');

    // --- GESTIÓN DE AUTENTICACIÓN Y PERMISOS DE ADMIN ---
    auth.onAuthStateChanged(user => {
        if (user) {
            adminUser = user;
            const userDocRef = db.collection('users').doc(user.uid);
            userDocRef.get().then(doc => {
                if (doc.exists && doc.data().role === 'admin') {
                    statusMessage.classList.add('hidden');
                    adminContent.classList.remove('hidden');
                    listenForLiveBets();
                } else {
                    statusMessage.textContent = "Acceso denegado. No eres administrador.";
                    alert("Acceso denegado. Serás redirigido a la página principal.");
                    window.location.href = 'index.html';
                }
            }).catch(error => {
                console.error("Error verificando permisos de admin:", error);
                statusMessage.textContent = "Error al verificar permisos.";
            });
        } else {
            window.location.href = 'login.html';
        }
    });

    // --- FUNCIÓN DE ESCUCHA DE APUESTAS EN TIEMPO REAL ---
    function listenForLiveBets() {
        const betsRef = db.collection('liveBets').orderBy('timestamp', 'desc');
        betsRef.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    if (liveBetsList.children.length === 0 || liveBetsList.firstChild.textContent !== 'Aún no se han realizado apuestas.') {
                        const bet = change.doc.data();
                        toastMessage.innerHTML = `<strong>${bet.userName}</strong> apostó a "${bet.selection}"`;
                        toastNotification.classList.add('show');
                        setTimeout(() => {
                            toastNotification.classList.remove('show');
                        }, 5000);
                    }
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
                    <small>${bet.timestamp.toDate().toLocaleTimeString()}</small>
                `;
                liveBetsList.appendChild(li);
            });
        }, error => {
            console.error("Error al escuchar apuestas en vivo:", error);
            liveBetsList.innerHTML = '<li>Error al cargar las apuestas.</li>';
        });
    }

    // --- LÓGICA DE LOS BOTONES DEL PANEL ---

    // Iniciar o actualizar la transmisión
    updateStreamBtn.addEventListener('click', () => {
        const url = streamUrlInput.value.trim();
        if (!url) {
            alert("Por favor, ingresa la URL de tu canal.");
            return;
        }
        liveMatchRef.set({
            streamUrl: url,
            status: 'live'
        }, { merge: true }).then(() => {
            alert("¡Transmisión iniciada/actualizada!");
        }).catch(error => console.error("Error al actualizar la transmisión:", error));
    });

    // Finalizar la transmisión (sin pagar)
    stopStreamBtn.addEventListener('click', () => {
        liveMatchRef.update({
            streamUrl: null,
            status: 'finished'
        }).then(() => {
            alert("¡Transmisión finalizada!");
        }).catch(error => console.error("Error al finalizar la transmisión:", error));
    });

    // Pagar apuestas automáticamente (LÓGICA CORREGIDA)
    settleBetsBtn.addEventListener('click', async () => {
        const winner = winnerSelector.value;
        if (!winner) {
            alert("Por favor, selecciona un resultado final para el partido.");
            return;
        }
        const confirmation = confirm(`¿Estás seguro de que el resultado es "${winnerSelector.options[winnerSelector.selectedIndex].text}"? Esta acción pagará las apuestas y no se puede deshacer.`);
        if (!confirmation) return;

        try {
            // 1. Guardar el resultado final en el documento del partido
            await liveMatchRef.update({
                status: 'finished',
                winner: winner
            });

            // 2. Obtener todas las apuestas pendientes de la colección 'liveBets'
            const betsSnapshot = await db.collection('liveBets').get();
            if (betsSnapshot.empty) {
                alert("No hay apuestas pendientes para pagar.");
                return;
            }

            // 3. Preparar un lote para pagar a los ganadores y borrar las apuestas
            const batch = db.batch();
            let winnersCount = 0;
            let totalPaid = 0;

            betsSnapshot.forEach(doc => {
                const bet = doc.data();
                const userDocRef = db.collection('users').doc(bet.userId);

                // Comprobar si la apuesta es ganadora
                if (bet.type === winner) {
                    const winnings = bet.amount * bet.odd;
                    // Preparamos la actualización del saldo del ganador
                    batch.update(userDocRef, { balance: firebase.firestore.FieldValue.increment(winnings) });
                    winnersCount++;
                    totalPaid += winnings;
                }
                // Preparamos la eliminación de la apuesta de 'liveBets', sea ganadora o no
                batch.delete(doc.ref);
            });

            // 4. Ejecutar todas las operaciones a la vez
            await batch.commit();

            alert(`¡Proceso completado!\n- Se pagaron ${winnersCount} apuestas ganadoras.\n- Monto total pagado: S/ ${totalPaid.toFixed(2)}\n- Se limpió el historial de apuestas en vivo.`);

        } catch (error) {
            console.error("Error al pagar las apuestas:", error);
            alert("Ocurrió un error durante el pago automático. Revisa la consola y las reglas de seguridad de Firestore.");
        }
    });
    
    // Buscar un usuario por su ID
    searchBtn.addEventListener('click', async () => { /* (Sin cambios) */ });

    // Acreditar saldo a un usuario
    creditBtn.addEventListener('click', async () => { /* (Sin cambios) */ });

    // --- Bloques de código sin cambios (copiados para que esté completo) ---
    async function searchUser() {
        const userIdToFind = searchInput.value.trim();
        if (!userIdToFind) {
            alert("Por favor, ingresa un ID de usuario.");
            return;
        }
        userInfo.classList.add('hidden');
        searchedUser = null;
        const userDocRef = db.collection('users').doc(userIdToFind);
        try {
            const doc = await userDocRef.get();
            if (doc.exists) {
                searchedUser = { id: doc.id, ...doc.data() };
                userNameInfo.textContent = searchedUser.id;
                userBalanceInfo.textContent = (searchedUser.balance || 0).toFixed(2);
                userInfo.classList.remove('hidden');
            } else {
                alert("Usuario no encontrado.");
            }
        } catch (error) {
            console.error("Error al buscar usuario:", error);
            alert("Ocurrió un error al buscar.");
        }
    }
    searchBtn.addEventListener('click', searchUser);

    async function creditBalance() {
        if (!searchedUser) {
            alert("Primero busca y encuentra un usuario válido.");
            return;
        }
        const amount = parseFloat(depositAmountAdmin.value);
        if (isNaN(amount) || amount <= 0) {
            alert("Monto inválido.");
            return;
        }
        const currentBalance = searchedUser.balance || 0;
        const newBalance = currentBalance + amount;
        const userDocRef = db.collection('users').doc(searchedUser.id);
        try {
            await userDocRef.update({ balance: newBalance });
            alert(`¡Saldo acreditado! Nuevo saldo es S/ ${newBalance.toFixed(2)}`);
            userBalanceInfo.textContent = newBalance.toFixed(2);
            searchedUser.balance = newBalance;
            depositAmountAdmin.value = '';
        } catch (error) {
            console.error("Error al acreditar saldo:", error);
            alert("Hubo un error al actualizar el saldo.");
        }
    }
    creditBtn.addEventListener('click', creditBalance);
});