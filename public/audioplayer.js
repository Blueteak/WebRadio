// imports the Lottie library via Skypack
import lottieWeb from 'https://cdn.skypack.dev/lottie-web';

// variable for the button that will contain both icons
const playIconContainer = document.getElementById('play-icon');
// variable that will store the button’s current state (play or pause)
let state = 'play';

// loads the animation that transitions the play icon into the pause icon into the referenced button, using Lottie’s loadAnimation() method
const animation = lottieWeb.loadAnimation({
    container: playIconContainer,
    path: 'https://maxst.icons8.com/vue-static/landings/animated-icons/icons/pause/pause.json',
    renderer: 'svg',
    loop: false,
    autoplay: false,
    name: "Demo Animation",
});

animation.goToAndStop(14, true);
//togglePlay();

function togglePlay() {
    if (state === 'play') {
        animation.playSegments([14, 27], true);
        state = 'pause';
    } else {
        animation.playSegments([0, 14], true);
        state = 'play';
    }
}

// adds an event listener to the button so that when it is clicked, the the player toggles between play and pause
playIconContainer.addEventListener('click', togglePlay);