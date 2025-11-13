// 优化版球球大作战游戏
class Game {
    constructor() {
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: false
        });
        
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d', {
            alpha: false
        });
        
        // 世界配置
        this.world = {
            width: 4000,
            height: 4000
        };
        
        // 游戏状态
        this.players = [];
        this.foods = [];
        this.particles = [];
        this.player = null;
        this.camera = { x: 0, y: 0 };
        this.gameState = 'menu'; // menu, playing, paused, gameover
        this.score = 0;
        this.startTime = 0;
        this.isPaused = false;
        this.defeatedPlayers = 0;
        
        // 性能优化
        this.lastFrameTime = performance.now();
        this.fps = 60;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
        
        // 游戏设置
        this.settings = {
            graphicsQuality: 'medium',
            particleEffects: true,
            showGrid: true,
            soundEffects: true
        };
        
        // 颜色方案
        this.colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', 
            '#bb8fce', '#85c88a', '#f8b500', '#6c5ce7',
            '#00b894', '#fdcb6e', '#e17055', '#74b9ff',
            '#a29bfe', '#fd79a8', '#55efc4', '#81ecec'
        ];
        
        // 鼠标状态
        this.mousePos = { x: 0, y: 0 };
        this.mouseWorldPos = { x: 0, y: 0 };
        this.mouseDown = false;
        this.mouseUpdateTime = 0;
        
        // 缓存对象
        this.objectPool = {
            particles: [],
            foods: []
        };
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.generateFood();
        this.setupEventListeners();
        this.hideLoadingScreen();
        this.gameLoop();
    }
    
    hideLoadingScreen() {
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                setTimeout(() => loadingScreen.style.display = 'none', 500);
            }
        }, 1000);
    }
    
    setupCanvas() {
        // 设置高DPI支持
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        // 设置画布样式优化
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'high';
        
        this.minimapCanvas.width = 180;
        this.minimapCanvas.height = 180;
        
        window.addEventListener('resize', () => this.handleResize());
    }
    
    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        if (this.settings.graphicsQuality === 'high') {
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = window.innerWidth * dpr;
            this.canvas.height = window.innerHeight * dpr;
            this.canvas.style.width = window.innerWidth + 'px';
            this.canvas.style.height = window.innerHeight + 'px';
            this.ctx.scale(dpr, dpr);
        }
    }
    
    generateFood() {
        const foodCount = this.settings.graphicsQuality === 'high' ? 800 : 
                         this.settings.graphicsQuality === 'medium' ? 600 : 400;
        
        for (let i = 0; i < foodCount; i++) {
            this.foods.push({
                x: Math.random() * this.world.width,
                y: Math.random() * this.world.height,
                radius: Math.random() * 4 + 3,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }
    
    setupEventListeners() {
        // 开始游戏
        document.getElementById('startBtn').addEventListener('click', () => {
            const playerName = document.getElementById('playerName').value.trim();
            if (playerName) {
                this.startGame(playerName);
            } else {
                this.showNotification('请输入你的游戏昵称！');
            }
        });
        
        // 重新开始
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restartGame();
        });
        
        // 返回主页
        document.getElementById('homeBtn').addEventListener('click', () => {
            this.returnToMenu();
        });
        
        // 鼠标事件 - 优化响应速度
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.gameState === 'playing' && !this.isPaused && this.player) {
                const rect = this.canvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                
                this.mousePos.x = canvasX;
                this.mousePos.y = canvasY;
                this.mouseWorldPos.x = canvasX + this.camera.x;
                this.mouseWorldPos.y = canvasY + this.camera.y;
                this.mouseUpdateTime = performance.now();
                
                // 实时更新玩家目标位置
                this.player.targetX = this.mouseWorldPos.x;
                this.player.targetY = this.mouseWorldPos.y;
            }
        });
        
        // 触摸事件支持
        this.canvas.addEventListener('touchmove', (e) => {
            if (this.gameState === 'playing' && !this.isPaused && this.player) {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.touches[0];
                const canvasX = touch.clientX - rect.left;
                const canvasY = touch.clientY - rect.top;
                
                this.mousePos.x = canvasX;
                this.mousePos.y = canvasY;
                this.mouseWorldPos.x = canvasX + this.camera.x;
                this.mouseWorldPos.y = canvasY + this.camera.y;
                this.mouseUpdateTime = performance.now();
                
                // 实时更新玩家目标位置
                this.player.targetX = this.mouseWorldPos.x;
                this.player.targetY = this.mouseWorldPos.y;
            }
        });
        
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (this.gameState === 'playing' && !this.isPaused) {
                switch(e.code) {
                    case 'Space':
                        e.preventDefault();
                        this.splitPlayer();
                        break;
                    case 'KeyW':
                        e.preventDefault();
                        this.ejectMass();
                        break;
                    case 'Escape':
                        this.togglePause();
                        break;
                }
            } else if (this.gameState === 'paused') {
                if (e.code === 'Escape') {
                    this.togglePause();
                }
            }
        });
        
        // 游戏控制按钮
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });
        
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });
        
        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });
        
        // 设置面板
        document.getElementById('closeSettings').addEventListener('click', () => {
            this.hideSettings();
        });
        
        // 设置项监听
        document.getElementById('graphicsQuality').addEventListener('change', (e) => {
            this.settings.graphicsQuality = e.target.value;
            this.applyGraphicsSettings();
        });
        
        document.getElementById('particleEffects').addEventListener('change', (e) => {
            this.settings.particleEffects = e.target.checked;
        });
        
        document.getElementById('showGrid').addEventListener('change', (e) => {
            this.settings.showGrid = e.target.checked;
        });
        
        // 暂停菜单
        document.getElementById('resumeBtn').addEventListener('click', () => {
            this.togglePause();
        });
        
        document.getElementById('quitBtn').addEventListener('click', () => {
            this.returnToMenu();
        });
        
        // 输入框回车键
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('startBtn').click();
            }
        });
    }
    
    startGame(playerName) {
        // 创建玩家
        this.player = {
            name: playerName,
            x: this.world.width / 2,
            y: this.world.height / 2,
            radius: 25,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            targetX: this.world.width / 2,
            targetY: this.world.height / 2,
            velocityX: 0,
            velocityY: 0,
            parts: [{
                x: this.world.width / 2,
                y: this.world.height / 2,
                radius: 25,
                vx: 0,
                vy: 0
            }],
            mass: 625,
            score: 0,
            lastSplitTime: 0
        };
        
        // 确保鼠标初始位置正确
        this.mouseWorldPos = {
            x: this.world.width / 2,
            y: this.world.height / 2
        };
        
        // 生成AI玩家
        this.generateAIPlayers(8);
        
        // 切换游戏状态
        this.gameState = 'playing';
        this.isPaused = false;
        this.startTime = Date.now();
        this.defeatedPlayers = 0;
        
        // 隐藏菜单，显示游戏
        document.getElementById('startMenu').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'block';
        
        // 更新统计
        this.updateStats();
        
        // 添加鼠标进入画布的监听
        this.canvas.addEventListener('mouseenter', () => {
            this.canvas.style.cursor = 'crosshair';
        });
    }
    
    generateAIPlayers(count) {
        for (let i = 0; i < count; i++) {
            const radius = Math.random() * 30 + 15;
            const aiPlayer = {
                name: `AI玩家${i + 1}`,
                x: Math.random() * this.world.width,
                y: Math.random() * this.world.height,
                radius: radius,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                targetX: Math.random() * this.world.width,
                targetY: Math.random() * this.world.height,
                velocityX: 0,
                velocityY: 0,
                parts: [{
                    x: Math.random() * this.world.width,
                    y: Math.random() * this.world.height,
                    radius: radius,
                    vx: 0,
                    vy: 0
                }],
                mass: radius * radius * Math.PI,
                score: 0,
                isAI: true,
                aiUpdateCounter: 0,
                personality: Math.random() > 0.5 ? 'aggressive' : 'defensive'
            };
            this.players.push(aiPlayer);
        }
    }
    
    splitPlayer() {
        const now = Date.now();
        if (now - this.player.lastSplitTime < 1000) return; // 分裂冷却时间
        if (this.player.parts.length >= 16) return; // 最多分裂成16个部分
        
        this.player.lastSplitTime = now;
        const newParts = [];
        
        this.player.parts.forEach(part => {
            if (part.radius > 20) {
                const newRadius = Math.sqrt(part.radius * part.radius / 2);
                part.radius = newRadius;
                
                // 计算分裂方向
                const dx = this.player.targetX - part.x;
                const dy = this.player.targetY - part.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = distance > 0 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
                
                // 创建分裂后的新球
                const splitSpeed = 20;
                newParts.push({
                    x: part.x + Math.cos(angle) * newRadius * 2,
                    y: part.y + Math.sin(angle) * newRadius * 2,
                    radius: newRadius,
                    vx: Math.cos(angle) * splitSpeed,
                    vy: Math.sin(angle) * splitSpeed
                });
                
                // 创建分裂粒子效果
                if (this.settings.particleEffects) {
                    this.createSplitEffect(part.x, part.y, part.color);
                }
            }
        });
        
        this.player.parts.push(...newParts);
    }
    
    ejectMass() {
        this.player.parts.forEach(part => {
            if (part.radius > 25) {
                const massLoss = part.radius * 0.1;
                part.radius = Math.sqrt(part.radius * part.radius - massLoss * massLoss);
                
                // 计算发射方向
                const dx = this.player.targetX - part.x;
                const dy = this.player.targetY - part.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = distance > 0 ? Math.atan2(dy, dx) : 0;
                
                // 创建发射的小球
                const ejectBall = {
                    x: part.x + Math.cos(angle) * part.radius,
                    y: part.y + Math.sin(angle) * part.radius,
                    radius: 8,
                    vx: Math.cos(angle) * 15,
                    vy: Math.sin(angle) * 15,
                    color: this.player.color,
                    isEjected: true
                };
                
                // 添加到临时数组，稍后转换为食物
                if (!this.ejectedBalls) this.ejectedBalls = [];
                this.ejectedBalls.push(ejectBall);
            }
        });
    }
    
    createSplitEffect(x, y, color) {
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            const speed = Math.random() * 5 + 2;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 3 + 1,
                color: color,
                life: 1.0,
                decay: 0.02
            });
        }
    }
    
    togglePause() {
        if (this.gameState === 'playing') {
            this.isPaused = !this.isPaused;
            if (this.isPaused) {
                this.gameState = 'paused';
                document.getElementById('pauseMenu').style.display = 'flex';
            } else {
                this.gameState = 'playing';
                document.getElementById('pauseMenu').style.display = 'none';
            }
        }
    }
    
    showSettings() {
        document.getElementById('settingsPanel').style.display = 'flex';
        this.isPaused = true;
    }
    
    hideSettings() {
        document.getElementById('settingsPanel').style.display = 'none';
        if (this.gameState === 'paused') {
            this.isPaused = false;
            this.gameState = 'playing';
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('无法进入全屏模式:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    showNotification(message) {
        // 创建临时通知元素
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 107, 107, 0.9);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-weight: bold;
            z-index: 10000;
            animation: fadeInOut 2s ease;
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }
    
    updateGame() {
        if (this.gameState !== 'playing' || this.isPaused) return;
        
        // 更新玩家
        if (this.player) {
            this.updatePlayer(this.player);
            this.updatePlayerParts(this.player);
        }
        
        // 更新AI玩家
        this.players.forEach(player => {
            this.updatePlayer(player);
            this.updatePlayerParts(player);
            if (player.isAI) {
                this.updateAI(player);
            }
        });
        
        // 更新发射的小球
        if (this.ejectedBalls) {
            this.updateEjectedBalls();
        }
        
        // 更新粒子
        if (this.settings.particleEffects) {
            this.updateParticles();
        }
        
        // 检查碰撞
        this.checkCollisions();
        
        // 补充食物
        if (Math.random() < 0.1 && this.foods.length < 800) {
            this.generateFood();
        }
        
        // 更新相机
        this.updateCamera();
        
        // 更新UI
        this.updateUI();
    }
    
    updatePlayer(player) {
        // 如果没有目标位置，设置为当前玩家中心位置
        if (!player.targetX || !player.targetY) {
            let centerX = 0, centerY = 0;
            player.parts.forEach(part => {
                centerX += part.x;
                centerY += part.y;
            });
            centerX /= player.parts.length;
            centerY /= player.parts.length;
            
            player.targetX = centerX;
            player.targetY = centerY;
        }
        
        // 对于人类玩家，确保target位置始终跟随鼠标
        if (player === this.player && this.mouseWorldPos.x && this.mouseWorldPos.y) {
            player.targetX = this.mouseWorldPos.x;
            player.targetY = this.mouseWorldPos.y;
        }
    }
    
    updatePlayerParts(player) {
        player.parts.forEach((part, index) => {
            // 确保targetX和targetY存在
            if (!player.targetX || !player.targetY) {
                player.targetX = part.x;
                player.targetY = part.y;
            }
            
            // 计算到目标的距离
            const dx = player.targetX - part.x;
            const dy = player.targetY - part.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 基础速度计算
            const baseSpeed = Math.max(2.5, 10 - part.radius * 0.06);
            
            // 处理分裂速度
            if (part.vx !== 0 || part.vy !== 0) {
                part.velocityX = part.vx;
                part.velocityY = part.vy;
                part.vx *= 0.85;
                part.vy *= 0.85;
                
                // 当速度足够小时停止
                if (Math.abs(part.vx) < 0.5) part.vx = 0;
                if (Math.abs(part.vy) < 0.5) part.vy = 0;
            } else if (distance > 5) {
                // 正常移动 - 确保有持续移动
                part.velocityX = (dx / distance) * baseSpeed;
                part.velocityY = (dy / distance) * baseSpeed;
            } else {
                // 速度衰减但不要完全停止
                part.velocityX *= 0.95;
                part.velocityY *= 0.95;
            }
            
            // 更新位置
            part.x += part.velocityX;
            part.y += part.velocityY;
            
            // 边界检查
            part.x = Math.max(part.radius, Math.min(this.world.width - part.radius, part.x));
            part.y = Math.max(part.radius, Math.min(this.world.height - part.radius, part.y));
            
            // 球球之间的分离检测
            for (let j = index + 1; j < player.parts.length; j++) {
                const otherPart = player.parts[j];
                const dx2 = otherPart.x - part.x;
                const dy2 = otherPart.y - part.y;
                const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                const minDistance = part.radius + otherPart.radius;
                
                if (distance2 < minDistance) {
                    const overlap = minDistance - distance2;
                    const separationX = (dx2 / distance2) * overlap * 0.5;
                    const separationY = (dy2 / distance2) * overlap * 0.5;
                    
                    part.x -= separationX;
                    part.y -= separationY;
                    otherPart.x += separationX;
                    otherPart.y += separationY;
                }
            }
        });
        
        // 更新玩家质量
        let totalMass = 0;
        player.parts.forEach(part => {
            totalMass += part.radius * part.radius * Math.PI;
        });
        player.mass = totalMass;
    }
    
    updateAI(aiPlayer) {
        aiPlayer.aiUpdateCounter++;
        if (aiPlayer.aiUpdateCounter % 30 !== 0) return; // 每30帧更新一次AI决策
        
        const mainPart = aiPlayer.parts[0];
        
        // 检查威胁
        let threats = [];
        if (this.player) {
            this.player.parts.forEach(part => {
                const distance = Math.sqrt(
                    Math.pow(part.x - mainPart.x, 2) + 
                    Math.pow(part.y - mainPart.y, 2)
                );
                if (part.radius > mainPart.radius * 1.2 && distance < 200) {
                    threats.push({ player: part, distance: distance, type: 'player' });
                }
            });
        }
        
        // 检查其他AI威胁
        this.players.forEach(otherAI => {
            if (otherAI !== aiPlayer) {
                otherAI.parts.forEach(part => {
                    const distance = Math.sqrt(
                        Math.pow(part.x - mainPart.x, 2) + 
                        Math.pow(part.y - mainPart.y, 2)
                    );
                    if (part.radius > mainPart.radius * 1.2 && distance < 200) {
                        threats.push({ player: part, distance: distance, type: 'ai' });
                    }
                });
            }
        });
        
        // 如果有威胁，优先逃跑
        if (threats.length > 0) {
            threats.sort((a, b) => a.distance - b.distance);
            const threat = threats[0];
            const escapeAngle = Math.atan2(
                mainPart.y - threat.player.y,
                mainPart.x - threat.player.x
            );
            const escapeDistance = 300;
            
            aiPlayer.targetX = mainPart.x + Math.cos(escapeAngle) * escapeDistance;
            aiPlayer.targetY = mainPart.y + Math.sin(escapeAngle) * escapeDistance;
        } else {
            // 根据性格决定行为
            if (aiPlayer.personality === 'aggressive') {
                // 积极寻找食物和小球
                let targets = [];
                
                // 寻找食物
                this.foods.forEach(food => {
                    const distance = Math.sqrt(
                        Math.pow(food.x - mainPart.x, 2) + 
                        Math.pow(food.y - mainPart.y, 2)
                    );
                    if (distance < 300) {
                        targets.push({ item: food, distance: distance, type: 'food' });
                    }
                });
                
                // 寻找比AI小的球
                if (this.player) {
                    this.player.parts.forEach(part => {
                        if (part.radius < mainPart.radius * 0.8) {
                            const distance = Math.sqrt(
                                Math.pow(part.x - mainPart.x, 2) + 
                                Math.pow(part.y - mainPart.y, 2)
                            );
                            if (distance < 400) {
                                targets.push({ item: part, distance: distance, type: 'prey' });
                            }
                        }
                    });
                }
                
                if (targets.length > 0) {
                    targets.sort((a, b) => a.distance - b.distance);
                    const target = targets[0];
                    aiPlayer.targetX = target.item.x;
                    aiPlayer.targetY = target.item.y;
                } else {
                    // 随机移动探索
                    if (Math.random() < 0.1) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = 200 + Math.random() * 200;
                        aiPlayer.targetX = mainPart.x + Math.cos(angle) * distance;
                        aiPlayer.targetY = mainPart.y + Math.sin(angle) * distance;
                    }
                }
            } else {
                // 防守型，更谨慎
                let safeFood = [];
                this.foods.forEach(food => {
                    const distance = Math.sqrt(
                        Math.pow(food.x - mainPart.x, 2) + 
                        Math.pow(food.y - mainPart.y, 2)
                    );
                    
                    // 检查食物周围是否安全
                    let isSafe = true;
                    if (this.player) {
                        this.player.parts.forEach(part => {
                            const distanceToPlayer = Math.sqrt(
                                Math.pow(part.x - food.x, 2) + 
                                Math.pow(part.y - food.y, 2)
                            );
                            if (distanceToPlayer < 150 && part.radius > mainPart.radius) {
                                isSafe = false;
                            }
                        });
                    }
                    
                    if (isSafe && distance < 200) {
                        safeFood.push({ item: food, distance: distance });
                    }
                });
                
                if (safeFood.length > 0) {
                    safeFood.sort((a, b) => a.distance - b.distance);
                    const food = safeFood[0].item;
                    aiPlayer.targetX = food.x;
                    aiPlayer.targetY = food.y;
                } else {
                    // 随机移动，但不要太激进
                    if (Math.random() < 0.05) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = 100 + Math.random() * 100;
                        aiPlayer.targetX = mainPart.x + Math.cos(angle) * distance;
                        aiPlayer.targetY = mainPart.y + Math.sin(angle) * distance;
                    }
                }
            }
        }
        
        // AI分裂逻辑
        if (Math.random() < 0.01 && aiPlayer.parts.length < 4) {
            const dx = aiPlayer.targetX - mainPart.x;
            const dy = aiPlayer.targetY - mainPart.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 100) {
                this.aiSplit(aiPlayer);
            }
        }
    }
    
    aiSplit(aiPlayer) {
        const newParts = [];
        aiPlayer.parts.forEach(part => {
            if (part.radius > 25) {
                const newRadius = Math.sqrt(part.radius * part.radius / 2);
                part.radius = newRadius;
                
                const dx = aiPlayer.targetX - part.x;
                const dy = aiPlayer.targetY - part.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = distance > 0 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
                
                newParts.push({
                    x: part.x + Math.cos(angle) * newRadius * 2,
                    y: part.y + Math.sin(angle) * newRadius * 2,
                    radius: newRadius,
                    vx: Math.cos(angle) * 18,
                    vy: Math.sin(angle) * 18
                });
            }
        });
        
        aiPlayer.parts.push(...newParts);
    }
    
    updateEjectedBalls() {
        if (!this.ejectedBalls) return;
        
        this.ejectedBalls = this.ejectedBalls.filter(ball => {
            // 更新位置
            ball.x += ball.vx;
            ball.y += ball.vy;
            ball.vx *= 0.98;
            ball.vy *= 0.98;
            
            // 检查边界
            if (ball.x < 0 || ball.x > this.world.width || 
                ball.y < 0 || ball.y > this.world.height) {
                return false;
            }
            
            // 检查速度
            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            if (speed < 0.5) {
                // 转换为食物
                this.foods.push({
                    x: ball.x,
                    y: ball.y,
                    radius: ball.radius,
                    color: ball.color,
                    pulsePhase: Math.random() * Math.PI * 2
                });
                return false;
            }
            
            return true;
        });
    }
    
    updateParticles() {
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.98;
            particle.vy *= 0.98;
            particle.life -= particle.decay;
            
            return particle.life > 0;
        });
    }
    
    checkCollisions() {
        // 玩家吃食物
        if (this.player) {
            this.player.parts.forEach(part => {
                this.foods = this.foods.filter(food => {
                    const distance = Math.sqrt(
                        Math.pow(food.x - part.x, 2) + 
                        Math.pow(food.y - part.y, 2)
                    );
                    
                    if (distance < part.radius + food.radius) {
                        part.radius = Math.sqrt(part.radius * part.radius + food.radius * food.radius);
                        this.player.score += Math.floor(food.radius * 2);
                        
                        // 创建吃食物的粒子效果
                        if (this.settings.particleEffects) {
                            this.createEatEffect(food.x, food.y, food.color);
                        }
                        
                        return false;
                    }
                    return true;
                });
            });
        }
        
        // AI玩家吃食物
        this.players.forEach(player => {
            player.parts.forEach(part => {
                this.foods = this.foods.filter(food => {
                    const distance = Math.sqrt(
                        Math.pow(food.x - part.x, 2) + 
                        Math.pow(food.y - part.y, 2)
                    );
                    
                    if (distance < part.radius + food.radius) {
                        part.radius = Math.sqrt(part.radius * part.radius + food.radius * food.radius);
                        player.score += Math.floor(food.radius * 2);
                        return false;
                    }
                    return true;
                });
            });
        });
        
        // 玩家之间的碰撞
        this.checkPlayerCollisions();
        
        // 检查玩家是否死亡
        if (this.player && this.player.parts.length === 0) {
            this.gameOver();
        }
    }
    
    checkPlayerCollisions() {
        const allPlayers = [...this.players];
        if (this.player) {
            allPlayers.push(this.player);
        }
        
        for (let i = 0; i < allPlayers.length; i++) {
            for (let j = i + 1; j < allPlayers.length; j++) {
                const player1 = allPlayers[i];
                const player2 = allPlayers[j];
                
                player1.parts.forEach(part1 => {
                    player2.parts.forEach(part2 => {
                        const distance = Math.sqrt(
                            Math.pow(part1.x - part2.x, 2) + 
                            Math.pow(part1.y - part2.y, 2)
                        );
                        
                        if (distance < part1.radius + part2.radius) {
                            // 大的吃小的
                            if (part1.radius > part2.radius * 1.1) {
                                const massGain = part2.radius * part2.radius * Math.PI;
                                part1.radius = Math.sqrt(part1.radius * part1.radius + massGain);
                                player1.score += Math.floor(part2.radius * 5);
                                player2.parts = player2.parts.filter(p => p !== part2);
                                
                                // 如果玩家被吃，增加击败计数
                                if (player2 === this.player) {
                                    this.defeatedPlayers++;
                                }
                                
                                // 创建被吃的粒子效果
                                if (this.settings.particleEffects) {
                                    this.createEatEffect(part2.x, part2.y, part2.color);
                                }
                            } else if (part2.radius > part1.radius * 1.1) {
                                const massGain = part1.radius * part1.radius * Math.PI;
                                part2.radius = Math.sqrt(part2.radius * part2.radius + massGain);
                                player2.score += Math.floor(part1.radius * 5);
                                player1.parts = player1.parts.filter(p => p !== part1);
                                
                                if (player1 === this.player) {
                                    this.defeatedPlayers++;
                                }
                                
                                if (this.settings.particleEffects) {
                                    this.createEatEffect(part1.x, part1.y, part1.color);
                                }
                            }
                        }
                    });
                });
            }
        }
        
        // 移除没有部分的玩家
        this.players = this.players.filter(player => player.parts.length > 0);
        
        // 补充AI玩家
        while (this.players.length < 5) {
            this.generateAIPlayers(1);
        }
    }
    
    createEatEffect(x, y, color) {
        for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 2 + 1,
                color: color,
                life: 1.0,
                decay: 0.03
            });
        }
    }
    
    updateCamera() {
        if (!this.player || this.player.parts.length === 0) return;
        
        // 计算玩家中心点
        let totalX = 0, totalY = 0;
        this.player.parts.forEach(part => {
            totalX += part.x;
            totalY += part.y;
        });
        
        const centerX = totalX / this.player.parts.length;
        const centerY = totalY / this.player.parts.length;
        
        // 平滑相机移动
        const targetCameraX = centerX - this.canvas.width / 2;
        const targetCameraY = centerY - this.canvas.height / 2;
        
        this.camera.x += (targetCameraX - this.camera.x) * 0.1;
        this.camera.y += (targetCameraY - this.camera.y) * 0.1;
        
        // 限制相机边界
        this.camera.x = Math.max(0, Math.min(this.world.width - this.canvas.width, this.camera.x));
        this.camera.y = Math.max(0, Math.min(this.world.height - this.canvas.height, this.camera.y));
    }
    
    updateUI() {
        if (!this.player) return;
        
        // 更新分数和质量
        document.getElementById('score').textContent = this.player.score;
        document.getElementById('mass').textContent = Math.floor(this.player.mass);
        
        // 计算排名
        const allPlayers = [...this.players];
        if (this.player) {
            allPlayers.push(this.player);
        }
        allPlayers.sort((a, b) => b.score - a.score);
        const rank = allPlayers.findIndex(p => p === this.player) + 1;
        document.getElementById('rank').textContent = rank;
        
        // 更新排行榜
        this.updateLeaderboard(allPlayers.slice(0, 10));
        
        // 更新在线人数
        document.getElementById('onlineCount').textContent = this.players.length + 1;
    }
    
    updateLeaderboard(topPlayers) {
        const leaderList = document.getElementById('leaderList');
        leaderList.innerHTML = '';
        
        topPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            if (index === 0) item.classList.add('top-player');
            
            item.innerHTML = `
                <span>${index + 1}. ${player.name}</span>
                <span>${player.score}</span>
            `;
            leaderList.appendChild(item);
        });
    }
    
    updateStats() {
        // 更新统计数据
        const totalPlayers = Math.floor(Math.random() * 1000) + 500;
        const todayGames = Math.floor(Math.random() * 10000) + 5000;
        
        document.getElementById('totalPlayers').textContent = totalPlayers.toLocaleString();
        document.getElementById('todayGames').textContent = todayGames.toLocaleString();
    }
    
    applyGraphicsSettings() {
        switch(this.settings.graphicsQuality) {
            case 'low':
                this.foods = this.foods.slice(0, 400);
                break;
            case 'medium':
                while (this.foods.length < 600) {
                    this.generateFood();
                }
                break;
            case 'high':
                while (this.foods.length < 800) {
                    this.generateFood();
                }
                break;
        }
    }
    
    render() {
        // 清空画布
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.gameState !== 'playing' && this.gameState !== 'paused') return;
        
        // 保存上下文状态
        this.ctx.save();
        
        // 应用相机变换
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // 绘制网格背景
        if (this.settings.showGrid) {
            this.drawGrid();
        }
        
        // 绘制食物
        this.foods.forEach(food => {
            this.drawFood(food);
        });
        
        // 绘制发射的小球
        if (this.ejectedBalls) {
            this.ejectedBalls.forEach(ball => {
                this.drawEjectedBall(ball);
            });
        }
        
        // 绘制AI玩家
        this.players.forEach(player => {
            this.drawPlayer(player);
        });
        
        // 绘制玩家
        if (this.player) {
            this.drawPlayer(this.player);
        }
        
        // 绘制粒子效果
        if (this.settings.particleEffects) {
            this.particles.forEach(particle => {
                this.drawParticle(particle);
            });
        }
        
        // 恢复上下文状态
        this.ctx.restore();
        
        // 绘制小地图
        this.renderMinimap();
        
        // 更新FPS
        this.updateFPS();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        const startX = Math.floor(this.camera.x / gridSize) * gridSize;
        const startY = Math.floor(this.camera.y / gridSize) * gridSize;
        const endX = this.camera.x + this.canvas.width;
        const endY = this.camera.y + this.canvas.height;
        
        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }
        
        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }
    }
    
    drawFood(food) {
        // 添加脉动效果
        const pulse = Math.sin(Date.now() * 0.003 + food.pulsePhase) * 0.1 + 1;
        const radius = food.radius * pulse;
        
        this.ctx.fillStyle = food.color;
        this.ctx.beginPath();
        this.ctx.arc(food.x, food.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 添加光晕效果
        const gradient = this.ctx.createRadialGradient(
            food.x, food.y, 0,
            food.x, food.y, radius * 1.5
        );
        gradient.addColorStop(0, food.color + '40');
        gradient.addColorStop(1, food.color + '00');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(food.x, food.y, radius * 1.5, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawEjectedBall(ball) {
        this.ctx.fillStyle = ball.color;
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 添加边框
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }
    
    drawPlayer(player) {
        player.parts.forEach((part, index) => {
            // 绘制球体阴影
            const gradient = this.ctx.createRadialGradient(
                part.x - part.radius * 0.3, 
                part.y - part.radius * 0.3, 
                0,
                part.x, part.y, part.radius
            );
            gradient.addColorStop(0, this.lightenColor(player.color, 30));
            gradient.addColorStop(0.7, player.color);
            gradient.addColorStop(1, this.darkenColor(player.color, 20));
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(part.x, part.y, part.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制边框
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制名字（只在最大的球上显示）
            if (player.parts.length === 1 || index === 0) {
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold ${Math.max(14, part.radius / 2.5)}px 'Segoe UI', Arial, sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                // 添加文字阴影
                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                this.ctx.shadowBlur = 3;
                this.ctx.shadowOffsetX = 1;
                this.ctx.shadowOffsetY = 1;
                
                this.ctx.fillText(player.name, part.x, part.y - part.radius - 15);
                
                // 重置阴影
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
                
                // 绘制分数
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.font = `bold ${Math.max(12, part.radius / 3)}px 'Segoe UI', Arial, sans-serif`;
                this.ctx.fillText(player.score, part.x, part.y + 5);
            }
        });
    }
    
    drawParticle(particle) {
        this.ctx.fillStyle = particle.color + Math.floor(particle.life * 255).toString(16).padStart(2, '0');
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.radius * particle.life, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255))
            .toString(16).slice(1);
    }
    
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 +
            (G > 0 ? G : 0) * 0x100 +
            (B > 0 ? B : 0))
            .toString(16).slice(1);
    }
    
    renderMinimap() {
        // 清空小地图
        this.minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        this.minimapCtx.fillRect(0, 0, 180, 180);
        
        const scale = 180 / Math.max(this.world.width, this.world.height);
        
        // 绘制食物（简化为点）
        this.minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.foods.forEach(food => {
            if ((food.x - this.camera.x > -100 && food.x - this.camera.x < this.canvas.width + 100) &&
                (food.y - this.camera.y > -100 && food.y - this.camera.y < this.canvas.height + 100)) {
                this.minimapCtx.fillRect(
                    food.x * scale,
                    food.y * scale,
                    2, 2
                );
            }
        });
        
        // 绘制AI玩家
        this.minimapCtx.fillStyle = 'rgba(255, 100, 100, 0.6)';
        this.players.forEach(player => {
            player.parts.forEach(part => {
                this.minimapCtx.beginPath();
                this.minimapCtx.arc(
                    part.x * scale,
                    part.y * scale,
                    Math.max(3, part.radius * scale),
                    0, Math.PI * 2
                );
                this.minimapCtx.fill();
            });
        });
        
        // 绘制玩家
        if (this.player) {
            this.minimapCtx.fillStyle = '#4ecdc4';
            this.player.parts.forEach(part => {
                this.minimapCtx.beginPath();
                this.minimapCtx.arc(
                    part.x * scale,
                    part.y * scale,
                    Math.max(4, part.radius * scale),
                    0, Math.PI * 2
                );
                this.minimapCtx.fill();
            });
        }
        
        // 绘制相机视野
        this.minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.minimapCtx.lineWidth = 2;
        this.minimapCtx.strokeRect(
            this.camera.x * scale,
            this.camera.y * scale,
            this.canvas.width * scale,
            this.canvas.height * scale
        );
    }
    
    updateFPS() {
        const now = performance.now();
        this.frameCount++;
        
        if (now - this.fpsUpdateTime >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.fpsUpdateTime));
            document.getElementById('fps').textContent = this.fps;
            this.frameCount = 0;
            this.fpsUpdateTime = now;
        }
    }
    
    gameOver() {
        this.gameState = 'gameover';
        const survivalTime = Math.floor((Date.now() - this.startTime) / 1000);
        
        document.getElementById('finalScore').textContent = this.player.score;
        document.getElementById('survivalTime').textContent = survivalTime;
        document.getElementById('defeatedPlayers').textContent = this.defeatedPlayers;
        document.getElementById('gameOver').style.display = 'block';
    }
    
    restartGame() {
        // 重置游戏状态
        this.player = null;
        this.players = [];
        this.foods = [];
        this.particles = [];
        this.ejectedBalls = [];
        this.camera = { x: 0, y: 0 };
        this.score = 0;
        this.defeatedPlayers = 0;
        this.isPaused = false;
        
        // 重新生成食物
        this.generateFood();
        
        // 切换界面
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('startMenu').style.display = 'block';
        
        this.gameState = 'menu';
    }
    
    returnToMenu() {
        // 重置游戏状态
        this.player = null;
        this.players = [];
        this.foods = [];
        this.particles = [];
        this.ejectedBalls = [];
        this.camera = { x: 0, y: 0 };
        this.score = 0;
        this.defeatedPlayers = 0;
        this.isPaused = false;
        
        // 重新生成食物
        this.generateFood();
        
        // 切换界面
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('pauseMenu').style.display = 'none';
        document.getElementById('startMenu').style.display = 'block';
        
        this.gameState = 'menu';
    }
    
    gameLoop() {
        this.updateGame();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 启动游戏
window.addEventListener('load', () => {
    new Game();
});

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
    
    .notification {
        animation: fadeInOut 2s ease;
    }
`;
document.head.appendChild(style);