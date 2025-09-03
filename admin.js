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
    const streamUrlInput = document.getElementById('stream-url');
    const updateStreamBtn = document.getElementById('update-stream-btn');
    const stopStreamBtn = document.getElementById('stop-stream-btn');
    const searchInput = document.getElementById('search-user-id');
    const searchBtn = document.getElementById('search-btn');
    const userInfo = document.getElementById('user-info');
    const userNameInfo = document.getElementById('user-name-info');
    const userBalanceInfo = document.getElementById('user-balance-info');
    const depositAmountAdmin = document.getElementById('deposit-amount-admin');
    const creditBtn = document.getElementById('credit-btn');
    const liveBetsList = document.getElementById('live-bets-list');
    const toastNotification = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');

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
            // Lógica para la notificación pop-up
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    if (liveBetsList.children.length > 0 && liveBetsList.firstChild.textContent !== 'Aún no se han realizado apuestas.') {
                        const bet = change.doc.data();
                        toastMessage.innerHTML = `<strong>${bet.userName}</strong> apostó a "${bet.selection}"`;
                        toastNotification.classList.add('show');
                        setTimeout(() => {
                            toastNotification.classList.remove('show');
                        }, 5000);
                    }
                }
            });

            // Lógica para mostrar la lista de apuestas
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
            alert("Por favor, ingresa la URL de tu canal de Twitch.");
            return;
        }
        liveMatchRef.set({
            streamUrl: url,
            status: 'live'
        }, { merge: true }).then(() => {
            alert("¡Transmisión iniciada/actualizada para todos los usuarios!");
        }).catch(error => console.error("Error al actualizar la transmisión:", error));
    });

    // Finalizar la transmisión
    stopStreamBtn.addEventListener('click', () => {
        liveMatchRef.update({
            streamUrl: null,
            status: 'finished'
        }).then(() => {
            alert("¡Transmisión finalizada para todos los usuarios!");
        }).catch(error => console.error("Error al finalizar la transmisión:", error));
    });
    
    // Buscar un usuario por su ID
    searchBtn.addEventListener('click', async () => {
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
            alert("Ocurrió un error al buscar. Revisa las reglas de seguridad y la consola.");
        }
    });

    // Acreditar saldo a un usuario
    creditBtn.addEventListener('click', async () => {
        if (!searchedUser) {
            alert("Primero busca y encuentra un usuario válido.");
            return;
        }
        const amount = parseFloat(depositAmountAdmin.value);
        if (isNaN(amount) || amount <= 0) {
            alert("Monto inválido. Ingresa un número positivo.");
            return;
        }
        const currentBalance = searchedUser.balance || 0;
        const newBalance = currentBalance + amount;
        const userDocRef = db.collection('users').doc(searchedUser.id);
        try {
            await userDocRef.update({ balance: newBalance });
            alert(`¡Saldo acreditado! Nuevo saldo para el usuario es S/ ${newBalance.toFixed(2)}`);
            userBalanceInfo.textContent = newBalance.toFixed(2);
            searchedUser.balance = newBalance;
            depositAmountAdmin.value = '';
        } catch (error) {
            console.error("Error al acreditar saldo:", error);
            alert("Hubo un error al actualizar el saldo.");
        }
    });
});