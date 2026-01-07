// Background animation with consistent cross-device speed using requestAnimationFrame

(function() {
    // Animation parameters
    const ANIMATION_DURATION = 120000; // 120 seconds in milliseconds
    const TILE_SIZE = 412; // pixels to move (one full tile)

    let startTime = null;
    let animationId = null;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        // Don't animate if user prefers reduced motion
        return;
    }

    function animate(currentTime) {
        if (!startTime) {
            startTime = currentTime;
        }

        // Calculate elapsed time
        const elapsed = currentTime - startTime;

        // Calculate progress (0 to 1) within the animation duration
        const progress = (elapsed % ANIMATION_DURATION) / ANIMATION_DURATION;

        // Calculate current position (linear progression)
        const x = progress * TILE_SIZE;
        const y = progress * TILE_SIZE;

        // Update background position
        document.body.style.backgroundPosition = `${x}px ${y}px`;

        // Continue animation
        animationId = requestAnimationFrame(animate);
    }

    // Start animation when page loads
    function startAnimation() {
        if (!animationId) {
            animationId = requestAnimationFrame(animate);
        }
    }

    // Stop animation (for cleanup)
    function stopAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    // Start animation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startAnimation);
    } else {
        startAnimation();
    }

    // Pause animation when page is hidden (save resources)
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopAnimation();
        } else {
            startTime = null; // Reset start time to avoid jump
            startAnimation();
        }
    });
})();
