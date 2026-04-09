(function () {
  'use strict';

  const WORLD_HALF = 88;
  /** Adult cat eye height (meters-ish). Kits are much lower — you feel small. */
  const EYE_HEIGHT = 1.12;
  const EYE_HEIGHT_KIT = 0.4;
  const MOVE_SPEED = 11;
  const MOVE_SPEED_KIT = 6.2;
  const FOV_ADULT = 72;
  const FOV_KIT = 80;
  const LOOK_SENS_MOUSE = 0.0022;
  const LOOK_SENS_TOUCH = 0.0045;

  const $ = function (id) { return document.getElementById(id); };

  const screenTitle = $('screen-title');
  const screenSaves = $('screen-saves');
  const screenSetup = $('screen-setup');
  const canvas = $('game-canvas');
  const btnPlay = $('btn-play');
  const saveSlotsEl = $('save-slots');
  const btnBackSaves = $('btn-back-saves');
  const btnBackTitle = $('btn-back-title');
  const setupForm = $('setup-form');
  const inputPrefix = $('input-prefix');
  const inputFur = $('input-fur');
  const furPresetsEl = $('fur-presets');
  const selectClan = $('select-clan');
  const selectRank = $('select-rank');
  const selectSuffix = $('select-suffix');
  const suffixRow = $('suffix-row');
  const hud = $('hud');
  const hudName = $('hud-name');
  const hudRole = $('hud-role');
  const btnMenu = $('btn-menu');
  const touchLookZone = $('touch-look-zone');
  const joystickZone = $('joystick-zone');
  const joystick = $('joystick');
  const joystickKnob = $('joystick-knob');
  const hintBar = $('hint-bar');
  const kitMotherScreen = $('screen-kit-mother');
  const btnKitMotherContinue = $('btn-kit-mother-continue');

  let profile = null;
  let scene, camera, renderer;
  let clock;
  let cameraYaw = 0;
  let cameraPitch = 0;
  const keys = {};
  let joystickVec = { x: 0, y: 0 };
  let isPlaying = false;
  let isMobile = false;
  let audioCtx = null;
  /** Master gain for all game audio (Web Audio API — no sound files). */
  let audioBus = null;
  let footstepCooldown = 0;
  let birdTimer = 0;
  let nextBirdIn = 4;
  let saveTimer = null;
  let hintShown = false;
  /** Active save slot 1–3 (set when picking a slot or continuing). */
  let activeSaveSlot = 1;

  function keyDown (e) { onKey(e, true); }
  function keyUp (e) { onKey(e, false); }
  function onResize () { resize(); }
  function onVis () {
    if (document.hidden && profile) GameLogic.saveProfile(profile, activeSaveSlot);
  }

  function isTouchDevice () {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function detectMobile () {
    return isTouchDevice() && window.matchMedia('(max-width: 900px)').matches;
  }

  function setGameAudioLevel (playing) {
    if (!audioBus) return;
    const t = audioCtx ? audioCtx.currentTime : 0;
    try {
      audioBus.gain.cancelScheduledValues(t);
      audioBus.gain.setValueAtTime(audioBus.gain.value, t);
      audioBus.gain.linearRampToValueAtTime(playing ? 0.42 : 0, t + 0.2);
    } catch (e) {
      audioBus.gain.value = playing ? 0.42 : 0;
    }
  }

  function playUiBlip () {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(780, t + 0.06);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.11);
  }

  function playFootstep () {
    if (!audioCtx || !audioBus) return;
    const t = audioCtx.currentTime;
    const len = Math.floor(audioCtx.sampleRate * 0.055);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 1.8);
      data[i] = (Math.random() * 2 - 1) * env * 0.85;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260 + Math.random() * 80;
    bp.Q.value = 0.9;
    const g = audioCtx.createGain();
    g.gain.value = isKitRole() ? 0.14 : 0.18;
    src.connect(bp);
    bp.connect(g);
    g.connect(audioBus);
    src.start(t);
    src.stop(t + 0.06);
  }

  function playBirdChirp () {
    if (!audioCtx || !audioBus) return;
    const t = audioCtx.currentTime;
    const base = 2600 + Math.random() * 900;
    for (let k = 0; k < 2; k++) {
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base + k * 180, t + k * 0.04);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, t + k * 0.04);
      g.gain.linearRampToValueAtTime(0.06, t + k * 0.04 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.04 + 0.1);
      o.connect(g);
      g.connect(audioBus);
      o.start(t + k * 0.04);
      o.stop(t + k * 0.04 + 0.12);
    }
  }

  function updateWorldSounds (dt, moving) {
    if (moving) {
      footstepCooldown -= dt;
      if (footstepCooldown <= 0) {
        playFootstep();
        footstepCooldown = isKitRole() ? 0.2 : 0.26;
      }
    } else {
      footstepCooldown = 0;
    }
    birdTimer += dt;
    if (birdTimer >= nextBirdIn) {
      birdTimer = 0;
      nextBirdIn = 5 + Math.random() * 9;
      if (Math.random() > 0.35) playBirdChirp();
    }
  }

  function initAudio () {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioBus = audioCtx.createGain();
      audioBus.gain.value = 0;

      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 8;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      audioBus.connect(comp);
      comp.connect(audioCtx.destination);

      const sr = audioCtx.sampleRate;
      const noiseBuf = audioCtx.createBuffer(1, sr * 2, sr);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const wind = audioCtx.createBufferSource();
      wind.buffer = noiseBuf;
      wind.loop = true;
      const windF = audioCtx.createBiquadFilter();
      windF.type = 'lowpass';
      windF.frequency.value = 380;
      const windG = audioCtx.createGain();
      windG.gain.value = 0.32;
      wind.connect(windF);
      windF.connect(windG);
      windG.connect(audioBus);
      wind.start();

      const rustleBuf = audioCtx.createBuffer(1, sr * 2, sr);
      const rd = rustleBuf.getChannelData(0);
      for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1;
      const rustle = audioCtx.createBufferSource();
      rustle.buffer = rustleBuf;
      rustle.loop = true;
      const rustleF = audioCtx.createBiquadFilter();
      rustleF.type = 'bandpass';
      rustleF.frequency.value = 2200;
      rustleF.Q.value = 0.4;
      const rustleG = audioCtx.createGain();
      rustleG.gain.value = 0.045;
      rustle.connect(rustleF);
      rustleF.connect(rustleG);
      rustleG.connect(audioBus);
      rustle.start();

      const drone = audioCtx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 52;
      const droneG = audioCtx.createGain();
      droneG.gain.value = 0.06;
      drone.connect(droneG);
      droneG.connect(audioBus);
      drone.start();

      const drone2 = audioCtx.createOscillator();
      drone2.type = 'sine';
      drone2.frequency.value = 78;
      const drone2G = audioCtx.createGain();
      drone2G.gain.value = 0.035;
      drone2.connect(drone2G);
      drone2G.connect(audioBus);
      drone2.start();

      try {
        const lfo = audioCtx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoG = audioCtx.createGain();
        lfoG.gain.value = 60;
        lfo.connect(lfoG);
        lfoG.connect(windF.frequency);
        lfo.start();
      } catch (lfoErr) {
        /* wind still works without gust LFO */
      }
    } catch (err) {
      /* ignore */
    }
  }

  function makeTree (furHue) {
    const g = new THREE.Group();
    const trunkBrown = new THREE.Color().setHSL(0.07 + Math.random() * 0.04, 0.35, 0.28);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: trunkBrown,
      roughness: 0.92,
      metalness: 0,
      flatShading: false
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 2.35, 9), trunkMat);
    trunk.position.y = 1.15;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);
    const leafHue = (furHue + Math.random() * 0.06) % 1;
    const leafCol = new THREE.Color().setHSL(leafHue, 0.22 + Math.random() * 0.18, 0.26 + Math.random() * 0.08);
    const leafMat = new THREE.MeshStandardMaterial({
      color: leafCol,
      roughness: 0.78,
      metalness: 0,
      flatShading: false
    });
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.45, 3.1, 10), leafMat);
    leaves.position.y = 3.05;
    leaves.castShadow = true;
    g.add(leaves);
    const leafCol2 = leafCol.clone().multiplyScalar(0.92);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.8, 8), new THREE.MeshStandardMaterial({
      color: leafCol2,
      roughness: 0.82,
      metalness: 0
    }));
    top.position.y = 4.35;
    top.castShadow = true;
    g.add(top);
    return g;
  }

  function initThree () {
    const w = window.innerWidth;
    const h = window.innerHeight;
    scene = new THREE.Scene();
    const skyColor = 0xaabdc4;
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.Fog(0xb9c8ce, 35, 145);

    camera = new THREE.PerspectiveCamera(FOV_ADULT, w / h, 0.08, 220);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (renderer.outputEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping =
      THREE.ACESFilmicToneMapping !== undefined
        ? THREE.ACESFilmicToneMapping
        : THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.05;

    const hemi = new THREE.HemisphereLight(0xc5d4e0, 0x2a3528, 0.42);
    scene.add(hemi);
    const fill = new THREE.AmbientLight(0x8a9a88, 0.18);
    scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff2e0, 1.05);
    sun.position.set(55, 78, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    const sh = 95;
    sun.shadow.camera.left = -sh;
    sun.shadow.camera.right = sh;
    sun.shadow.camera.top = sh;
    sun.shadow.camera.bottom = -sh;
    sun.shadow.bias = -0.00025;
    scene.add(sun);

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a3d2c,
      roughness: 0.98,
      metalness: 0
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2.2, WORLD_HALF * 2.2), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const hslOut = { h: 0, s: 0, l: 0 };
    new THREE.Color(profile.furColor).getHSL(hslOut);
    const furHue = hslOut.h;

    for (let i = 0; i < 70; i++) {
      const t = makeTree((furHue + i * 0.07) % 1);
      const rx = (Math.random() - 0.5) * WORLD_HALF * 1.85;
      const rz = (Math.random() - 0.5) * WORLD_HALF * 1.85;
      if (Math.hypot(rx, rz) < 6) continue;
      t.position.set(rx, 0, rz);
      const sc = 0.75 + Math.random() * 0.55;
      t.scale.set(sc, sc, sc);
      t.rotation.y = Math.random() * Math.PI * 2;
      scene.add(t);
    }

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5a5a5e,
      roughness: 0.94,
      metalness: 0.05
    });
    for (let i = 0; i < 18; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5, 0), rockMat);
      const rx = (Math.random() - 0.5) * WORLD_HALF * 1.6;
      const rz = (Math.random() - 0.5) * WORLD_HALF * 1.6;
      rock.position.set(rx, 0.35, rz);
      rock.castShadow = true;
      scene.add(rock);
    }

    clock = new THREE.Clock();
  }

  function isKitRole () {
    return profile && profile.rank === 'kit';
  }

  function getEyeHeight () {
    return isKitRole() ? EYE_HEIGHT_KIT : EYE_HEIGHT;
  }

  function getMoveSpeed () {
    return isKitRole() ? MOVE_SPEED_KIT : MOVE_SPEED;
  }

  function applyRoleCameraFov () {
    if (!camera) return;
    camera.fov = isKitRole() ? FOV_KIT : FOV_ADULT;
    camera.updateProjectionMatrix();
  }

  function resize () {
    if (!camera || !renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function updateCamera () {
    const p = profile.position;
    const pitch = -cameraPitch;
    const lookDist = 14;
    const camX = p.x;
    const camZ = p.z;
    const camY = getEyeHeight();
    const lookX = camX - Math.sin(cameraYaw) * Math.cos(pitch) * lookDist;
    const lookZ = camZ - Math.cos(cameraYaw) * Math.cos(pitch) * lookDist;
    const lookY = camY + Math.sin(pitch) * lookDist;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(lookX, lookY, lookZ);
  }

  function tick () {
    if (!isPlaying || !clock) return;
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);

    let fwd = 0;
    let str = 0;
    if (keys.w) fwd += 1;
    if (keys.s) fwd -= 1;
    if (keys.a) str -= 1;
    if (keys.d) str += 1;

    if (isMobile && (joystickVec.x !== 0 || joystickVec.y !== 0)) {
      fwd += joystickVec.y;
      str += joystickVec.x;
    }

    const len = Math.hypot(fwd, str);
    if (len > 1) {
      fwd /= len;
      str /= len;
    }

    const moving = len > 0.02;
    updateWorldSounds(dt, moving);

    const speed = getMoveSpeed() * dt;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const dx = (-sin * fwd + cos * str) * speed;
    const dz = (-cos * fwd - sin * str) * speed;

    profile.position.x += dx;
    profile.position.z += dz;

    const max = WORLD_HALF - 1.5;
    profile.position.x = Math.max(-max, Math.min(max, profile.position.x));
    profile.position.z = Math.max(-max, Math.min(max, profile.position.z));
    profile.position.yaw = cameraYaw;

    updateCamera();
    renderer.render(scene, camera);
  }

  function onKey (e, down) {
    if (!isPlaying) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || e.code === 'ArrowUp') keys.w = down;
    if (k === 's' || e.code === 'ArrowDown') keys.s = down;
    if (k === 'a' || e.code === 'ArrowLeft') keys.a = down;
    if (k === 'd' || e.code === 'ArrowRight') keys.d = down;
    if (down && e.code === 'Escape') pauseToMenu();
  }

  function setupPointerLock () {
    canvas.addEventListener('click', function () {
      if (!isPlaying || isMobile) return;
      canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', function () {
      const locked = document.pointerLockElement === canvas;
      canvas.style.cursor = locked ? 'none' : 'grab';
    });

    document.addEventListener('mousemove', function (e) {
      if (!isPlaying || isMobile) return;
      if (document.pointerLockElement !== canvas) return;
      cameraYaw -= e.movementX * LOOK_SENS_MOUSE;
      cameraPitch -= e.movementY * LOOK_SENS_MOUSE;
      const lim = Math.PI / 2 - 0.08;
      cameraPitch = Math.max(-lim, Math.min(lim, cameraPitch));
    });
  }

  function setupJoystick () {
    let startX = 0;
    let startY = 0;
    const maxDist = 38;

    function handleStart (cx, cy) {
      const rect = joystick.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      moveKnob(cx, cy);
    }

    function moveKnob (cx, cy) {
      let dx = cx - startX;
      let dy = cy - startY;
      const d = Math.hypot(dx, dy);
      if (d > maxDist) {
        dx = (dx / d) * maxDist;
        dy = (dy / d) * maxDist;
      }
      joystickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joystickVec.x = dx / maxDist;
      joystickVec.y = -dy / maxDist;
    }

    function endKnob () {
      joystickKnob.style.transform = 'translate(0,0)';
      joystickVec.x = 0;
      joystickVec.y = 0;
    }

    joystick.addEventListener('touchstart', function (e) {
      e.preventDefault();
      const t = e.changedTouches[0];
      handleStart(t.clientX, t.clientY);
    }, { passive: false });

    joystick.addEventListener('touchmove', function (e) {
      e.preventDefault();
      const t = e.changedTouches[0];
      moveKnob(t.clientX, t.clientY);
    }, { passive: false });

    joystick.addEventListener('touchend', endKnob);

    let lookLastX = 0;
    let lookLastY = 0;
    touchLookZone.addEventListener('touchstart', function (e) {
      const t = e.changedTouches[0];
      lookLastX = t.clientX;
      lookLastY = t.clientY;
    }, { passive: true });

    touchLookZone.addEventListener('touchmove', function (e) {
      e.preventDefault();
      const t = e.changedTouches[0];
      const dx = t.clientX - lookLastX;
      const dy = t.clientY - lookLastY;
      lookLastX = t.clientX;
      lookLastY = t.clientY;
      cameraYaw -= dx * LOOK_SENS_TOUCH;
      cameraPitch -= dy * LOOK_SENS_TOUCH;
      const lim = Math.PI / 2 - 0.08;
      cameraPitch = Math.max(-lim, Math.min(lim, cameraPitch));
    }, { passive: false });
  }

  function formatSuffixLabel (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function updateSuffixRow () {
    const rank = selectRank.value;
    const show = GameLogic.usesWarriorSuffixRank(rank);
    suffixRow.classList.toggle('hidden', !show);
    if (show && selectSuffix.value && !GameLogic.validateNameSuffix(selectSuffix.value)) {
      selectSuffix.value = 'heart';
    }
  }

  function fillSetupForm (p) {
    inputPrefix.value = p.namePrefix || '';
    inputFur.value = GameLogic.clampHexColor(p.furColor);
    furPresetsEl.querySelectorAll('.fur-swatch').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.hex === inputFur.value);
    });
    selectClan.value = p.clan || 'ThunderClan';
    selectRank.value = p.rank || 'warrior';
    const suf = p.nameSuffix && GameLogic.validateNameSuffix(p.nameSuffix) ? p.nameSuffix : 'heart';
    selectSuffix.value = suf;
    updateSuffixRow();
  }

  function tintKitIntroSvg () {
    const fur = profile && profile.furColor ? profile.furColor : '#d4a574';
    const kitPath = kitMotherScreen && kitMotherScreen.querySelector('#kit-intro-body');
    if (kitPath) kitPath.setAttribute('fill', fur);
  }

  function beginPlaySession () {
    hudName.textContent = GameLogic.getWarriorName(profile);
    hudRole.textContent = GameLogic.getRoleLabel(profile);

    if (isMobile) {
      touchLookZone.classList.remove('hidden');
      joystickZone.classList.remove('hidden');
      if (!hintShown) {
        hintShown = true;
        hintBar.classList.add('visible');
        setTimeout(function () { hintBar.classList.remove('visible'); }, 4500);
      }
    } else {
      touchLookZone.classList.add('hidden');
      joystickZone.classList.add('hidden');
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    document.addEventListener('visibilitychange', onVis);

    isPlaying = true;
    updateCamera();
    tick();

    saveTimer = setInterval(function () {
      if (profile) GameLogic.saveProfile(profile, activeSaveSlot);
    }, 4000);
  }

  function startGame () {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    setGameAudioLevel(true);

    isMobile = detectMobile();
    initThree();
    applyRoleCameraFov();

    const p = profile.position;
    if (typeof p.x !== 'number') p.x = 0;
    if (typeof p.z !== 'number') p.z = 10;
    if (typeof p.yaw !== 'number') p.yaw = 0;
    cameraYaw = p.yaw;
    cameraPitch = 0;

    hudName.textContent = GameLogic.getWarriorName(profile);
    hudRole.textContent = GameLogic.getRoleLabel(profile);

    if (isKitRole()) {
      canvas.classList.add('hidden');
      hud.classList.add('hidden');
      btnMenu.classList.add('hidden');
      touchLookZone.classList.add('hidden');
      joystickZone.classList.add('hidden');
      tintKitIntroSvg();
      kitMotherScreen.classList.remove('hidden');

      btnKitMotherContinue.onclick = function onKitContinue () {
        btnKitMotherContinue.onclick = null;
        playUiBlip();
        kitMotherScreen.classList.add('hidden');
        canvas.classList.remove('hidden');
        hud.classList.remove('hidden');
        btnMenu.classList.remove('hidden');
        beginPlaySession();
      };
      return;
    }

    canvas.classList.remove('hidden');
    hud.classList.remove('hidden');
    btnMenu.classList.remove('hidden');

    beginPlaySession();
  }

  function pauseToMenu () {
    isPlaying = false;
    setGameAudioLevel(false);
    if (saveTimer) {
      clearInterval(saveTimer);
      saveTimer = null;
    }
    if (profile) GameLogic.saveProfile(profile, activeSaveSlot);

    if (document.pointerLockElement === canvas) document.exitPointerLock();

    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    document.removeEventListener('visibilitychange', onVis);

    if (renderer) {
      renderer.dispose();
      scene = null;
      camera = null;
      renderer = null;
    }

    if (kitMotherScreen) {
      kitMotherScreen.classList.add('hidden');
      if (btnKitMotherContinue) btnKitMotherContinue.onclick = null;
    }

    canvas.classList.add('hidden');
    hud.classList.add('hidden');
    btnMenu.classList.add('hidden');
    touchLookZone.classList.add('hidden');
    joystickZone.classList.add('hidden');

    screenSetup.classList.add('hidden');
    screenSaves.classList.add('hidden');
    screenTitle.classList.remove('hidden');
  }

  function renderSaveSlots () {
    if (!saveSlotsEl) return;
    saveSlotsEl.innerHTML = '';
    for (let slot = 1; slot <= GameLogic.SAVE_SLOT_COUNT; slot++) {
      const summary = GameLogic.getSlotSummary(slot);
      const row = document.createElement('div');
      row.className = 'save-slot-row';

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'btn-save-slot' + (summary.empty ? ' is-empty' : '');
      main.dataset.slot = String(slot);

      const lab = document.createElement('span');
      lab.className = 'save-slot-num';
      lab.textContent = 'Slot ' + slot;
      main.appendChild(lab);

      if (summary.empty) {
        const t = document.createElement('span');
        t.className = 'save-slot-empty-text';
        t.textContent = 'Empty — tap to create a new cat';
        main.appendChild(t);
      } else {
        const nameEl = document.createElement('span');
        nameEl.className = 'save-slot-name';
        nameEl.textContent = summary.title;
        main.appendChild(nameEl);
        const det = document.createElement('span');
        det.className = 'save-slot-detail';
        det.textContent = summary.detail || '';
        main.appendChild(det);
      }

      row.appendChild(main);

      if (!summary.empty) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'save-slot-delete';
        del.dataset.slot = String(slot);
        del.setAttribute('aria-label', 'Delete save in slot ' + slot);
        del.textContent = 'Delete';
        row.appendChild(del);
      }

      saveSlotsEl.appendChild(row);
    }
  }

  function selectSaveSlot (slot) {
    activeSaveSlot = slot;
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    playUiBlip();
    const existing = GameLogic.loadProfile(slot);
    if (existing) {
      profile = existing;
      screenSaves.classList.add('hidden');
      startGame();
    } else {
      profile = GameLogic.createDefaultProfile();
      fillSetupForm(profile);
      screenSaves.classList.add('hidden');
      screenSetup.classList.remove('hidden');
    }
  }

  function initDom () {
    GameLogic.CLANS.forEach(function (c) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      selectClan.appendChild(opt);
    });
    GameLogic.RANKS.forEach(function (r) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = GameLogic.getRoleDisplayName(r);
      selectRank.appendChild(opt);
    });

    GameLogic.WARRIOR_SUFFIXES.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = formatSuffixLabel(s);
      selectSuffix.appendChild(opt);
    });

    selectRank.addEventListener('change', updateSuffixRow);

    GameLogic.FUR_PRESETS.forEach(function (hex) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fur-swatch';
      b.style.background = hex;
      b.dataset.hex = hex;
      b.setAttribute('aria-label', 'Fur color ' + hex);
      furPresetsEl.appendChild(b);
    });

    furPresetsEl.addEventListener('click', function (e) {
      const t = e.target.closest('.fur-swatch');
      if (!t) return;
      furPresetsEl.querySelectorAll('.fur-swatch').forEach(function (el) { el.classList.remove('selected'); });
      t.classList.add('selected');
      inputFur.value = t.dataset.hex;
    });

    const firstSwatch = furPresetsEl.querySelector('.fur-swatch');
    if (firstSwatch) firstSwatch.classList.add('selected');

    btnPlay.addEventListener('click', function () {
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      playUiBlip();
      screenTitle.classList.add('hidden');
      screenSaves.classList.remove('hidden');
      renderSaveSlots();
    });

    btnBackSaves.addEventListener('click', function () {
      playUiBlip();
      screenSaves.classList.add('hidden');
      screenTitle.classList.remove('hidden');
    });

    saveSlotsEl.addEventListener('click', function (e) {
      const delBtn = e.target.closest('.save-slot-delete');
      if (delBtn) {
        e.preventDefault();
        const slot = parseInt(delBtn.dataset.slot, 10);
        if (window.confirm('Delete this save? This cannot be undone.')) {
          GameLogic.deleteSaveSlot(slot);
          renderSaveSlots();
        }
        return;
      }
      const mainBtn = e.target.closest('.btn-save-slot');
      if (mainBtn) {
        selectSaveSlot(parseInt(mainBtn.dataset.slot, 10));
      }
    });

    btnBackTitle.addEventListener('click', function () {
      screenSetup.classList.add('hidden');
      screenSaves.classList.remove('hidden');
      renderSaveSlots();
    });

    setupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const prefix = inputPrefix.value.trim();
      if (!GameLogic.validateNamePrefix(prefix)) {
        inputPrefix.focus();
        return;
      }
      profile = {
        namePrefix: GameLogic.formatNamePrefix(prefix),
        furColor: GameLogic.clampHexColor(inputFur.value),
        clan: selectClan.value,
        rank: selectRank.value,
        nameSuffix: selectSuffix.value,
        position: profile && profile.position ? profile.position : { x: 0, z: 10, yaw: 0 }
      };
      GameLogic.normalizeProfile(profile);
      GameLogic.saveProfile(profile, activeSaveSlot);
      playUiBlip();
      screenSetup.classList.add('hidden');
      startGame();
    });

    btnMenu.addEventListener('click', function () {
      pauseToMenu();
    });

    setupPointerLock();
    setupJoystick();

    document.addEventListener('visibilitychange', function () {
      if (!audioCtx) return;
      if (document.hidden) {
        audioCtx.suspend().catch(function () {});
      } else {
        audioCtx.resume().catch(function () {});
      }
    });
  }

  initDom();
})();
