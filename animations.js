/**
 * Simple animation utilities for smooth show/hide transitions
 * Usage:
 *   import { fadeIn, fadeInStagger } from './animations.js';
 *   fadeIn(element);              // Animate a single element
 *   fadeInStagger(container);     // Animate all children with stagger effect
 */

/**
 * Animate a single element with fade-in effect
 * @param {HTMLElement|string} elementOrSelector - Element or CSS selector
 */
export function fadeIn(elementOrSelector) {
    const element = typeof elementOrSelector === 'string'
        ? document.querySelector(elementOrSelector)
        : elementOrSelector;

    if (!element) return;

    element.classList.add('fade-in');
}

/**
 * Animate all children of a container with staggered fade-in effect
 * @param {HTMLElement|string} containerOrSelector - Container element or CSS selector
 * @param {string} childSelector - Optional selector for specific children (default: all direct children)
 */
export function fadeInStagger(containerOrSelector, childSelector = ':scope > *') {
    const container = typeof containerOrSelector === 'string'
        ? document.querySelector(containerOrSelector)
        : containerOrSelector;

    if (!container) return;

    const children = container.querySelectorAll(childSelector);
    children.forEach(child => child.classList.add('stagger-fade-in'));
}

/**
 * Animate an element with fade-out effect (useful before removing)
 * @param {HTMLElement|string} elementOrSelector - Element or CSS selector
 * @param {Function} callback - Optional callback after animation completes
 */
export function fadeOut(elementOrSelector, callback) {
    const element = typeof elementOrSelector === 'string'
        ? document.querySelector(elementOrSelector)
        : elementOrSelector;

    if (!element) return;

    element.classList.add('fade-out');

    if (callback) {
        // Wait for animation to complete (300ms as defined in CSS)
        setTimeout(callback, 300);
    }
}
