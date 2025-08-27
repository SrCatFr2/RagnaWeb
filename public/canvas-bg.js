class CanvasBackground {
  constructor() {
      this.canvas = null;
      this.ctx = null;
      this.particles = [];
      this.connections = [];
      this.mouse = { x: 0, y: 0 };
      this.animationId = null;

      this.config = {
          particleCount: 50,
          maxDistance: 150,
          particleSpeed: 0.5,
          particleSize: 2,
          connectionOpacity: 0.1,
          particleOpacity: 0.6,
          colors: {
              particles: ['#6366f1', '#06b6d4', '#8b5cf6', '#10b981'],
              connections: '#6366f1'
          }
      };

      this.init();
  }

  init() {
      this.createCanvas();
      this.createParticles();
      this.bindEvents();
      this.animate();
  }

  createCanvas() {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'background-canvas';
      this.ctx = this.canvas.getContext('2d');
      document.body.appendChild(this.canvas);
      this.resize();
  }

  createParticles() {
      this.particles = [];
      for (let i = 0; i < this.config.particleCount; i++) {
          this.particles.push({
              x: Math.random() * this.canvas.width,
              y: Math.random() * this.canvas.height,
              vx: (Math.random() - 0.5) * this.config.particleSpeed,
              vy: (Math.random() - 0.5) * this.config.particleSpeed,
              size: Math.random() * this.config.particleSize + 1,
              color: this.config.colors.particles[Math.floor(Math.random() * this.config.colors.particles.length)],
              opacity: Math.random() * this.config.particleOpacity + 0.2
          });
      }
  }

  bindEvents() {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('mousemove', (e) => {
          this.mouse.x = e.clientX;
          this.mouse.y = e.clientY;
      });
  }

  resize() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.createParticles();
  }

  updateParticles() {
      this.particles.forEach(particle => {
          // Update position
          particle.x += particle.vx;
          particle.y += particle.vy;

          // Bounce off edges
          if (particle.x < 0 || particle.x > this.canvas.width) {
              particle.vx *= -1;
          }
          if (particle.y < 0 || particle.y > this.canvas.height) {
              particle.vy *= -1;
          }

          // Keep particles in bounds
          particle.x = Math.max(0, Math.min(this.canvas.width, particle.x));
          particle.y = Math.max(0, Math.min(this.canvas.height, particle.y));

          // Mouse interaction
          const dx = this.mouse.x - particle.x;
          const dy = this.mouse.y - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
              const force = (100 - distance) / 100;
              particle.vx += (dx / distance) * force * 0.01;
              particle.vy += (dy / distance) * force * 0.01;
          }

          // Limit velocity
          const maxVelocity = this.config.particleSpeed * 2;
          particle.vx = Math.max(-maxVelocity, Math.min(maxVelocity, particle.vx));
          particle.vy = Math.max(-maxVelocity, Math.min(maxVelocity, particle.vy));
      });
  }

  drawParticles() {
      this.particles.forEach(particle => {
          this.ctx.beginPath();
          this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          this.ctx.fillStyle = particle.color + Math.floor(particle.opacity * 255).toString(16).padStart(2, '0');
          this.ctx.fill();

          // Add glow effect
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = particle.color;
          this.ctx.fill();
          this.ctx.shadowBlur = 0;
      });
  }

  drawConnections() {
      for (let i = 0; i < this.particles.length; i++) {
          for (let j = i + 1; j < this.particles.length; j++) {
              const dx = this.particles[i].x - this.particles[j].x;
              const dy = this.particles[i].y - this.particles[j].y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance < this.config.maxDistance) {
                  const opacity = (1 - distance / this.config.maxDistance) * this.config.connectionOpacity;

                  this.ctx.beginPath();
                  this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                  this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                  this.ctx.strokeStyle = this.config.colors.connections + Math.floor(opacity * 255).toString(16).padStart(2, '0');
                  this.ctx.lineWidth = 1;
                  this.ctx.stroke();
              }
          }
      }
  }

  animate() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.updateParticles();
      this.drawConnections();
      this.drawParticles();

      this.animationId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
      if (this.animationId) {
          cancelAnimationFrame(this.animationId);
      }
      if (this.canvas) {
          this.canvas.remove();
      }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CanvasBackground();
});