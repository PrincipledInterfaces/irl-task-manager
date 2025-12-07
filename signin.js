import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { getPageUrl } from './utils.js';
import { initialize as initializeWhenIWork, getUser as searchWhenIWorkUser } from './wheniwork.js';

document.getElementById("signup").hidden = true; //Hides signup form initially

let wiwInitialized = false;
let selectedWiwUser = null;

//listner for showing signup form
document.getElementById("showSignup").addEventListener("click", async function() {
    document.getElementById("signup").hidden = false;
    document.getElementById("login").hidden = true;

    // Initialize WhenIWork when signup is shown (for searching users)
    if (!wiwInitialized) {
        console.log('[Signup] Initializing WhenIWork for user search...');
        try {
            await initializeWhenIWork();
            wiwInitialized = true;
            console.log('[Signup] WhenIWork initialized');
        } catch (error) {
            console.error('[Signup] Failed to initialize WhenIWork:', error);
        }
    }
});

//listner for showing login form
document.getElementById("showLogin").addEventListener("click", function() {
    document.getElementById("signup").hidden = true;
    document.getElementById("login").hidden = false;
});

//listener for forgot password
document.getElementById("forgotPassword").addEventListener("click", async function(e) {
    e.preventDefault();
    const email = prompt("Enter your email address to reset your password:");
    if (email) {
        await handlePasswordReset(email);
    }
});

//gray out sign in / up buttons when fields are empty
const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");

document.getElementById("loginEmail").addEventListener("input", toggleLoginButton);
document.getElementById("loginPassword").addEventListener("input", toggleLoginButton);
document.getElementById("signupEmail").addEventListener("input", toggleSignupButton);
document.getElementById("signupPassword").addEventListener("input", toggleSignupButton);
document.getElementById("signupFullName").addEventListener("input", toggleSignupButton);
document.getElementById("wiwUserSearch").addEventListener("input", handleWiwSearch);

function toggleLoginButton() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    loginButton.disabled = !(email && password);
}

function toggleSignupButton() {
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const fullName = document.getElementById("signupFullName").value;
    const wiwUserId = document.getElementById("selectedWiwUserId").value;
    signupButton.disabled = !(email && password && fullName && wiwUserId);
}

// Search WhenIWork users as user types
async function handleWiwSearch() {
    const searchQuery = document.getElementById("wiwUserSearch").value.trim();
    const resultsDiv = document.getElementById("wiwSearchResults");

    if (!searchQuery) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
        return;
    }

    if (!wiwInitialized) {
        resultsDiv.innerHTML = '<p style="padding: 5px;">Initializing...</p>';
        resultsDiv.style.display = 'block';
        return;
    }

    try {
        const results = searchWhenIWorkUser(searchQuery);

        if (!results || results.length === 0) {
            resultsDiv.innerHTML = '<p style="padding: 5px; color: #888;">No users found</p>';
            resultsDiv.style.display = 'block';
            return;
        }

        resultsDiv.innerHTML = results.map(user =>
            `<div class="wiw-result" data-user-id="${user.id}" data-user-name="${user.first_name} ${user.last_name}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;">
                ${user.first_name} ${user.last_name} (${user.email || 'no email'})
            </div>`
        ).join('');

        // Add click listeners to results
        resultsDiv.querySelectorAll('.wiw-result').forEach(div => {
            div.addEventListener('click', () => {
                const userId = div.getAttribute('data-user-id');
                const userName = div.getAttribute('data-user-name');
                selectWiwUser(userId, userName);
            });
        });

        resultsDiv.style.display = 'block';
    } catch (error) {
        console.error('[Signup] Error searching WhenIWork users:', error);
        resultsDiv.innerHTML = '<p style="padding: 5px; color: red;">Error searching users</p>';
        resultsDiv.style.display = 'block';
    }
}

// Select a WhenIWork user from search results
function selectWiwUser(userId, userName) {
    selectedWiwUser = { id: userId, name: userName };
    document.getElementById("selectedWiwUserId").value = userId;
    document.getElementById("wiwUserSearch").value = userName;
    document.getElementById("wiwSearchResults").style.display = 'none';
    toggleSignupButton(); // Re-check if signup button should be enabled
    console.log('[Signup] Selected WhenIWork user:', userName, 'ID:', userId);
}

//listener for login / signup button
loginButton.addEventListener("click", async function() {
    console.log("Login button clicked");
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    console.log("Attempting login with email:", email);
    await login(email, password);
});

signupButton.addEventListener("click", async function() {
    console.log("Signup button clicked");
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const fullName = document.getElementById("signupFullName").value;
    const wiwUserId = document.getElementById("selectedWiwUserId").value;
    console.log("Attempting signup with email:", email, "name:", fullName, "WIW ID:", wiwUserId);
    await createAccount(email, password, fullName, wiwUserId);
});

async function createAccount(email, password, fullName, wiwUserId) {
    try {
        console.log("Step 1: Creating Firebase Auth account...");
        // STEP 1: Create auth account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        console.log("Auth account created with UID:", userId);

        console.log("Step 2: Creating Firestore user document...");
        // STEP 2: Create Firestore document with full name and other data
        await setDoc(doc(db, "users", userId), {
            email: email,
            fullName: fullName,
            role: "user",  // Default to user, managers set manually in Firebase Console
            assignedJobIds: [],
            allowedHours: 25,
            wiwUserId: parseInt(wiwUserId)  // Store WhenIWork user ID
        });
        console.log("Firestore document created successfully with WIW ID:", wiwUserId);

        console.log("Account created successfully!");
        alert("Account created successfully! Please sign in.");

        // Redirect to signin page after successful signup
        window.location.href = getPageUrl("staff");
    } catch (error) {
        console.error("Error creating account:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        alert("Error creating account: " + error.message);
    }
}

async function login(email, password) {
    try {
        console.log("Step 1: Authenticating with Firebase Auth...");
        // Login with email/password
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        console.log("Authentication successful! UID:", userId);

        console.log("Step 2: Fetching user data from Firestore...");
        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("User data found:", userData);
            console.log("Full name:", userData.fullName);
            console.log("Role:", userData.role);
            console.log("Assigned jobs:", userData.assignedJobIds);

            // Redirect based on user role
            if (userData.role === "manager") {
                console.log("Redirecting to manager dashboard...");
                window.location.href = getPageUrl("manager");
            } else {
                console.log("Redirecting to user dashboard...");
                window.location.href = getPageUrl("staff");
            }
        } else {
            console.error("User document does not exist in Firestore!");
            alert("User account data not found. Please contact support.");
        }
    } catch (error) {
        console.error("Error logging in:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        alert("Error logging in: " + error.message);
    }
}

async function handlePasswordReset(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        alert("Password reset email sent! Check your inbox.");
        console.log("Password reset email sent to:", email);
    } catch (error) {
        console.error("Error sending password reset email:", error);
        alert("Error sending password reset email: " + error.message);
    }
}