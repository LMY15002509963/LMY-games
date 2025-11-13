const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 中间件
app.use(cors());
app.use(express.static(path.join(__dirname)));

// 游戏世界配置 - 扩大世界尺寸
const WORLD_WIDTH = 8000;
const WORLD_HEIGHT = 8000;
const FOOD_COUNT = 1200; // 增加食物数量
const MAX_PLAYERS_PER_ROOM = 50; // 增加房间最大玩家数

// 房间管理
const rooms = new Map();
const playerRooms = new Map();

// 颜色配置
const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', 
    '#bb8fce', '#85c88a', '#f8b500', '#6c5ce7',
    '#00b894', '#fdcb6e', '#e17055', '#74b9ff',
    '#a29bfe', '#fd79a8', '#55efc4', '#81ecec'
];

// 游戏房间类
class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map(); // 真实玩家
        this.aiPlayers = [];      // AI玩家
        this.foods = [];
        this.particles = [];
        this.lastUpdateTime = Date.now();
        this.maxAIPlayers = 15;     // 增加最大AI玩家数量
        this.minTotalPlayers = 8;  // 增加最小总玩家数量
        this.generateFood();
        this.generateAIPlayers(this.maxAIPlayers);
    }

    generateFood() {
        for (let i = 0; i < FOOD_COUNT; i++) {
            this.foods.push({
                id: Math.random().toString(36).substr(2, 9),
                x: Math.random() * WORLD_WIDTH,
                y: Math.random() * WORLD_HEIGHT,
                radius: Math.random() * 4 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    generateAIPlayers(count) {
        for (let i = 0; i < count; i++) {
            const x = Math.random() * WORLD_WIDTH;
            const y = Math.random() * WORLD_HEIGHT;
            const radius = Math.random() * 30 + 15;
            
            const aiPlayer = {
                id: `ai_${Date.now()}_${i}`,
                name: this.generateAINames(),
                x: x,
                y: y,
                radius: radius,
                color: colors[Math.floor(Math.random() * colors.length)],
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
                score: Math.floor(Math.random() * 500),
                isAI: true,
                aiUpdateCounter: Math.floor(Math.random() * 30),
                personality: this.generateAIPersonality(),
                skill: Math.random()
            };
            this.aiPlayers.push(aiPlayer);
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
        if (rand < 0.35) return 'aggressive';
        else if (rand < 0.7) return 'defensive';
        else if (rand < 0.85) return 'balanced';
        else return 'hunter';
    }

    addPlayer(socketId, playerData) {
        // 人类玩家加入时，根据当前玩家数量调整AI玩家数量
        const totalPlayers = this.players.size + this.aiPlayers.length;
        
        if (totalPlayers >= this.minTotalPlayers && this.aiPlayers.length > 0) {
            // 移除一个AI玩家为人类玩家腾出空间
            this.aiPlayers.pop();
        }
        
        const player = {
            id: socketId,
            name: playerData.name,
            x: WORLD_WIDTH / 2 + (Math.random() - 0.5) * 100,
            y: WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 100,
            radius: 25,
            color: playerData.color,
            targetX: WORLD_WIDTH / 2,
            targetY: WORLD_HEIGHT / 2,
            velocityX: 0,
            velocityY: 0,
            parts: [{
                x: WORLD_WIDTH / 2 + (Math.random() - 0.5) * 100,
                y: WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 100,
                radius: 25,
                vx: 0,
                vy: 0
            }],
            mass: 625,
            score: 0,
            lastSplitTime: 0,
            isAI: false
        };
        
        this.players.set(socketId, player);
        return player;
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.players.delete(socketId);
            
            // 玩家离开时，补充AI玩家
            const totalPlayers = this.players.size + this.aiPlayers.length;
            if (totalPlayers < this.minTotalPlayers && this.aiPlayers.length < this.maxAIPlayers) {
                this.generateAIPlayers(1);
            }
            
            return player;
        }
        return null;
    }

    updatePlayerData(socketId, data) {
        const player = this.players.get(socketId);
        if (player) {
            if (data.targetX !== undefined) player.targetX = data.targetX;
            if (data.targetY !== undefined) player.targetY = data.targetY;
            if (data.split !== undefined && data.split) {
                this.splitPlayer(player);
            }
            if (data.eject !== undefined && data.eject) {
                this.ejectMass(player);
            }
        }
    }

    splitPlayer(player) {
        const now = Date.now();
        if (now - player.lastSplitTime < 1000) return;
        if (player.parts.length >= 16) return;
        
        player.lastSplitTime = now;
        const newParts = [];
        
        player.parts.forEach(part => {
            if (part.radius > 20) {
                const newRadius = Math.sqrt(part.radius * part.radius / 2);
                part.radius = newRadius;
                
                const dx = player.targetX - part.x;
                const dy = player.targetY - part.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = distance > 0 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
                
                newParts.push({
                    x: part.x + Math.cos(angle) * newRadius * 2,
                    y: part.y + Math.sin(angle) * newRadius * 2,
                    radius: newRadius,
                    vx: Math.cos(angle) * 20,
                    vy: Math.sin(angle) * 20
                });
            }
        });
        
        player.parts.push(...newParts);
    }

    ejectMass(player) {
        // 实现质量发射功能
        // 这里可以简化处理，或者返回发射的小球信息
    }

    update() {
        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;

        // 更新所有真实玩家
        this.players.forEach(player => {
            this.updatePlayer(player, deltaTime);
        });
        
        // 更新所有AI玩家
        this.aiPlayers.forEach(aiPlayer => {
            this.updateAIPlayer(aiPlayer, deltaTime);
        });

        // 检查碰撞
        this.checkCollisions();

        // 补充食物
        if (Math.random() < 0.05 && this.foods.length < FOOD_COUNT) {
            this.foods.push({
                id: Math.random().toString(36).substr(2, 9),
                x: Math.random() * WORLD_WIDTH,
                y: Math.random() * WORLD_HEIGHT,
                radius: Math.random() * 4 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    updateAIPlayer(aiPlayer, deltaTime) {
        // 简化版的AI逻辑，主要用于服务器端
        aiPlayer.aiUpdateCounter++;
        if (aiPlayer.aiUpdateCounter % 15 !== 0) return;
        
        const mainPart = aiPlayer.parts[0];
        
        // 简单的目标更新逻辑
        if (Math.random() < 0.1) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 200;
            aiPlayer.targetX = mainPart.x + Math.cos(angle) * distance;
            aiPlayer.targetY = mainPart.y + Math.sin(angle) * distance;
        }
        
        // 边界检查
        if (aiPlayer.targetX < 50) aiPlayer.targetX = 50;
        if (aiPlayer.targetX > WORLD_WIDTH - 50) aiPlayer.targetX = WORLD_WIDTH - 50;
        if (aiPlayer.targetY < 50) aiPlayer.targetY = 50;
        if (aiPlayer.targetY > WORLD_HEIGHT - 50) aiPlayer.targetY = WORLD_HEIGHT - 50;
        
        // 调用普通玩家更新逻辑
        this.updatePlayer(aiPlayer, deltaTime);
    }

    updatePlayer(player, deltaTime) {
        // 更新玩家部分
        player.parts.forEach((part, index) => {
            const dx = player.targetX - part.x;
            const dy = player.targetY - part.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 计算速度
            const baseSpeed = Math.max(3.5, 12 - part.radius * 0.05);
            
            if (part.vx !== 0 || part.vy !== 0) {
                part.velocityX = part.vx;
                part.velocityY = part.vy;
                part.vx *= 0.88;
                part.vy *= 0.88;
                
                if (Math.abs(part.vx) < 0.3) {
                    part.vx = 0;
                    part.velocityX = 0;
                }
                if (Math.abs(part.vy) < 0.3) {
                    part.vy = 0;
                    part.velocityY = 0;
                }
            } else if (distance > 8) {
                const moveFactor = Math.min(1.0, distance / 100);
                part.velocityX = (dx / distance) * baseSpeed * moveFactor;
                part.velocityY = (dy / distance) * baseSpeed * moveFactor;
                
                if (distance < 20) {
                    const slowFactor = distance / 20;
                    part.velocityX *= slowFactor;
                    part.velocityY *= slowFactor;
                }
            } else {
                part.velocityX *= 0.92;
                part.velocityY *= 0.92;
                
                if (Math.abs(part.velocityX) < 0.1) part.velocityX = 0;
                if (Math.abs(part.velocityY) < 0.1) part.velocityY = 0;
            }
            
            // 更新位置
            part.x += part.velocityX;
            part.y += part.velocityY;
            
            // 边界检查
            const margin = part.radius;
            part.x = Math.max(margin, Math.min(WORLD_WIDTH - margin, part.x));
            part.y = Math.max(margin, Math.min(WORLD_HEIGHT - margin, part.y));
            
            // 分离检测
            for (let j = index + 1; j < player.parts.length; j++) {
                const otherPart = player.parts[j];
                const dx2 = otherPart.x - part.x;
                const dy2 = otherPart.y - part.y;
                const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                const minDistance = part.radius + otherPart.radius + 5;
                
                if (distance2 < minDistance && distance2 > 0) {
                    const overlap = minDistance - distance2;
                    const separationForce = overlap * 0.6;
                    const separationX = (dx2 / distance2) * separationForce;
                    const separationY = (dy2 / distance2) * separationForce;
                    
                    part.x -= separationX;
                    part.y -= separationY;
                    otherPart.x += separationX;
                    otherPart.y += separationY;
                }
            }
        });

        // 更新质量
        let totalMass = 0;
        player.parts.forEach(part => {
            totalMass += part.radius * part.radius * Math.PI;
        });
        player.mass = totalMass;
    }

    checkCollisions() {
        // 获取所有玩家（真实+AI）
        const allPlayers = [...Array.from(this.players.values()), ...this.aiPlayers];
        
        // 玩家吃食物
        allPlayers.forEach(player => {
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
                            if (part1.radius > part2.radius * 1.1) {
                                const massGain = part2.radius * part2.radius * Math.PI;
                                part1.radius = Math.sqrt(part1.radius * part1.radius + massGain);
                                player1.score += Math.floor(part2.radius * 5);
                                
                                // 从对应列表中移除被吃掉的部分
                                if (player2.isAI) {
                                    player2.parts = player2.parts.filter(p => p !== part2);
                                    if (player2.parts.length === 0) {
                                        const index = this.aiPlayers.findIndex(ai => ai.id === player2.id);
                                        if (index !== -1) this.aiPlayers.splice(index, 1);
                                    }
                                } else {
                                    player2.parts = player2.parts.filter(p => p !== part2);
                                    // 注意：这里不删除真实玩家，让客户端处理
                                }
                            } else if (part2.radius > part1.radius * 1.1) {
                                const massGain = part1.radius * part1.radius * Math.PI;
                                part2.radius = Math.sqrt(part2.radius * part2.radius + massGain);
                                player2.score += Math.floor(part1.radius * 5);
                                
                                if (player1.isAI) {
                                    player1.parts = player1.parts.filter(p => p !== part1);
                                    if (player1.parts.length === 0) {
                                        const index = this.aiPlayers.findIndex(ai => ai.id === player1.id);
                                        if (index !== -1) this.aiPlayers.splice(index, 1);
                                    }
                                } else {
                                    player1.parts = player1.parts.filter(p => p !== part1);
                                }
                            }
                        }
                    });
                });
            }
        }
        
        // 补充被吃掉的AI玩家
        const totalPlayers = this.players.size + this.aiPlayers.length;
        if (totalPlayers < this.minTotalPlayers && this.aiPlayers.length < this.maxAIPlayers) {
            this.generateAIPlayers(1);
        }
    }

    getState() {
        return {
            players: Array.from(this.players.values()),
            aiPlayers: this.aiPlayers,
            foods: this.foods,
            particles: this.particles
        };
    }
}

// 创建房间或加入现有房间
function getOrCreateRoom(roomId = 'default') {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new GameRoom(roomId));
    }
    return rooms.get(roomId);
}

// Socket连接处理
io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);

    // 加入房间
    socket.on('joinRoom', (data) => {
        const roomId = data.roomId || 'default';
        const room = getOrCreateRoom(roomId);
        
        // 限制房间人数
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            socket.emit('joinError', { message: '房间已满' });
            return;
        }

        // 加入房间
        socket.join(roomId);
        playerRooms.set(socket.id, roomId);
        
        // 添加玩家
        const player = room.addPlayer(socket.id, data);
        
        // 发送加入成功信息
        socket.emit('joinSuccess', {
            playerId: socket.id,
            player: player,
            roomState: room.getState()
        });

        // 通知房间内其他玩家
        socket.to(roomId).emit('playerJoined', {
            player: player
        });

        console.log(`玩家 ${data.name} 加入房间 ${roomId}`);
    });

    // 更新玩家数据
    socket.on('updatePlayer', (data) => {
        const roomId = playerRooms.get(socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.updatePlayerData(socket.id, data);
                
                // 广播给房间内其他玩家
                socket.to(roomId).emit('playerUpdated', {
                    playerId: socket.id,
                    data: data
                });
            }
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);
        
        const roomId = playerRooms.get(socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                const player = room.removePlayer(socket.id);
                if (player) {
                    // 通知房间内其他玩家
                    socket.to(roomId).emit('playerLeft', {
                        playerId: socket.id,
                        player: player
                    });
                }
                
                // 如果房间为空，删除房间
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                }
            }
        }
        
        playerRooms.delete(socket.id);
    });
});

// 游戏循环
setInterval(() => {
    rooms.forEach(room => {
        room.update();
        
        // 向房间内所有玩家广播游戏状态
        io.to(room.id).emit('gameState', room.getState());
    });
}, 1000 / 60); // 60 FPS

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`游戏地址: http://localhost:${PORT}`);
});