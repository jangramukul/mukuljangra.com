// Dancing emoji animation for post titles
document.addEventListener('DOMContentLoaded', function() {
  // Get the post title element
  const postTitle = document.querySelector('.post-title');
  
  // Only proceed if we're on a post page
  if (!postTitle) return;
  
  // Create a span for the emoji
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'dancing-emoji';
  emojiSpan.setAttribute('aria-hidden', 'true'); // Accessibility: mark as decorative
  
  // Insert the emoji span at the beginning of the title
  postTitle.prepend(emojiSpan);
  
  // Collection of fun emojis to cycle through - grouped by theme
  const emojiGroups = {
    tech: ['💻', '⚙️', '�', '�', '🖥️', '🚀', '🤖', '�', '🔍', '📡'],
    nature: ['�', '�', '🌵', '🍀', '🌴', '🌈', '🦋', '🐝', '🦄', '🐾'],
    fun: ['✨', '�', '�', '🎯', '🎸', '🎭', '🎪', '🎉', '�', '�'],
    idea: ['�', '🧠', '�', '📚', '�', '🧩', '💬', '🔮', '�', '💫'],
    motivation: ['🔥', '⚡️', '💪', '🏆', '👑', '💯', '🎯', '⏱️', '🧗‍♀️', '🚴‍♂️']
  };
  
  // Select a random emoji group for this post
  const groupKeys = Object.keys(emojiGroups);
  const selectedGroup = groupKeys[Math.floor(Math.random() * groupKeys.length)];
  const emojis = emojiGroups[selectedGroup];
  
  // Emoji transition states
  let currentEmojiIndex = Math.floor(Math.random() * emojis.length);
  let isChanging = false;
  
  // Set initial emoji
  emojiSpan.textContent = emojis[currentEmojiIndex] + ' ';
  
  // Add a data attribute to remember which theme is used
  emojiSpan.dataset.emojiTheme = selectedGroup;
  
  // Function to change emoji with animation
  function changeEmoji() {
    if (isChanging) return;
    isChanging = true;
    
    // Add exit animation class
    emojiSpan.classList.add('emoji-exit');
    
    setTimeout(() => {
      // Update to new emoji
      currentEmojiIndex = (currentEmojiIndex + 1) % emojis.length;
      emojiSpan.textContent = emojis[currentEmojiIndex] + ' ';
      
      // Remove exit class and add entrance class
      emojiSpan.classList.remove('emoji-exit');
      emojiSpan.classList.add('emoji-entrance');
      
      // Remove entrance class after animation completes
      setTimeout(() => {
        emojiSpan.classList.remove('emoji-entrance');
        isChanging = false;
      }, 500);
    }, 500);
  }
  
  // Change emoji every few seconds
  setInterval(changeEmoji, 4000);
  
  // Also change emoji when user hovers over the title
  postTitle.addEventListener('mouseenter', function() {
    if (!isChanging) changeEmoji();
  });
});
