/**
 * Amino Acid Sequence Visualization
 * Color-coded sequence with hover effects
 */

class AminoAcidSequence {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    // HBB sequence (Hemoglobin subunit beta)
    this.sequence =
      'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';

    // Amino acid properties
    this.properties = {
      // Nonpolar (hydrophobic)
      A: 'nonpolar',
      V: 'nonpolar',
      I: 'nonpolar',
      L: 'nonpolar',
      M: 'nonpolar',
      F: 'nonpolar',
      W: 'nonpolar',
      P: 'nonpolar',
      // Polar
      S: 'polar',
      T: 'polar',
      C: 'polar',
      Y: 'polar',
      N: 'polar',
      Q: 'polar',
      // Positive
      K: 'positive',
      R: 'positive',
      H: 'positive',
      // Negative
      D: 'negative',
      E: 'negative',
      // Special
      G: 'special',
    };

    // Colors
    this.colors = {
      nonpolar: '#ff6b6b',
      polar: '#00d4ff',
      positive: '#00ff88',
      negative: '#ffd700',
      special: '#b0b0b0',
    };

    // Full names
    this.fullNames = {
      A: 'Alanine',
      V: 'Valine',
      I: 'Isoleucine',
      L: 'Leucine',
      M: 'Methionine',
      F: 'Phenylalanine',
      W: 'Tryptophan',
      P: 'Proline',
      S: 'Serine',
      T: 'Threonine',
      C: 'Cysteine',
      Y: 'Tyrosine',
      N: 'Asparagine',
      Q: 'Glutamine',
      K: 'Lysine',
      R: 'Arginine',
      H: 'Histidine',
      D: 'Aspartic acid',
      E: 'Glutamic acid',
      G: 'Glycine',
    };

    this.init();
  }

  init() {
    this.renderSequence();
    this.renderLegend();
    this.addScrollAnimation();
  }

  renderSequence() {
    this.container.innerHTML = '';

    for (let i = 0; i < this.sequence.length; i++) {
      const aa = this.sequence[i];
      const prop = this.properties[aa] || 'special';
      const color = this.colors[prop];

      const el = document.createElement('div');
      el.className = 'aa-char';
      el.style.backgroundColor = color + '20';
      el.style.color = color;
      el.style.border = `1px solid ${color}40`;
      el.textContent = aa;
      el.dataset.index = i;
      el.dataset.aa = aa;
      el.dataset.property = prop;

      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.innerHTML = `
        <strong>${this.fullNames[aa]}</strong><br>
        Position: ${i + 1}<br>
        Type: ${prop}
      `;
      el.appendChild(tooltip);

      // Hover effect
      el.addEventListener('mouseenter', () => {
        el.style.backgroundColor = color;
        el.style.color = '#000';
        el.style.transform = 'scale(1.5)';
        el.style.zIndex = '10';
        el.style.boxShadow = `0 0 20px ${color}`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.backgroundColor = color + '20';
        el.style.color = color;
        el.style.transform = 'scale(1)';
        el.style.zIndex = '1';
        el.style.boxShadow = 'none';
      });

      this.container.appendChild(el);
    }
  }

  renderLegend() {
    const legendContainer = document.getElementById('legend');
    if (!legendContainer) return;

    const categories = [
      {
        name: 'Nonpolar',
        color: this.colors.nonpolar,
        desc: 'A, V, I, L, M, F, W, P',
      },
      { name: 'Polar', color: this.colors.polar, desc: 'S, T, C, Y, N, Q' },
      { name: 'Positive', color: this.colors.positive, desc: 'K, R, H' },
      { name: 'Negative', color: this.colors.negative, desc: 'D, E' },
      { name: 'Special', color: this.colors.special, desc: 'G' },
    ];

    legendContainer.innerHTML = categories
      .map(
        (cat) => `
      <div class="legend-item">
        <div class="legend-color" style="background: ${cat.color}"></div>
        <span><strong>${cat.name}</strong> (${cat.desc})</span>
      </div>
    `,
      )
      .join('');
  }

  addScrollAnimation() {
    // Animate sequence on scroll
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const chars = this.container.querySelectorAll('.aa-char');
            chars.forEach((char, i) => {
              char.style.animation = `fadeIn 0.5s ease forwards`;
              char.style.animationDelay = `${i * 0.02}s`;
              char.style.opacity = '0';
            });
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(this.container);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const sequenceContainer = document.getElementById('sequence');
  if (sequenceContainer) {
    window.aminoSequence = new AminoAcidSequence('sequence');
  }
});
