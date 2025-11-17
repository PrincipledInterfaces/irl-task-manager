import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

let currentUser = null;
let tasksData = [];

// Check auth state and redirect if not logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is logged in, fetch their data
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUser = {
                id: user.uid,
                ...userDoc.data()
            };
            console.log("Logged in as:", currentUser.fullName);

            // Update greeting
            const nameText = document.getElementById('nameText');
            nameText.textContent = `Hello ${currentUser.fullName}, you have the following tasks...`;

            // Load tasks and render board
            await loadTasks();
            renderBoard();

            // Setup logout button
            setupLogoutButton();
        }
    } else {
        // No user logged in, redirect to signin
        window.location.href = "signin.html";
    }
});

// Setup logout button functionality
function setupLogoutButton() {
    const logoutButton = document.querySelector('button[style*="rgb(255, 93, 93)"]');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // onAuthStateChanged will automatically redirect to signin.html
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Error signing out: " + error.message);
            }
        });
    }
}

// Format Firestore timestamp to readable string
function formatDueDate(timestamp) {
    if (!timestamp) return "No due date";

    // Convert Firestore Timestamp to JS Date
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    // Format: "Sat Nov 17, 10:30 AM"
    const options = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    return date.toLocaleString('en-US', options);
}

// Load tasks from Firestore
async function loadTasks() {
    try {
        console.log("Loading tasks from Firestore...");
        const tasksCollection = collection(db, "tasks");
        const tasksSnapshot = await getDocs(tasksCollection);
        tasksData = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Tasks loaded:", tasksData.length, "tasks found");
        console.log("Task data:", tasksData);
    } catch (error) {
        console.error("Error loading tasks:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
    }
}

// Render a single job card
function renderJobCard(task) {
    const isCompleted = task.completed;
    if (isCompleted) {
        return ''; // Don't render completed jobs
    }

    const workerSlots = task.workerSlots || 1;
    const assignedUsers = task.assignedTo || [];
    const assignedNames = task.assignedToNames || [];

    // Build assignment section
    let assignmentSection = '';

    if (workerSlots > 1) {
        assignmentSection += '<h5>Assigned workers:</h5><div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">';

        assignedNames.forEach(name => {
            assignmentSection += `<span class="badge badge-green"><i class="fa-solid fa-user"></i> ${name}</span>`;
        });

        assignmentSection += '</div>';
    }

    // Conditional rendering: show priority badge if isPriority is true
    const priorityBadge = task.isPriority
        ? ` <span class="badge badge-yellow"><i class="fa-solid fa-triangle-exclamation"></i> High Priority</span>`
        : '';

    return `
        <article data-job-id="${task.id}">
            <h3>${task.title}${priorityBadge}</h3>
            <h5><span class="badge badge-gray"><i class="fa-regular fa-clock"></i> ${task.hours} Hours</span> <span class="badge badge-gray"><i class="fa-solid fa-${task.icon}"></i> ${task.category}</span></h5>
            <h6>Due: <span class="badge badge-purple"><i class="fa-regular fa-calendar"></i> ${formatDueDate(task.due)}</span></h6>
            <h6>Location: <span class="badge badge-${task.locationColor}"><i class="fa-solid fa-location-dot"></i> ${task.location}</span></h6>
            <details>
                <article>
                    <p>${task.description}</p>
                </article>
            </details>
            ${assignmentSection}
            <button class="unclaim-button" data-job-id="${task.id}"><i class="fa-solid fa-xmark"></i> Unclaim Task</button>
            <button class="complete-button" data-job-id="${task.id}"><i class="fa-solid fa-check"></i> Mark as Complete</button>
        </article>
    `;
}

// Render all jobs to the board
function renderBoard() {
    console.log("Rendering user dashboard...");
    console.log("Total tasks:", tasksData.length);
    console.log("Current user assigned job IDs:", currentUser.assignedJobIds);
    const boardContainer = document.getElementById('user-tasks');
    // Filter to only show jobs assigned to current user
    const userTasks = tasksData.filter(task =>
        currentUser.assignedJobIds && currentUser.assignedJobIds.includes(task.id)
    );
    console.log("User's assigned tasks:", userTasks.length);
    console.log("User tasks:", userTasks);
    if (userTasks.length === 0) {
        boardContainer.innerHTML = '<h4>You have no assigned tasks at the moment.</h4>';
        return;
    } else {
        boardContainer.innerHTML = userTasks.map(task => renderJobCard(task)).join('');
    }
    console.log("User dashboard rendered with", userTasks.length, "tasks");

    // Attach event listeners to unclaim and complete buttons
    attachUnclaimListeners();
}

// Handle unclaim and complete button clicks
function attachUnclaimListeners() {
    const unclaimButtons = document.querySelectorAll('.unclaim-button');
    unclaimButtons.forEach(button => {
        button.addEventListener('click', handleUnclaim);
    });

    const completeButtons = document.querySelectorAll('.complete-button');
    completeButtons.forEach(button => {
        button.addEventListener('click', handleComplete);
    });
}

// Unclaim a job
async function handleUnclaim(event) {
    const taskId = event.currentTarget.getAttribute('data-job-id');

    try {
        const task = tasksData.find(t => t.id === taskId);
        if (task && currentUser) {
            const assignedUsers = task.assignedTo || [];

            // Check if user is actually assigned
            if (!assignedUsers.includes(currentUser.id)) {
                alert("You are not assigned to this task!");
                return;
            }

            // Update task in Firestore - remove from arrays
            await updateDoc(doc(db, "tasks", taskId), {
                assignedTo: arrayRemove(currentUser.id),
                assignedToNames: arrayRemove(currentUser.fullName)
            });

            // Update user's assignedJobIds in Firestore
            await updateDoc(doc(db, "users", currentUser.id), {
                assignedJobIds: arrayRemove(taskId)
            });

            // Update local data
            if (task.assignedTo) {
                const userIndex = task.assignedTo.indexOf(currentUser.id);
                if (userIndex > -1) {
                    task.assignedTo.splice(userIndex, 1);
                }
            }
            if (task.assignedToNames) {
                const nameIndex = task.assignedToNames.indexOf(currentUser.fullName);
                if (nameIndex > -1) {
                    task.assignedToNames.splice(nameIndex, 1);
                }
            }

            const index = currentUser.assignedJobIds.indexOf(taskId);
            if (index > -1) {
                currentUser.assignedJobIds.splice(index, 1);
            }

            // Re-render the board to show updated state
            renderBoard();

            console.log(`Task ${taskId} unclaimed by ${currentUser.fullName}`);
        }
    } catch (error) {
        console.error("Error unclaiming task:", error);
        alert("Error unclaiming task: " + error.message);
    }
}

// Mark a job as complete
async function handleComplete(event) {
    const taskId = event.currentTarget.getAttribute('data-job-id');

    try {
        const task = tasksData.find(t => t.id === taskId);
        if (task && currentUser) {
            const assignedUsers = task.assignedTo || [];

            // Check if user is actually assigned
            if (!assignedUsers.includes(currentUser.id)) {
                alert("You are not assigned to this task!");
                return;
            }

            // Update task in Firestore
            await updateDoc(doc(db, "tasks", taskId), {
                completed: true
            });

            // Update user's assignedJobIds in Firestore (remove from active list)
            await updateDoc(doc(db, "users", currentUser.id), {
                assignedJobIds: arrayRemove(taskId)
            });

            // Update local data
            task.completed = true;
            const index = currentUser.assignedJobIds.indexOf(taskId);
            if (index > -1) {
                currentUser.assignedJobIds.splice(index, 1);
            }

            // Re-render the board to show updated state
            renderBoard();

            console.log(`Task ${taskId} completed by ${currentUser.fullName}`);
        }
    } catch (error) {
        console.error("Error completing task:", error);
        alert("Error completing task: " + error.message);
    }
}
