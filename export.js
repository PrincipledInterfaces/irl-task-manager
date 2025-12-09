import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getPageUrl } from './utils.js';

// Check auth state and redirect if not logged in or not a manager
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const currentUser = userDoc.data();

            // Check if user is a manager
            if (currentUser.role !== "manager") {
                alert("Access denied. Manager privileges required.");
                window.location.href = getPageUrl("board");
                return;
            }

            console.log("Logged in as manager:", currentUser.fullName);
        } else {
            window.location.href = getPageUrl("signin");
        }
    } else {
        window.location.href = getPageUrl("signin");
    }
});

function exportData(datatype) {
    // uses string value of dropdown
    if (datatype.toLowerCase() === 'tasks') {
        uiFinished(exportTasks());
    } else if (datatype.toLowerCase() === 'users') {
        uiFinished(exportUsers());
    }
}

//returns download link
function exportTasks() {
    const tasksRef = collection(db, 'tasks');
    const headers = ['ID', 'Title', 'Description', 'Category', 'Assigned To (ID)', 'Assigned To (Name)', 'Due Date', 'Completed', 'Location', 'Priority', 'Required Skills', 'Slots', 'WIW Shift IDs', 'Apprentice Task', 'Hours'];
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

    return getDocs(tasksRef).then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const row = [
                doc.id,
                `"${data.title || ''}"`,
                `"${data.description || ''}"`,
                data.category || '',
                `"${(data.assignedTo || []).join(';')}"`,
                `"${(data.assignedToNames || []).join(';')}"`,
                data.dueDate ? new Date(data.dueDate).toISOString() : '',
                data.completed ? 'Yes' : 'No',
                `"${data.location || ''}"`,
                data.priority || '',
                `"${(data.requiredSkills || []).join(';')}"`,
                data.slots || '',
                `"${(data.wiwShiftIds || []).join(';')}"`,
                data.apprenticeTask ? 'Yes' : 'No',
                data.hours || ''
            ];
            csvContent += row.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "tasks_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        return encodedUri;
    });
}

//returns download link
function exportUsers() {
    const usersRef = collection(db, 'users');
    const headers = ['ID', 'Name', 'Email', 'Role', 'Skills', 'Assigned Task IDs'];
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

    return getDocs(usersRef).then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const row = [
                doc.id,
                `"${data.name || ''}"`,
                `"${data.email || ''}"`,
                data.role || '',
                `"${(data.skills || []).join(';')}"`,
                `"${(data.assignedTaskIds || []).join(';')}"`,
            ];
            csvContent += row.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "users_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        return encodedUri;
    });
}

//opens loading ui, hides stuff and shows loader
function uiLoading() {
    document.getElementById('hideme').innerHTML = `<div style="display:flex;justify-content:center;align-items:center;min-height:150px;"><div class="loader"></div></div><br><h2 style="text-align:center;">Hang tight.</h5><br><h5 style="text-align:center;">This may take a bit...</h5>`;
}

//shows finished ui with download link
function uiFinished(dlLink) {
    document.getElementById('hideme').innerHTML = `<article style="text-align: center;">
            <h2><i class="fa-solid fa-download"></i> Download Started</h2>
            <p>Keep this tab open until the download has fully completed.</p>
            <p>Once it has completed, you can safely close this page.</p>
            <h6>If the download doesn't start automatically, please click <a href="${dlLink}">here</a>.</h6>
        </article>`;
}

//export button click listner
document.getElementById('exportBtn').addEventListener('click', async () => {
    const datatypeSelect = document.getElementById('exportDataType');
    const datatype = datatypeSelect.value;

    // Show loading UI
    uiLoading();

    await exportData(datatype);
});