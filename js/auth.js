import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const messageBox = document.getElementById('messageBox');

// Helper to show messages
function showMessage(msg, isError = false) {
    messageBox.textContent = msg;
    messageBox.className = 'message-box ' + (isError ? 'message-error' : 'message-success');
    messageBox.style.display = 'block';
}

// Redirect based on role
async function redirectUserBasedOnRole(uid) {
    try {
        const userDocRef = doc(db, "users", uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const role = userData.role;
            const status = userData.status || 'active';

            if (status === 'suspended') {
                showMessage("Your account has been suspended. Please contact the administration.", true);
                auth.signOut();
                if(loginBtn) loginBtn.classList.remove('loading');
                return;
            }
            
            if (role === 'principal') {
                window.location.href = 'principal.html';
            } else if (role === 'teacher') {
                window.location.href = 'teacher.html';
            } else if (role === 'student') {
                window.location.href = 'student.html';
            } else if (role === 'accountant') {
                window.location.href = 'accountant.html';
            } else {
                showMessage("Role not assigned to this account. Contact admin.", true);
                auth.signOut();
                if(loginBtn) loginBtn.classList.remove('loading');
            }
        } else {
            showMessage("User data not found in database.", true);
            auth.signOut();
            loginBtn.classList.remove('loading');
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        showMessage("Error getting user details: " + error.message, true);
        auth.signOut();
        loginBtn.classList.remove('loading');
    }
}

// Check if already logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in, check role and redirect
        redirectUserBasedOnRole(user.uid);
    }
});

// Handle Login Form Submit
if(loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if(!email || !password) {
            showMessage("Please enter both email and password.", true);
            return;
        }

        loginBtn.classList.add('loading');
        messageBox.style.display = 'none';

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await redirectUserBasedOnRole(user.uid);
        } catch (error) {
            console.error("Login Error:", error);
            let errorMsg = "Login failed. Please check your credentials.";
            if (error.code === 'auth/invalid-credential') {
                errorMsg = "Invalid email or password.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg = "Too many failed login attempts. Try again later.";
            }
            showMessage(errorMsg, true);
            loginBtn.classList.remove('loading');
        }
    });
}
