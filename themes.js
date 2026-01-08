import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Background pattern definitions
const BACKGROUND_PATTERNS = {
    '*Default': './tile.png',
    'Double Bubble': 'https://www.toptal.com/designers/subtlepatterns/uploads/double-bubble.png',
    'Double Bubble Outline': 'https://www.toptal.com/designers/subtlepatterns/uploads/double-bubble-outline.png',
    'Mirrored Squares': 'https://www.transparenttextures.com/patterns/mirrored-squares.png',
    'Always Grey': 'https://www.transparenttextures.com/patterns/always-grey.png',
    'Crissxcross': 'https://www.transparenttextures.com/patterns/crissxcross.png',
    'Black Mamba': 'https://www.transparenttextures.com/patterns/black-mamba.png',
    'Bright Squares': 'https://www.transparenttextures.com/patterns/bright-squares.png',
};

// Theme definitions
const THEMES = {
    'Default Dark': {
        '--pico-background-color': '#11191f',
        '--pico-color': '#bbc6ce',
        '--pico-primary': '#1095c1',
        '--pico-primary-background': '#1095c1',
        '--pico-primary-hover': '#0d7a9e',
        '--pico-card-background-color': '#1c2732',
        '--pico-muted-color': '#8b96a0',
        '--pico-muted-border-color': '#2d3e50',
    },
    'Default Light': {
        '--pico-background-color': '#ffffff',
        '--pico-color': '#415462',
        '--pico-primary': '#1095c1',
        '--pico-primary-background': '#1095c1',
        '--pico-primary-hover': '#0d7a9e',
        '--pico-card-background-color': '#f7f9fa',
        '--pico-muted-color': '#73828c',
        '--pico-muted-border-color': '#d5dce0',
    },
    '2009 Modern': {
        '--pico-background-color': '#4D5061',
        '--pico-color': '#E7E247',
        '--pico-primary': '#E7E247',
        '--pico-primary-background': '#E7E247',
        '--pico-primary-hover': '#d4cf3a',
        '--pico-primary-inverse': '#4D5061',
        '--pico-card-background-color': '#5a5c6e',
        '--pico-muted-color': '#c4c49f',
        '--pico-muted-border-color': '#6a6c7e',
        '--pico-h1-color': '#f5f58e',
        '--pico-h2-color': '#f5f58e',
        '--pico-h3-color': '#eded80',
        '--pico-h4-color': '#eded80',
        '--pico-h5-color': '#E7E247',
        '--pico-h6-color': '#E7E247',
        '--pico-secondary': '#8a8c9e',
        '--pico-secondary-hover': '#9a9cae',
    },
    'Ocean Breeze': {
        '--pico-background-color': '#0a1929',
        '--pico-color': '#e1f0ff',
        '--pico-primary': '#2dd4bf',
        '--pico-primary-background': '#2dd4bf',
        '--pico-primary-hover': '#14b8a6',
        '--pico-primary-inverse': '#0a1929',
        '--pico-card-background-color': '#132f4c',
        '--pico-muted-color': '#9db8d1',
        '--pico-muted-border-color': '#1e3a5f',
        '--pico-h1-color': '#ffffff',
        '--pico-h2-color': '#ffffff',
        '--pico-h3-color': '#f0f8ff',
        '--pico-h4-color': '#f0f8ff',
        '--pico-h5-color': '#e1f0ff',
        '--pico-h6-color': '#e1f0ff',
        '--pico-secondary': '#38bdf8',
        '--pico-secondary-hover': '#0ea5e9',
    },
    'Sunset': {
        '--pico-background-color': '#1a1423',
        '--pico-color': '#f5e6d3',
        '--pico-primary': '#ff6b6b',
        '--pico-primary-background': '#ff6b6b',
        '--pico-primary-hover': '#ee5a52',
        '--pico-primary-inverse': '#ffffff',
        '--pico-card-background-color': '#2d1f3d',
        '--pico-muted-color': '#d4c0a8',
        '--pico-muted-border-color': '#3d2f4d',
        '--pico-h1-color': '#ffffff',
        '--pico-h2-color': '#ffffff',
        '--pico-h3-color': '#fff5eb',
        '--pico-h4-color': '#fff5eb',
        '--pico-h5-color': '#f5e6d3',
        '--pico-h6-color': '#f5e6d3',
        '--pico-secondary': '#ffd93d',
        '--pico-secondary-hover': '#f9ca24',
    },
    'Forest': {
        '--pico-background-color': '#1b2a1f',
        '--pico-color': '#e8f5e9',
        '--pico-primary': '#52b788',
        '--pico-primary-background': '#52b788',
        '--pico-primary-hover': '#3d9970',
        '--pico-primary-inverse': '#1b2a1f',
        '--pico-card-background-color': '#263d2f',
        '--pico-muted-color': '#b5d4b8',
        '--pico-muted-border-color': '#324d3a',
        '--pico-h1-color': '#ffffff',
        '--pico-h2-color': '#ffffff',
        '--pico-h3-color': '#f1f8f4',
        '--pico-h4-color': '#f1f8f4',
        '--pico-h5-color': '#e8f5e9',
        '--pico-h6-color': '#e8f5e9',
        '--pico-secondary': '#74c69d',
        '--pico-secondary-hover': '#5fa982',
    },
    'Lavender Dreams': {
        '--pico-background-color': '#f8f4ff',
        '--pico-color': '#2d1f47',
        '--pico-primary': '#9d4edd',
        '--pico-primary-background': '#9d4edd',
        '--pico-primary-hover': '#7b2cbf',
        '--pico-primary-inverse': '#ffffff',
        '--pico-card-background-color': '#f0e7ff',
        '--pico-muted-color': '#6b5b95',
        '--pico-muted-border-color': '#e0d5f5',
        '--pico-h1-color': '#1a0f2e',
        '--pico-h2-color': '#1a0f2e',
        '--pico-h3-color': '#2d1f47',
        '--pico-h4-color': '#2d1f47',
        '--pico-h5-color': '#3d3163',
        '--pico-h6-color': '#3d3163',
        '--pico-secondary': '#c77dff',
        '--pico-secondary-hover': '#b65dea',
    },
    'Monochrome': {
        '--pico-background-color': '#000000',
        '--pico-color': '#ffffff',
        '--pico-primary': '#ffffff',
        '--pico-primary-background': '#ffffff',
        '--pico-primary-hover': '#cccccc',
        '--pico-primary-inverse': '#000000',
        '--pico-card-background-color': '#1a1a1a',
        '--pico-muted-color': '#b3b3b3',
        '--pico-muted-border-color': '#404040',
        '--pico-h1-color': '#ffffff',
        '--pico-h2-color': '#ffffff',
        '--pico-h3-color': '#f5f5f5',
        '--pico-h4-color': '#f5f5f5',
        '--pico-h5-color': '#eeeeee',
        '--pico-h6-color': '#eeeeee',
        '--pico-secondary': '#808080',
        '--pico-secondary-hover': '#999999',
        '--pico-form-element-background-color': '#0d0d0d',
        '--pico-form-element-border-color': '#404040',
    },
};

// Apply theme to the page
function applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (theme) {
        // Determine if this is a light or dark theme based on background color
        const bgColor = theme['--pico-background-color'];
        const isDarkTheme = bgColor && (bgColor.startsWith('#') && parseInt(bgColor.slice(1, 3), 16) < 128);

        // Set data-theme attribute to override Pico's color-scheme detection
        document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');

        // Apply each CSS variable directly to the document root
        Object.entries(theme).forEach(([prop, value]) => {
            if (value && value !== '') {
                document.documentElement.style.setProperty(prop, value);
            }
        });

        // Force reflow to ensure styles are recalculated
        void document.documentElement.offsetHeight;

        // Force repaint by toggling a class
        document.documentElement.classList.add('theme-transitioning');
        requestAnimationFrame(() => {
            document.documentElement.classList.remove('theme-transitioning');
        });

        console.log(`Theme applied: ${themeName} (${isDarkTheme ? 'dark' : 'light'} mode)`);
    } else {
        console.warn(`Theme not found: ${themeName}`);
    }
}

// Apply background pattern to the page
function applyBackgroundPattern(patternName) {
    const patternUrl = BACKGROUND_PATTERNS[patternName];
    if (patternUrl) {
        document.body.style.backgroundImage = `url('${patternUrl}')`;
        // Ensure body uses the theme's background color
        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--pico-background-color');
        if (bgColor) {
            document.body.style.backgroundColor = bgColor;
        }
        console.log(`Background pattern applied: ${patternName}`);
    } else {
        console.warn(`Background pattern not found: ${patternName}`);
    }
}

// Get user's theme preference from Firestore
async function getUserThemePreference() {
    const user = auth.currentUser;
    if (!user) return 'Default Light'; // Default theme

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return userData.themePreference || 'Default Light';
        }
        return 'Default Light';
    } catch (error) {
        console.error('Error getting theme preference:', error);
        return 'Default Light';
    }
}

// Get user's background pattern preference from Firestore
async function getUserBackgroundPatternPreference() {
    const user = auth.currentUser;
    if (!user) return 'Default (Current)'; // Default pattern

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return userData.backgroundPatternPreference || 'Default (Current)';
        }
        return 'Default (Current)';
    } catch (error) {
        console.error('Error getting background pattern preference:', error);
        return 'Default (Current)';
    }
}

// Save user's theme preference to Firestore
async function saveUserThemePreference(themeName) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { themePreference: themeName });
        console.log(`Theme preference saved: ${themeName}`);
    } catch (error) {
        console.error("Error saving theme preference:", error);
    }
}

// Save user's background pattern preference to Firestore
async function saveUserBackgroundPatternPreference(patternName) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { backgroundPatternPreference: patternName });
        console.log(`Background pattern preference saved: ${patternName}`);
    } catch (error) {
        console.error("Error saving background pattern preference:", error);
    }
}

// Populate theme selector dropdown with available themes
function populateThemeSelector() {
    const themeSelector = document.getElementById('themeSelector');
    if (!themeSelector) return;

    // Clear existing options
    themeSelector.innerHTML = '';

    // Add each theme as an option
    Object.keys(THEMES).forEach(themeName => {
        const option = document.createElement('option');
        option.value = themeName;
        option.textContent = themeName;
        themeSelector.appendChild(option);
    });
}

// Populate background pattern selector dropdown with visual previews
function populateBackgroundPatternSelector() {
    const patternSelector = document.getElementById('backgroundPatternSelector');
    if (!patternSelector) return;

    // Clear existing options
    patternSelector.innerHTML = '';

    // Add each pattern as an option with visual preview
    Object.entries(BACKGROUND_PATTERNS).forEach(([patternName, patternUrl]) => {
        const option = document.createElement('option');
        option.value = patternName;
        option.textContent = patternName;
        option.style.backgroundImage = `url('${patternUrl}')`;
        option.style.backgroundRepeat = 'repeat';
        option.style.backgroundSize = '50px';
        patternSelector.appendChild(option);
    });

    // Set style on the select element itself to show preview of selected pattern
    patternSelector.addEventListener('change', function() {
        const selectedPattern = BACKGROUND_PATTERNS[this.value];
        this.style.backgroundImage = `url('${selectedPattern}')`;
    });
}

// Initialize theme system
async function initializeThemes() {
    console.log("Initializing theme system...");

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // Populate theme selector if it exists
    populateThemeSelector();

    // Populate background pattern selector if it exists
    populateBackgroundPatternSelector();

    // Wait for auth to be ready
    await new Promise(resolve => {
        if (auth.currentUser) {
            resolve();
        } else {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve();
            });
        }
    });

    // Get and apply user's theme preference
    const userTheme = await getUserThemePreference();
    const initialTheme = userTheme;
    applyTheme(userTheme);

    // Get and apply user's background pattern preference
    const userBackgroundPattern = await getUserBackgroundPatternPreference();
    applyBackgroundPattern(userBackgroundPattern);

    // Set the selector to the current theme if it exists
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.value = userTheme;

        // Add event listener for theme changes
        themeSelector.addEventListener('change', async (event) => {
            const selectedTheme = event.target.value;
            applyTheme(selectedTheme);
            await saveUserThemePreference(selectedTheme);
            // Reload to apply theme fully
            window.location.reload();
        });
    }

    // Set the background pattern selector to the current pattern if it exists
    const patternSelector = document.getElementById('backgroundPatternSelector');
    if (patternSelector) {
        patternSelector.value = userBackgroundPattern;
        // Set initial background preview on selector
        const initialPattern = BACKGROUND_PATTERNS[userBackgroundPattern];
        patternSelector.style.backgroundImage = `url('${initialPattern}')`;

        // Add event listener for background pattern changes
        patternSelector.addEventListener('change', async (event) => {
            const selectedPattern = event.target.value;
            applyBackgroundPattern(selectedPattern);
            await saveUserBackgroundPatternPreference(selectedPattern);
        });
    }
}

// Export functions for use in other scripts
export { THEMES, applyTheme, getUserThemePreference, saveUserThemePreference, initializeThemes };

// Auto-initialize when script is loaded
initializeThemes();