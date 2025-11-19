import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

let currentUser = null;
let allUsers = [];
let allTasks = [];
let selectedUser = null;

// Available skills from skills.txt
const AVAILABLE_SKILLS = [
    "Textiles",
    "Screen Printing",
    "3D Printer (FDM)",
    "3D Printer (Resin)",
    "Laser Cutter",
    "Wood Shop",
    "Programming",
    "Mechanical",
    "Electronics",
    "3D Modeling",
    "Graphic Design",
    "Photo/Video",
    "CNC"
];

// Check auth state and redirect if not logged in or not a manager
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUser = {
                id: user.uid,
                ...userDoc.data()
            };

            // Check if user is a manager
            if (currentUser.role !== "manager") {
                alert("Access denied. Manager privileges required.");
                window.location.href = "staff.html";
                return;
            }

            console.log("Logged in as manager:", currentUser.fullName);

            // Load data
            await loadAllUsers();
            await loadAllTasks();

            // Render team list
            renderTeamList();

            // Setup logout button
            setupLogoutButton();

            // Setup tab switching
            setupTabs();
        }
    } else {
        window.location.href = "signin.html";
    }
});

// Setup logout button
function setupLogoutButton() {
    const logoutButton = document.querySelector('button[style*="rgb(255, 93, 93)"]');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Error signing out: " + error.message);
            }
        });
    }
}

// Setup tab switching functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Load all users from Firestore
async function loadAllUsers() {
    try {
        console.log("Loading users from Firestore...");
        const usersCollection = collection(db, "users");
        const usersSnapshot = await getDocs(usersCollection);
        allUsers = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Users loaded:", allUsers.length, "users found");
    } catch (error) {
        console.error("Error loading users:", error);
    }
}

// Load all tasks from Firestore
async function loadAllTasks() {
    try {
        console.log("Loading tasks from Firestore...");
        const tasksCollection = collection(db, "tasks");
        const tasksSnapshot = await getDocs(tasksCollection);
        allTasks = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Tasks loaded:", allTasks.length, "tasks found");
    } catch (error) {
        console.error("Error loading tasks:", error);
    }
}

// Render team list
function renderTeamList() {
    const teamContainer = document.querySelector('#team article');
    if (!teamContainer) return;

    // Filter out managers, only show regular users
    const regularUsers = allUsers.filter(user => user.role !== "manager");

    if (regularUsers.length === 0) {
        teamContainer.innerHTML = '<p>No team members found.</p>';
        return;
    }

    teamContainer.innerHTML = regularUsers.map(user => {
        // Determine badge color based on active tasks
        const userTasks = allTasks.filter(task =>
            task.assignedTo && task.assignedTo.includes(user.id) && !task.completed
        );
        const taskCount = userTasks.length;
        let badgeColor = 'green';
        if (taskCount >= 5) badgeColor = 'red';
        else if (taskCount >= 3) badgeColor = 'yellow';

        return `<a class="hoveranim user-link" href="#" data-user-id="${user.id}"><span class="badge badge-${badgeColor}"><i class="fa-solid fa-user"></i> ${user.fullName}</span></a>`;
    }).join('\n');

    // Attach click listeners
    document.querySelectorAll('.user-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const userId = link.getAttribute('data-user-id');
            openUserDialog(userId);
        });
    });
}

// Open user edit dialog
function openUserDialog(userId) {
    selectedUser = allUsers.find(u => u.id === userId);
    if (!selectedUser) return;

    const dialog = document.getElementById('editUser');

    // Update dialog content
    const userName = dialog.querySelector('h2');
    userName.innerHTML = `<i class="fa-solid fa-user"></i> ${selectedUser.fullName}`;

    // Get user's active tasks
    const userTasks = allTasks.filter(task =>
        task.assignedTo && task.assignedTo.includes(selectedUser.id) && !task.completed
    );

    // Render active tasks
    const tasksSection = dialog.querySelector('div[style*="width:50%"] h5');
    tasksSection.textContent = `${userTasks.length} Active Task${userTasks.length !== 1 ? 's' : ''}`;

    const tasksArticle = dialog.querySelector('div[style*="width:50%"] article');
    if (userTasks.length === 0) {
        tasksArticle.innerHTML = '<p style="color: #888;">No active tasks</p>';
    } else {
        tasksArticle.innerHTML = userTasks.map(task =>
            `<span class="badge badge-gray"><i class="fa-solid fa-${task.icon || 'list'}"></i> ${task.title} | ${task.hours} Hrs</span><br>`
        ).join('');
    }

    // Render skills
    renderSkillsInDialog();

    // Show dialog
    dialog.showModal();
}

// Render skills in dialog
function renderSkillsInDialog() {
    const dialog = document.getElementById('editUser');
    const skillsArticle = dialog.querySelector('div:not([style*="width:50%"]) article');

    const userSkills = selectedUser.skills || [];

    if (userSkills.length === 0) {
        skillsArticle.innerHTML = '<p style="color: #888;">No skills added yet</p>';
    } else {
        skillsArticle.innerHTML = userSkills.map(skill =>
            `<span class="badge badge-gray">${skill} <a href="#" class="hoveranim delete-skill" data-skill="${skill}"><i class="fa-solid fa-x"></i></a></span>`
        ).join(' ');
    }

    // Attach delete listeners
    dialog.querySelectorAll('.delete-skill').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const skill = link.getAttribute('data-skill');
            removeSkill(skill);
        });
    });
}

// Setup dialog functionality
const dialog = document.getElementById('editUser');

// Close button
const closeButton = dialog.querySelector('button[aria-label="Close"]');
closeButton.addEventListener('click', () => {
    dialog.close();
});

// Add skill button
const addSkillButton = dialog.querySelector('button[class=""]');
const addSkillButtons = Array.from(dialog.querySelectorAll('button')).filter(btn =>
    btn.textContent.includes('Add Skill')
);
if (addSkillButtons.length > 0) {
    addSkillButtons[0].addEventListener('click', () => {
        showAddSkillPrompt();
    });
}

// Delete user button
const deleteUserButtons = Array.from(dialog.querySelectorAll('button')).filter(btn =>
    btn.textContent.includes('Delete User')
);
if (deleteUserButtons.length > 0) {
    deleteUserButtons[0].addEventListener('click', () => {
        confirmDeleteUser();
    });
}

// Show add skill prompt
function showAddSkillPrompt() {
    if (!selectedUser) return;

    const userSkills = selectedUser.skills || [];
    const availableSkills = AVAILABLE_SKILLS.filter(skill => !userSkills.includes(skill));

    if (availableSkills.length === 0) {
        alert("This user already has all available skills!");
        return;
    }

    const skillList = availableSkills.map((skill, idx) => `${idx + 1}. ${skill}`).join('\n');
    const skillInput = prompt(`Available skills:\n${skillList}\n\nEnter the number or name of the skill to add:`);

    if (!skillInput) return;

    let skillToAdd;

    // Check if input is a number
    if (!isNaN(skillInput)) {
        const index = parseInt(skillInput) - 1;
        if (index >= 0 && index < availableSkills.length) {
            skillToAdd = availableSkills[index];
        }
    } else {
        // Check if input matches a skill name
        skillToAdd = availableSkills.find(skill =>
            skill.toLowerCase() === skillInput.toLowerCase()
        );
    }

    if (skillToAdd) {
        addSkill(skillToAdd);
    } else {
        alert("Invalid skill selection. Please try again.");
    }
}

// Add skill to user
async function addSkill(skill) {
    if (!selectedUser) return;

    try {
        await updateDoc(doc(db, "users", selectedUser.id), {
            skills: arrayUnion(skill)
        });

        // Update local data
        if (!selectedUser.skills) selectedUser.skills = [];
        selectedUser.skills.push(skill);

        // Update the user in allUsers array
        const userIndex = allUsers.findIndex(u => u.id === selectedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = selectedUser;
        }

        // Re-render skills
        renderSkillsInDialog();

        console.log(`Skill "${skill}" added to ${selectedUser.fullName}`);
    } catch (error) {
        console.error("Error adding skill:", error);
        alert("Error adding skill: " + error.message);
    }
}

// Remove skill from user
async function removeSkill(skill) {
    if (!selectedUser) return;

    if (!confirm(`Remove "${skill}" from ${selectedUser.fullName}?`)) {
        return;
    }

    try {
        await updateDoc(doc(db, "users", selectedUser.id), {
            skills: arrayRemove(skill)
        });

        // Update local data
        if (selectedUser.skills) {
            const index = selectedUser.skills.indexOf(skill);
            if (index > -1) {
                selectedUser.skills.splice(index, 1);
            }
        }

        // Update the user in allUsers array
        const userIndex = allUsers.findIndex(u => u.id === selectedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = selectedUser;
        }

        // Re-render skills
        renderSkillsInDialog();

        console.log(`Skill "${skill}" removed from ${selectedUser.fullName}`);
    } catch (error) {
        console.error("Error removing skill:", error);
        alert("Error removing skill: " + error.message);
    }
}

// Confirm and delete user
async function confirmDeleteUser() {
    if (!selectedUser) return;

    const confirmation = prompt(`WARNING: This will permanently delete ${selectedUser.fullName} from both Firebase Auth and Firestore, and remove them from all assigned tasks.\n\nType "${selectedUser.fullName}" to confirm deletion:`);

    if (confirmation !== selectedUser.fullName) {
        alert("Deletion cancelled - name did not match.");
        return;
    }

    try {
        // Get the current user's ID token for authentication
        const user = auth.currentUser;
        if (!user) {
            alert("You must be logged in to delete users.");
            return;
        }

        const idToken = await user.getIdToken();

        console.log(`Calling server to delete user: ${selectedUser.fullName} (${selectedUser.id})`);

        // Call your custom server endpoint
        const response = await fetch('/api/delete-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ userId: selectedUser.id })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete user');
        }

        console.log("Server response:", result);

        // Update local data
        allUsers = allUsers.filter(u => u.id !== selectedUser.id);

        // Also update allTasks to reflect the user removal
        allTasks.forEach(task => {
            if (task.assignedTo && task.assignedTo.includes(selectedUser.id)) {
                task.assignedTo = task.assignedTo.filter(id => id !== selectedUser.id);
                task.assignedToNames = task.assignedToNames.filter(name => name !== selectedUser.fullName);
            }
        });

        // Close dialog and re-render team list
        dialog.close();
        renderTeamList();

        alert(`${selectedUser.fullName} has been deleted successfully from both Firebase Auth and Firestore.`);
        console.log(`User ${selectedUser.fullName} deleted successfully`);

        selectedUser = null;
    } catch (error) {
        console.error("Error deleting user:", error);
        alert(`Error deleting user: ${error.message}`);
    }
}
