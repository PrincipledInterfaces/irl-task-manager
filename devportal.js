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

            // Update UI with data
            updateVersionDisplay();
            updateReportsDisplay();
            setupEventListeners();

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

// Update version display with loaded data
function updateVersionDisplay() {
    console.log("updateVersionDisplay called, versionData:", versionData);

    const currentVersionSpan = document.getElementById('currentVersion');
    if (currentVersionSpan && versionData && versionData.version) {
        console.log("Setting version to:", versionData.version);
        currentVersionSpan.textContent = versionData.version;
    } else {
        console.warn("Could not update version display:", {
            spanExists: !!currentVersionSpan,
            versionDataExists: !!versionData,
            version: versionData?.version
        });
    }

    // Pre-fill developer name in dialog (first name only)
    const devNameInput = document.getElementById('devName');
    if (devNameInput && currentUser && currentUser.fullName) {
        const firstName = currentUser.fullName.split(' ')[0];
        devNameInput.value = firstName;
    }
}

// Setup all event listeners
function setupEventListeners() {
    console.log("Setting up event listeners...");

    // Version increment buttons
    const patchBtn = document.getElementById('incrementPatch');
    const minorBtn = document.getElementById('incrementMinor');
    const majorBtn = document.getElementById('incrementMajor');
    const manualBtn = document.getElementById('setManualVersion');

    console.log("Button elements found:", { patchBtn, minorBtn, majorBtn, manualBtn });

    if (patchBtn) {
        patchBtn.addEventListener('click', () => {
            console.log("Patch button clicked");
            openVersionDialog('patch');
        });
    }
    if (minorBtn) {
        minorBtn.addEventListener('click', () => {
            console.log("Minor button clicked");
            openVersionDialog('minor');
        });
    }
    if (majorBtn) {
        majorBtn.addEventListener('click', () => {
            console.log("Major button clicked");
            openVersionDialog('major');
        });
    }
    if (manualBtn) {
        manualBtn.addEventListener('click', () => {
            console.log("Manual version button clicked");
            setManualVersion();
        });
    }

    // Dialog controls
    const dialog = document.getElementById('versionUpdateDialog');
    const closeButton = document.getElementById('closeVersionDialog');
    if (closeButton) {
        closeButton.addEventListener('click', () => dialog.close());
    }

    const addBugFixBtn = document.getElementById('addBugFix');
    const addFeatureBtn = document.getElementById('addFeature');
    const publishBtn = document.getElementById('publishVersion');

    if (addBugFixBtn) addBugFixBtn.addEventListener('click', addBugFixInput);
    if (addFeatureBtn) addFeatureBtn.addEventListener('click', addFeatureInput);
    if (publishBtn) publishBtn.addEventListener('click', publishVersion);

    console.log("Event listeners setup complete");
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
    console.log("openVersionDialog called with type:", incrementType);
    console.log("versionData:", versionData);

    try {
        const dialog = document.getElementById('versionUpdateDialog');
        if (!dialog) {
            console.error("Dialog element not found!");
            return;
        }

        const newVersion = incrementVersion(versionData.version, incrementType);
        console.log("New version calculated:", newVersion);

        document.getElementById('newVersionNumber').textContent = `v${newVersion}`;
        document.getElementById('versionMessage').value = '';

        // Set first name only
        const firstName = currentUser.fullName ? currentUser.fullName.split(' ')[0] : '';
        document.getElementById('devName').value = firstName;

        // Reset bug fixes and features lists
        document.getElementById('bugFixesList').innerHTML = '<input type="text" class="bugfix-input" placeholder="Fixed issue where...">';
        document.getElementById('featuresList').innerHTML = '<input type="text" class="feature-input" placeholder="Added new feature...">';

        console.log("Opening dialog...");
        dialog.showModal();
    } catch (error) {
        console.error("Error in openVersionDialog:", error);
    }
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

    // Set first name only
    const firstName = currentUser.fullName ? currentUser.fullName.split(' ')[0] : '';
    document.getElementById('devName').value = firstName;

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

        // Close dialog and refresh display
        document.getElementById('versionUpdateDialog').close();
        updateVersionDisplay();

        alert(`Version ${newVersion} published successfully!`);

    } catch (error) {
        console.error('Error publishing version:', error);
        alert('Error publishing version: ' + error.message);
    }
}

// Update reports display with loaded data
function updateReportsDisplay() {
    const activeReports = allReports.filter(r => !r.completed);
    const completedReports = allReports.filter(r => r.completed);

    // Update active reports count
    const activeReportsCount = document.getElementById('activeReportsCount');
    if (activeReportsCount) {
        activeReportsCount.textContent = `${activeReports.length} active request${activeReports.length !== 1 ? 's' : ''}`;
    }

    // Update active reports list
    const activeReportsList = document.getElementById('activeReportsList');
    if (activeReportsList) {
        if (activeReports.length === 0) {
            activeReportsList.innerHTML = '<p style="color: #888;">No active reports.</p>';
        } else {
            activeReportsList.innerHTML = activeReports.map(report => renderReportCard(report, false)).join('');
        }
    }

    // Update completed reports section
    const completedReportsSection = document.getElementById('completedReportsSection');
    const completedReportsCount = document.getElementById('completedReportsCount');
    const completedReportsList = document.getElementById('completedReportsList');

    if (completedReports.length > 0) {
        if (completedReportsSection) completedReportsSection.style.display = 'block';
        if (completedReportsCount) completedReportsCount.textContent = completedReports.length;
        if (completedReportsList) {
            completedReportsList.innerHTML = completedReports.map(report => renderReportCard(report, true)).join('');
        }
    } else {
        if (completedReportsSection) completedReportsSection.style.display = 'none';
    }

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

        // Refresh reports display
        await loadAllReports();
        updateReportsDisplay();

    } catch (error) {
        console.error('Error toggling report status:', error);
        alert('Error updating report: ' + error.message);
    }
}
