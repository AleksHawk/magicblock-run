(function() {
    'use strict'; 

    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const wrapper = document.getElementById('game-wrapper');
    const scoreEl = document.getElementById('score-val');
    const energyEl = document.getElementById('energy-val');
    const playerNameInput = document.getElementById('player-name');
    const inputGroup = document.querySelector('.input-group');

    // 🛑 Блокування зуму (Античіт)
    document.addEventListener('wheel', function(e) { if (e.ctrlKey) { e.preventDefault(); } }, { passive: false });
    document.addEventListener('keydown', function(e) { if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=')) { e.preventDefault(); } });

    // 🎵 АУДІО ТА ЗВУКОВІ ЕФЕКТИ
    const bgMusic = new Audio('https://assets.mixkit.co/music/preview/mixkit-software-developer-851.mp3'); 
    bgMusic.loop = true; bgMusic.volume = 0.3;
    
    const coinSfx = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-arcade-game-jump-coin-216.mp3'); 
    coinSfx.volume = 0.5;
    
    const powerSfx = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-mighty-mystical-sword-cast-2121.mp3'); 
    powerSfx.volume = 0.7;
    
    const hitSfx = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-explosion-with-glass-debris-1701.mp3'); 
    hitSfx.volume = 0.6;

    const rulesI18n = {
        en: { title: "rules:", r1: "hold space or touch to fly", r2: "collect 5 logos for superpower", r3: "avoid dark rifts", r4: "during superpower you are invincible!" },
        ua: { title: "правила:", r1: "затисни екран щоб летіти", r2: "збери 5 лого для суперсили", r3: "уникай темних розломів", r4: "під час суперсили ти невразливий!" }
    };

    function setRulesLang(lang) {
        document.getElementById('text-rules').innerText = rulesI18n[lang].title;
        document.getElementById('rules-list').innerHTML = `<li>${rulesI18n[lang].r1}</li><li>${rulesI18n[lang].r2}</li><li>${rulesI18n[lang].r3}</li><li>${rulesI18n[lang].r4}</li>`;
    }

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); setRulesLang(btn.dataset.lang);
        };
    });

    // Підключення Firebase
    const firebaseConfig = {
      apiKey: "AIzaSyChIHzdaeMU8xpD3aoDUiw1DDez1vobF8E",
      authDomain: "magic-game-1a08d.firebaseapp.com",
      databaseURL: "https://magic-game-1a08d-default-rtdb.europe-west1.firebasedatabase.app/",
      projectId: "magic-game-1a08d",
      storageBucket: "magic-game-1a08d.firebasestorage.app",
      messagingSenderId: "72902038152",
      appId: "1:72902038152:web:6edc657a2397a30df4453d"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    function loadGlobalBest() {
        db.ref('leaderboard').orderByChild('score').limitToLast(5).on('value', (snapshot) => {
            const lbList = document.getElementById('lb-list');
            if (snapshot.exists() && lbList) { 
                let topPlayers = [];
                snapshot.forEach((child) => { topPlayers.push({ name: child.key, score: child.val().score }); });
                topPlayers.reverse(); lbList.innerHTML = ''; 
                topPlayers.forEach((player, index) => {
                    const row = document.createElement('div'); row.className = 'lb-row';
                    row.innerHTML = `<span class="lb-rank">#${index + 1}</span><span class="lb-name">${player.name}</span><span class="lb-score">${Math.floor(player.score)}</span>`;
                    lbList.appendChild(row);
                });
            } else if (lbList) { 
                lbList.innerHTML = '<div class="lb-wait">no records yet. be the first!</div>'; 
            }
        }, (error) => {
            console.error("Firebase read error:", error);
            document.getElementById('lb-list').innerHTML = '<div class="lb-wait">error loading leaderboard</div>';
        });
    }
    loadGlobalBest();

    let bestLocalScore = localStorage.getItem('magic_best_score') || 0;
    
    const mageImg = new Image(); mageImg.src = 'mage.png';
    const logoImg = new Image(); logoImg.src = 'minilogo.png';

    let w, h;
    const p = { x: 100, y: 0, w: 60, h: 60, vy: 0, floorY: 0, ceilY: 0 };

    function resize() { 
        w = wrapper.clientWidth; h = wrapper.clientHeight; 
        if (w > 800) w = 800; if (h > 850) h = 850;
        canvas.width = w; canvas.height = h; 
        p.floorY = h - 30; p.ceilY = 30;
        if (p.y > p.floorY) p.y = p.floorY - p.h; 
    }
    window.addEventListener('resize', resize); resize();

    let isLive = false, score = 0, speed = 7.5;
    let energy = 0, feverMode = false, feverTimer = 0;
    let frameCount = 0, shakeTime = 0;
    let isThrusting = false;
    let obstacles = [], stones = [], particles = [], stars = [];
    let currentPlayerName = "";
    
    let _shadowScore = 0; 
    let _gameStartTime = 0;
    let _lastFrameTime = 0;
    let _cheatDetected = false;
    let flashAlpha = 0;

    function tryStartGame() {
        const name = playerNameInput.value.trim();
        if (name === "") {
            playerNameInput.classList.add('input-error'); inputGroup.classList.add('has-error');
            setTimeout(() => { playerNameInput.classList.remove('input-error'); inputGroup.classList.remove('has-error'); }, 1000);
            return; 
        }
        currentPlayerName = name; document.getElementById('menu').classList.remove('active'); initGame();
    }

    function initGame() {
        score = 0; _shadowScore = 0; speed = 7.5; energy = 0; feverMode = false; feverTimer = 0; frameCount = 0; _cheatDetected = false; flashAlpha = 0;
        obstacles = []; stones = []; particles = []; stars = [];
        wrapper.classList.remove('blink-active');
        isThrusting = false; p.vy = 0; resize(); p.y = p.floorY - p.h; 
        scoreEl.innerText = score; energyEl.innerText = `mana: 0/5`; energyEl.classList.remove('fever');
        isLive = true; _gameStartTime = performance.now(); _lastFrameTime = _gameStartTime;
        document.getElementById('ss-foot-text').innerText = `can you beat ${currentPlayerName}'s magic?`;
        
        // 🎵 Запуск музики
        bgMusic.currentTime = 0; 
        bgMusic.play().catch(e => console.log("Браузер блокує автоплей музики", e));
        
        requestAnimationFrame(loop);
    }

    function startThrust() { if (isLive) isThrusting = true; }
    function stopThrust() { isThrusting = false; }

    window.addEventListener('keydown', e => { if(e.code === 'Space') startThrust(); }); window.addEventListener('keyup', e => { if(e.code === 'Space') stopThrust(); });
    wrapper.addEventListener('touchstart', e => { if(e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !e.target.classList.contains('lang-btn')) startThrust(); }, {passive: true});
    wrapper.addEventListener('touchend', e => { stopThrust(); }, {passive: true});
    wrapper.addEventListener('mousedown', e => { if(e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !e.target.classList.contains('lang-btn')) startThrust(); });
    wrapper.addEventListener('mouseup', e => { stopThrust(); });

    function spawn() {
        let level = Math.floor(frameCount / 900);
        let obstacleThreshold = Math.min(0.70, 0.40 + (level * 0.10));
        let type = Math.random() > obstacleThreshold ? 'stone' : 'obstacle';
        if (type === 'obstacle') {
            let isTop = Math.random() > 0.5; let obsH = Math.random() * (h/2.5) + 40;
            obstacles.push({ x: w, w: 50, h: obsH, y: isTop ? p.ceilY : p.floorY - obsH });
        } else {
            stones.push({ x: w, y: Math.random() * (h - 140) + 70, w: 45, h: 45, collected: false });
        }
    }

    function createParticles(x, y, color, count, speedMulti = 1) {
        for (let i = 0; i < count; i++) { particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 15 * speedMulti, vy: (Math.random() - 0.5) * 15 * speedMulti, life: Math.random() * 30 + 10, color: color, size: Math.random() * 4 + 2 }); }
    }

    function die(cheated = false) {
        isLive = false; shakeTime = 20; isThrusting = false; wrapper.classList.remove('blink-active');
        
        // 🎵 Звук смерті та зупинка музики
        bgMusic.pause();
        hitSfx.currentTime = 0; hitSfx.play().catch(()=>{});
        
        for(let i=0; i<80; i++) {
            let color = Math.random() > 0.5 ? '#8a2be2' : '#ff00ff';
            particles.push({ x: p.x + p.w/2, y: p.y + p.h/2, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: Math.random() * 50 + 20, color: color, size: Math.random() * 5 + 2 });
        }
        
        if(navigator.vibrate) navigator.vibrate([300, 100, 300]);
        
        let finalSc = Math.floor(score);
        let timePlayed = (performance.now() - _gameStartTime) / 1000; 
        
        if (Math.abs(score - _shadowScore) > 2) cheated = true; 
        if (finalSc > timePlayed * 150) cheated = true; 

        if (!cheated && finalSc > 0 && currentPlayerName) {
            const userRef = db.ref('leaderboard/' + currentPlayerName);
            userRef.once('value').then((snapshot) => {
                const oldScore = snapshot.val() ? snapshot.val().score : 0;
                if (finalSc > oldScore) { userRef.set({ score: finalSc }); }
            }).catch(err => console.error("Firebase write error:", err));
            if (finalSc > bestLocalScore) { bestLocalScore = finalSc; localStorage.setItem('magic_best_score', bestLocalScore); }
        }

        setTimeout(() => {
            document.getElementById('final-score').innerText = cheated ? "CHEATER DETECTED" : finalSc;
            document.getElementById('ss-score-val').innerText = cheated ? "0" : finalSc;
            document.getElementById('game-over').classList.add('active');
        }, 1200);
    }

    function loop() {
        let now = performance.now();
        if (isLive && now - _lastFrameTime > 1500) { _cheatDetected = true; die(true); return; }
        _lastFrameTime = now;

        if (shakeTime > 0) { ctx.save(); ctx.translate((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20); shakeTime--; } else { ctx.save(); }
        
        ctx.clearRect(0, 0, w, h);

        if (isLive) {
            let starSpawnRate = speed / 30;
            if (Math.random() < starSpawnRate) {
                stars.push({ x: w, y: Math.random() * h, s: Math.random() * 3 + 1, speed: speed * (Math.random() * 1.5 + 0.5) });
            }
        }
        ctx.fillStyle = feverMode ? "#ff00ff" : "#ffffff";
        for (let i = stars.length - 1; i >= 0; i--) {
            let s = stars[i]; if (isLive) s.x -= s.speed;
            ctx.globalAlpha = s.s / 4; ctx.fillRect(s.x, s.y, feverMode ? s.speed : s.s * 2, s.s); ctx.globalAlpha = 1;
            if (s.x < 0) stars.splice(i, 1);
        }

        ctx.fillStyle = "#8a2be2"; ctx.shadowBlur = 15; ctx.shadowColor = "#b026ff"; 
        ctx.fillRect(0, p.ceilY - 5, w, 5); ctx.fillRect(0, p.floorY, w, 5); ctx.shadowBlur = 0;

        if (!isLive && particles.length === 0 && flashAlpha <= 0) { ctx.restore(); return; }
        if (isLive) frameCount++;

        if (feverMode) {
            feverTimer--;
            if (feverTimer % 2 === 0) createParticles(p.x, p.y + p.h/2, '#ff00ff', 1, 0.5); 
            if (feverTimer <= 0) { 
                feverMode = false; energy = 0; speed -= 5; 
                energyEl.innerText = `mana: 0/5`; energyEl.classList.remove('fever'); 
                wrapper.classList.remove('blink-active');
            }
        }

        if (isLive && frameCount % 240 === 0) {
            if (speed < 25) speed += 1.5; 
            if(!feverMode) {
                wrapper.style.boxShadow = "inset 0 0 80px rgba(176, 38, 255, 0.6)";
                setTimeout(() => wrapper.style.boxShadow = "0 0 40px rgba(176, 38, 255, 0.4)", 300);
            }
        }

        if (isLive && frameCount % Math.max(20, 90 - Math.floor(speed*1.5)) === 0) spawn();

        if (isLive) {
            if (isThrusting) { p.vy -= 1.8; createParticles(p.x + 10, p.y + p.h, '#00ffff', 1, 0.3); } else { p.vy += 1.2; }
            p.vy *= 0.85; p.y += p.vy;
            if (p.y + p.h > p.floorY) { p.y = p.floorY - p.h; p.vy = 0; } else if (p.y < p.ceilY) { p.y = p.ceilY; p.vy = 0; }
            
            let pts = feverMode ? 0.3 : 0.1;
            score += pts; _shadowScore += pts; 
            scoreEl.innerText = Math.floor(score);
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obs = obstacles[i]; if (isLive) obs.x -= speed;
            ctx.fillStyle = "#1a0033"; ctx.strokeStyle = "#b026ff"; ctx.lineWidth = 3;
            ctx.shadowBlur = 20; ctx.shadowColor = "#8a2be2"; 
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h); ctx.strokeRect(obs.x, obs.y, obs.w, obs.h); ctx.shadowBlur = 0;
            
            if (isLive && p.x + 10 < obs.x + obs.w && p.x + p.w - 10 > obs.x && p.y + 10 < obs.y + obs.h && p.y + p.h - 10 > obs.y) {
                if (feverMode) { 
                    score += 50; _shadowScore += 50; shakeTime = 10; 
                    createParticles(obs.x + obs.w/2, obs.y + obs.h/2, '#ffffff', 40, 2); 
                    if(navigator.vibrate) navigator.vibrate(50); obstacles.splice(i, 1); continue; 
                } else { die(); }
            }
            if (obs.x + obs.w < 0) obstacles.splice(i, 1);
        }

        for (let i = stones.length - 1; i >= 0; i--) {
            let st = stones[i]; if (isLive) st.x -= speed;
            if (!st.collected) {
                ctx.shadowBlur = 15; ctx.shadowColor = "#00ffff"; ctx.drawImage(logoImg, st.x, st.y, st.w, st.h); ctx.shadowBlur = 0;
                if (isLive && p.x < st.x + st.w && p.x + p.w > st.x && p.y < st.y + st.h && p.y + p.h > st.y) {
                    st.collected = true; 
                    let bonus = feverMode ? 40 : 15; score += bonus; _shadowScore += bonus;
                    
                    // 🎵 Звук збору
                    coinSfx.currentTime = 0; coinSfx.play().catch(()=>{});

                    if (!feverMode) {
                        energy++;
                        if (energy >= 5) { 
                            feverMode = true; feverTimer = 300; speed += 5; flashAlpha = 1.0; shakeTime = 15;
                            energyEl.innerText = "⚡ BLINK READY! ⚡"; energyEl.classList.add('fever'); 
                            wrapper.classList.add('blink-active');
                            createParticles(p.x + p.w/2, p.y + p.h/2, "#ffffff", 80, 3);
                            
                            // 🎵 Звук магічної суперсили
                            powerSfx.currentTime = 0; powerSfx.play().catch(()=>{});
                        } else { energyEl.innerText = `mana: ${energy}/5`; }
                    }
                    if(navigator.vibrate) navigator.vibrate(40); createParticles(st.x + st.w/2, st.y + st.h/2, "#00ffff", 15);
                }
            }
            if (st.x + st.w < 0) stones.splice(i, 1);
        }

        for (let i = particles.length - 1; i >= 0; i--) { let pt = particles[i]; pt.x += pt.vx; pt.y += pt.vy; pt.life--; ctx.fillStyle = pt.color; ctx.globalAlpha = Math.max(0, pt.life / 30); ctx.fillRect(pt.x, pt.y, pt.size, pt.size); ctx.globalAlpha = 1; if (pt.life <= 0) particles.splice(i, 1); }

        if (isLive && !feverMode) { ctx.save(); ctx.shadowBlur = 15; ctx.shadowColor = "#b026ff"; ctx.drawImage(mageImg, p.x, p.y, p.w, p.h); ctx.restore(); }
        else if (isLive && feverMode) { ctx.save(); ctx.globalAlpha = 0.8; ctx.shadowBlur = 40; ctx.shadowColor = "#ffffff"; ctx.drawImage(mageImg, p.x, p.y, p.w, p.h); ctx.restore(); }

        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, w, h);
            flashAlpha -= 0.05;
        }

        ctx.restore(); if (isLive || shakeTime > 0 || particles.length > 0 || flashAlpha > 0) requestAnimationFrame(loop);
    }

    document.getElementById('btn-start').onclick = tryStartGame;
    document.getElementById('btn-restart').onclick = () => { document.getElementById('game-over').classList.remove('active'); initGame(); };
    document.getElementById('btn-save').onclick = function() {
        const originalText = this.innerText; this.innerText = "downloading...";
        html2canvas(document.getElementById('ss-export'), { backgroundColor: "#0a0014", scale: 2, logging: false }).then(canvas => { const link = document.createElement('a'); link.download = 'magicblock-run-record.png'; link.href = canvas.toDataURL('image/png'); link.click(); this.innerText = "saved!"; setTimeout(() => this.innerText = originalText, 2000); });
    };

    document.getElementById('btn-x').onclick = function() {
        const txt = encodeURIComponent(`casting spells in a challenge from @hawk_tyt! 🔮\nmy mage (${currentPlayerName}) reached: ${Math.floor(score)} points ⚡\ncrafted for the @magicblock community 💜\n\ntry to beat it: https://alekshawk.github.io/magicblock-run/\n\ni summon: @`);
        window.open(`https://twitter.com/intent/tweet?text=${txt}`, '_blank');
    };
})();
