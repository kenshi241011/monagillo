document.addEventListener('DOMContentLoaded', () => {
    // ▼▼ ASEGÚRATE DE QUE TU CONFIGURACIÓN ESTÉ PEGADA AQUÍ ▼▼
   const firebaseConfig = {
  apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
  authDomain: "simulador-apuestas-uni.firebaseapp.com",
  projectId: "simulador-apuestas-uni",
  storageBucket: "simulador-apuestas-uni.firebasestorage.app",
  messagingSenderId: "1089950371477",
  appId: "1:1089950371477:web:3e7fdc7fa16ad8e5c6559c"
};

    // ▲▲ ---------------------------------------------------- ▲▲

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let adminUser = null;
    let searchedUser = null;

    // Elementos del DOM
    const adminContent = document.getElementById('admin-content');
    const loadingMsg = document.getElementById('loading-msg');
    const searchInput = document.getElementById('search-user-id');
    const searchBtn = document.getElementById('search-btn');
    const userInfo = document.getElementById('user-info');
    const userNameInfo = document.getElementById('user-name-info');
    const userBalanceInfo = document.getElementById('user-balance-info');
    const depositAmountAdmin = document.getElementById('deposit-amount-admin');
    const creditBtn = document.getElementById('credit-btn');

    // Verificar si el usuario es admin
    auth.onAuthStateChanged(user => {
        if (user) {
            adminUser = user;
            const userDocRef = db.collection('users').doc(user.uid);
            userDocRef.get().then(doc => {
                if (doc.exists && doc.data().role === 'admin') {
                    loadingMsg.classList.add('hidden');
                    adminContent.classList.remove('hidden');
                } else {
                    alert("Acceso denegado. No eres administrador.");
                    window.location.href = 'index.html';
                }
            }).catch(error => {
                console.error("Error verificando permisos de admin:", error);
                loadingMsg.textContent = "Error al verificar permisos.";
            });
        } else {
            window.location.href = 'login.html';
        }
    });

    // Lógica de búsqueda
    searchBtn.addEventListener('click', async () => {
        const userIdToFind = searchInput.value.trim();
        if (!userIdToFind) {
            alert("Por favor, ingresa un ID de usuario.");
            return;
        }

        // Ocultar información anterior antes de una nueva búsqueda
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

    // Lógica para acreditar saldo
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
            // Actualizar la UI del admin en tiempo real
            userBalanceInfo.textContent = newBalance.toFixed(2);
            searchedUser.balance = newBalance;
            depositAmountAdmin.value = '';
        } catch (error) {
            console.error("Error al acreditar saldo:", error);
            alert("Hubo un error al actualizar el saldo.");
        }
    });
});