function replaceAvailabilityText() {
  // 1. First, check if the "WorldCat" indicator exists on the page
  const spans = document.querySelectorAll('span.ng-star-inserted');
  let worldCatExists = false;

  for (let span of spans) {
    if (span.textContent.trim() === 'WorldCat') {
      worldCatExists = true;
      break;
    }
  }

  // 2. If WorldCat is found, look for the target button and change its text
  if (worldCatExists) {
    const targetButtons = document.querySelectorAll('span.availability-code.light-text.ng-star-inserted');
    
    // Check if the button exists and still says the old text
    targetButtons.forEach(button => {
      if (button.textContent.trim() === 'See Request Options') {
        button.textContent = 'Request from Interlibrary Loan';
      }
    });
  }
}

// Run the function immediately on script load
replaceAvailabilityText();

// Watch the page for changes (so it re-applies if Angular re-renders the element)
const pageObserver = new MutationObserver(replaceAvailabilityText);
pageObserver.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});
