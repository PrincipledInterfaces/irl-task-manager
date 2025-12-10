import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Check and show version update popup if needed
export async function checkAndShowVersionPopup(currentUser) {
    try {
        // Load version data
        const dataCollection = collection(db, "data");
        const dataSnapshot = await getDocs(dataCollection);

        if (dataSnapshot.empty) {
            console.log("No version data found");
            return;
        }

        const versionData = dataSnapshot.docs[0].data();
        const currentVersion = versionData.version || "1.0.0";

        console.log(`Current version: ${currentVersion}, User's last seen version: ${currentUser.lastSeenVersion || 'none'}`);

        // Check if user has seen this version
        if (currentUser.lastSeenVersion === currentVersion) {
            console.log("User has already seen this version");
            return;
        }

        // Show version popup
        showVersionPopup(versionData, currentUser);

    } catch (error) {
        console.error("Error checking version:", error);
    }
}

// Show version update popup
function showVersionPopup(versionData, currentUser) {
    const version = versionData.version || "1.0.0";
    const message = versionData.versionMessage || "New update available!";
    const devName = versionData.versionDevName || "Development Team";
    const bugFixes = versionData.versionBugFixes || [];
    const features = versionData.versionFeatures || [];

    // Build bug fixes list
    let bugFixesHTML = '';
    if (bugFixes.length > 0) {
        bugFixesHTML = bugFixes.map(fix => `<li>${fix}</li>`).join('');
    } else {
        bugFixesHTML = '<li>No bug fixes in this release</li>';
    }

    // Build features list
    let featuresHTML = '';
    if (features.length > 0) {
        featuresHTML = features.map(feature => `<li>${feature}</li>`).join('');
    } else {
        featuresHTML = '<li>No new features in this release</li>';
    }

    // Create dialog HTML
    const dialogHTML = `
        <dialog id="versionPopup" open>
            <article>
                <header>
                    <button aria-label="Close" rel="prev" id="closeVersionPopup"></button>
                    <p>
                        <strong>v${version}</strong>
                    </p>
                </header>
                <h2>New Update</h2>
                <h4 class="badge badge-blue"><i class="fa-solid fa-code-fork"></i> v${version}</h4>
                <hr>
                <p>
                    ${message}
                </p>
                <h5>-${devName}</h5>
                <hr>
                <h4><i class="badge badge-red fa-solid fa-bug-slash"></i> Bug Fixes:</h4>
                <article>
                    <ul>
                        ${bugFixesHTML}
                    </ul>
                </article>
                <hr>
                <h4><i class="badge badge-green fa-solid fa-microchip"></i> New Features:</h4>
                <article>
                    <ul>
                        ${featuresHTML}
                    </ul>
                </article>
            </article>
        </dialog>
    `;

    // Add dialog to page
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    // Setup close button
    const dialog = document.getElementById('versionPopup');
    const closeButton = document.getElementById('closeVersionPopup');

    const closePopup = async () => {
        try {
            // Update user's lastSeenVersion
            await updateDoc(doc(db, "users", currentUser.id), {
                lastSeenVersion: version
            });
            console.log(`Updated user's lastSeenVersion to ${version}`);

            // Close and remove dialog
            dialog.close();
            dialog.remove();
        } catch (error) {
            console.error("Error updating lastSeenVersion:", error);
            // Still close the dialog even if update fails
            dialog.close();
            dialog.remove();
        }
    };

    closeButton.addEventListener('click', closePopup);

    // Also close on backdrop click
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closePopup();
        }
    });
}
