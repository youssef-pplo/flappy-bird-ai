// --- Configuration & Global State ---
const CONFIG = {
    popSize: 150,
    mutationRate: 0.1,
    elitismCount: 2, 
    speedMultiplier: 1,
    graphics: 'HIGH' 
};

const CONSTANTS = {
    GRAVITY: 0.25,
    JUMP_STRENGTH: -4.5,
    PIPE_SPEED: 2.5,
    PIPE_SPAWN_RATE: 100,
    BIRD_SIZE: 24,
    MIN_GAP: 110,
    MAX_GAP: 160
};

// --- Audio System ---
const AudioSys = {
    ctx: null,
    init: function() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch (e) {
            console.warn('Audio context not available:', e);
        }
    },
    playTone: function(freq, type, duration, vol=0.1) {
        if (!this.ctx || game.mode === 'ai') return; 
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    jump: function() { this.playTone(400, 'square', 0.1, 0.1); },
    score: function() { this.playTone(1000, 'sine', 0.1, 0.1); },
    hit: function() { this.playTone(150, 'sawtooth', 0.2, 0.2); }
};

// --- Neural Network ---
class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes) {
        this.inputNodes = inputNodes;
        this.hiddenNodes = hiddenNodes;
        this.outputNodes = outputNodes;
        this.weightsIH = new Float32Array(this.inputNodes * this.hiddenNodes);
        this.weightsHO = new Float32Array(this.hiddenNodes * this.outputNodes);
        this.randomize();
    }

    randomize() {
        for(let i=0; i<this.weightsIH.length; i++) this.weightsIH[i] = Math.random() * 2 - 1;
        for(let i=0; i<this.weightsHO.length; i++) this.weightsHO[i] = Math.random() * 2 - 1;
    }

    predict(inputs) {
        let hidden = new Float32Array(this.hiddenNodes);
        for(let j=0; j<this.hiddenNodes; j++) {
            let sum = 0;
            for(let i=0; i<this.inputNodes; i++) sum += inputs[i] * this.weightsIH[i * this.hiddenNodes + j];
            hidden[j] = Math.tanh(sum); 
        }
        let output = new Float32Array(this.outputNodes);
        for(let k=0; k<this.outputNodes; k++) {
            let sum = 0;
            for(let j=0; j<this.hiddenNodes; j++) sum += hidden[j] * this.weightsHO[j * this.outputNodes + k];
            output[k] = 1 / (1 + Math.exp(-sum));
        }
        return output;
    }

    clone() {
        let nn = new NeuralNetwork(this.inputNodes, this.hiddenNodes, this.outputNodes);
        nn.weightsIH.set(this.weightsIH);
        nn.weightsHO.set(this.weightsHO);
        return nn;
    }

    mutate(rate) {
        for(let i=0; i<this.weightsIH.length; i++) if(Math.random()<rate) this.weightsIH[i] += (Math.random()*0.5-0.25);
        for(let i=0; i<this.weightsHO.length; i++) if(Math.random()<rate) this.weightsHO[i] += (Math.random()*0.5-0.25);
    }
}

// --- Graphics & Particles ---
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = (Math.random() - 0.5) * 3;
        this.life = 1.0;
        this.color = `hsl(${Math.random()*50 + 40}, 100%, 50%)`; 
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.03;
    }

    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

const particles = {
    list: [],
    spawn: function(x, y, count) {
        if (CONFIG.graphics === 'LOW') return;
        for(let i=0; i<count; i++) this.list.push(new Particle(x, y));
    },
    updateAndDraw: function(ctx) {
        if (CONFIG.graphics === 'LOW') return;
        for(let i=this.list.length-1; i>=0; i--) {
            let p = this.list[i];
            p.update();
            p.draw(ctx);
            if(p.life <= 0) this.list.splice(i, 1);
        }
    }
};

// --- Game Logic ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI References
const ui = {
    start: document.getElementById('start-screen'),
    over: document.getElementById('game-over-screen'),
    score: document.getElementById('score-display'),
    dashboard: document.getElementById('ai-dashboard'),
    settings: document.getElementById('settings-modal'),
    aiConfig: document.getElementById('ai-config-modal'),
    finalScore: document.getElementById('final-score'),
    bestScore: document.getElementById('best-score')
};

function resize() {
    canvas.width = window.innerWidth > 500 ? 500 : window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

class Bird {
    constructor(brain = null) {
        this.y = canvas.height / 2;
        this.x = 60;
        this.velocity = 0;
        this.radius = CONSTANTS.BIRD_SIZE / 2;
        this.dead = false;
        this.score = 0;
        this.fitness = 0;
        // Inputs: 1.Y, 2.Vel, 3.PipeDist, 4.PipeTopY, 5.GapSize
        this.brain = brain ? brain.clone() : new NeuralNetwork(5, 8, 1);
    }

    update(pipesList) {
        if(this.dead) return;

        this.score++;

        this.velocity += CONSTANTS.GRAVITY;
        this.y += this.velocity;

        if(game.mode === 'ai') this.think(pipesList);

        // Floor/Ceiling
        if (this.y + this.radius >= canvas.height - 20 || this.y - this.radius <= 0) {
            this.die();
        }
    }

    think(pipesList) {
        let closest = null;
        let closestD = Infinity;
        // Find closest pipe in front of us
        for(let p of pipesList) {
            let d = (p.x + p.width) - (this.x - this.radius);
            if(d > 0 && d < closestD) {
                closest = p;
                closestD = d;
            }
        }
        if(closest) {
            let inputs = [
                this.y / canvas.height,
                (this.velocity + 15) / 30,
                closest.x / canvas.width,
                closest.topHeight / canvas.height,
                closest.gap / 300 // Normalize gap size
            ];
            let output = this.brain.predict(inputs);
            if(output[0] > 0.5) this.flap();
        }
    }

    flap() {
        if(this.dead) return;
        this.velocity = CONSTANTS.JUMP_STRENGTH;
        if(game.mode === 'normal') {
            AudioSys.jump();
            particles.spawn(this.x - 10, this.y + 5, 3);
        }
    }

    die() {
        this.dead = true;
        if(game.mode === 'normal') AudioSys.hit();
    }

    draw(isBest) {
        if(this.dead && !isBest) return; 

        ctx.save();
        ctx.translate(this.x, this.y);
        let rot = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
        ctx.rotate(rot);

        if(game.mode === 'ai') {
            ctx.globalAlpha = isBest ? 1.0 : 0.4;
        }

        if(CONFIG.graphics === 'HIGH') {
            // Body
            ctx.fillStyle = isBest ? '#fdd835' : (game.mode === 'ai' ? '#e57373' : '#fdd835');
            ctx.beginPath(); 
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2); 
            ctx.fill();
            ctx.strokeStyle = '#3e2723'; 
            ctx.lineWidth = 2; 
            ctx.stroke();

            // Eye
            ctx.fillStyle = '#fff'; 
            ctx.beginPath(); 
            ctx.arc(6, -6, 9, 0, Math.PI*2); 
            ctx.fill(); 
            ctx.stroke();

            ctx.fillStyle = '#000'; 
            ctx.beginPath(); 
            ctx.arc(8, -6, 3, 0, Math.PI*2); 
            ctx.fill();

            // Wing
            ctx.fillStyle = '#fff9c4'; 
            ctx.beginPath(); 
            ctx.ellipse(-6, 4, 10, 6, 0.2, 0, Math.PI*2); 
            ctx.fill(); 
            ctx.stroke();

            // Beak
            ctx.fillStyle = '#ff9800'; 
            ctx.beginPath(); 
            ctx.moveTo(6, 2); 
            ctx.lineTo(16, 6); 
            ctx.lineTo(6, 12); 
            ctx.fill(); 
            ctx.stroke();
        } else {
            ctx.fillStyle = isBest ? '#ffeb3b' : '#ef5350';
            ctx.beginPath(); 
            ctx.arc(0, 0, this.radius, 0, Math.PI*2); 
            ctx.fill();
            ctx.strokeStyle = '#000'; 
            ctx.lineWidth = 2; 
            ctx.stroke();
            ctx.fillStyle = 'black'; 
            ctx.beginPath(); 
            ctx.arc(5, -5, 2, 0, Math.PI*2); 
            ctx.fill();
        }

        ctx.restore();
        ctx.globalAlpha = 1.0;
    }
}

const pipes = {
    items: [],
    timer: 0,
    reset: function() { 
        this.items = []; 
        this.timer = 0; 
    },
    update: function() {
        if (this.timer % CONSTANTS.PIPE_SPAWN_RATE === 0) {
            const minPipe = 50;
            const currentGap = Math.floor(Math.random() * (CONSTANTS.MAX_GAP - CONSTANTS.MIN_GAP + 1)) + CONSTANTS.MIN_GAP;
            const maxPipe = canvas.height - 20 - currentGap - 50;
            const topHeight = Math.floor(Math.random() * (maxPipe - minPipe + 1)) + minPipe;
            
            this.items.push({ 
                x: canvas.width, 
                topHeight: topHeight, 
                width: 52, 
                gap: currentGap,
                passed: false 
            });
        }
        this.timer++;

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= CONSTANTS.PIPE_SPEED;
            if (!p.passed && p.x + p.width < 60) {
                if(game.mode === 'normal') {
                    game.score++;
                    ui.score.innerText = game.score;
                    AudioSys.score();
                }
                p.passed = true;
            }
            if (p.x + p.width < 0) {
                this.items.splice(i, 1);
                i--;
            }
        }
    },
    draw: function() {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2e5420'; 
        
        this.items.forEach(p => {
            let grad;
            if (CONFIG.graphics === 'HIGH') {
                grad = ctx.createLinearGradient(p.x, 0, p.x + p.width, 0);
                grad.addColorStop(0, '#73bf2e');
                grad.addColorStop(0.5, '#9ce659');
                grad.addColorStop(1, '#73bf2e');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = '#73bf2e';
            }
            // Top Pipe
            ctx.fillRect(p.x, 0, p.width, p.topHeight);
            ctx.strokeRect(p.x, -2, p.width, p.topHeight + 2);
            ctx.fillRect(p.x - 3, p.topHeight - 24, p.width + 6, 24);
            ctx.strokeRect(p.x - 3, p.topHeight - 24, p.width + 6, 24);
            let bottomY = p.topHeight + p.gap;
            let bottomH = canvas.height - bottomY - 20;
            
            // Bottom Pipe
            ctx.fillRect(p.x, bottomY, p.width, bottomH);
            ctx.strokeRect(p.x, bottomY, p.width, bottomH + 2);
            ctx.fillRect(p.x - 3, bottomY, p.width + 6, 24);
            ctx.strokeRect(p.x - 3, bottomY, p.width + 6, 24);
        });
    }
};

const background = {
    clouds: [],
    buildings: [],
    offset: 0,
    init: function() {
        this.clouds = [];
        for(let i=0; i<6; i++) this.addCloud(Math.random() * canvas.width);
        
        this.buildings = [];
        let currX = 0;
        while(currX < canvas.width * 2) {
            let w = 20 + Math.random() * 40;
            let h = 50 + Math.random() * 100;
            this.buildings.push({x: currX, w: w, h: h});
            currX += w;
        }
    },
    addCloud: function(x) {
        this.clouds.push({
            x: x, 
            y: Math.random() * (canvas.height/2.5), 
            speed: 0.2 + Math.random()*0.3, 
            scale: 0.5 + Math.random()*0.5
        });
    },
    update: function() {
        if(CONFIG.graphics === 'LOW') return;
        
        this.clouds.forEach(c => {
            c.x -= c.speed;
            if(c.x < -100) { 
                c.x = canvas.width + 100; 
                c.y = Math.random() * (canvas.height/2.5); 
            }
        });
        
        this.offset -= 0.5;
        if(this.offset <= -100) this.offset = 0; 
    },
    draw: function() {
        let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        skyGrad.addColorStop(0, '#4fc3f7');
        skyGrad.addColorStop(1, '#ffffff');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0,0,canvas.width, canvas.height);
        
        if(CONFIG.graphics === 'HIGH') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.clouds.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, 30*c.scale, 0, Math.PI*2);
                ctx.arc(c.x+25*c.scale, c.y-10*c.scale, 35*c.scale, 0, Math.PI*2);
                ctx.arc(c.x+50*c.scale, c.y, 30*c.scale, 0, Math.PI*2);
                ctx.fill();
            });
            ctx.fillStyle = '#a3d1d6';
            this.buildings.forEach((b, i) => {
                let bx = (b.x + this.offset * 0.5) % (canvas.width + 200);
                if(bx < -100) bx += canvas.width + 200;
                ctx.fillRect(bx, canvas.height - 20 - b.h, b.w + 1, b.h);
            });
            
            ctx.fillStyle = '#81c784'; 
            this.buildings.forEach((b, i) => {
                let h = b.h * 0.6; 
                let bx = (b.x + this.offset) % (canvas.width + 200);
                if(bx < -100) bx += canvas.width + 200;
                ctx.fillRect(bx, canvas.height - 20 - h, b.w + 1, h);
            });
        }
        
        ctx.fillStyle = '#ded895';
        ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
        
        ctx.fillStyle = '#73bf2e';
        ctx.fillRect(0, canvas.height - 20, canvas.width, 4);
        ctx.strokeStyle = '#558f22';
        ctx.beginPath(); 
        ctx.moveTo(0, canvas.height-20); 
        ctx.lineTo(canvas.width, canvas.height-20); 
        ctx.stroke();
    }
};

const game = {
    mode: 'normal',
    state: 'start', 
    score: 0,
    highScore: parseInt(localStorage.getItem('flappy_highscore') || '0', 10),
    frameId: null,
    
    birds: [],
    generation: 0,
    bestAIScore: 0,
    
    start: function() {
        ui.start.style.display = 'none';
        ui.over.style.display = 'none';
        ui.score.style.display = 'block';
        AudioSys.init();
        
        this.resetGameData();
        this.state = 'playing';
        this.loop();
    },
    
    resetGameData: function() {
        pipes.reset();
        particles.list = [];
        this.score = 0;
        ui.score.innerText = '0';
        background.init();
        
        if (this.mode === 'normal') {
            this.birds = [new Bird()];
            ui.dashboard.style.display = 'none';
        } else {
            ui.dashboard.style.display = 'block';
            if (this.generation === 0) this.createInitialPopulation();
        }
    },
    
    createInitialPopulation: function() {
        this.birds = [];
        for(let i=0; i<CONFIG.popSize; i++) this.birds.push(new Bird());
        this.generation = 1;
        this.updateDashboard();
    },
    
    evolve: function() {
        let sumScore = 0;
        let maxScore = 0;
        let bestBird = this.birds[0];
        
        for(let b of this.birds) {
            b.fitness = b.score * b.score; 
            sumScore += b.fitness;
            if(b.score > maxScore) { 
                maxScore = b.score; 
                bestBird = b; 
            }
        }
        if(maxScore > this.bestAIScore) this.bestAIScore = maxScore;
        let sortedBirds = [...this.birds].sort((a,b) => b.fitness - a.fitness);
        let newBirds = [];
        
        for(let i=0; i<CONFIG.elitismCount; i++) {
            if(sortedBirds[i]) newBirds.push(new Bird(sortedBirds[i].brain));
        }
        while(newBirds.length < CONFIG.popSize) {
            let parent = this.pickOne(this.birds, sumScore);
            let childBrain = parent.brain.clone();
            childBrain.mutate(CONFIG.mutationRate);
            newBirds.push(new Bird(childBrain));
        }
        this.birds = newBirds;
        this.generation++;
        this.resetGameData();
    },
    
    pickOne: function(list, sumProb) {
        let index = 0;
        let r = Math.random() * sumProb;
        while(index < list.length) {
            r -= list[index].fitness;
            if(r <= 0) return list[index];
            index++;
        }
        return list[list.length-1];
    },
    
    reset: function() {
        ui.over.style.display = 'none';
        this.start();
    },
    
    endGame: function() {
        this.state = 'start';
        if(this.frameId) cancelAnimationFrame(this.frameId);
        ui.dashboard.style.display = 'none';
        ui.score.style.display = 'none';
        ui.over.style.display = 'none';
        ui.start.style.display = 'block';
        this.generation = 0; 
    },
    
    gameOver: function() {
        if(this.mode === 'normal') {
            this.state = 'gameover';
            AudioSys.hit();
            if(this.frameId) cancelAnimationFrame(this.frameId);
            
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('flappy_highscore', this.highScore.toString());
            }
            ui.finalScore.innerText = this.score;
            ui.bestScore.innerText = this.highScore;
            
            setTimeout(() => {
                ui.score.style.display = 'none';
                ui.over.style.display = 'block';
            }, 500);
        } else {
            this.evolve();
        }
    },
    
    updateDashboard: function() {
        if(this.mode !== 'ai') return;
        let alive = this.birds.filter(b => !b.dead).length;
        document.getElementById('dash-gen').innerText = this.generation;
        document.getElementById('dash-alive').innerText = `${alive}/${CONFIG.popSize}`;
        document.getElementById('dash-best').innerText = this.bestAIScore;
        
        let currentBest = 0;
        this.birds.forEach(b => { if(b.score > currentBest) currentBest = b.score; });
        document.getElementById('dash-curr').innerText = currentBest;
    },
    
    step: function() {
        pipes.update();
        background.update();
        let allDead = true;
        
        for(let b of this.birds) {
            b.update(pipes.items);
            if(!b.dead) {
                allDead = false;
                for(let p of pipes.items) {
                    if (b.x + b.radius > p.x && b.x - b.radius < p.x + p.width) {
                        if (b.y - b.radius < p.topHeight || b.y + b.radius > p.topHeight + p.gap) {
                            b.die();
                        }
                    }
                }
            }
        }
        
        if(allDead) {
            this.gameOver();
            return false;
        }
        return true;
    },
    
    loop: function() {
        if (this.state !== 'playing') return;
        let loops = (this.mode === 'ai') ? CONFIG.speedMultiplier : 1;
        
        for(let i=0; i<loops; i++) {
            if(!this.step()) break;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        background.draw();
        pipes.draw();
        particles.updateAndDraw(ctx);
        
        let leader = null;
        let maxS = -1;
        this.birds.forEach(b => {
           if(!b.dead && b.score > maxS) { 
               maxS = b.score; 
               leader = b; 
           }
        });
        
        // Update main Score Display in AI mode
        if(game.mode === 'ai' && leader) {
            ui.score.innerText = leader.score;
        }
        
        for(let b of this.birds) b.draw(b === leader);
        if(this.mode === 'ai') this.updateDashboard();
        this.frameId = requestAnimationFrame(() => this.loop());
    }
};

// --- UI Controls ---
function startGame(mode) {
    game.mode = mode;
    game.start();
}

function showMainMenu() {
    ui.start.style.display = 'block';
    ui.over.style.display = 'none';
    ui.score.style.display = 'none';
}

function updateSpeed(val) {
    CONFIG.speedMultiplier = parseInt(val, 10);
    document.getElementById('speed-val').innerText = val + 'x';
}

// -- Settings Modal Logic --
function showSettings() { 
    ui.settings.style.display = 'block'; 
    ui.start.style.display = 'none'; 
}

function closeSettings() { 
    ui.settings.style.display = 'none'; 
    ui.start.style.display = 'block'; 
}

function setGraphics(level) {
    CONFIG.graphics = level;
    const toggle = document.getElementById('gfx-toggle');
    const btns = toggle.children;
    btns[0].classList.toggle('active', level === 'LOW');
    btns[1].classList.toggle('active', level === 'HIGH');
}

// -- AI Config Logic --
function showAiConfig() { 
    ui.aiConfig.style.display = 'block'; 
}

function closeAiConfig() { 
    ui.aiConfig.style.display = 'none'; 
}

function saveAiSettings() {
    let pop = parseInt(document.getElementById('cfg-pop').value, 10);
    let mut = parseFloat(document.getElementById('cfg-mut').value);
    let elite = parseInt(document.getElementById('cfg-elite').value, 10);
    
    CONFIG.popSize = Math.max(20, Math.min(1500, pop));
    CONFIG.mutationRate = Math.max(0.01, Math.min(0.5, mut));
    CONFIG.elitismCount = Math.max(0, Math.min(10, elite));
    
    closeAiConfig();
    game.generation = 0; 
    game.bestAIScore = 0;
    game.resetGameData(); 
}

// -- Dragging Logic for AI Dashboard --
(function enableDragging() {
    const dashboard = document.getElementById('ai-dashboard');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    
    dashboard.addEventListener('mousedown', startDrag);
    dashboard.addEventListener('touchstart', startDrag, {passive: false});
    
    function startDrag(e) {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        
        // Get initial cursor/touch position
        if(e.type === 'touchstart') {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }
        
        // Get element's current position
        const style = window.getComputedStyle(dashboard);
        initialLeft = parseInt(style.left, 10);
        initialTop = parseInt(style.top, 10);
        
        dashboard.style.cursor = 'grabbing';
    }
    
    function onDrag(e) {
        if(!isDragging) return;
        e.preventDefault(); 
        
        let currentX, currentY;
        if(e.type === 'touchmove') {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        } else {
            currentX = e.clientX;
            currentY = e.clientY;
        }
        const dx = currentX - startX;
        const dy = currentY - startY;
        dashboard.style.left = `${initialLeft + dx}px`;
        dashboard.style.top = `${initialTop + dy}px`;
    }
    
    function stopDrag() {
        isDragging = false;
        dashboard.style.cursor = 'move';
    }
    
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, {passive: false});
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
})();

// -- Input Handling --
function handleInput(e) {
    if(e.type === 'keydown' && e.code !== 'Space') return;
    if(e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    if(e.type !== 'keydown') e.preventDefault(); 
    if (game.state === 'playing' && game.mode === 'normal') {
        game.birds[0].flap();
    } 
}

window.addEventListener('keydown', handleInput);
window.addEventListener('mousedown', handleInput);
window.addEventListener('touchstart', handleInput, {passive: false});

// Initialize background
background.init();
background.draw();

