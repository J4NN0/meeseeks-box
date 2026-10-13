// The landing page on GitHub Pages (`npm run build:site`): the office's fonts,
// a copy button for the command, and the office in 3D.
import '@fontsource/luckiest-guy';
import '@fontsource/patrick-hand';
import '@fontsource/permanent-marker';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';

const button = document.getElementById('copy');
const command = button.previousElementSibling.textContent;
let reset;

button.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(command);
    button.textContent = 'Copied!';
  } catch {
    button.textContent = 'Select it';
  }
  clearTimeout(reset);
  reset = setTimeout(() => { button.textContent = 'Copy'; }, 1600);
});

// The screenshot stands in until the office is up, and stays if it can't be
// (no WebGL). Loaded after the page, so the page doesn't wait for three.js.
const stage = document.getElementById('stage');
import('./office.js')
  .then(({ mountOffice }) => {
    mountOffice(stage);
    stage.classList.add('live');
  })
  .catch((err) => console.warn('The 3D office could not start:', err));
