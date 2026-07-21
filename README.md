# Quantum-Circuit-Simulator
Light Rider Competition Web Application. Represents the ability to understand the significance of truly random generation through quantum entropy.

This web application is used to display my ability to create a functional web application while creating a system that implements random number generation through quantum entropy.
https://random.colorado.edu/

Not only was it important to create an application that used this randomness, but also necessary to represent why the pure randomness of quantum entropy is important and necessary for my project.

This project is a Circuit Simulator, having an interface inspired primarily by KiCAD and other circuit design software. My version provides a lot of general features, such as creating a schematic using different electronic components like the voltage source, resistor, capacitor, switch, etc. The capabilities of this simulation seem very minimalistic because the main focus of this application was the oscilloscope, and my use of quantum entropy to create artificial noise when reading voltage differences.

In real-world circuits, reading signals from an active component results in reads that are not perfect or clean, but rather have some buzziness due to the noise when reading. Noise is a very real thing, and though there are artificial ways to create noise, noise must inhibit the truly random nature that it has in real circuits, being the reason why quantum entropy was used.

In terms of Web Development, I decided to use an MVC architecture to structure code and logic. With the complexity in each component, display, and circuit combination, it felt necessary to organize and separate code in this way for easier debugging and cleaner code structure. I used the general format of using CSS, HTML, and JavaScript to break my website into the different layers of full-stack development. Most of the busy code, including the interface and general behaviors of components and features, was rigorously vibe-coded. I then went into the code myself in order to do some final tweaks and fix small bugs in the program's overall functionality.

Made by Justin Han

## v2 — Oscilloscope & solver rewrite

The probe/oscilloscope read path was rewritten around a real circuit solver:

- **Real nodal analysis (MNA).** Probe reads previously returned hard-coded
  guesses depending on which component was found first. The simulator now
  builds a netlist every step (wires and closed switches merge nodes,
  ground is the 0 V reference) and solves it with Modified Nodal Analysis:
  resistors as conductances, ideal voltage sources, backward-Euler companion
  models for capacitors and inductors, and an iterated piecewise-linear LED
  model. Probes read the true node voltage for any circuit topology, and
  quantum entropy perturbs the source physically so scope noise is
  propagated through the circuit rather than painted on.
- **True 500 Sa/s.** Physics and sampling run on a fixed sub-step
  (accumulator pattern) instead of once per animation frame.
- **Usable scope controls.** V/div and s/div zoom, Auto-fit, Clear, a live
  settings readout, per-probe A/B traces alongside Ch1 = A−B, and stats
  computed over the visible window.
- **UI fixes.** Probe buttons no longer stick when switching tools, the
  circuit canvas resizes when the scope opens, probe badges show grid
  coordinates, and rendering is devicePixelRatio-crisp.
