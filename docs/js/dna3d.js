/**
 * Bio-Matrix: 生物信息学碱基序列雨
 * 简洁优雅的背景，一眼识别生物/DNA/生物信息学属性
 */

class BioMatrix {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.width = 0;
    this.height = 0;

    this.columns = [];
    this.baseChars = ['A', 'T', 'G', 'C'];
    this.bioTerms = [
      'BLAST',
      'FASTQ',
      'BAM',
      'VCF',
      'GFF',
      'ORF',
      'SNP',
      'Indel',
      'Reads',
      'Align',
      'Phred',
      'Contig',
      'Scaffold',
      'Assembly',
      'Promoter',
      'Exon',
      'Intron',
      'UTR',
      'Genome',
      'Transcript',
      'Protein',
      'Peptide',
      'Helix',
      'Primer',
      'PCR',
      'qPCR',
      'RNA-seq',
      'ChIP-seq',
      'ATAC',
      'Methyl',
      'Codon',
      'Anticodon',
      'Poly-A',
      'cDNA',
    ];

    this.baseColors = {
      A: '#ef4444',
      T: '#f97316',
      G: '#22c55e',
      C: '#3b82f6',
    };

    this.resize();
    this.initColumns();
    this.setupEvents();
    this.loop();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.initColumns();
    });
  }

  initColumns() {
    this.columns = [];
    const colWidth = 18;
    const count = Math.ceil(this.width / colWidth) + 2;

    for (let i = 0; i < count; i++) {
      this.columns.push({
        x: i * colWidth + Math.random() * 6,
        chars: [],
        speed: 0.3 + Math.random() * 0.5,
        nextSpawn: Math.random() * 200,
        spawnRate: 8 + Math.random() * 25,
        isTermColumn: Math.random() < 0.04,
      });
    }
  }

  spawnChar(col) {
    const isTerm = col.isTermColumn && Math.random() < 0.15;
    const text = isTerm
      ? this.bioTerms[Math.floor(Math.random() * this.bioTerms.length)]
      : this.baseChars[Math.floor(Math.random() * this.baseChars.length)];

    col.chars.push({
      text,
      y: -20,
      alpha: 1,
      isHead: true,
      isTerm,
      age: 0,
    });
  }

  update() {
    this.columns.forEach((col) => {
      col.nextSpawn--;
      if (col.nextSpawn <= 0) {
        this.spawnChar(col);
        col.nextSpawn = col.spawnRate + Math.random() * 15;
      }

      col.chars.forEach((c) => {
        c.y += col.speed;
        c.age++;
        if (c.age > 3) c.isHead = false;

        if (c.isHead) {
          c.alpha = 0.9 + Math.random() * 0.1;
        } else {
          c.alpha = Math.max(0, 0.35 - (c.y / this.height) * 0.3);
        }
      });

      col.chars = col.chars.filter(
        (c) => c.y < this.height + 20 && c.alpha > 0.02,
      );
    });
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.columns.forEach((col) => {
      col.chars.forEach((c) => {
        const base = c.text.charAt(0);
        const color = this.baseColors[base] || '#94a3b8';

        ctx.font = c.isTerm
          ? 'bold 13px JetBrains Mono'
          : '13px JetBrains Mono';
        ctx.textAlign = 'center';

        if (c.isHead) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = color + '88';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(c.text, col.x, c.y);
          ctx.shadowBlur = 0;
        } else if (c.isTerm) {
          ctx.fillStyle = color;
          ctx.globalAlpha = c.alpha * 0.7;
          ctx.fillText(c.text, col.x, c.y);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = color;
          ctx.globalAlpha = c.alpha;
          ctx.fillText(c.text, col.x, c.y);
          ctx.globalAlpha = 1;
        }
      });
    });
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    this.update();
    this.draw();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new BioMatrix('bg-canvas');
});
