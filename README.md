# AR Piano

An interactive Computer Vision project that turns your webcam into a virtual piano.  
Built with MediaPipe Hand Landmarker and web audio synthesis, this app lets users play piano keys using hand gestures in real time.

## Overview

AR Piano explores the intersection of:

- Computer Vision
- Gesture-based interaction
- Browser audio synthesis
- Modern front-end architecture

The goal is to provide a responsive and maintainable AR music interface that can scale from prototype to portfolio-grade product.

## Key Features

- Real-time hand tracking using Google MediaPipe Tasks Vision
- Webcam-based interaction directly in the browser
- Virtual piano keyboard overlay
- Touchless key triggering from finger position
- Low-latency sound generation with Tone.js
- Strong TypeScript-first architecture for long-term maintainability

## Tech Stack

- React
- TypeScript
- Vite
- MediaPipe Tasks Vision
- Tone.js
- ESLint

## Project Standards

This repository follows strict engineering guidelines documented in [src/assets/docs/CODING_STANDARD.md](src/assets/docs/CODING_STANDARD.md), including:

- Single Responsibility Principle across files and modules
- UI and business logic separation (hooks for logic, components for rendering)
- Strict type safety (no any)
- Performance-first approach for camera and hand-tracking workloads
- Clean architecture and reusable component design

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

### 3. Build for Production

```bash
npm run build
```

### 4. Preview Production Build

```bash
npm run preview
```

## Interaction Concept

1. User opens the AR Piano page.
2. Browser requests webcam permission.
3. MediaPipe detects hand landmarks from the live camera stream.
4. Fingertip coordinates are mapped to virtual key regions.
5. Matching notes are triggered through the audio engine.

## Performance Notes

Because hand tracking and rendering run continuously, optimization is a first-class concern:

- Minimize unnecessary React re-renders
- Keep expensive logic in hooks/utils
- Clean up camera and tracker resources on unmount
- Use lightweight UI composition

## Portfolio Value

This project demonstrates practical skills in:

- Real-time Computer Vision on the web
- Human-computer interaction design
- Audio-visual synchronization
- Scalable React + TypeScript architecture
- Production-ready coding standards

## Roadmap

- Multi-octave keyboard modes
- Left-hand and right-hand split mapping
- Calibration screen for different camera setups
- Note recording and playback
- Visual effects for key-hit feedback

## License

MIT License. You are free to use, modify, and distribute this project.
