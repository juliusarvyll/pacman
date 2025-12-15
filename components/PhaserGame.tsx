"use client";

import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';

const PhaserGame = () => {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');

  useEffect(() => {
    if (!gameRef.current) return;

    let player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    let dialogZones: { zone: Phaser.GameObjects.Zone; message: string }[] = [];
    let activeDialogMessage: string | null = null;
    let dialogContainer: Phaser.GameObjects.Container | null = null;
    let dialogText: Phaser.GameObjects.Text | null = null;
    let dialogTimer: Phaser.Time.TimerEvent | null = null;
    let typewriterTimer: Phaser.Time.TimerEvent | null = null;
    let externalDialogTimer: Phaser.Time.TimerEvent | null = null;
    let externalPromptActive = false;
    let externalPromptMessage = '';
    let startZone: Phaser.GameObjects.Zone | null = null;
    let startSequenceActive = false;
    let startTriggerHandled = false;
    let movementPaused = false;
    let startTypewriterTimer: Phaser.Time.TimerEvent | null = null;
    let startResumeTimer: Phaser.Time.TimerEvent | null = null;

    let currentDirection = new Phaser.Math.Vector2(0, 0);
    let targetWorld: Phaser.Math.Vector2 | null = null;
    let targetAxis: 'x' | 'y' | null = null;
    let pointerDownScreen: Phaser.Math.Vector2 | null = null;
    let pointerDownTime = 0;

    const TARGET_ARRIVAL_PX = 6;

    const START_MESSAGE = 'This is a game of memories';
    const TYPEWRITER_SPEED = 60;
    const START_HOLD_TIME = 1400;
    const MOBILE_WIDTH_THRESHOLD = 820;
    const DESKTOP_ZOOM = 2.0;

    const useInGameDialogUI = typeof window !== 'undefined' && window.innerWidth > MOBILE_WIDTH_THRESHOLD;

    function computeZoom(width: number) {
      if (width <= MOBILE_WIDTH_THRESHOLD) {
        return Math.min(DESKTOP_ZOOM, Math.max(0.75, width / 820));
      }
      return DESKTOP_ZOOM;
    }

    function initDialogUI(scene: Phaser.Scene) {
      if (!useInGameDialogUI) {
        return;
      }
      const panelWidth = 360;
      const panelHeight = 110;
      const padding = 10;

      const background = scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x1a1a1a).setOrigin(0);
      background.setStrokeStyle(4, 0xffffff);
      dialogText = scene.add.text(padding, padding, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        align: 'left',
        wordWrap: { width: panelWidth - padding * 2 }
      });

      const camera = scene.cameras.main;
      const targetY = Math.max(camera.height - panelHeight - 40, 40);
      dialogContainer = scene.add.container(40, targetY, [background, dialogText]);
      dialogContainer.setScrollFactor(0);
      dialogContainer.setDepth(2000);
      dialogContainer.setVisible(false);
    }

    function showExternalDialog(scene: Phaser.Scene, message: string, options: { autoHide?: boolean } = { autoHide: true }) {
      if (externalPromptActive && externalPromptMessage === message) {
        if (options.autoHide) {
          externalDialogTimer?.remove(false);
          externalDialogTimer = scene.time.delayedCall(2400, () => {
            setShowPrompt(false);
            externalPromptActive = false;
            externalPromptMessage = '';
          });
        }
        return;
      }
      externalPromptActive = true;
      externalPromptMessage = message;
      setPromptMessage('');
      setShowPrompt(true);
      externalDialogTimer?.remove(false);
      if (options.autoHide) {
        externalDialogTimer = scene.time.delayedCall(2400, () => {
          setShowPrompt(false);
          externalPromptActive = false;
          externalPromptMessage = '';
        });
      }
    }

    function stopTypewriter() {
      typewriterTimer?.remove(false);
      typewriterTimer = null;
    }

    function runTypewriter(scene: Phaser.Scene, message: string, options: { autoHideMs?: number; onComplete?: () => void } = {}) {
      const container = dialogContainer;
      const textObject = dialogText;
      activeDialogMessage = message;
      let displayedText = '';
      if (container && textObject) {
        container.setVisible(true);
        container.setAlpha(1);
        textObject.setText('');
      }
      stopTypewriter();
      setPromptMessage('');
      setShowPrompt(true);
      typewriterTimer = scene.time.addEvent({
        delay: TYPEWRITER_SPEED,
        loop: true,
        callback: () => {
          const nextChar = message.charAt(displayedText.length);
          if (nextChar) {
            displayedText += nextChar;
            if (textObject) {
              textObject.setText(displayedText);
            }
            setPromptMessage(displayedText);
          }
          if (displayedText.length >= message.length) {
            stopTypewriter();
            if (options.autoHideMs) {
              dialogTimer?.remove(false);
              dialogTimer = scene.time.delayedCall(options.autoHideMs, () => {
                container?.setVisible(false);
                activeDialogMessage = null;
              });
            }
            options.onComplete?.();
          }
        }
      });
    }

    function showDialogMessage(scene: Phaser.Scene, message: string) {
      if (startSequenceActive) {
        return;
      }
      if (activeDialogMessage === message && dialogContainer?.visible) {
        return;
      }
      runTypewriter(scene, message);
      showExternalDialog(scene, message, { autoHide: false });
    }

    function hideDialog(scene: Phaser.Scene) {
      stopTypewriter();
      dialogTimer?.remove(false);
      dialogContainer?.setVisible(false);
      activeDialogMessage = null;
      if (externalPromptActive) {
        externalDialogTimer?.remove(false);
        setShowPrompt(false);
        externalPromptActive = false;
        externalPromptMessage = '';
      }
    }

    function triggerStartSequence(scene: Phaser.Scene) {
      if (startSequenceActive) {
        return;
      }
      startSequenceActive = true;
      movementPaused = true;
      startTriggerHandled = true;
      dialogTimer?.remove(false);
      runTypewriter(scene, START_MESSAGE, {
        onComplete: () => {
          startResumeTimer?.remove(false);
          startResumeTimer = scene.time.delayedCall(START_HOLD_TIME, () => {
            movementPaused = false;
            startSequenceActive = false;
            hideDialog(scene);
          });
        }
      });
      showExternalDialog(scene, START_MESSAGE);
    }

    function checkStartZone(scene: Phaser.Scene, playerSprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
      if (startTriggerHandled) {
        return;
      }
      if (startZone && scene.physics.world.overlap(playerSprite, startZone)) {
        triggerStartSequence(scene);
      }
    }

    function setupObjectDialogZones(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap, playerSprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
      const dialogTargets: { name: string; message: string }[] = [
        { name: 'curb1', message: 'Curb: Watch your step—these edges are sneaky.' },
        { name: 'alfresco', message: 'Alfresco: Smells of charcoal and indie beats.' },
        { name: 'ramen', message: 'Ramen: Slurp-worthy noodles await nearby.' },
        { name: 'carig', message: 'Carig: Traffic and neon blur in puddle reflections.' },
        { name: 'bonchon', message: 'Bonchon: Crunchy wings call your name.' },
        { name: 'flowers', message: 'Flowers: Petals tremble when you walk close.' }
      ];

      dialogTargets.forEach(target => {
        const objectData = map.findObject('Objects', obj => obj.name === target.name);
        console.log('Dialog target lookup', target.name, objectData ? 'found' : 'missing');
        if (!objectData) {
          return;
        }

        const width = objectData.width && objectData.width > 0 ? objectData.width : 32;
        const height = objectData.height && objectData.height > 0 ? objectData.height : 32;
        const zone = scene.add.zone(
          (objectData.x ?? 0) + width / 2,
          (objectData.y ?? 0) + height / 2,
          width,
          height
        );

        zone.setOrigin(0.5);
        scene.physics.add.existing(zone, true);
        const body = zone.body as Phaser.Physics.Arcade.Body;
        body.setSize(width, height);
        zone.setVisible(false);
        dialogZones.push({ zone, message: target.message });
      });
    }

    function setupStartZone(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap) {
      const startObject = map.findObject('Objects', obj => obj.name === 'start');
      if (!startObject) {
        return;
      }
      const width = startObject.width && startObject.width > 0 ? startObject.width : 32;
      const height = startObject.height && startObject.height > 0 ? startObject.height : 32;
      const zone = scene.add.zone(
        (startObject.x ?? 0) + width / 2,
        (startObject.y ?? 0) + height / 2,
        width,
        height
      );
      zone.setOrigin(0.5);
      scene.physics.add.existing(zone, true);
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.setSize(width, height);
      zone.setVisible(false);
      startZone = zone;
    }

    function checkDialogZones(scene: Phaser.Scene, playerSprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
      if (startSequenceActive) {
        return;
      }
      const overlappingTarget = dialogZones.find(({ zone }) => scene.physics.world.overlap(playerSprite, zone));
      if (overlappingTarget) {
        if (activeDialogMessage !== overlappingTarget.message || !dialogContainer?.visible) {
          showDialogMessage(scene, overlappingTarget.message);
        }
        return;
      }
      if (dialogContainer?.visible) {
        hideDialog(scene);
      }
    }

    function preload(this: Phaser.Scene) {
      const assetPath = "/game";
      this.load.image("tiles", `${assetPath}/32px-pokemoni.png`);
      this.load.tilemapTiledJSON("map", `${assetPath}/tiled.tmj`);
      this.load.atlas("atlas", `${assetPath}/killjoy.png`, `${assetPath}/killjoy.json`);
    }


    function create(this: Phaser.Scene) {
      const map = this.make.tilemap({ key: "map" });
      const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");
      if (!tileset) {
        console.error('Failed to load tileset');
        return;
      }

      const belowLayer = map.createLayer("Below Player", tileset, 0, 0);
      const worldLayer = map.createLayer("World", tileset, 0, 0);
      const aboveLayer = map.createLayer("Above Player", tileset, 0, 0);
      if (!worldLayer || !aboveLayer) {
        console.error('Failed to create map layers');
        return;
      }

      worldLayer.setCollisionByProperty({ collides: true });
      aboveLayer.setDepth(10);

      const spawnPoint = map.findObject("Objects", obj => obj.name === "Spawn Point");
      const spawnX = spawnPoint?.x ?? 100;
      const spawnY = spawnPoint?.y ?? 100;

      player = this.physics.add
        .sprite(spawnX, spawnY, "atlas", "misa-front")
        .setSize(30, 40)
        .setOffset(0, 24);

      this.physics.add.collider(player, worldLayer!);

      this.physics.world.on('worldstep', () => {
        checkStartZone(this, player);
        checkDialogZones(this, player);
      });

      initDialogUI(this);
      setupObjectDialogZones(this, map, player);
      setupStartZone(this, map);

      const anims = this.anims;
      anims.create({
        key: "misa-left-walk",
        frames: anims.generateFrameNames("atlas", { prefix: "misa-left-walk.", start: 0, end: 3, zeroPad: 3 }),
        frameRate: 10,
        repeat: -1
      });
      anims.create({
        key: "misa-right-walk",
        frames: anims.generateFrameNames("atlas", { prefix: "misa-right-walk.", start: 0, end: 3, zeroPad: 3 }),
        frameRate: 10,
        repeat: -1
      });
      anims.create({
        key: "misa-front-walk",
        frames: anims.generateFrameNames("atlas", { prefix: "misa-front-walk.", start: 0, end: 3, zeroPad: 3 }),
        frameRate: 10,
        repeat: -1
      });
      anims.create({
        key: "misa-back-walk",
        frames: anims.generateFrameNames("atlas", { prefix: "misa-back-walk.", start: 0, end: 3, zeroPad: 3 }),
        frameRate: 10,
        repeat: -1
      });

      const camera = this.cameras.main;
      camera.startFollow(player);
      camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      const baseZoom = computeZoom(this.scale.width);
      camera.setZoom(baseZoom);
      this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
        camera.setZoom(computeZoom(gameSize.width));
      });


      const helpText = this.add.text(16, 16, 'Click/tap to move • Swipe to change direction', {
        font: "18px monospace",
        color: "#000000",
        padding: { x: 20, y: 10 },
        backgroundColor: "#ffffff"
      } as any)
        .setScrollFactor(0)
        .setDepth(100);

      const STOP_RADIUS_PX = 18;
      const SWIPE_THRESHOLD_PX = 24;
      const MAX_TAP_DURATION_MS = 250;

      const setDirectionFromVector = (dx: number, dy: number) => {
        if (Math.abs(dx) >= Math.abs(dy)) {
          currentDirection.set(dx >= 0 ? 1 : -1, 0);
        } else {
          currentDirection.set(0, dy >= 0 ? 1 : -1);
        }
      };

      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointerDownScreen = new Phaser.Math.Vector2(pointer.x, pointer.y);
        pointerDownTime = this.time.now;
      });

      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const down = pointerDownScreen;
        pointerDownScreen = null;

        const upScreen = new Phaser.Math.Vector2(pointer.x, pointer.y);
        const elapsed = this.time.now - pointerDownTime;

        if (down) {
          const dx = upScreen.x - down.x;
          const dy = upScreen.y - down.y;
          const distSq = dx * dx + dy * dy;

          if (distSq >= SWIPE_THRESHOLD_PX * SWIPE_THRESHOLD_PX) {
            setDirectionFromVector(dx, dy);
            targetWorld = null;
            targetAxis = null;
            return;
          }

          if (elapsed <= MAX_TAP_DURATION_MS) {
            const tapWorldX = pointer.worldX;
            const tapWorldY = pointer.worldY;
            const playerDx = tapWorldX - player.x;
            const playerDy = tapWorldY - player.y;

            if (playerDx * playerDx + playerDy * playerDy <= STOP_RADIUS_PX * STOP_RADIUS_PX) {
              currentDirection.set(0, 0);
              targetWorld = null;
              targetAxis = null;
              return;
            }

            targetWorld = new Phaser.Math.Vector2(tapWorldX, tapWorldY);
            currentDirection.set(0, 0);
            targetAxis = Math.abs(playerDx) >= Math.abs(playerDy) ? 'x' : 'y';
          }
        }
      });
    }


    function update(this: Phaser.Scene, time: number, delta: number) {
      if (movementPaused) {
        player.body.setVelocity(0);
        return;
      }
      const speed = 175;
      const prevVelocity = player.body.velocity.clone();
      player.body.setVelocity(0);

      if (targetWorld) {
        const dx = targetWorld.x - player.x;
        const dy = targetWorld.y - player.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= TARGET_ARRIVAL_PX * TARGET_ARRIVAL_PX) {
          targetWorld = null;
          targetAxis = null;
          player.body.setVelocity(0);
        } else {
          if (targetAxis === 'x') {
            if (Math.abs(dx) <= TARGET_ARRIVAL_PX) {
              targetAxis = 'y';
              player.body.setVelocity(0, dy >= 0 ? speed : -speed);
            } else {
              player.body.setVelocity(dx >= 0 ? speed : -speed, 0);
            }
          } else {
            if (Math.abs(dy) <= TARGET_ARRIVAL_PX) {
              targetAxis = 'x';
              player.body.setVelocity(dx >= 0 ? speed : -speed, 0);
            } else {
              player.body.setVelocity(0, dy >= 0 ? speed : -speed);
            }
          }
        }
      } else if (currentDirection.lengthSq() > 0) {
        const movement = currentDirection.clone().normalize().scale(speed);
        player.body.setVelocity(movement.x, movement.y);
      }

      const velocity = player.body.velocity;
      const horizontal = velocity.x;
      const vertical = velocity.y;
      if (horizontal < 0) {
        player.anims.play("misa-left-walk", true);
      } else if (horizontal > 0) {
        player.anims.play("misa-right-walk", true);
      } else if (vertical < 0) {
        player.anims.play("misa-back-walk", true);
      } else if (vertical > 0) {
        player.anims.play("misa-front-walk", true);
      } else {
        player.anims.stop();
        if (prevVelocity.x < 0) player.setTexture("atlas", "misa-left");
        else if (prevVelocity.x > 0) player.setTexture("atlas", "misa-right");
        else if (prevVelocity.y < 0) player.setTexture("atlas", "misa-back");
        else if (prevVelocity.y > 0) player.setTexture("atlas", "misa-front");
      }
    }

    const initialWidth = gameRef.current.clientWidth || window.innerWidth;
    const initialHeight = gameRef.current.clientHeight || window.innerHeight;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: "game-container",
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: initialWidth,
        height: initialHeight
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 }
        }
      },
      audio: {
        disableWebAudio: true
      },
      input: {
        touch: {
          capture: true
        }
      },
      scene: {
        preload,
        create,
        update
      }
    };

    const game = new Phaser.Game(config);
    gameInstanceRef.current = game;

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div id="game-container" ref={gameRef} className="block w-full h-full" />
        {showPrompt && (
          <div className="pointer-events-none absolute inset-x-2 bottom-8 mx-auto w-auto max-w-[300px]">
            <div className="bg-black/85 border border-white/60 text-white text-sm font-mono px-5 py-3 rounded-lg shadow-xl backdrop-blur-sm">
              {promptMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhaserGame;
