import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/ShaderPass.js";

//////////// SCENE ////////////

const skybox = new THREE.CubeTextureLoader()
.setPath("skybox/")
.load(["front.png", "back.png", "top.png", "bottom.png", "left.png", "right.png"]);
const bgColor = new THREE.Color(0x222233);
const scene = new THREE.Scene();
scene.background = bgColor;

//////////// RENDERER ////////////

const renderer = new THREE.WebGLRenderer({
  preserveDrawingBuffer: true,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

//////////// CAMERA & CONTROLS ////////////

const fov = 75
const aspectRatio = window.innerWidth / window.innerHeight
const camera = new THREE.PerspectiveCamera(fov, aspectRatio, 0.1, 1000);
camera.position.set(0, 50, 50);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

//////////// LIGHTS & SHADOWS ////////////

const ambientLight = new THREE.AmbientLight(0xcccccc, 0.1);
scene.add(ambientLight);

const light = new THREE.DirectionalLight(0xffffff);
const size = 50;
light.position.set(20, 40, 100);
light.castShadow = true;
light.shadow.camera.near = 1;
light.shadow.camera.far = 200;
light.shadow.camera.right = size;
light.shadow.camera.left = -size;
light.shadow.camera.top = size;
light.shadow.camera.bottom = -size;
light.shadow.mapSize.width = 2048;
light.shadow.mapSize.height = 2048;
scene.add(light);
// const helper = new THREE.CameraHelper( light.shadow.camera );
// scene.add( helper );

//////////// POST PROCESSING ////////////

const BLOOM_SCENE = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_SCENE);

const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0;
bloomPass.strength = 7;
bloomPass.radius = 0;

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderPass);
bloomComposer.addPass(bloomPass);

const finalPass = new ShaderPass(
  new THREE.ShaderMaterial({
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
    },
    vertexShader: `varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

        }`,
    fragmentShader: `uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;

        void main() {
            gl_FragColor = ( texture2D( baseTexture, vUv )*3. + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
        }
`,
    defines: {},
  }),
  "baseTexture"
);
finalPass.needsSwap = true;

const darkMaterial = new THREE.MeshBasicMaterial({ color: "black" });
const materials = {};
function renderBloom() {
  const bg = scene.background;
  scene.background = new THREE.Color(0);
  scene.traverse(darkenNonBloomed);
  bloomComposer.render();
  scene.traverse(restoreMaterial);
  scene.background = bg;
}

function darkenNonBloomed(obj) {
  if (obj.isMesh && bloomLayer.test(obj.layers) === false) {
    materials[obj.uuid] = obj.material;
    obj.material = darkMaterial;
  }
}

function restoreMaterial(obj) {
  if (materials[obj.uuid]) {
    obj.material = materials[obj.uuid];
    delete materials[obj.uuid];
  }
}

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderPass);
finalComposer.addPass(finalPass);

//////////// MOON ////////////

let moon, fastMoon;
function initMoon() {
  const loader = new GLTFLoader();
  loader.load("moon/scene.gltf", (object) => {
    object.scene.scale.multiplyScalar(100);
    object.scene.traverse(function (node) {
      if (node.isMesh) {
        node.receiveShadow = true;
      }
    });
    moon = object.scene;
  });

  const moonGeometry = new THREE.PlaneGeometry(100, 100);
  const moonMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x998888),
  });
  fastMoon = new THREE.Mesh(moonGeometry, moonMaterial);
  fastMoon.rotateX(-Math.PI / 2);
  fastMoon.receiveShadow = true;
  scene.add(fastMoon);
}

//////////// SETTINGS ////////////

const gui = new dat.GUI();
const settings = {
  fast: true,
};

function initGUI() {
  gui.add(settings, "fast").onChange((value) => {
    if (value) {
      moon.removeFromParent();
      scene.add(fastMoon);
      scene.background = bgColor;
    } else {
      fastMoon.removeFromParent();
      scene.add(moon);
      scene.background = skybox;
    }
  });
}

//////////// MAIN  ////////////

class Rocket {
  constructor(target = new THREE.Vector3(0, 10, 0)) {
    this.obj = new THREE.Group() // 3D group containing all the rocket's elements
    this.target = target // Target landing position

    this.position = new THREE.Vector3() // Rocket's position
    this.rotation = new THREE.Euler() // Rocket's rotation
    this.thrusterRotation = new THREE.Euler() // Thruster's rotation (relative to the rocket)
    this.thrustPower = 0 // Control the flame's size
  }

  // Initialize the object's model, thruster and landing platform
  async init() {
    const loader = new GLTFLoader();

    await loader.loadAsync("starship/scene.gltf").then((object) => {
      let rocketObj = object.scene;
      rocketObj.scale.multiplyScalar(0.001);

      // Make the whole object cast shadows
      rocketObj.traverse(function (node) {
        if (node.isMesh) node.castShadow = true;
      });

      // Compute rocket's bounding box
      const aabb = new THREE.Box3();
      aabb.setFromObject(rocketObj);
      const rocketH = (this.rocketH = aabb.max.sub(aabb.min).y);

      // Add the rocket to the group
      rocketObj.translateY(rocketH / 2);
      this.obj.add(rocketObj);

      // Create the thruster
      const thrusterR = 0.5;
      const thrusterH = (this.thrusterH = 5);
      const thrusterGeometry = new THREE.CylinderGeometry(thrusterR, 0, thrusterH);
      thrusterGeometry.translate(0, -thrusterH / 2, 0);
      const thrusterColor = new THREE.Color();
      thrusterColor.setHSL(0.05, 0.7, Math.random() * 0.4 + 0.2);
      const thrusterMaterial = new THREE.MeshBasicMaterial({color: thrusterColor});
      const thruster = new THREE.Mesh(thrusterGeometry, thrusterMaterial);

      // Add the thruster to the group
      thruster.layers.enable(BLOOM_SCENE);
      thruster.translateY(-this.rocketH / 2);
      this.thruster = thruster;
      this.obj.add(thruster);

      // Add the group to the scene
      scene.add(this.obj);
    });

    // Create the landing platform
    const platformGeometry = new THREE.BoxGeometry(2.5, this.target.y, 2.5);
    const platformMaterial = new THREE.MeshStandardMaterial({color: new THREE.Color(0xee2244)});
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);

    // Add the platform to the scene
    platformGeometry.translate(this.target.x, 0, this.target.z);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.platform = platform;
    scene.add(platform);
  }

  // Update the rocket !
  update({ position, rotation, thrusterRotation, thrustPower }) {
    this.position = position ?? this.position;
    this.rotation = rotation ?? this.rotation;
    this.thrusterRotation = thrusterRotation ?? this.thrusterRotation;
    this.thrustPower = thrustPower ?? this.thrustPower;

    this.obj.position.copy(this.position);
    this.obj.rotation.copy(this.rotation);

    this.thruster.rotation.copy(this.thrusterRotation);
    this.thruster.scale.y = Math.max(0, Math.min(2, this.thrustPower / 100)) * (Math.random() * 0.5 + 0.75);
  }
}

let rot = new THREE.Euler(0, 0, 0)
let trot = new THREE.Euler(0, 0, 0)

// Executed each frame
function animate() {
  requestAnimationFrame(animate);

  let elapsedTime = (Date.now() - startTime) / 1000; // Time elapsed in seconds

  rot.x += 0.01
  rot.y += 0.02
  rot.z += 0.03
  // trot.x += 0.01
  // trot.y += 0.02
  // trot.z += 0.03

  const y = Math.max(rocket.target.y, 50 - elapsedTime * 4)

  // Update every attribute of the rocket here
  rocket.update({
    position: new THREE.Vector3(0, y, 0),
    rotation: rot,
    thrusterRotation: trot,
    thrustPower:  y*1.75
  });

  // Render
  controls.target = rocket.position;
  controls.update();
  renderBloom();
  finalComposer.render();
}

const startTime = Date.now();
let rocket;

// Starting point
async function main() {
  // Init the rocket
  rocket = new Rocket(new THREE.Vector3(0, 10, 0));
  await rocket.init();

  // Init the settings panel
  initGUI();
  // Init the moon
  initMoon();

  // Start the infinite loop
  animate();
}

main();