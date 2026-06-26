/**
 * Protein 3D Structure Viewer using 3Dmol.js
 * Visualizes hemoglobin tetramer structure
 */

class ProteinViewer {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.viewer = null;
    this.spinning = true;

    if (this.container) {
      this.init();
    }
  }

  init() {
    // Initialize 3Dmol viewer
    this.viewer = $3Dmol.createViewer(this.container, {
      backgroundColor: '#0a0a14',
      antialias: true,
    });

    // Load hemoglobin structure
    this.loadStructure();
  }

  loadStructure() {
    // Fetch PDB file
    fetch('data/pdb/1a3n.pdb')
      .then((response) => response.text())
      .then((data) => {
        this.viewer.addModel(data, 'pdb');
        this.setStyle('cartoon');
        this.viewer.zoomTo();
        this.viewer.render();
        this.viewer.spin(true);
      })
      .catch((err) => {
        console.error('Failed to load PDB:', err);
        // Try alternative
        this.loadFromRCSB('1A3N');
      });
  }

  loadFromRCSB(pdbId) {
    const url = `https://files.rcsb.org/view/${pdbId}.pdb`;

    fetch(url)
      .then((response) => response.text())
      .then((data) => {
        this.viewer.addModel(data, 'pdb');
        this.setStyle('cartoon');
        this.viewer.zoomTo();
        this.viewer.render();
        this.viewer.spin(true);
      })
      .catch((err) => {
        console.error('Failed to load from RCSB:', err);
        this.container.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8888aa;">Failed to load protein structure</div>';
      });
  }

  setStyle(style) {
    if (!this.viewer) return;

    // Clear existing styles
    this.viewer.setStyle({}, {});

    // Chain colors
    const chainColors = {
      A: '#00d4ff',
      B: '#7b61ff',
      C: '#00ff88',
      D: '#ff6b6b',
    };

    switch (style) {
      case 'cartoon':
        // Cartoon style with chain colors
        Object.entries(chainColors).forEach(([chain, color]) => {
          this.viewer.setStyle(
            { chain: chain },
            {
              cartoon: {
                color: color,
                opacity: 0.9,
              },
            },
          );
        });
        break;

      case 'stick':
        // Stick style
        Object.entries(chainColors).forEach(([chain, color]) => {
          this.viewer.setStyle(
            { chain: chain },
            {
              stick: {
                color: color,
                radius: 0.15,
              },
            },
          );
        });
        break;

      case 'sphere':
        // Sphere style
        Object.entries(chainColors).forEach(([chain, color]) => {
          this.viewer.setStyle(
            { chain: chain },
            {
              sphere: {
                color: color,
                scale: 0.3,
              },
            },
          );
        });
        break;

      case 'surface':
        // Surface style with transparency
        Object.entries(chainColors).forEach(([chain, color]) => {
          this.viewer.setStyle(
            { chain: chain },
            {
              cartoon: {
                color: color,
                opacity: 0.5,
              },
            },
          );
          this.viewer.addSurface(
            $3Dmol.SurfaceType.VDW,
            {
              opacity: 0.6,
              color: color,
            },
            { chain: chain },
          );
        });
        break;
    }

    this.viewer.render();

    // Update active button
    document.querySelectorAll('.ctrl-btn').forEach((btn) => {
      btn.classList.remove('active');
      if (btn.textContent.toLowerCase() === style) {
        btn.classList.add('active');
      }
    });
  }

  toggleSpin() {
    this.spinning = !this.spinning;
    this.viewer.spin(this.spinning);
  }
}

// Global functions for button onclick
let proteinViewer;

function setStyle(style) {
  if (proteinViewer) {
    proteinViewer.setStyle(style);
  }
}

function toggleSpin() {
  if (proteinViewer) {
    proteinViewer.toggleSpin();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('protein-viewer');
  if (container) {
    proteinViewer = new ProteinViewer('protein-viewer');
  }
});
