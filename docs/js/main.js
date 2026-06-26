/**
 * Main JavaScript for ExtendAI Lab Website
 */

// Mobile menu toggle
function toggleMenu() {
  const navLinks = document.querySelector('.nav-links');
  navLinks.classList.toggle('show');
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-nav');
  if (window.scrollY > 50) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

// Counter animation
function animateCounters() {
  const counters = document.querySelectorAll('.stat-number');

  counters.forEach((counter) => {
    const target = parseInt(counter.dataset.target);
    const duration = 2000;
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        counter.textContent = target;
        clearInterval(timer);
      } else {
        counter.textContent = Math.floor(current);
      }
    }, 16);
  });
}

// Intersection Observer for animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px',
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate');

      // Trigger counter animation
      if (entry.target.classList.contains('hero-stats')) {
        animateCounters();
      }
    }
  });
}, observerOptions);

// Observe elements
document
  .querySelectorAll('.feature-card, .hero-stats, .section-header')
  .forEach((el) => {
    observer.observe(el);
  });

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  });
});

// Particle effect on mouse move
document.addEventListener('mousemove', (e) => {
  const bioElements = document.querySelectorAll('.bio-el');
  const x = e.clientX / window.innerWidth;
  const y = e.clientY / window.innerHeight;

  bioElements.forEach((el, i) => {
    const speed = (i + 1) * 0.5;
    const offsetX = (x - 0.5) * speed * 20;
    const offsetY = (y - 0.5) * speed * 20;
    el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  });
});

// Typing effect
function typeWriter(element, text, speed = 50) {
  let i = 0;
  element.textContent = '';

  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }

  type();
}

// Initialize typing effect
document.addEventListener('DOMContentLoaded', () => {
  const typingElement = document.querySelector('.typing-text');
  if (typingElement) {
    const text = typingElement.textContent;
    typeWriter(typingElement, text, 30);
  }
});

// Parallax effect for sections
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const sections = document.querySelectorAll('.section');

  sections.forEach((section, index) => {
    const speed = 0.5;
    const yPos = -(scrolled * speed);
    section.style.backgroundPositionY = yPos + 'px';
  });
});

// Add fade-in animation class
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate {
    animation: fadeIn 0.8s ease forwards;
  }
  
  .feature-card {
    opacity: 0;
    transform: translateY(20px);
  }
  
  .feature-card.animate {
    opacity: 1;
    transform: translateY(0);
  }
  
  .feature-card:nth-child(1) { animation-delay: 0.1s; }
  .feature-card:nth-child(2) { animation-delay: 0.2s; }
  .feature-card:nth-child(3) { animation-delay: 0.3s; }
  .feature-card:nth-child(4) { animation-delay: 0.4s; }
  .feature-card:nth-child(5) { animation-delay: 0.5s; }
  .feature-card:nth-child(6) { animation-delay: 0.6s; }
`;
document.head.appendChild(style);

// Console Easter egg
console.log(
  `
%c🧬 ExtendAI Lab %cv1.2.3
%c─────────────────────────────
%cAI-Powered Bioinformatics
617 Skills • 88 Categories • 15 Agents
https://github.com/BOHUYESHAN-APB/openagent-labforge-bio
`,
  'color: #00d4ff; font-size: 24px; font-weight: bold;',
  'color: #7b61ff; font-size: 14px;',
  'color: #8888aa;',
  'color: #00ff88; font-size: 12px;',
);
