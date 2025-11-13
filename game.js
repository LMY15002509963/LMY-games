// 优化版球球大作战游戏 - 支持多人联机
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
        
        // 世界配置 - 扩大世界尺寸支持更多玩家
        this.world = {
            width: 8000,
            height: 8000
        };
        
        // 联机配置
        this.socket = null;
        this.isConnected = false;
        this.roomId = 'default';
        this.playerId = null;
        this.isMultiplayer = false;
        
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
        this.lastNetworkUpdate = 0;
        
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
        this.initNetwork();
        this.generateFood();
        this.setupEventListeners();
        this.hideLoadingScreen();
        
        // 立即开始游戏循环
        this.gameLoop();
        
        console.log('游戏初始化完成');
    }
    
    initNetwork() {
        // 检测是否有Socket.IO可用
        if (typeof io === 'undefined') {
            console.log('Socket.IO未加载，使用单机模式');
            this.isMultiplayer = false;
            return;
        }
        
        // 检测是否在本地环境运行
        const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.protocol === 'file:';
        
        // 如果是file://协议或者本地没有服务器，直接使用单机模式
        if (window.location.protocol === 'file:') {
            console.log('本地文件模式，使用单机游戏');
            this.isMultiplayer = false;
            return;
        }
        
        // 根据环境设置服务器地址
        const serverUrl = isLocalhost ? 'http://localhost:3000' : window.location.origin;
        
        try {
            // 初始化Socket.io连接
            this.socket = io(serverUrl, {
                timeout: 3000,
                forceNew: true
            });
            this.setupNetworkListeners();
        } catch (error) {
            console.log('无法连接到服务器，使用单机模式:', error.message);
            this.isMultiplayer = false;
        }
    }
    
    setupNetworkListeners() {
        if (!this.socket) return;
        
        // 连接成功
        this.socket.on('connect', () => {
            console.log('已连接到服务器');
            this.isConnected = true;
            this.isMultiplayer = true;
            this.playerId = this.socket.id;
        });
        
        // 连接失败
        this.socket.on('connect_error', (error) => {
            console.log('连接服务器失败:', error.message);
            this.isMultiplayer = false;
            this.showNotification('连接服务器失败，使用单机模式');
        });
        
        // 加入房间成功
        this.socket.on('joinSuccess', (data) => {
            console.log('加入房间成功:', data);
            this.playerId = data.playerId;
            this.player = data.player;
            
            // 分离真实玩家和AI玩家
            this.players = [];
            this.serverAIPlayers = data.roomState.aiPlayers || [];
            
            this.foods = data.roomState.foods;
            this.particles = data.roomState.particles || [];
            
            // 确保本地玩家位置正确
            this.mouseWorldPos = {
                x: this.player.x,
                y: this.player.y
            };
            
            this.gameState = 'playing';
            this.isPaused = false;
            this.startTime = Date.now();
            this.defeatedPlayers = 0;
            
            // 隐藏菜单，显示游戏
            document.getElementById('startMenu').style.display = 'none';
            document.getElementById('gameCanvas').style.display = 'block';
        });
        
        // 加入房间失败
        this.socket.on('joinError', (data) => {
            console.log('加入房间失败:', data.message);
            this.showNotification(data.message || '加入房间失败');
        });
        
        // 其他玩家加入
        this.socket.on('playerJoined', (data) => {
            console.log('其他玩家加入:', data.player.name);
            this.players.push(data.player);
            this.showNotification(`${data.player.name} 加入了游戏`);
        });
        
        // 玩家离开
        this.socket.on('playerLeft', (data) => {
            console.log('玩家离开:', data.player.name);
            this.players = this.players.filter(p => p.id !== data.playerId);
            this.showNotification(`${data.player.name} 离开了游戏`);
        });
        
        // 玩家更新
        this.socket.on('playerUpdated', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                if (data.data.targetX !== undefined) player.targetX = data.data.targetX;
                if (data.data.targetY !== undefined) player.targetY = data.data.targetY;
            }
        });
        
        // 游戏状态更新
        this.socket.on('gameState', (state) => {
            // 更新其他真实玩家
            this.players = state.players.filter(p => p.id !== this.playerId);
            
            // 更新服务器AI玩家
            this.serverAIPlayers = state.aiPlayers || [];
            
            // 更新食物
            this.foods = state.foods;
            
            // 更新粒子
            this.particles = state.particles || [];
            
            // 更新本地玩家数据（仅从服务器同步位置）
            const serverPlayer = state.players.find(p => p.id === this.playerId);
            if (serverPlayer && this.player) {
                this.player.score = serverPlayer.score;
                this.player.parts = serverPlayer.parts;
                this.player.mass = serverPlayer.mass;
            }
        });
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // 限制DPI避免过载
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        // 优化画布设置
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'medium'; // 降低质量提高性能
        this.ctx.globalAlpha = 1.0;
        
        // 启用硬件加速
        this.canvas.style.willChange = 'transform';
        this.canvas.style.transform = 'translateZ(0)';
        
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
        // 根据世界大小和图形质量调整食物数量
        const baseFoodCount = this.settings.graphicsQuality === 'high' ? 800 : 
                             this.settings.graphicsQuality === 'medium' ? 600 : 400;
        // 根据世界大小比例调整食物数量
        const foodCount = Math.floor(baseFoodCount * (this.world.width * this.world.height) / (4000 * 4000));
        
        // 性能优化：限制最大食物数量
        const maxFoodCount = Math.min(foodCount, 800);
        
        for (let i = 0; i < maxFoodCount; i++) {
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
        console.log("Setting up event listeners...");
        
        // 开始游戏
        document.getElementById('startBtn').addEventListener('click', () => {
            console.log("Start button clicked");
            const playerName = document.getElementById('playerName').value.trim();
            if (playerName) {
                this.startGame(playerName);
            } else {
                this.showNotification('请输入你的游戏昵称！');
            }
        });
        
        // 重新开始
        document.getElementById('restartBtn').addEventListener('click', () => {
            console.log("Restart button clicked");
            this.restartGame();
        });
        
        // 返回主页
        document.getElementById('homeBtn').addEventListener('click', () => {
            console.log("Home button clicked");
            this.returnToMenu();
        });
        
        // 鼠标事件 - 优化响应速度和性能
        let mouseThrottle = false;
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.gameState === 'playing' && !this.isPaused && this.player && !mouseThrottle) {
                mouseThrottle = true;
                
                const rect = this.canvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                
                this.mousePos.x = canvasX;
                this.mousePos.y = canvasY;
                this.mouseWorldPos.x = canvasX + this.camera.x;
                this.mouseWorldPos.y = canvasY + this.camera.y;
                this.mouseUpdateTime = performance.now();
                
                // 立即更新玩家目标位置，提高响应性
                this.player.targetX = this.mouseWorldPos.x;
                this.player.targetY = this.mouseWorldPos.y;
                
                // 使用requestAnimationFrame恢复
                requestAnimationFrame(() => {
                    mouseThrottle = false;
                });
            }
        });
        
        // 确保鼠标进入画布时立即生效
        this.canvas.addEventListener('mouseenter', (e) => {
            if (this.gameState === 'playing' && !this.isPaused && this.player) {
                const rect = this.canvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                
                this.mousePos.x = canvasX;
                this.mousePos.y = canvasY;
                this.mouseWorldPos.x = canvasX + this.camera.x;
                this.mouseWorldPos.y = canvasY + this.camera.y;
                
                this.player.targetX = this.mouseWorldPos.x;
                this.player.targetY = this.mouseWorldPos.y;
                
                // 启用硬件加速
                this.canvas.style.cursor = 'crosshair';
                this.canvas.style.transform = 'translateZ(0)';
            }
        });
        
        // 添加鼠标离开画布事件，防止抽搐
        this.canvas.addEventListener('mouseleave', (e) => {
            if (this.gameState === 'playing' && !this.isPaused && this.player) {
                // 保持最后位置，不改变目标
                this.canvas.style.cursor = 'default';
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
                
                console.log(`Touch moved to: ${this.mouseWorldPos.x}, ${this.mouseWorldPos.y}`);
            }
        });
        
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (this.gameState === 'playing' && !this.isPaused) {
                console.log(`Key pressed: ${e.code}`);
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
            console.log("Pause button clicked");
            this.togglePause();
        });
        
        document.getElementById('settingsBtn').addEventListener('click', () => {
            console.log("Settings button clicked");
            this.showSettings();
        });
        
        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            console.log("Fullscreen button clicked");
            this.toggleFullscreen();
        });
        
        // 设置面板
        document.getElementById('closeSettings').addEventListener('click', () => {
            console.log("Close settings clicked");
            this.hideSettings();
        });
        
        // 设置项监听
        document.getElementById('graphicsQuality').addEventListener('change', (e) => {
            console.log(`Graphics quality changed to: ${e.target.value}`);
            this.settings.graphicsQuality = e.target.value;
            this.applyGraphicsSettings();
        });
        
        document.getElementById('particleEffects').addEventListener('change', (e) => {
            console.log(`Particle effects: ${e.target.checked}`);
            this.settings.particleEffects = e.target.checked;
        });
        
        document.getElementById('showGrid').addEventListener('change', (e) => {
            console.log(`Show grid: ${e.target.checked}`);
            this.settings.showGrid = e.target.checked;
        });
        
        // 暂停菜单
        document.getElementById('resumeBtn').addEventListener('click', () => {
            console.log("Resume button clicked");
            this.togglePause();
        });
        
        document.getElementById('quitBtn').addEventListener('click', () => {
            console.log("Quit button clicked");
            this.returnToMenu();
        });
        
        // 输入框回车键
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('startBtn').click();
            }
        });
        
        console.log("All event listeners set up");
    }
    
    startGame(playerName) {
        console.log(`Starting game with player: ${playerName}`);
        
        // 创建玩家
        const centerX = this.world.width / 2;
        const centerY = this.world.height / 2;
        
        this.player = {
            name: playerName,
            x: centerX,
            y: centerY,
            radius: 25,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            targetX: centerX,
            targetY: centerY,
            velocityX: 0,
            velocityY: 0,
            parts: [{
                x: centerX,
                y: centerY,
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
            x: centerX,
            y: centerY
        };
        
        this.mousePos = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
        
        // 生成AI玩家（仅在单机模式或本地游戏）
        if (!this.isMultiplayer) {
            this.generateAIPlayers(8);
        }
        
        // 切换游戏状态
        this.gameState = 'playing';
        this.isPaused = false;
        this.startTime = Date.now();
        this.defeatedPlayers = 0;
        
        // 隐藏菜单，显示游戏
        document.getElementById('startMenu').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'block';
        
        // 立即设置鼠标位置
        setTimeout(() => {
            if (this.canvas && this.player) {
                this.player.targetX = centerX;
                this.player.targetY = centerY;
                this.mouseWorldPos.x = centerX;
                this.mouseWorldPos.y = centerY;
                console.log(`Initial mouse position set to: ${centerX}, ${centerY}`);
            }
        }, 100);
        
        // 更新统计
        this.updateStats();
        
        // 添加鼠标进入画布的监听
        this.canvas.addEventListener('mouseenter', () => {
            this.canvas.style.cursor = 'crosshair';
            console.log("Mouse entered canvas");
        });
        
        console.log(`Game started! State: ${this.gameState}, Player: ${!!this.player}`);
    }
    
    generateAIPlayers(count) {
        for (let i = 0; i < count; i++) {
            const x = Math.random() * this.world.width;
            const y = Math.random() * this.world.height;
            const radius = Math.random() * 30 + 15;
            
            const aiPlayer = {
                name: this.generateAINames(),
                x: x,
                y: y,
                radius: radius,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                targetX: x + (Math.random() - 0.5) * 200,
                targetY: y + (Math.random() - 0.5) * 200,
                velocityX: 0,
                velocityY: 0,
                parts: [{
                    x: x,
                    y: y,
                    radius: radius,
                    vx: 0,
                    vy: 0
                }],
                mass: radius * radius * Math.PI,
                score: Math.floor(Math.random() * 500), // 给AI一些初始分数
                isAI: true,
                aiUpdateCounter: Math.floor(Math.random() * 30), // 随机初始计数器
                personality: this.generateAIPersonality(),
                skill: Math.random() // 0-1之间的技能水平，影响决策质量
            };
            this.players.push(aiPlayer);
            
            console.log(`Created AI player ${aiPlayer.name} at (${x}, ${y}) with target (${aiPlayer.targetX}, ${aiPlayer.targetY})`);
        }
    }
    
    generateAINames() {
        const prefixes = ['极速', '疯狂', '智能', '幽灵', '战神', '忍者', '勇士', '霸王', '无敌', '传奇'];
        const suffixes = ['球球', '战士', '大师', '王者', '猎手', '杀手', '专家', '精英', '高手', '霸主'];
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        return randomPrefix + randomSuffix;
    }
    
    generateAIPersonality() {
        const rand = Math.random();
        if (rand < 0.35) return 'aggressive';      // 35% 攻击型
        else if (rand < 0.7) return 'defensive';  // 35% 防守型
        else if (rand < 0.85) return 'balanced';   // 15% 平衡型
        else return 'hunter';                     // 15% 狩猎型
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
        // 添加调试信息
        console.log(`Game State: ${this.gameState}, IsPaused: ${this.isPaused}, Player exists: ${!!this.player}`);
        
        if (this.gameState !== 'playing' || this.isPaused) return;
        
        // 更新玩家
        if (this.player) {
            this.updatePlayer(this.player);
            this.updatePlayerParts(this.player);
            console.log(`Player target: ${this.player.targetX}, ${this.player.targetY}`);
        }
        
        // 更新AI玩家
        this.players.forEach(player => {
            this.updatePlayer(player);
            this.updatePlayerParts(player);
            if (player.isAI) {
                this.updateAI(player);
            }
        });
        
        // 更新服务器AI玩家（仅在联机模式）
        if (this.serverAIPlayers && this.serverAIPlayers.length > 0) {
            this.serverAIPlayers.forEach(aiPlayer => {
                this.updatePlayer(aiPlayer);
                this.updatePlayerParts(aiPlayer);
            });
        }
        
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
        
        // 补充食物 - 根据世界大小调整
        const maxFoodCount = this.settings.graphicsQuality === 'high' ? 800 : 
                            this.settings.graphicsQuality === 'medium' ? 500 : 300;
        const targetFoodCount = Math.floor(maxFoodCount * (this.world.width * this.world.height) / (4000 * 4000));
        
        if (Math.random() < 0.03 && this.foods.length < targetFoodCount) { // 降低补充频率
            // 只生成可见区域附近的食物
            const centerX = this.camera.x + this.canvas.width / 2;
            const centerY = this.camera.y + this.canvas.height / 2;
            const spawnRange = 500;
            
            this.foods.push({
                x: centerX + (Math.random() - 0.5) * spawnRange,
                y: centerY + (Math.random() - 0.5) * spawnRange,
                radius: Math.random() * 4 + 3,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                pulsePhase: Math.random() * Math.PI * 2
            });
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
            
            // 对于人类玩家，始终同步鼠标位置，提高响应速度
            if (player === this.player && this.mouseWorldPos.x && this.mouseWorldPos.y) {
                player.targetX = this.mouseWorldPos.x;
                player.targetY = this.mouseWorldPos.y;
            }
            
            // 计算到目标的距离
            const dx = player.targetX - part.x;
            const dy = player.targetY - part.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 基础速度计算 - 大幅提高响应灵敏度
            let baseSpeed = Math.max(5.0, 15 - part.radius * 0.04);
            
            // 对人类玩家显著提高响应速度
            if (player === this.player) {
                baseSpeed *= 1.6;
            }
            
            // 处理分裂速度
            if (part.vx !== 0 || part.vy !== 0) {
                part.velocityX = part.vx;
                part.velocityY = part.vy;
                part.vx *= 0.92;
                part.vy *= 0.92;
                
                // 当速度足够小时完全停止
                if (Math.abs(part.vx) < 0.2) {
                    part.vx = 0;
                    part.velocityX = 0;
                }
                if (Math.abs(part.vy) < 0.2) {
                    part.vy = 0;
                    part.velocityY = 0;
                }
            } else if (distance > 5) { // 降低最小距离阈值，提高精度
                // 正常移动 - 完全重新设计移动算法，消除抽搐
                const moveFactor = Math.min(1.0, distance / 80); // 优化移动因子
                part.velocityX = (dx / distance) * baseSpeed * moveFactor;
                part.velocityY = (dy / distance) * baseSpeed * moveFactor;
                
                // 更平滑的过渡，避免突然停止
                if (distance < 15) {
                    const slowFactor = Math.max(0.1, distance / 15);
                    part.velocityX *= slowFactor;
                    part.velocityY *= slowFactor;
                }
            } else {
                // 接近目标时平滑停止 - 提高停止精度
                part.velocityX *= 0.95;
                part.velocityY *= 0.95;
                
                // 更严格的完全停止阈值
                if (Math.abs(part.velocityX) < 0.05) part.velocityX = 0;
                if (Math.abs(part.velocityY) < 0.05) part.velocityY = 0;
            }
            
            // 确保最小速度（除非非常接近目标）- 进一步提高响应性
            if (distance > 10) {
                const currentSpeed = Math.sqrt(part.velocityX * part.velocityX + part.velocityY * part.velocityY);
                const minSpeed = Math.max(2.0, baseSpeed * 0.3);
                if (currentSpeed < minSpeed) {
                    const boost = minSpeed / currentSpeed;
                    part.velocityX *= boost;
                    part.velocityY *= boost;
                }
            }
            
            // 更新位置
            part.x += part.velocityX;
            part.y += part.velocityY;
            
            // 边界检查 - 优化弹性效果
            const margin = part.radius;
            if (part.x < margin) {
                part.x = margin;
                part.velocityX = Math.abs(part.velocityX) * 0.6;
            } else if (part.x > this.world.width - margin) {
                part.x = this.world.width - margin;
                part.velocityX = -Math.abs(part.velocityX) * 0.6;
            }
            
            if (part.y < margin) {
                part.y = margin;
                part.velocityY = Math.abs(part.velocityY) * 0.6;
            } else if (part.y > this.world.height - margin) {
                part.y = this.world.height - margin;
                part.velocityY = -Math.abs(part.velocityY) * 0.6;
            }
            
            // 球球之间的分离检测 - 优化分离算法
            for (let j = index + 1; j < player.parts.length; j++) {
                const otherPart = player.parts[j];
                const dx2 = otherPart.x - part.x;
                const dy2 = otherPart.y - part.y;
                const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                const minDistance = part.radius + otherPart.radius + 8; // 增加间距
                
                if (distance2 < minDistance && distance2 > 0) {
                    const overlap = minDistance - distance2;
                    const separationForce = overlap * 0.7; // 增加分离力度
                    const separationX = (dx2 / distance2) * separationForce;
                    const separationY = (dy2 / distance2) * separationForce;
                    
                    part.x -= separationX;
                    part.y -= separationY;
                    otherPart.x += separationX;
                    otherPart.y += separationY;
                    
                    // 优化速度影响，完全防止粘连
                    const separationVelocityX = separationX * 0.3;
                    const separationVelocityY = separationY * 0.3;
                    
                    part.velocityX -= separationVelocityX;
                    part.velocityY -= separationVelocityY;
                    otherPart.velocityX += separationVelocityX;
                    otherPart.velocityY += separationVelocityY;
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
        if (aiPlayer.aiUpdateCounter % 15 !== 0) return; // 进一步提高AI更新频率
        
        const mainPart = aiPlayer.parts[0];
        
        // 大幅增强威胁检测范围和准确性
        let threats = [];
        const threatRange = mainPart.radius * 10; // 大幅增加威胁检测范围
        
        if (this.player) {
            this.player.parts.forEach(part => {
                const distance = Math.sqrt(
                    Math.pow(part.x - mainPart.x, 2) + 
                    Math.pow(part.y - mainPart.y, 2)
                );
                if (part.radius > mainPart.radius * 1.1 && distance < threatRange) {
                    // 计算威胁等级，更精确的评估
                    const threatLevel = (part.radius / mainPart.radius) * (1 - distance / threatRange);
                    // 考虑速度向量进行威胁预测
                    let speedBonus = 0;
                    if (part.velocityX && part.velocityY) {
                        const speed = Math.sqrt(part.velocityX * part.velocityX + part.velocityY * part.velocityY);
                        speedBonus = Math.min(0.3, speed / 20);
                    }
                    threats.push({ 
                        player: part, 
                        distance: distance, 
                        type: 'player',
                        threatLevel: threatLevel + speedBonus
                    });
                }
            });
        }
        
        // 检查其他AI威胁，也考虑速度预测
        this.players.forEach(otherAI => {
            if (otherAI !== aiPlayer) {
                otherAI.parts.forEach(part => {
                    const distance = Math.sqrt(
                        Math.pow(part.x - mainPart.x, 2) + 
                        Math.pow(part.y - mainPart.y, 2)
                    );
                    if (part.radius > mainPart.radius * 1.1 && distance < threatRange) {
                        const threatLevel = (part.radius / mainPart.radius) * (1 - distance / threatRange);
                        let speedBonus = 0;
                        if (part.velocityX && part.velocityY) {
                            const speed = Math.sqrt(part.velocityX * part.velocityX + part.velocityY * part.velocityY);
                            speedBonus = Math.min(0.3, speed / 15);
                        }
                        threats.push({ 
                            player: part, 
                            distance: distance, 
                            type: 'ai',
                            threatLevel: threatLevel + speedBonus
                        });
                    }
                });
            }
        });
        
        // 如果有威胁，超智能逃跑
        if (threats.length > 0) {
            threats.sort((a, b) => b.threatLevel - a.threatLevel);
            const threat = threats[0];
            
            // 计算最佳逃生路线 - 考虑所有威胁的合力方向
            let escapeVectorX = 0;
            let escapeVectorY = 0;
            
            threats.slice(0, 3).forEach(t => { // 考虑前3个威胁
                const escapeWeight = t.threatLevel;
                escapeVectorX += (mainPart.x - t.player.x) / t.distance * escapeWeight;
                escapeVectorY += (mainPart.y - t.player.y) / t.distance * escapeWeight;
            });
            
            // 归一化逃生向量
            const escapeMagnitude = Math.sqrt(escapeVectorX * escapeVectorX + escapeVectorY * escapeVectorY);
            if (escapeMagnitude > 0) {
                escapeVectorX /= escapeMagnitude;
                escapeVectorY /= escapeMagnitude;
            }
            
            // 高级威胁预测 - 考虑威胁的速度和意图
            let predictedX = threat.player.x;
            let predictedY = threat.player.y;
            if (threat.player.velocityX && threat.player.velocityY) {
                const timeToIntercept = Math.max(5, threat.distance / 12);
                predictedX += threat.player.velocityX * timeToIntercept;
                predictedY += threat.player.velocityY * timeToIntercept;
            }
            
            // 计算智能逃生角度
            const smartEscapeAngle = Math.atan2(
                mainPart.y - predictedY + escapeVectorY * 100,
                mainPart.x - predictedX + escapeVectorX * 100
            );
            
            // 根据威胁等级动态调整逃生距离
            const escapeDistance = 250 + threat.threatLevel * 300;
            
            // 设置逃生目标，添加一些随机性避免可预测性
            const randomAngle = (Math.random() - 0.5) * Math.PI / 6;
            aiPlayer.targetX = mainPart.x + Math.cos(smartEscapeAngle + randomAngle) * escapeDistance;
            aiPlayer.targetY = mainPart.y + Math.sin(smartEscapeAngle + randomAngle) * escapeDistance;
            
            // 高威胁时智能使用分裂逃生
            if (threat.threatLevel > 0.6 && aiPlayer.parts.length === 1 && mainPart.radius > 28) {
                this.aiSplit(aiPlayer);
            }
        } else {
            // 根据性格决定行为，大幅提升智能
            if (aiPlayer.personality === 'aggressive') {
                // 攻击型AI - 超智能狩猎策略
                let opportunities = [];
                
                // 扩大狩猎范围
                const huntRange = mainPart.radius * 8;
                
                // 评估食物，考虑密度和安全性
                const foodClusters = this.findFoodClusters(mainPart, huntRange);
                foodClusters.forEach(cluster => {
                    const distance = Math.sqrt(
                        Math.pow(cluster.centerX - mainPart.x, 2) + 
                        Math.pow(cluster.centerY - mainPart.y, 2)
                    );
                    // 计算食物集群的价值
                    const clusterValue = (cluster.totalValue * cluster.density) / (distance + 100);
                    opportunities.push({ 
                        item: cluster, 
                        distance: distance, 
                        type: 'food_cluster',
                        value: clusterValue
                    });
                });
                
                // 评估玩家猎物，更精确的风险评估
                if (this.player) {
                    this.player.parts.forEach(part => {
                        if (part.radius < mainPart.radius * 0.9) {
                            const distance = Math.sqrt(
                                Math.pow(part.x - mainPart.x, 2) + 
                                Math.pow(part.y - mainPart.y, 2)
                            );
                            if (distance < huntRange * 2) {
                                // 考虑玩家技能水平和当前状态
                                const riskLevel = this.assessHuntRisk(aiPlayer, part);
                                const preyValue = (part.radius * 8 * (1 - riskLevel)) / (distance + 150);
                                opportunities.push({ 
                                    item: part, 
                                    distance: distance, 
                                    type: 'prey',
                                    value: preyValue,
                                    risk: riskLevel
                                });
                            }
                        }
                    });
                }
                
                // 评估其他AI猎物
                this.players.forEach(otherAI => {
                    if (otherAI !== aiPlayer) {
                        otherAI.parts.forEach(part => {
                            if (part.radius < mainPart.radius * 0.85) {
                                const distance = Math.sqrt(
                                    Math.pow(part.x - mainPart.x, 2) + 
                                    Math.pow(part.y - mainPart.y, 2)
                                );
                                if (distance < huntRange * 1.8) {
                                    const riskLevel = this.assessHuntRisk(aiPlayer, part);
                                    const preyValue = (part.radius * 5 * (1 - riskLevel)) / (distance + 120);
                                    opportunities.push({ 
                                        item: part, 
                                        distance: distance, 
                                        type: 'ai_prey',
                                        value: preyValue,
                                        risk: riskLevel
                                    });
                                }
                            }
                        });
                    }
                });
                
                if (opportunities.length > 0) {
                    opportunities.sort((a, b) => b.value - a.value);
                    const target = opportunities[0];
                    
                    // 智能预测目标移动
                    if (target.type === 'prey' || target.type === 'ai_prey') {
                        let predictedX = target.item.x;
                        let predictedY = target.item.y;
                        if (target.item.velocityX && target.item.velocityY) {
                            const timeToIntercept = target.distance / 10;
                            predictedX += target.item.velocityX * timeToIntercept;
                            predictedY += target.item.velocityY * timeToIntercept;
                        }
                        aiPlayer.targetX = predictedX;
                        aiPlayer.targetY = predictedY;
                        
                        // 更智能的分裂决策
                        if (target.distance > 180 && target.distance < 320 && 
                            aiPlayer.parts.length === 1 && mainPart.radius > 32 && 
                            target.risk < 0.4 && target.value > 2) {
                            this.aiSplit(aiPlayer);
                        }
                    } else {
                        // 移向食物集群中心
                        aiPlayer.targetX = target.item.centerX;
                        aiPlayer.targetY = target.item.centerY;
                    }
                } else {
                    // 更智能的探索模式 - 螺旋搜索结合随机探索
                    if (Math.random() < 0.2) {
                        const time = Date.now() * 0.001;
                        const spiralRadius = 300 + Math.sin(time * 0.3) * 150;
                        const angle = time * 0.6 + aiPlayer.aiUpdateCounter * 0.15;
                        
                        // 向安全区域探索
                        const safeDirection = this.findSafestDirection(mainPart);
                        const finalAngle = angle + safeDirection * 0.3;
                        
                        aiPlayer.targetX = mainPart.x + Math.cos(finalAngle) * spiralRadius;
                        aiPlayer.targetY = mainPart.y + Math.sin(finalAngle) * spiralRadius;
                    }
                }
            } else if (aiPlayer.personality === 'defensive') {
                // 防守型AI - 极度谨慎的生存策略
                let safeTargets = [];
                const safeRange = mainPart.radius * 5;
                
                this.foods.forEach(food => {
                    const distance = Math.sqrt(
                        Math.pow(food.x - mainPart.x, 2) + 
                        Math.pow(food.y - mainPart.y, 2)
                    );
                    
                    // 全面的安全性检查
                    let isSafe = true;
                    let dangerLevel = 0;
                    let threatCount = 0;
                    
                    // 检查人类玩家威胁
                    if (this.player) {
                        this.player.parts.forEach(part => {
                            if (part.radius > mainPart.radius * 0.9) {
                                const distanceToPlayer = Math.sqrt(
                                    Math.pow(part.x - food.x, 2) + 
                                    Math.pow(part.y - food.y, 2)
                                );
                                if (distanceToPlayer < 250) {
                                    isSafe = false;
                                    dangerLevel += part.radius / distanceToPlayer;
                                    threatCount++;
                                }
                            }
                        });
                    }
                    
                    // 检查其他AI威胁
                    this.players.forEach(otherAI => {
                        if (otherAI !== aiPlayer) {
                            otherAI.parts.forEach(part => {
                                if (part.radius > mainPart.radius * 0.9) {
                                    const distanceToAI = Math.sqrt(
                                        Math.pow(part.x - food.x, 2) + 
                                        Math.pow(part.y - food.y, 2)
                                    );
                                    if (distanceToAI < 220) {
                                        isSafe = false;
                                        dangerLevel += part.radius / distanceToAI;
                                        threatCount++;
                                    }
                                }
                            });
                        }
                    });
                    
                    if (isSafe && distance < safeRange) {
                        // 计算食物的综合安全价值
                        const safetyFactor = 1 / (1 + threatCount);
                        const safetyValue = (food.radius * safetyFactor) / (distance + dangerLevel * 80);
                        safeTargets.push({ 
                            item: food, 
                            distance: distance, 
                            value: safetyValue,
                            safety: safetyFactor
                        });
                    }
                });
                
                if (safeTargets.length > 0) {
                    safeTargets.sort((a, b) => b.value - a.value);
                    const target = safeTargets[0];
                    aiPlayer.targetX = target.item.x;
                    aiPlayer.targetY = target.item.y;
                } else {
                    // 极度谨慎的移动策略
                    if (Math.random() < 0.1) {
                        // 寻找绝对最安全方向
                        const safeDirection = this.findAbsoluteSafestDirection(mainPart);
                        const distance = 60 + Math.random() * 80;
                        aiPlayer.targetX = mainPart.x + Math.cos(safeDirection) * distance;
                        aiPlayer.targetY = mainPart.y + Math.sin(safeDirection) * distance;
                    }
                }
            } else if (aiPlayer.personality === 'balanced') {
                // 平衡型AI - 高级攻守平衡策略
                let allTargets = [];
                const balancedRange = mainPart.radius * 6;
                
                // 评估所有目标，更复杂的价值计算
                this.foods.forEach(food => {
                    const distance = Math.sqrt(
                        Math.pow(food.x - mainPart.x, 2) + 
                        Math.pow(food.y - mainPart.y, 2)
                    );
                    if (distance < balancedRange) {
                        let riskFactor = 1.0;
                        let opportunityFactor = 1.0;
                        
                        // 检查周围机会（食物密度）
                        const nearbyFoods = this.foods.filter(f => {
                            const dist = Math.sqrt(
                                Math.pow(f.x - food.x, 2) + 
                                Math.pow(f.y - food.y, 2)
                            );
                            return dist < 100 && f !== food;
                        });
                        opportunityFactor = 1 + nearbyFoods.length * 0.2;
                        
                        // 检查风险
                        if (this.player) {
                            this.player.parts.forEach(part => {
                                if (part.radius > mainPart.radius * 0.8) {
                                    const distToFood = Math.sqrt(
                                        Math.pow(part.x - food.x, 2) + 
                                        Math.pow(part.y - food.y, 2)
                                    );
                                    if (distToFood < 180) {
                                        riskFactor -= 0.4;
                                    }
                                }
                            });
                        }
                        
                        const value = (food.radius * riskFactor * opportunityFactor) / distance;
                        allTargets.push({ 
                            item: food, 
                            distance: distance, 
                            type: 'food',
                            value: value,
                            risk: 1 - riskFactor
                        });
                    }
                });
                
                // 考虑攻击小型猎物，但更谨慎
                if (this.player) {
                    this.player.parts.forEach(part => {
                        if (part.radius < mainPart.radius * 0.7) {
                            const distance = Math.sqrt(
                                Math.pow(part.x - mainPart.x, 2) + 
                                Math.pow(part.y - mainPart.y, 2)
                            );
                            if (distance < balancedRange) {
                                const riskLevel = this.assessHuntRisk(aiPlayer, part);
                                const preyValue = (part.radius * 4 * (1 - riskLevel * 1.5)) / distance;
                                allTargets.push({ 
                                    item: part, 
                                    distance: distance, 
                                    type: 'prey',
                                    value: preyValue,
                                    risk: riskLevel
                                });
                            }
                        }
                    });
                }
                
                if (allTargets.length > 0) {
                    allTargets.sort((a, b) => b.value - a.value);
                    const bestTarget = allTargets[0];
                    
                    // 动态阈值系统
                    const valueThreshold = Math.max(0.005, 0.02 - this.players.length * 0.002);
                    
                    if (bestTarget.value > valueThreshold) {
                        if (bestTarget.type === 'prey') {
                            // 预测猎物移动
                            let predictedX = bestTarget.item.x;
                            let predictedY = bestTarget.item.y;
                            if (bestTarget.item.velocityX && bestTarget.item.velocityY) {
                                predictedX += bestTarget.item.velocityX * 8;
                                predictedY += bestTarget.item.velocityY * 8;
                            }
                            aiPlayer.targetX = predictedX;
                            aiPlayer.targetY = predictedY;
                        } else {
                            aiPlayer.targetX = bestTarget.item.x;
                            aiPlayer.targetY = bestTarget.item.y;
                        }
                    } else {
                        // 智能移动到更好的位置
                        if (Math.random() < 0.08) {
                            const strategicPosition = this.findStrategicPosition(mainPart);
                            aiPlayer.targetX = strategicPosition.x;
                            aiPlayer.targetY = strategicPosition.y;
                        }
                    }
                }
            } else if (aiPlayer.personality === 'hunter') {
                // 狩猎型AI - 专业猎手策略
                let prey = [];
                const huntRange = mainPart.radius * 10;
                
                // 专门寻找玩家作为猎物，高优先级
                if (this.player) {
                    this.player.parts.forEach(part => {
                        if (part.radius < mainPart.radius * 0.75) {
                            const distance = Math.sqrt(
                                Math.pow(part.x - mainPart.x, 2) + 
                                Math.pow(part.y - mainPart.y, 2)
                            );
                            if (distance < huntRange) {
                                // 高级狩猎成功率计算
                                const successChance = this.calculateAdvancedHuntSuccess(aiPlayer, mainPart, part, distance);
                                prey.push({ 
                                    item: part, 
                                    distance: distance, 
                                    type: 'player_prey',
                                    value: successChance * part.radius * 1.5,
                                    successChance: successChance
                                });
                            }
                        }
                    });
                }
                
                // 次要目标：其他AI
                this.players.forEach(otherAI => {
                    if (otherAI !== aiPlayer) {
                        otherAI.parts.forEach(part => {
                            if (part.radius < mainPart.radius * 0.7) {
                                const distance = Math.sqrt(
                                    Math.pow(part.x - mainPart.x, 2) + 
                                    Math.pow(part.y - mainPart.y, 2)
                                );
                                if (distance < huntRange * 0.8) {
                                    const successChance = this.calculateAdvancedHuntSuccess(aiPlayer, mainPart, part, distance);
                                    prey.push({ 
                                        item: part, 
                                        distance: distance, 
                                        type: 'ai_prey',
                                        value: successChance * part.radius,
                                        successChance: successChance
                                    });
                                }
                            }
                        });
                    }
                });
                
                if (prey.length > 0) {
                    prey.sort((a, b) => b.value - a.value);
                    const target = prey[0];
                    
                    // 高级预测和拦截算法
                    let predictedX = target.item.x;
                    let predictedY = target.item.y;
                    if (target.item.velocityX && target.item.velocityY) {
                        const timeToIntercept = this.calculateInterceptTime(mainPart, target.item, target.distance);
                        predictedX += target.item.velocityX * timeToIntercept;
                        predictedY += target.item.velocityY * timeToIntercept;
                        
                        // 考虑目标的加速度模式
                        if (target.item.lastPositions && target.item.lastPositions.length > 2) {
                            const acceleration = this.calculateAcceleration(target.item.lastPositions);
                            predictedX += acceleration.x * timeToIntercept * timeToIntercept * 0.5;
                            predictedY += acceleration.y * timeToIntercept * timeToIntercept * 0.5;
                        }
                    }
                    
                    // 设置拦截点
                    aiPlayer.targetX = predictedX;
                    aiPlayer.targetY = predictedY;
                    
                    // 狩猎型精确分裂决策
                    if (target.successChance > 0.6 && target.distance > 160 && 
                        target.distance < 380 && aiPlayer.parts.length === 1 && 
                        mainPart.radius > 28 && target.value > 15) {
                        this.aiSplit(aiPlayer);
                    }
                } else {
                    // 没有猎物时的智能巡逻
                    if (Math.random() < 0.15) {
                        const patrolData = this.calculateOptimalPatrol(mainPart);
                        aiPlayer.targetX = patrolData.x;
                        aiPlayer.targetY = patrolData.y;
                    }
                }
            }
        }
        
        // 超级智能分裂逻辑
        if (Math.random() < 0.03 && aiPlayer.parts.length < 6) {
            const dx = aiPlayer.targetX - mainPart.x;
            const dy = aiPlayer.targetY - mainPart.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 复杂的分裂条件
            let shouldSplit = false;
            
            if (threats.length > 0 && threats[0].threatLevel > 0.5) {
                // 高威胁时分裂逃生
                shouldSplit = mainPart.radius > 26;
            } else if (distance > 100 && distance < 350) {
                // 中距离追击时分裂加速
                const targetValue = this.evaluateTargetValue(mainPart, aiPlayer.targetX, aiPlayer.targetY);
                shouldSplit = targetValue > 3 && mainPart.radius > 30;
            }
                
            if (shouldSplit) {
                this.aiSplit(aiPlayer);
            }
        }
    }
    
    assessRisk(mainPart, target) {
        // 评估攻击风险
        let risk = 0;
        if (this.player) {
            this.player.parts.forEach(part => {
                if (part.radius > mainPart.radius * 0.8) {
                    const distToTarget = Math.sqrt(
                        Math.pow(part.x - target.x, 2) + 
                        Math.pow(part.y - target.y, 2)
                    );
                    if (distToTarget < 200) {
                        risk += 0.3 * (1 - distToTarget / 200);
                    }
                }
            });
        }
        return Math.min(risk, 0.8);
    }
    
    findSafestDirection(mainPart) {
        let safestAngle = Math.random() * Math.PI * 2;
        let maxSafety = -Infinity;
        
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
            let safety = 0;
            const testX = mainPart.x + Math.cos(angle) * 200;
            const testY = mainPart.y + Math.sin(angle) * 200;
            
            if (this.player) {
                this.player.parts.forEach(part => {
                    if (part.radius > mainPart.radius) {
                        const dist = Math.sqrt(
                            Math.pow(part.x - testX, 2) + 
                            Math.pow(part.y - testY, 2)
                        );
                        safety += dist;
                    }
                });
            }
            
            if (safety > maxSafety) {
                maxSafety = safety;
                safestAngle = angle;
            }
        }
        
        return safestAngle;
    }
    
    calculateHuntSuccess(hunter, prey, distance) {
        // 计算狩猎成功率
        let successRate = 0.7; // 基础成功率
        
        // 距离影响
        if (distance > 300) successRate -= 0.3;
        else if (distance < 100) successRate += 0.2;
        
        // 大小比例影响
        const sizeRatio = hunter.radius / prey.radius;
        if (sizeRatio > 2) successRate += 0.2;
        else if (sizeRatio < 1.5) successRate -= 0.3;
        
        // 考虑周围威胁
        if (this.player) {
            this.player.parts.forEach(part => {
                if (part.radius > hunter.radius) {
                    const threatDist = Math.sqrt(
                        Math.pow(part.x - hunter.x, 2) + 
                        Math.pow(part.y - hunter.y, 2)
                    );
                    if (threatDist < 250) {
                        successRate -= 0.4;
                    }
                }
            });
        }
        
        return Math.max(0.1, Math.min(0.9, successRate));
    }
    
    // 新增的AI辅助方法
    findFoodClusters(mainPart, range) {
        const clusters = [];
        const processed = new Set();
        
        this.foods.forEach(food => {
            const foodId = `${food.x}-${food.y}`;
            if (!processed.has(foodId)) {
                const cluster = {
                    foods: [food],
                    centerX: food.x,
                    centerY: food.y,
                    totalValue: food.radius,
                    density: 1
                };
                
                // 查找附近的食物
                this.foods.forEach(otherFood => {
                    const otherId = `${otherFood.x}-${otherFood.y}`;
                    if (foodId !== otherId && !processed.has(otherId)) {
                        const dist = Math.sqrt(
                            Math.pow(food.x - otherFood.x, 2) + 
                            Math.pow(food.y - otherFood.y, 2)
                        );
                        if (dist < 80) { // 食物集群半径
                            cluster.foods.push(otherFood);
                            cluster.totalValue += otherFood.radius;
                            processed.add(otherId);
                        }
                    }
                });
                
                // 计算集群中心和密度
                cluster.centerX = cluster.foods.reduce((sum, f) => sum + f.x, 0) / cluster.foods.length;
                cluster.centerY = cluster.foods.reduce((sum, f) => sum + f.y, 0) / cluster.foods.length;
                cluster.density = cluster.foods.length;
                
                // 只考虑在范围内的集群
                const distToMainPart = Math.sqrt(
                    Math.pow(cluster.centerX - mainPart.x, 2) + 
                    Math.pow(cluster.centerY - mainPart.y, 2)
                );
                
                if (distToMainPart < range) {
                    clusters.push(cluster);
                }
                
                processed.add(foodId);
            }
        });
        
        return clusters;
    }
    
    assessHuntRisk(hunter, prey) {
        let risk = 0;
        
        // 检查玩家威胁
        if (this.player) {
            this.player.parts.forEach(part => {
                if (part.radius > hunter.radius * 0.8) {
                    const distToPrey = Math.sqrt(
                        Math.pow(part.x - prey.x, 2) + 
                        Math.pow(part.y - prey.y, 2)
                    );
                    if (distToPrey < 200) {
                        risk += 0.3 * (1 - distToPrey / 200);
                    }
                    
                    const distToHunter = Math.sqrt(
                        Math.pow(part.x - hunter.x, 2) + 
                        Math.pow(part.y - hunter.y, 2)
                    );
                    if (distToHunter < 180) {
                        risk += 0.2 * (1 - distToHunter / 180);
                    }
                }
            });
        }
        
        // 检查其他AI威胁
        this.players.forEach(otherAI => {
            if (otherAI !== hunter) {
                otherAI.parts.forEach(part => {
                    if (part.radius > hunter.radius * 0.8) {
                        const distToPrey = Math.sqrt(
                            Math.pow(part.x - prey.x, 2) + 
                            Math.pow(part.y - prey.y, 2)
                        );
                        if (distToPrey < 180) {
                            risk += 0.25 * (1 - distToPrey / 180);
                        }
                        
                        const distToHunter = Math.sqrt(
                            Math.pow(part.x - hunter.x, 2) + 
                            Math.pow(part.y - hunter.y, 2)
                        );
                        if (distToHunter < 150) {
                            risk += 0.15 * (1 - distToHunter / 150);
                        }
                    }
                });
            }
        });
        
        return Math.min(risk, 0.8);
    }
    
    findAbsoluteSafestDirection(mainPart) {
        let safestAngle = Math.random() * Math.PI * 2;
        let maxSafety = -Infinity;
        
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            let safety = 0;
            const testX = mainPart.x + Math.cos(angle) * 400;
            const testY = mainPart.y + Math.sin(angle) * 400;
            
            // 检查所有威胁
            if (this.player) {
                this.player.parts.forEach(part => {
                    if (part.radius > mainPart.radius) {
                        const dist = Math.sqrt(
                            Math.pow(part.x - testX, 2) + 
                            Math.pow(part.y - testY, 2)
                        );
                        safety += dist;
                    }
                });
            }
            
            this.players.forEach(otherAI => {
                otherAI.parts.forEach(part => {
                    if (part.radius > mainPart.radius) {
                        const dist = Math.sqrt(
                            Math.pow(part.x - testX, 2) + 
                            Math.pow(part.y - testY, 2)
                        );
                        safety += dist;
                    }
                });
            });
            
            if (safety > maxSafety) {
                maxSafety = safety;
                safestAngle = angle;
            }
        }
        
        return safestAngle;
    }
    
    findStrategicPosition(mainPart) {
        // 找到战略位置：食物较多且相对安全的地方
        let bestPosition = null;
        let bestScore = -Infinity;
        
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
            const testDistance = 150 + Math.random() * 100;
            const testX = mainPart.x + Math.cos(angle) * testDistance;
            const testY = mainPart.y + Math.sin(angle) * testDistance;
            
            let foodScore = 0;
            let threatScore = 0;
            
            // 计算食物得分
            this.foods.forEach(food => {
                const dist = Math.sqrt(
                    Math.pow(food.x - testX, 2) + 
                    Math.pow(food.y - testY, 2)
                );
                if (dist < 100) {
                    foodScore += food.radius * (1 - dist / 100);
                }
            });
            
            // 计算威胁得分（威胁越低越好）
            if (this.player) {
                this.player.parts.forEach(part => {
                    if (part.radius > mainPart.radius) {
                        const dist = Math.sqrt(
                            Math.pow(part.x - testX, 2) + 
                            Math.pow(part.y - testY, 2)
                        );
                        if (dist < 300) {
                            threatScore -= (300 - dist) / 300;
                        }
                    }
                });
            }
            
            const totalScore = foodScore * 0.6 + threatScore * 0.4;
            
            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestPosition = { x: testX, y: testY };
            }
        }
        
        return bestPosition || { x: mainPart.x, y: mainPart.y };
    }
    
    calculateAdvancedHuntSuccess(aiPlayer, hunter, prey, distance) {
        let successRate = 0.6;
        
        // 距离因素
        if (distance < 80) successRate += 0.3;
        else if (distance < 150) successRate += 0.2;
        else if (distance > 350) successRate -= 0.4;
        
        // 大小比例
        const sizeRatio = hunter.radius / prey.radius;
        if (sizeRatio > 2.5) successRate += 0.3;
        else if (sizeRatio > 1.8) successRate += 0.1;
        else if (sizeRatio < 1.3) successRate -= 0.2;
        
        // AI技能水平影响
        successRate *= (0.7 + aiPlayer.skill * 0.3);
        
        // 环境威胁评估
        let environmentThreat = 0;
        if (this.player) {
            this.player.parts.forEach(part => {
                if (part.radius > hunter.radius) {
                    const threatDist = Math.sqrt(
                        Math.pow(part.x - hunter.x, 2) + 
                        Math.pow(part.y - hunter.y, 2)
                    );
                    if (threatDist < 200) {
                        environmentThreat += (200 - threatDist) / 200 * 0.3;
                    }
                }
            });
        }
        
        successRate -= environmentThreat;
        
        return Math.max(0.1, Math.min(0.95, successRate));
    }
    
    calculateInterceptTime(hunter, prey, currentDistance) {
        const hunterSpeed = 8; // 假设平均速度
        const preySpeed = Math.sqrt(prey.velocityX * prey.velocityX + prey.velocityY * prey.velocityY);
        
        // 简化的拦截时间计算
        let interceptTime = currentDistance / hunterSpeed;
        
        // 考虑猎物速度和方向
        if (preySpeed > 0) {
            const angleToHunter = Math.atan2(hunter.y - prey.y, hunter.x - prey.x);
            const preyDirection = Math.atan2(prey.velocityY, prey.velocityX);
            const angleDiff = Math.abs(angleToHunter - preyDirection);
            
            // 如果猎物向远离猎人的方向移动，增加拦截时间
            if (angleDiff < Math.PI / 2) {
                interceptTime *= (1 + preySpeed / hunterSpeed);
            } else {
                interceptTime *= (1 - preySpeed / hunterSpeed * 0.5);
            }
        }
        
        return Math.max(2, interceptTime);
    }
    
    calculateAcceleration(lastPositions) {
        if (lastPositions.length < 3) return { x: 0, y: 0 };
        
        const recent = lastPositions.slice(-3);
        const vx1 = recent[1].x - recent[0].x;
        const vy1 = recent[1].y - recent[0].y;
        const vx2 = recent[2].x - recent[1].x;
        const vy2 = recent[2].y - recent[1].y;
        
        return {
            x: vx2 - vx1,
            y: vy2 - vy1
        };
    }
    
    calculateOptimalPatrol(mainPart) {
        const time = Date.now() * 0.001;
        const baseAngle = (time * 0.2 + mainPart.aiUpdateCounter * 0.05) % (Math.PI * 2);
        
        // 结合安全方向进行巡逻
        const safeDirection = this.findSafestDirection(mainPart);
        const combinedAngle = baseAngle * 0.7 + safeDirection * 0.3;
        
        const patrolRadius = 200 + Math.sin(time * 0.3) * 100;
        
        return {
            x: mainPart.x + Math.cos(combinedAngle) * patrolRadius,
            y: mainPart.y + Math.sin(combinedAngle) * patrolRadius
        };
    }
    
    evaluateTargetValue(mainPart, targetX, targetY) {
        let value = 0;
        
        // 评估目标位置的食物价值
        this.foods.forEach(food => {
            const distToTarget = Math.sqrt(
                Math.pow(food.x - targetX, 2) + 
                Math.pow(food.y - targetY, 2)
            );
            if (distToTarget < 50) {
                value += food.radius;
            }
        });
        
        return value;
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
        // 限制粒子更新数量
        const maxParticles = 50;
        const particlesToUpdate = this.particles.slice(0, maxParticles);
        
        this.particles = particlesToUpdate.filter(particle => {
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
        
        // 平滑相机移动 - 提高平滑度
        const targetCameraX = centerX - this.canvas.width / 2;
        const targetCameraY = centerY - this.canvas.height / 2;
        
        const smoothingFactor = 0.15; // 提高平滑度
        this.camera.x += (targetCameraX - this.camera.x) * smoothingFactor;
        this.camera.y += (targetCameraY - this.camera.y) * smoothingFactor;
        
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
        const allPlayers = this.players.slice(); // 本地AI玩家
        if (this.serverAIPlayers && this.serverAIPlayers.length > 0) {
            allPlayers.push(...this.serverAIPlayers); // 服务器AI玩家
        }
        if (this.player) {
            allPlayers.push(this.player);
        }
        allPlayers.sort((a, b) => b.score - a.score);
        const rank = allPlayers.findIndex(p => p === this.player) + 1;
        document.getElementById('rank').textContent = rank;
        
        // 更新排行榜
        this.updateLeaderboard(allPlayers.slice(0, 10));
        
        // 更新在线人数
        let totalOnlineCount = this.players.length;
        if (this.serverAIPlayers && this.serverAIPlayers.length > 0) {
            totalOnlineCount += this.serverAIPlayers.length;
        }
        totalOnlineCount += 1; // 加上玩家自己
        document.getElementById('onlineCount').textContent = totalOnlineCount;
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
                // 低质量模式 - 优化性能
                this.foods = this.foods.slice(0, 300);
                this.ctx.imageSmoothingQuality = 'low';
                break;
            case 'medium':
                // 中等质量模式
                while (this.foods.length < 500) {
                    this.generateFood();
                }
                this.ctx.imageSmoothingQuality = 'medium';
                break;
            case 'high':
                // 高质量模式
                while (this.foods.length < 800) {
                    this.generateFood();
                }
                this.ctx.imageSmoothingQuality = 'high';
                break;
        }
        
        // 限制粒子数量
        if (this.particles.length > 100) {
            this.particles = this.particles.slice(0, 100);
        }
    }
    
    render() {
        // 清空画布 - 优化清空方式
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.gameState !== 'playing' && this.gameState !== 'paused') return;
        
        // 保存上下文状态
        this.ctx.save();
        
        // 应用相机变换
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // 只渲染可见区域内的食物 - 视锥剔除
        const visibleFoods = this.foods.filter(food => {
            return food.x > this.camera.x - 100 && 
                   food.x < this.camera.x + this.canvas.width + 100 &&
                   food.y > this.camera.y - 100 && 
                   food.y < this.camera.y + this.canvas.height + 100;
        });
        
        // 绘制网格（降低频率）
        if (this.settings.showGrid && this.frameCount % 2 === 0) {
            this.drawGrid();
        }
        
        // 绘制食物
        visibleFoods.forEach(food => {
            this.drawFood(food);
        });
        
        // 绘制发射的小球
        if (this.ejectedBalls && this.ejectedBalls.length > 0) {
            this.ejectedBalls.forEach(ball => {
                this.drawEjectedBall(ball);
            });
        }
        
        // 绘制所有玩家
        const allPlayers = this.players.slice();
        if (this.serverAIPlayers && this.serverAIPlayers.length > 0) {
            allPlayers.push(...this.serverAIPlayers);
        }
        
        // 只绘制可见玩家
        const visiblePlayers = allPlayers.filter(player => {
            return player.parts.some(part => 
                part.x > this.camera.x - 200 && 
                part.x < this.camera.x + this.canvas.width + 200 &&
                part.y > this.camera.y - 200 && 
                part.y < this.camera.y + this.canvas.height + 200
            );
        });
        
        visiblePlayers.forEach(player => {
            this.drawPlayer(player);
        });
        
        // 绘制玩家
        if (this.player) {
            this.drawPlayer(this.player);
        }
        
        // 限制粒子数量
        if (this.settings.particleEffects && this.particles.length > 0) {
            const maxParticles = 50;
            const particlesToRender = this.particles.slice(0, maxParticles);
            particlesToRender.forEach(particle => {
                this.drawParticle(particle);
            });
        }
        
        // 恢复上下文状态
        this.ctx.restore();
        
        // 绘制小地图（降低更新频率）
        if (this.frameCount % 3 === 0) {
            this.renderMinimap();
        }
        
        // 更新FPS（降低频率）
        if (this.frameCount % 10 === 0) {
            this.updateFPS();
        }
        
        this.frameCount++;
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; // 降低不透明度
        this.ctx.lineWidth = 1;
        
        const gridSize = 100; // 增大网格尺寸减少绘制次数
        const startX = Math.floor(this.camera.x / gridSize) * gridSize;
        const startY = Math.floor(this.camera.y / gridSize) * gridSize;
        const endX = this.camera.x + this.canvas.width;
        const endY = this.camera.y + this.canvas.height;
        
        // 使用更高效的绘制方式
        this.ctx.beginPath();
        
        // 绘制垂直线
        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
        }
        
        // 绘制水平线
        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
        }
        
        this.ctx.stroke();
    }
    
    drawFood(food) {
        // 简化脉动效果计算
        const pulse = Math.sin(Date.now() * 0.001 + food.pulsePhase) * 0.05 + 1;
        const radius = food.radius * pulse;
        
        // 简化绘制，减少渐变
        this.ctx.fillStyle = food.color;
        this.ctx.beginPath();
        this.ctx.arc(food.x, food.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 仅在高质量模式下添加光晕
        if (this.settings.graphicsQuality === 'high') {
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
        const allMinimapAIPlayers = this.players.slice(); // 本地AI玩家
        if (this.serverAIPlayers && this.serverAIPlayers.length > 0) {
            allMinimapAIPlayers.push(...this.serverAIPlayers); // 服务器AI玩家
        }
        
        allMinimapAIPlayers.forEach(player => {
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
        const now = performance.now();
        const deltaTime = now - this.lastFrameTime;
        
        // 限制帧率到60FPS
        if (deltaTime >= 16.67) { // 1000/60 = 16.67ms
            this.updateGame();
            this.render();
            this.lastFrameTime = now;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 启动游戏
window.addEventListener('load', () => {
    console.log('页面加载完成，开始初始化游戏...');
    
    try {
        window.game = new Game();
        console.log('游戏创建成功');
        
        // 如果没有连接到服务器，设置超时后进入单机模式
        setTimeout(() => {
            if (window.game && !window.game.isMultiplayer && !window.game.player) {
                console.log('自动启动单机模式');
                document.getElementById('playerName').value = '本地玩家';
                // 不自动开始游戏，让用户点击开始按钮
            }
        }, 2000);
        
    } catch (error) {
        console.error('游戏初始化失败:', error);
        alert('游戏加载失败，请刷新页面重试');
    }
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