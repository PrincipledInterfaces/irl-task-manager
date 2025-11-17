import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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

            // Load tasks and render board
            await loadTasks();
            renderBoard();
        }
    } else {
        // No user logged in, redirect to signin
        window.location.href = "signin.html";
    }
});

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
    const workerSlots = task.workerSlots || 1; // Default to 1 slot if not specified
    const assignedUsers = task.assignedTo || []; // Array of user IDs
    const assignedNames = task.assignedToNames || []; // Array of user names
    const openSlots = workerSlots - assignedUsers.length;

    // Check if current user is already assigned
    const isUserAssigned = currentUser && assignedUsers.includes(currentUser.id);

    // Build assignment section
    let assignmentSection = '';

    if (assignedUsers.length > 0 || workerSlots > 1) {
        assignmentSection += '<h5>Assigned to:</h5><div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">';

        // Show assigned workers
        assignedNames.forEach(name => {
            assignmentSection += `<span class="badge badge-green"><i class="fa-solid fa-user"></i> ${name}</span>`;
        });

        // Show empty slots
        for (let i = 0; i < openSlots; i++) {
            assignmentSection += `<span class="badge badge-gray"><i class="fa-solid fa-user"></i> Open</span>`;
        }

        assignmentSection += '</div>';
    }

    // Show claim button if there are open slots and user not already assigned
    if (openSlots > 0 && !isUserAssigned) {
        assignmentSection += `<div style="text-align: center;"><button data-job-id="${task.id}">Claim Assignment</button></div>`;
    } else if (isUserAssigned) {
        assignmentSection += `<div style="text-align: center; color: #888;"><i>You are assigned to this task</i></div>`;
    } else if (openSlots === 0) {
        assignmentSection += `<div style="text-align: center; color: #888;"><i>All slots filled</i></div>`;
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
        </article>
    `;
}

// Render all jobs to the board
function renderBoard() {
    console.log("Rendering board...");
    console.log("Total tasks:", tasksData.length);
    const boardContainer = document.getElementById('board-listings');
    // Only show non-completed tasks
    const activeTasks = tasksData.filter(task => !task.completed);
    console.log("Active (non-completed) tasks:", activeTasks.length);
    console.log("Active tasks:", activeTasks);
    if (activeTasks.length === 0) {
        boardContainer.innerHTML = '<h4>No available tasks at the moment.</h4>';
        return;
    } else {
        boardContainer.innerHTML = activeTasks.map(task => renderJobCard(task)).join('');
    }
    console.log("Board rendered with", activeTasks.length, "tasks");

    // Attach event listeners to claim buttons
    attachClaimListeners();
}

// Handle claim button clicks
function attachClaimListeners() {
    const claimButtons = document.querySelectorAll('button[data-job-id]');
    claimButtons.forEach(button => {
        button.addEventListener('click', handleClaim);
    });
}

// Claim a job
async function handleClaim(event) {
    const taskId = event.currentTarget.getAttribute('data-job-id');

    try {
        const task = tasksData.find(t => t.id === taskId);
        if (task && currentUser) {
            const assignedUsers = task.assignedTo || [];
            const workerSlots = task.workerSlots || 1;

            // Check if user already assigned
            if (assignedUsers.includes(currentUser.id)) {
                alert("You are already assigned to this task!");
                return;
            }

            // Check if slots available
            if (assignedUsers.length >= workerSlots) {
                alert("All slots for this task are filled!");
                return;
            }

            // Update task in Firestore - add to arrays
            await updateDoc(doc(db, "tasks", taskId), {
                assignedTo: arrayUnion(currentUser.id),
                assignedToNames: arrayUnion(currentUser.fullName)
            });

            // Update user's assignedJobIds in Firestore
            await updateDoc(doc(db, "users", currentUser.id), {
                assignedJobIds: arrayUnion(taskId)
            });

            // Update local data
            if (!task.assignedTo) task.assignedTo = [];
            if (!task.assignedToNames) task.assignedToNames = [];
            task.assignedTo.push(currentUser.id);
            task.assignedToNames.push(currentUser.fullName);

            if (!currentUser.assignedJobIds) currentUser.assignedJobIds = [];
            currentUser.assignedJobIds.push(taskId);

            // Re-render the board to show updated state
            renderBoard();

            console.log(`Task ${taskId} claimed by ${currentUser.fullName}`);
        }
    } catch (error) {
        console.error("Error claiming task:", error);
        alert("Error claiming task: " + error.message);
    }
}
