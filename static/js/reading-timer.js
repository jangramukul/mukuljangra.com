/**
 * Reading Time Timer
 * This script calculates the estimated reading time of an article
 * and displays a timer counting up to that time with a flip animation.
 */

document.addEventListener('DOMContentLoaded', function() {
  // Get the post content
  const postContent = document.querySelector('.post-content');
  if (!postContent) return;
  
  // Calculate reading time (average reading speed: 200 words per minute)
  const text = postContent.textContent || postContent.innerText;
  const wordCount = text.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
  
  // Set up timer container
  const timer = document.createElement('div');
  timer.className = 'reading-timer';
  
  // Create timer icon
  const timerIcon = document.createElement('span');
  timerIcon.className = 'timer-icon';
  timerIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
  
  // Create flip timer display
  const flipTimer = document.createElement('div');
  flipTimer.className = 'flip-timer';
  
  // Create minutes display
  const minutesContainer = document.createElement('div');
  minutesContainer.className = 'timer-unit minutes';
  
  // Create tens of minutes digit
  const minutesTensDigit = createFlipDigit('0');
  minutesContainer.appendChild(minutesTensDigit);
  
  // Create ones of minutes digit
  const minutesOnesDigit = createFlipDigit('0');
  minutesContainer.appendChild(minutesOnesDigit);
  
  // Create separator
  const separator = document.createElement('span');
  separator.className = 'timer-separator';
  separator.textContent = ':';
  
  // Create seconds display
  const secondsContainer = document.createElement('div');
  secondsContainer.className = 'timer-unit seconds';
  
  // Create tens of seconds digit
  const secondsTensDigit = createFlipDigit('0');
  secondsContainer.appendChild(secondsTensDigit);
  
  // Create ones of seconds digit
  const secondsOnesDigit = createFlipDigit('0');
  secondsContainer.appendChild(secondsOnesDigit);
  
  // Create timer label
  const timerLabel = document.createElement('span');
  timerLabel.className = 'timer-label';
  timerLabel.textContent = `/ ${readingTimeMinutes} min read`;
  
  // Assemble timer display
  flipTimer.appendChild(minutesContainer);
  flipTimer.appendChild(separator);
  flipTimer.appendChild(secondsContainer);
  
  // Add all elements to timer container
  timer.appendChild(timerIcon);
  timer.appendChild(flipTimer);
  timer.appendChild(timerLabel);
  
  // Insert timer next to back button
  const backNavigation = document.querySelector('.back-navigation');
  if (backNavigation) {
    backNavigation.appendChild(timer);
  }
  
  // Start the timer
  let secondsElapsed = 0;
  const timerInterval = setInterval(() => {
    secondsElapsed++;
    
    const minutes = Math.floor(secondsElapsed / 60);
    const seconds = secondsElapsed % 60;
    
    // Update minutes display
    updateDigit(minutesTensDigit, Math.floor(minutes / 10));
    updateDigit(minutesOnesDigit, minutes % 10);
    
    // Update seconds display
    updateDigit(secondsTensDigit, Math.floor(seconds / 10));
    updateDigit(secondsOnesDigit, seconds % 10);
    
    // Stop timer when reaching the estimated reading time
    if (minutes >= readingTimeMinutes) {
      clearInterval(timerInterval);
    }
  }, 1000);
});

/**
 * Creates a flip digit element
 * @param {string} initialValue - The initial value to display
 * @returns {HTMLElement} The flip digit element
 */
function createFlipDigit(initialValue) {
  const flipDigit = document.createElement('div');
  flipDigit.className = 'flip-digit';
  flipDigit.dataset.currentValue = initialValue;
  
  // Create top half
  const digitTop = document.createElement('div');
  digitTop.className = 'flip-digit-top';
  const digitTopSpan = document.createElement('span');
  digitTopSpan.textContent = initialValue;
  digitTop.appendChild(digitTopSpan);
  
  // Create bottom half
  const digitBottom = document.createElement('div');
  digitBottom.className = 'flip-digit-bottom';
  const digitBottomSpan = document.createElement('span');
  digitBottomSpan.textContent = initialValue;
  digitBottom.appendChild(digitBottomSpan);
  
  // Create back top half (for animation)
  const digitBackTop = document.createElement('div');
  digitBackTop.className = 'flip-digit-back-top';
  const digitBackTopSpan = document.createElement('span');
  digitBackTopSpan.textContent = initialValue;
  digitBackTop.appendChild(digitBackTopSpan);
  
  // Create back bottom half (for animation)
  const digitBackBottom = document.createElement('div');
  digitBackBottom.className = 'flip-digit-back-bottom';
  const digitBackBottomSpan = document.createElement('span');
  digitBackBottomSpan.textContent = initialValue;
  digitBackBottom.appendChild(digitBackBottomSpan);
  
  // Assemble digit
  flipDigit.appendChild(digitTop);
  flipDigit.appendChild(digitBottom);
  flipDigit.appendChild(digitBackTop);
  flipDigit.appendChild(digitBackBottom);
  
  return flipDigit;
}

/**
 * Updates a flip digit with a new value
 * @param {HTMLElement} digitElement - The digit element to update
 * @param {number} newValue - The new value to display
 */
function updateDigit(digitElement, newValue) {
  newValue = newValue.toString();
  const currentValue = digitElement.dataset.currentValue;
  
  if (currentValue === newValue) return;
  
  // Update current value data attribute
  digitElement.dataset.currentValue = newValue;
  
  // Update the static parts
  const digitTopSpan = digitElement.querySelector('.flip-digit-top span');
  const digitBottomSpan = digitElement.querySelector('.flip-digit-bottom span');
  
  // Update back parts (will become visible during animation)
  const digitBackTopSpan = digitElement.querySelector('.flip-digit-back-top span');
  const digitBackBottomSpan = digitElement.querySelector('.flip-digit-back-bottom span');
  
  // Set the new values
  digitBackTopSpan.textContent = newValue;
  digitBackBottomSpan.textContent = newValue;
  
  // Start the flip animation
  digitElement.classList.add('flipping');
  
  // After animation completes
  setTimeout(() => {
    // Update the front parts
    digitTopSpan.textContent = newValue;
    digitBottomSpan.textContent = newValue;
    
    // Remove the animation class
    digitElement.classList.remove('flipping');
  }, 500);
}
