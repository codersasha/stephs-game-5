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
  const screenSetup = $('screen-setup');
  const canvas = $('game-canvas');
  const btnStart = $('btn-start');
  const btnContinue = $('btn-continue');
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
  let saveTimer = null;
  let hintShown = false;

  function keyDown (e) { onKey(e, true); }
  function keyUp (e) { onKey(e, false); }
  function onResize () { resize(); }
  function onVis () {
    if (document.hidden && profile) GameLogic.saveProfile(profile);
  }

  function isTouchDevice () {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function detectMobile () {
    return isTouchDevice() && window.matchMedia('(max-width: 900px)').matches;
  }

  function initAudio () {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const master = audioCtx.createGain();
      master.gain.value = 0.12;
      master.connect(audioCtx.destination);

      const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.value = 420;
      const g = audioCtx.createGain();
      g.gain.value = 0.35;
      noise.connect(bp);
      bp.connect(g);
      g.connect(master);
      noise.start();

      const ambientOsc = audioCtx.createOscillator();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 58;
      const og = audioCtx.createGain();
      og.gain.value = 0.04;
      ambientOsc.connect(og);
      og.connect(master);
      ambientOsc.start();
    } catch (err) {
      /* ignore */
    }
  }

  function makeTree (furHue) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const leafMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(furHue, 0.35, 0.32) });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 7), trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    g.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 8), leafMat);
    leaves.position.y = 3.2;
    leaves.castShadow = true;
    g.add(leaves);
    return g;
  }

  function initThree () {
    const w = window.innerWidth;
    const h = window.innerHeight;
    scene = new THREE.Scene();
    const sky = 0x87b8d8;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(0xa8c8b8, 25, 130);

    camera = new THREE.PerspectiveCamera(FOV_ADULT, w / h, 0.08, 220);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    const hemi = new THREE.HemisphereLight(0xc8e8ff, 0x3a5c38, 0.92);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e0, 0.85);
    sun.position.set(40, 70, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_HALF * 2.2, WORLD_HALF * 2.2),
      new THREE.MeshLambertMaterial({ color: 0x3d6b45 })
    );
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

    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
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

  function startGame () {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    isMobile = detectMobile();
    initThree();
    applyRoleCameraFov();

    const p = profile.position;
    if (typeof p.x !== 'number') p.x = 0;
    if (typeof p.z !== 'number') p.z = 10;
    if (typeof p.yaw !== 'number') p.yaw = 0;
    cameraYaw = p.yaw;
    cameraPitch = 0;

    canvas.classList.remove('hidden');
    hud.classList.remove('hidden');
    btnMenu.classList.remove('hidden');

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
      if (profile) GameLogic.saveProfile(profile);
    }, 4000);
  }

  function pauseToMenu () {
    isPlaying = false;
    if (saveTimer) {
      clearInterval(saveTimer);
      saveTimer = null;
    }
    if (profile) GameLogic.saveProfile(profile);

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

    canvas.classList.add('hidden');
    hud.classList.add('hidden');
    btnMenu.classList.add('hidden');
    touchLookZone.classList.add('hidden');
    joystickZone.classList.add('hidden');

    screenSetup.classList.add('hidden');
    screenTitle.classList.remove('hidden');

    btnContinue.hidden = !GameLogic.loadProfile();
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

    if (GameLogic.loadProfile()) {
      btnContinue.hidden = false;
    }

    btnStart.addEventListener('click', function () {
      profile = GameLogic.loadProfile() || GameLogic.createDefaultProfile();
      fillSetupForm(profile);
      screenTitle.classList.add('hidden');
      screenSetup.classList.remove('hidden');
    });

    btnContinue.addEventListener('click', function () {
      profile = GameLogic.loadProfile();
      if (!profile) return;
      screenTitle.classList.add('hidden');
      startGame();
    });

    btnBackTitle.addEventListener('click', function () {
      screenSetup.classList.add('hidden');
      screenTitle.classList.remove('hidden');
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
      GameLogic.saveProfile(profile);
      screenSetup.classList.add('hidden');
      startGame();
    });

    btnMenu.addEventListener('click', function () {
      pauseToMenu();
    });

    setupPointerLock();
    setupJoystick();
  }

  initDom();
})();
