// Bee Animation JavaScript
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure the typed animation has started
  setTimeout(function() {
    // Create bee element
    const bee = document.createElement('span');
    bee.classList.add('bee');
    bee.textContent = '🐝';
    bee.style.position = 'absolute';
    
    // Add bee to the document
    const introSection = document.querySelector('.intro-section');
    introSection.appendChild(bee);
    
    // Position bee somewhere off-screen initially
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    bee.style.top = Math.floor(viewportHeight / 2) + 'px';
    bee.style.left = Math.floor(viewportWidth) + 'px';
    
    // Start animation after greeting is typed
    function startBeeAnimation() {
      // Check if typing is complete
      if (document.getElementById('typed-greeting').classList.contains('typing-complete')) {
        // Get greeting position for final bee destination
        const greeting = document.getElementById('typed-greeting');
        const greetingText = greeting.textContent;
        
        // Remove bee emoji from the greeting text
        greeting.textContent = greetingText.replace('🐝', '');
        
        // Add animations to bee
        bee.classList.add('bee-flapping');
        bee.classList.add('bee-flying');
        
        // After animation completes, append bee to the end of greeting
        setTimeout(function() {
          bee.classList.remove('bee-flapping');
          bee.classList.remove('bee-flying');
          bee.style.position = 'static';
          bee.style.display = 'inline';
          greeting.appendChild(bee);
        }, 2000); // Match with the animation duration
        
        return true; // Animation started
      }
      return false; // Animation not started yet
    }
    
    // Try to start animation, or set an interval to check when typing is complete
    if (!startBeeAnimation()) {
      const checkInterval = setInterval(function() {
        if (startBeeAnimation()) {
          clearInterval(checkInterval);
        }
      }, 500);
    }
  }, 500); // Give a small delay for initial page load
});
