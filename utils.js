// Utility function to handle URLs for both local and production environments
export function getPageUrl(page) {
    // Check if we're running locally (file:// or localhost)
    const isLocal = window.location.protocol === 'file:' ||
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

    // Add .html extension for local development
    return isLocal ? `${page}.html` : page;
}
