/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';
import {vs as sphereVS} from './sphere-shader';

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    if (this._outputNode && !this.outputAnalyser) {
      this.outputAnalyser = new Analyser(this._outputNode);
    }
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
     if (this._inputNode && !this.inputAnalyser) {
      this.inputAnalyser = new Analyser(this._inputNode);
    }
  }

  get inputNode() {
    return this._inputNode;
  }

  @property({type: Boolean}) isRecording = false;

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      /* image-rendering: pixelated; remove if FXAA is used or smooth look is preferred */
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(2, -2, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true, // Enabled antialias
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Use full device pixel ratio

    const geometry = new THREE.IcosahedronGeometry(1, 10);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    
    new EXRLoader().load('piz_compressed.exr', (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
      texture.dispose(); // Dispose texture after use
      pmremGenerator.dispose(); // Dispose PMREMGenerator
    }, undefined, (error) => {
      console.error('Error loading EXR texture:', error);
    });


    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010, // Base color
      metalness: 0.6,  // Slightly more metallic
      roughness: 0.2,  // Slightly less rough
      emissive: 0x000010, // Initial emissive color
      emissiveIntensity: 1.5, // Initial emissive intensity
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.inputData = {value: new THREE.Vector4()};
      shader.uniforms.outputData = {value: new THREE.Vector4()};

      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false; // Initially hidden until texture loads

    this.sphere = sphere;

    const renderPass = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.0, // bloom strength
      0.4, // bloom radius
      0.85, // bloom threshold
    );

    // FXAA Pass for anti-aliasing - consider performance impact
    // const fxaaPass = new ShaderPass(FXAAShader);
    // const dpr = renderer.getPixelRatio();
    // fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * dpr);
    // fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * dpr);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    // composer.addPass(fxaaPass); // Uncomment to enable FXAA

    this.composer = composer;

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (backdrop.material.uniforms.resolution) { // Check if material and uniform exist
         backdrop.material.uniforms.resolution.value.set(w * dPR, h * dPR);
      }
      renderer.setSize(w, h);
      composer.setSize(w, h);
      // if (fxaaPass) {
      //   fxaaPass.material.uniforms['resolution'].value.set(
      //    1 / (w * dPR),
      //    1 / (h * dPR),
      //   );
      // }
      bloomPass.resolution.set(w,h);
    }

    window.addEventListener('resize', onWindowResize);
    onWindowResize();
    
    // Ensure analysers are initialized if nodes are already set
    if (this._inputNode && !this.inputAnalyser) {
        this.inputAnalyser = new Analyser(this._inputNode);
    }
    if (this._outputNode && !this.outputAnalyser) {
        this.outputAnalyser = new Analyser(this._outputNode);
    }


    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (!this.inputAnalyser || !this.outputAnalyser) return; // Guard against uninitialized analysers

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const t = performance.now();
    const dt = (t - this.prevTime) / (1000 / 60); // Delta time normalized to 60 FPS
    this.prevTime = t;

    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;
    if (backdropMaterial.uniforms.rand) { // Check if uniform exists
      backdropMaterial.uniforms.rand.value = Math.random() * 10000;
    }


    const sphereMaterial = this.sphere.material as THREE.MeshStandardMaterial;

    if (sphereMaterial.userData.shader) {
      this.sphere.scale.setScalar(
        1 + (0.2 * this.outputAnalyser.data[1]) / 255,
      );

      const f = 0.001;
      this.rotation.x += (dt * f * 0.5 * this.outputAnalyser.data[1]) / 255;
      this.rotation.z += (dt * f * 0.5 * this.inputAnalyser.data[1]) / 255;
      this.rotation.y += (dt * f * 0.25 * this.inputAnalyser.data[2]) / 255;
      this.rotation.y += (dt * f * 0.25 * this.outputAnalyser.data[2]) / 255;

      const euler = new THREE.Euler(
        this.rotation.x,
        this.rotation.y,
        this.rotation.z,
      );
      const quaternion = new THREE.Quaternion().setFromEuler(euler);
      const vector = new THREE.Vector3(0, 0, 5); // Camera distance from origin
      vector.applyQuaternion(quaternion);
      this.camera.position.copy(vector);
      this.camera.lookAt(this.sphere.position);

      // Dynamic emissive properties based on recording state
      if (this.isRecording) {
        const pulseFactor = 0.2 * Math.sin(t * 0.006); // Stronger, slightly faster pulse
        sphereMaterial.emissiveIntensity = (1.8 + pulseFactor); // Brighter base intensity when recording
        sphereMaterial.emissive.setHex(0xE53935); // Vibrant red color (e.g., Material Design Red 600)
      } else {
        sphereMaterial.emissiveIntensity = 1.5; // Default intensity
        sphereMaterial.emissive.setHex(0x000010); // Default emissive color (dark blue/black)
      }
      
      const shaderUniforms = sphereMaterial.userData.shader.uniforms;
      shaderUniforms.time.value += (dt * 0.1 * this.outputAnalyser.data[0]) / 255;
      shaderUniforms.inputData.value.set(
        (1 * this.inputAnalyser.data[0]) / 255,
        (0.1 * this.inputAnalyser.data[1]) / 255,
        (10 * this.inputAnalyser.data[2]) / 255,
        0,
      );
      shaderUniforms.outputData.value.set(
        (2 * this.outputAnalyser.data[0]) / 255,
        (0.1 * this.outputAnalyser.data[1]) / 255,
        (10 * this.outputAnalyser.data[2]) / 255,
        0,
      );
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}