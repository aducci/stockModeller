# Stock Modeller

A web-based 3D modeling tool that provides an interactive GUI interface for manipulating scene properties using [dat.GUI](https://github.com/dataarts/dat.gui).

## Description

Stock Modeller is a JavaScript application built with modern web technologies, featuring an interactive graphical user interface for real-time parameter adjustments. The application uses dat.GUI to provide intuitive controls for scene properties like color and intensity settings.

## Features

- **Interactive GUI Controls**: Real-time manipulation of scene parameters
- **Color Picker**: Adjustable color settings with visual feedback
- **Intensity Slider**: Fine-tune intensity values from 0 to 1
- **Modern JavaScript**: Built with ES6+ features and transpiled for browser compatibility
- **Hot Reload**: Development server with automatic reloading

## Technologies Used

- **JavaScript (ES6+)**: Modern JavaScript syntax and features
- **[dat.GUI](https://github.com/dataarts/dat.gui)**: Lightweight graphical user interface library
- **[Webpack](https://webpack.js.org/)**: Module bundler for JavaScript applications
- **[Babel](https://babeljs.io/)**: JavaScript compiler for backward compatibility
- **webpack-dev-server**: Development server with live reloading

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (version 12 or higher recommended)
- npm (comes with Node.js)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/aducci/stockModeller.git
   cd stockModeller
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development Mode

Start the development server with hot reload:

```bash
npm start
```

This will:
- Start webpack-dev-server on port 8080
- Open the application in your default browser
- Enable hot module replacement for live updates

Access the application at: `http://localhost:8080`

### Production Build

Build the application for production:

```bash
npm run build
```

This creates an optimized bundle in the `dist/` directory.

## Project Structure

```
stockModeller/
├── src/
│   └── app.js              # Main application entry point
├── dist/                   # Production build output (generated)
│   └── bundle.js          # Compiled JavaScript bundle
├── node_modules/          # Dependencies (generated)
├── index.html             # HTML entry point
├── package.json           # Project metadata and dependencies
├── webpack.config.js      # Webpack configuration
├── babel.config.js        # Babel transpiler configuration
└── LICENSE                # GNU GPL v3 license
```

## Available Scripts

- `npm start` - Start development server on port 8080
- `npm run build` - Create production build
- `npm test` - Run tests (currently not implemented)

## How It Works

The application initializes a dat.GUI instance with two controls:

1. **Color Control**: A color picker that logs changes to the console
2. **Intensity Control**: A slider (range 0-1) that logs changes to the console

These controls demonstrate the basic functionality and can be extended to control 3D scenes, animations, or other interactive elements.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Author

A Ducci

---

## Suggested Enhancements

The following improvements would enhance the functionality and maintainability of this project:

### Code Quality & Testing
1. **Add Unit Tests**: Implement a testing framework (Jest or Mocha) with test coverage for core functionality
2. **Add Linting**: Configure ESLint with a style guide (Airbnb, Standard) for consistent code quality
3. **Add Type Checking**: Consider migrating to TypeScript or adding JSDoc type annotations

### Features
4. **3D Rendering**: Integrate a 3D library like Three.js to actually render and manipulate 3D models
5. **Model Import/Export**: Add functionality to import/export 3D models in common formats (OBJ, STL, GLTF)
6. **More Controls**: Expand GUI controls to include:
   - Position controls (x, y, z)
   - Rotation controls
   - Scale controls
   - Material properties (metalness, roughness, etc.)
7. **Preset Management**: Add ability to save and load control presets
8. **Undo/Redo**: Implement action history for better user experience

### Developer Experience
9. **Hot Module Replacement**: Improve webpack config to preserve state during hot reload
10. **Source Maps**: Enable source maps in production for better debugging
11. **Code Splitting**: Implement code splitting for better performance
12. **Environment Variables**: Add support for different environment configurations

### Documentation
13. **API Documentation**: Generate API documentation from code comments
14. **Contribution Guidelines**: Add CONTRIBUTING.md with development guidelines
15. **Code Examples**: Include more examples demonstrating different use cases

### UI/UX
16. **Better HTML Template**: Improve index.html with proper meta tags, favicon, and structured layout
17. **Canvas Element**: Add a canvas element for rendering 3D graphics
18. **Responsive Design**: Add CSS for better mobile and tablet experience
19. **Dark/Light Theme**: Implement theme switching capability

### DevOps
20. **CI/CD Pipeline**: Set up GitHub Actions for automated testing and deployment
21. **Docker Support**: Add Dockerfile for containerized deployment
22. **Git Hooks**: Add pre-commit hooks for linting and testing
23. **Dependency Updates**: Configure Dependabot for automatic dependency updates

### Performance
24. **Bundle Optimization**: Minimize bundle size with tree shaking and compression
25. **Lazy Loading**: Implement lazy loading for non-critical components
26. **Service Worker**: Add PWA capabilities with offline support

### Security
27. **Dependency Audit**: Regularly run `npm audit` and fix vulnerabilities
28. **Content Security Policy**: Add CSP headers for enhanced security
29. **Input Validation**: Implement proper validation for all user inputs
