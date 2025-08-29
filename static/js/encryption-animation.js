// Encryption animation script
document.addEventListener('DOMContentLoaded', function() {
  // Character sets for encryption/decryption effect
  const encryptedChars = '!@#$%^&*()_+-=[]{}|;:,./<>?~`1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  // Function to create encryption/decryption effect
  function encryptDecryptText(element, finalText, callback) {
    const originalText = finalText;
    element.textContent = '';
    let decryptedIndices = [];
    let interval;
    let fullEncryptionDone = false;
    
    // First phase: encrypt the text (show random characters)
    function encryptionPhase() {
      let encryptedText = '';
      for (let i = 0; i < originalText.length; i++) {
        // Use space for spaces in the original text
        if (originalText[i] === ' ') {
          encryptedText += ' ';
        } else {
          // Generate a random character from the encrypted set
          const randomIndex = Math.floor(Math.random() * encryptedChars.length);
          encryptedText += encryptedChars[randomIndex];
        }
      }
      
      element.textContent = encryptedText;
      
      // After a few iterations, start the decryption phase
      if (!fullEncryptionDone) {
        setTimeout(() => {
          fullEncryptionDone = true;
          
          // Clear the current interval and start decryption
          clearInterval(interval);
          interval = setInterval(decryptionPhase, 25); // Speed up decryption (reduced from 50ms)
        }, 1000); // Encryption phase reduced from 2000ms to 1000ms
      }
    }
    
    // Second phase: gradually decrypt the text (reveal the actual text)
    function decryptionPhase() {
      // If all characters are decrypted, stop the animation
      if (decryptedIndices.length === originalText.replace(/\s/g, '').length) {
        clearInterval(interval);
        element.textContent = originalText;
        element.classList.add('typing-complete');
        if (callback) {
          callback();
        }
        return;
      }
      
      // Get the current text
      let currentText = element.textContent;
      let newText = '';
      
      // Randomly select a new character to decrypt
      let availableIndices = [];
      for (let i = 0; i < originalText.length; i++) {
        if (originalText[i] !== ' ' && !decryptedIndices.includes(i)) {
          availableIndices.push(i);
        }
      }
      
      if (availableIndices.length > 0) {
        // Pick multiple random indices to decrypt (2 at a time)
        const charsToDecryptPerIteration = Math.min(2, availableIndices.length);
        
        for (let i = 0; i < charsToDecryptPerIteration; i++) {
          const randomIndex = Math.floor(Math.random() * availableIndices.length);
          const decryptIndex = availableIndices[randomIndex];
          decryptedIndices.push(decryptIndex);
          // Remove this index so we don't select it again
          availableIndices.splice(randomIndex, 1);
        }
      }
      
      // Build the new text with some characters decrypted
      for (let i = 0; i < originalText.length; i++) {
        if (originalText[i] === ' ') {
          newText += ' ';
        } else if (decryptedIndices.includes(i)) {
          // This character is decrypted
          newText += originalText[i];
        } else {
          // This character is still encrypted
          const randomIndex = Math.floor(Math.random() * encryptedChars.length);
          newText += encryptedChars[randomIndex];
        }
      }
      
      element.textContent = newText;
    }
    
    // Start with encryption phase
    interval = setInterval(encryptionPhase, 50); // Speed up from 100ms to 50ms
  }
  
  // Make the function globally available
  window.encryptDecryptText = encryptDecryptText;
});
