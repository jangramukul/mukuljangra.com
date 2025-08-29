// Binary animation script
document.addEventListener('DOMContentLoaded', function() {
  // Create container for binary digits
  const container = document.createElement('div');
  container.className = 'binary-animation-container';
  document.body.appendChild(container);

  // Binary characters to use (mostly 0s and 1s)
  const binaryChars = ['0', '1', '0', '1', '0', '1', '0', '1', '0', '1'];
  
  // Function to create a binary sequence
  function createBinarySequence() {
    // Create the element
    const element = document.createElement('span');
    element.className = 'binary-digit';
    
    // Determine if this will be a single digit or a sequence
    const isSequence = Math.random() > 0.7;
    
    if (isSequence) {
      // Create a sequence of 2-4 characters
      const length = Math.floor(Math.random() * 3) + 2;
      let sequence = '';
      for (let i = 0; i < length; i++) {
        const charIndex = Math.floor(Math.random() * binaryChars.length);
        sequence += binaryChars[charIndex];
      }
      element.textContent = sequence;
    } else {
      // Just a single character
      const charIndex = Math.floor(Math.random() * binaryChars.length);
      element.textContent = binaryChars[charIndex];
    }
    
    // Set position in the top-left area
    // Random position within the container
    const xPos = Math.random() * 250; // Pixels from left
    const yPos = Math.random() * 200; // Pixels from top
    element.style.left = `${xPos}px`;
    element.style.top = `${yPos}px`;
    
    // Set random drift and rotation for airy effect
    const xDrift = Math.random() * 20 - 10; // Between -10 and 10px
    element.style.setProperty('--x-drift', `${xDrift}px`);
    
    const rotation = Math.random() * 40 - 20; // Between -20 and 20 degrees
    element.style.setProperty('--rotation', `${rotation}deg`);
    
    // Set random animation duration for varied effect
    const duration = 4 + Math.random() * 4; // Between 4 and 8 seconds
    element.style.setProperty('--float-duration', `${duration}s`);
    
    // Add to container
    container.appendChild(element);
    
    // Remove after animation completes
    setTimeout(() => {
      element.remove();
    }, duration * 1000);
  }
  
  // Create digits at intervals (slightly more frequently for top-left area)
  setInterval(createBinarySequence, 300);
  
  // Create initial set of digits
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      createBinarySequence();
    }, i * 150);
  }
});
