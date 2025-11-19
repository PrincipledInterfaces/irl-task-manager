// Utility function to handle URLs for both local and production environments
export function getPageUrl(page) {
    // Check if we're running locally (file:// or localhost)
    const isLocal = window.location.protocol === 'file:' ||
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

    // Get the base path from current URL (e.g., /tasks/ if site is in subdirectory)
    const currentPath = window.location.pathname;
    const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Build the URL
    const fileName = isLocal ? `${page}.html` : page;
    return `${basePath}${fileName}`;
}
