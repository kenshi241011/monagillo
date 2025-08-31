// Espera a que el contenido del HTML esté listo
document.addEventListener('DOMContentLoaded', () => {
    // PEGA AQUÍ EL OBJETO firebaseConfig QUE COPIASTE DE TU CONSOLA
    const firebaseConfig = {
      apiKey: "AIzaSyCFfeidxVBVMgDyKdBc3qq9sqs-Ht6CLLM",
      authDomain: "simulador-apuestas-uni.firebaseapp.com",
      projectId: "simulador-apuestas-uni",
      storageBucket: "simulador-apuestas-uni.firebasestorage.app",
      messagingSenderId: "1089950371477",
      appId: "1:1089950371477:web:3e7fdc7fa16ad8e5c6559c"
    };

    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // Lógica para el botón de login con Google
    const googleLoginBtn = document.getElementById('google-login-btn');

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            
            // --- LÍNEA AÑADIDA PARA MEJORAR COMPATIBILIDAD ---
            auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
              .then(() => {
                // Ahora que la persistencia está configurada, iniciamos sesión con el popup
                return auth.signInWithPopup(provider);
              })
              .then((result) => {
                console.log('Usuario logueado con Google:', result.user);
                window.location.href = 'index.html'; // Redirige al panel principal
              })
              .catch((error) => {
                console.error('Error de inicio de sesión con Google:', error);
                alert('Hubo un error al intentar iniciar sesión: ' + error.message);
              });
        });
    }
});