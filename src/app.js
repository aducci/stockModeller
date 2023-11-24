// Import Dat.GUI library
import * as dat from 'dat.gui';

// Create a scene object to hold your variables
const scene = {
    color: '#00ff00', // example variable
    intensity: 0.5 // another example variable
};

// Create a GUI
const gui = new dat.GUI();

// Add variables to the GUI
gui.addColor(scene, 'color').onChange((value) => {
    // Do something when color changes
    console.log(`Color changed to ${value}`);
});

gui.add(scene, 'intensity', 0, 1).onChange((value) => {
    // Do something when intensity changes
    console.log(`Intensity changed to ${value}`);
});
