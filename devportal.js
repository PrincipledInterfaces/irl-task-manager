import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, Timestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getPageUrl, getApiUrl } from './utils.js';
import { fadeIn, fadeInStagger } from './animations.js';

let currentUser = null;
let versionData = null;
let allReports = [];
let allUsers = [];

// Check auth state and redirect if not a developer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUser = {
                id: user.uid,
                ...userDoc.data()
            };

            // Check if user is a developer
            if (!currentUser.isDev) {
                alert("Access denied. Developer privileges required.");
                window.location.href = getPageUrl("staff");
                return;
            }

            console.log("Logged in as developer:", currentUser.fullName);

            // Load data
            await loadVersionData();
            await loadAllReports();
            await loadAllUsers();

            // Render UI
            renderVersionSection();
            renderReportsSection();

        }
    } else {
        window.location.href = getPageUrl("signin");
    }
});

// Load version data from Firestore
async function loadVersionData() {
    try {
        console.log("Loading version data from Firestore...");
        const dataCollection = collection(db, "data");
        const dataSnapshot = await getDocs(dataCollection);

        if (!dataSnapshot.empty) {
            const dataDoc = dataSnapshot.docs[0];
            versionData = {
                id: dataDoc.id,
                ...dataDoc.data()
            };
            console.log("Version data loaded:", versionData);
        } else {
            console.warn("No version data found - creating default");
            // Create default version data
            const docRef = await addDoc(collection(db, "data"), {
                version: "1.0.0",
                versionMessage: "",
                versionDevName: "",
                versionBugFixes: [],
                versionFeatures: []
            });
            versionData = {
                id: docRef.id,
                version: "1.0.0",
                versionMessage: "",
                versionDevName: "",
                versionBugFixes: [],
                versionFeatures: []
            };
        }
    } catch (error) {
        console.error("Error loading version data:", error);
    }
}

// Load all bug reports and feature requests
async function loadAllReports() {
    try {
        console.log("Loading reports from Firestore...");
        const reportsCollection = collection(db, "reports");
        const reportsQuery = query(reportsCollection, orderBy("createdAt", "desc"));
        const reportsSnapshot = await getDocs(reportsQuery);
        allReports = reportsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Reports loaded:", allReports.length, "reports found");
    } catch (error) {
        console.error("Error loading reports:", error);
    }
}

// Load all users to get developer list
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

// Render version management section
function renderVersionSection() {
    const container = document.querySelector('main .container');

    const versionHTML = `
        <article>
            <h2>Version Management</h2>
            <h3>Current Version: <span class="badge badge-blue"><i class="fa-solid fa-code-fork"></i> v${versionData.version}</span></h3>
            <hr>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1rem;">
                <button id="incrementPatch" class="secondary"><i class="fa-solid fa-plus"></i> Minor Fix (0.0.x)</button>
                <button id="incrementMinor" class="secondary"><i class="fa-solid fa-plus"></i> Larger Update (0.x.0)</button>
                <button id="incrementMajor" class="secondary"><i class="fa-solid fa-plus"></i> Overhaul (x.0.0)</button>
            </div>
            <details>
                <summary>Manually set version</summary>
                <div style="display: flex; gap: 10px; align-items: center; margin-top: 0.5rem;">
                    <input type="text" id="manualVersion" placeholder="e.g., 2.1.3" pattern="[0-9]+\\.[0-9]+\\.[0-9]+" style="max-width: 200px;">
                    <button id="setManualVersion">Set Version</button>
                </div>
            </details>
        </article>

        <dialog id="versionUpdateDialog">
            <article>
                <header>
                    <button aria-label="Close" rel="prev"></button>
                    <p><strong>Publish Version Update</strong></p>
                </header>
                <h2>New Version: <span id="newVersionNumber">v1.0.0</span></h2>
                <hr>
                <label for="versionMessage"><strong>Update Message:</strong></label>
                <textarea id="versionMessage" rows="4" placeholder="Brief message about this update..."></textarea>
                <hr>
                <label for="devName"><strong>Your Name:</strong></label>
                <input type="text" id="devName" placeholder="Developer Name" value="${currentUser.fullName}">
                <hr>
                <h4><i class="badge badge-red fa-solid fa-bug-slash"></i> Bug Fixes:</h4>
                <div id="bugFixesList">
                    <input type="text" class="bugfix-input" placeholder="Fixed issue where...">
                </div>
                <button id="addBugFix" class="secondary" style="margin-top: 0.5rem;"><i class="fa-solid fa-plus"></i> Add Bug Fix</button>
                <hr>
                <h4><i class="badge badge-green fa-solid fa-microchip"></i> New Features:</h4>
                <div id="featuresList">
                    <input type="text" class="feature-input" placeholder="Added new feature...">
                </div>
                <button id="addFeature" class="secondary" style="margin-top: 0.5rem;"><i class="fa-solid fa-plus"></i> Add Feature</button>
                <hr>
                <footer>
                    <button id="publishVersion"><i class="fa-solid fa-rocket"></i> Publish Version</button>
                </footer>
            </article>
        </dialog>
    `;

    container.insertAdjacentHTML('beforeend', versionHTML);

    // Setup event listeners
    document.getElementById('incrementPatch').addEventListener('click', () => openVersionDialog('patch'));
    document.getElementById('incrementMinor').addEventListener('click', () => openVersionDialog('minor'));
    document.getElementById('incrementMajor').addEventListener('click', () => openVersionDialog('major'));
    document.getElementById('setManualVersion').addEventListener('click', setManualVersion);

    const dialog = document.getElementById('versionUpdateDialog');
    dialog.querySelector('button[aria-label="Close"]').addEventListener('click', () => dialog.close());
    document.getElementById('addBugFix').addEventListener('click', addBugFixInput);
    document.getElementById('addFeature').addEventListener('click', addFeatureInput);
    document.getElementById('publishVersion').addEventListener('click', publishVersion);
}

// Increment version number
function incrementVersion(currentVersion, type) {
    const parts = currentVersion.split('.').map(Number);

    switch(type) {
        case 'major':
            parts[0]++;
            parts[1] = 0;
            parts[2] = 0;
            break;
        case 'minor':
            parts[1]++;
            parts[2] = 0;
            break;
        case 'patch':
            parts[2]++;
            break;
    }

    return parts.join('.');
}

// Open version update dialog
function openVersionDialog(incrementType) {
    const dialog = document.getElementById('versionUpdateDialog');
    const newVersion = incrementVersion(versionData.version, incrementType);

    document.getElementById('newVersionNumber').textContent = `v${newVersion}`;
    document.getElementById('versionMessage').value = '';
    document.getElementById('devName').value = currentUser.fullName;

    // Reset bug fixes and features lists
    document.getElementById('bugFixesList').innerHTML = '<input type="text" class="bugfix-input" placeholder="Fixed issue where...">';
    document.getElementById('featuresList').innerHTML = '<input type="text" class="feature-input" placeholder="Added new feature...">';

    dialog.showModal();
}

// Set manual version
function setManualVersion() {
    const manualVersionInput = document.getElementById('manualVersion');
    const version = manualVersionInput.value.trim();

    // Validate version format (x.x.x)
    const versionRegex = /^[0-9]+\.[0-9]+\.[0-9]+$/;
    if (!versionRegex.test(version)) {
        alert('Invalid version format. Please use x.x.x format (e.g., 1.2.3)');
        return;
    }

    const dialog = document.getElementById('versionUpdateDialog');
    document.getElementById('newVersionNumber').textContent = `v${version}`;
    document.getElementById('versionMessage').value = '';
    document.getElementById('devName').value = currentUser.fullName;

    // Reset bug fixes and features lists
    document.getElementById('bugFixesList').innerHTML = '<input type="text" class="bugfix-input" placeholder="Fixed issue where...">';
    document.getElementById('featuresList').innerHTML = '<input type="text" class="feature-input" placeholder="Added new feature...">';

    manualVersionInput.value = '';
    dialog.showModal();
}

// Add bug fix input field
function addBugFixInput() {
    const container = document.getElementById('bugFixesList');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bugfix-input';
    input.placeholder = 'Fixed issue where...';
    input.style.marginTop = '0.5rem';
    container.appendChild(input);
}

// Add feature input field
function addFeatureInput() {
    const container = document.getElementById('featuresList');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'feature-input';
    input.placeholder = 'Added new feature...';
    input.style.marginTop = '0.5rem';
    container.appendChild(input);
}

// Publish new version
async function publishVersion() {
    const newVersion = document.getElementById('newVersionNumber').textContent.replace('v', '');
    const message = document.getElementById('versionMessage').value.trim();
    const devName = document.getElementById('devName').value.trim();

    // Collect bug fixes
    const bugFixInputs = document.querySelectorAll('.bugfix-input');
    const bugFixes = Array.from(bugFixInputs)
        .map(input => input.value.trim())
        .filter(val => val.length > 0);

    // Collect features
    const featureInputs = document.querySelectorAll('.feature-input');
    const features = Array.from(featureInputs)
        .map(input => input.value.trim())
        .filter(val => val.length > 0);

    if (!message) {
        alert('Please provide an update message');
        return;
    }

    if (bugFixes.length === 0 && features.length === 0) {
        alert('Please add at least one bug fix or feature');
        return;
    }

    try {
        // Update version data in Firestore
        await updateDoc(doc(db, "data", versionData.id), {
            version: newVersion,
            versionMessage: message,
            versionDevName: devName,
            versionBugFixes: bugFixes,
            versionFeatures: features,
            versionPublishedAt: Timestamp.fromDate(new Date())
        });

        // Update local data
        versionData.version = newVersion;
        versionData.versionMessage = message;
        versionData.versionDevName = devName;
        versionData.versionBugFixes = bugFixes;
        versionData.versionFeatures = features;

        // Close dialog and refresh
        document.getElementById('versionUpdateDialog').close();
        renderVersionSection();

        alert(`Version ${newVersion} published successfully!`);

    } catch (error) {
        console.error('Error publishing version:', error);
        alert('Error publishing version: ' + error.message);
    }
}

// Render reports section
function renderReportsSection() {
    const container = document.querySelector('main .container');

    const activeReports = allReports.filter(r => !r.completed);
    const completedReports = allReports.filter(r => r.completed);

    let reportsHTML = `
        <article style="margin-top: 2rem;">
            <h2>Bug Reports & Feature Requests</h2>
            <h5>${activeReports.length} active request${activeReports.length !== 1 ? 's' : ''}</h5>
            <hr>
    `;

    if (activeReports.length === 0) {
        reportsHTML += '<p style="color: #888;">No active reports.</p>';
    } else {
        activeReports.forEach(report => {
            reportsHTML += renderReportCard(report, false);
        });
    }

    if (completedReports.length > 0) {
        reportsHTML += `
            <details style="margin-top: 2rem;">
                <summary><h4 style="display: inline;">Completed Requests (${completedReports.length})</h4></summary>
                <div style="margin-top: 1rem;">
        `;

        completedReports.forEach(report => {
            reportsHTML += renderReportCard(report, true);
        });

        reportsHTML += `
                </div>
            </details>
        `;
    }

    reportsHTML += `
        </article>
    `;

    container.insertAdjacentHTML('beforeend', reportsHTML);

    // Attach event listeners for mark complete/uncomplete buttons
    document.querySelectorAll('.toggle-report-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleReportStatus(btn.dataset.reportId));
    });
}

// Render a single report card
function renderReportCard(report, isCompleted) {
    const typeColor = report.type === 'bug' ? 'red' : 'green';
    const typeIcon = report.type === 'bug' ? 'bug-slash' : 'microchip';
    const typeLabel = report.type === 'bug' ? 'Bug Report' : 'Feature Request';

    const createdDate = report.createdAt ? new Date(report.createdAt.toDate()).toLocaleDateString() : 'Unknown';
    const completedDate = report.completedAt ? new Date(report.completedAt.toDate()).toLocaleDateString() : '';

    const submitterName = report.includeName ? report.submitterName : 'Anonymous';

    const buttonText = isCompleted ? 'Reopen' : 'Mark Complete';
    const buttonIcon = isCompleted ? 'rotate-left' : 'check';

    return `
        <article style="margin-bottom: 1rem; opacity: ${isCompleted ? '0.7' : '1'};">
            <h4>${report.title} <span class="badge badge-${typeColor}"><i class="fa-solid fa-${typeIcon}"></i> ${typeLabel}</span></h4>
            <p>${report.body}</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 0.5rem;">
                <span class="badge badge-gray"><i class="fa-solid fa-user"></i> ${submitterName}</span>
                <span class="badge badge-gray"><i class="fa-solid fa-calendar"></i> Created: ${createdDate}</span>
                ${completedDate ? `<span class="badge badge-green"><i class="fa-solid fa-check"></i> Completed: ${completedDate}</span>` : ''}
            </div>
            <button class="toggle-report-btn ${isCompleted ? 'secondary' : ''}" data-report-id="${report.id}" style="margin-top: 0.5rem;">
                <i class="fa-solid fa-${buttonIcon}"></i> ${buttonText}
            </button>
        </article>
    `;
}

// Toggle report completion status
async function toggleReportStatus(reportId) {
    const report = allReports.find(r => r.id === reportId);
    if (!report) return;

    const newStatus = !report.completed;

    try {
        const updateData = {
            completed: newStatus
        };

        if (newStatus) {
            updateData.completedAt = Timestamp.fromDate(new Date());
        } else {
            updateData.completedAt = null;
        }

        await updateDoc(doc(db, "reports", reportId), updateData);

        // Update local data
        report.completed = newStatus;
        report.completedAt = updateData.completedAt;

        // Refresh reports section
        const reportsArticle = document.querySelector('main .container article:last-child');
        reportsArticle.remove();
        await loadAllReports();
        renderReportsSection();

    } catch (error) {
        console.error('Error toggling report status:', error);
        alert('Error updating report: ' + error.message);
    }
}
