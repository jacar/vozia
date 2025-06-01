/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = 'Click the record button to start.';
  @state() error = '';
  @state() private sessionReady = false;

  private client: GoogleGenAI;
  private session: Session | null = null;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    :host {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
        'Segoe UI Symbol';
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between; /* Adjusts spacing */
      height: 100vh; /* Ensure host takes full height */
      width: 100vw; /* Ensure host takes full width */
      overflow: hidden; /* Prevent scrollbars from appearing due to absolute elements */
      box-sizing: border-box;
    }

    h1 {
      color: #eceff1; /* Light grey for better contrast */
      font-size: 2.5em; /* Larger font size */
      margin-top: 5vh; /* Margin from the top */
      margin-bottom: 2vh; /* Space below title */
      text-align: center;
      font-weight: 300; /* Lighter font weight */
      letter-spacing: 1px;
      text-shadow: 0 1px 3px rgba(0,0,0,0.2);
      z-index: 10; /* Ensure it's above the 3D visual */
    }

    #status-container {
      position: absolute;
      bottom: 18vh; /* Adjusted to be above controls */
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      display: flex;
      justify-content: center;
      padding: 0 10px; /* Add some padding for smaller screens */
    }

    #status {
      padding: 8px 15px;
      background-color: rgba(0, 0, 0, 0.4);
      border-radius: 8px;
      color: #eee;
      font-size: 0.9em;
      transition: all 0.3s ease-in-out;
      max-width: 80%;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }

    #status.error-message {
      color: #ffcdd2;
      background-color: rgba(176, 0, 32, 0.6);
      font-weight: bold;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 5vh; /* Lowered slightly */
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 15px; /* Increased gap */

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 50%; /* Make all buttons circular */
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s ease-in-out, transform 0.1s ease-in-out;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        &:active {
          transform: scale(0.95);
        }
      }

      #recordToggleButton {
        width: 72px;
        height: 72px;
      }
      
      #recordToggleButton svg {
        transition: transform 0.2s ease-in-out;
      }

      #recordToggleButton[aria-pressed="true"] svg {
         /* Optional: slightly scale the stop icon or change color */
      }


      #resetButton {
        width: 56px; /* Slightly smaller */
        height: 56px;
      }

      button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
        background: rgba(255, 255, 255, 0.05);
      }
      /* Hide reset button via CSS if preferred over ?disabled attribute effect */
      /* #resetButton:disabled { display: none; } */
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY, 
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    this.sessionReady = false; // Mark as not ready until onopen fires

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.sessionReady = true;
            this.updateStatus('Session opened. Ready to record.');
            this.error = '';
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () =>{
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if(interrupted) {
              for(const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.sessionReady = false;
            this.updateError(`Error: ${e.message || 'Unknown error'}`);
          },
          onclose: (e: CloseEvent) => {
            this.sessionReady = false;
            this.updateStatus(`Session closed: ${e.reason || 'Unknown reason'}`);
            if (this.isRecording) this.stopRecordingInternals(); 
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
      this.sessionReady = false;
      this.updateError(`Failed to initialize session: ${(e as Error).message}`);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = ''; 
    console.log("Status:", msg);
  }

  private updateError(msg: string) {
    this.error = msg;
    console.error("Error:", msg);
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }
    this.error = '';
    this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);
        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination); 

      this.isRecording = true;
      this.updateStatus('🔴 Recording...');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateError(`Error starting recording: ${(err as Error).message}`);
      this.stopRecordingInternals(); 
    }
  }

  private stopRecordingInternals() {
     if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }
    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.isRecording = false;
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext) return;
    this.updateStatus('Stopping recording...');
    this.stopRecordingInternals();
    this.updateStatus('Recording stopped. Click to record again.');
  }

  private toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      if (!this.sessionReady || !this.session) {
        this.updateStatus('Re-initializing session...');
        this.initSession().then(() => {
           if (!this.error && this.sessionReady) {
             this.startRecording();
           }
        });
      } else {
        this.startRecording();
      }
    }
  }

  private reset() {
    this.updateStatus('Resetting session...');
    this.stopRecording(); 
    if (this.session) {
      this.session.close(); // This should trigger the onclose callback
    }
    this.sessionReady = false; // Explicitly set for immediate effect
    this.session = null; // Clear the session object

    setTimeout(() => {
      this.initSession(); // This will attempt to create a new session
                           // and set sessionReady=true via onopen if successful.
                           // Status updates handled by initSession's callbacks.
    }, 100); 
  }

  // SVG Icons
  private recordIcon = html`<svg viewBox="0 0 100 100" width="32px" height="32px" fill="#E53935" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" /></svg>`;
  private stopIcon = html`<svg viewBox="0 0 100 100" width="32px" height="32px" fill="#FFFFFF" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="15" width="70" height="70" rx="10" /></svg>`;
  private resetIcon = html`<svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="currentColor"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" /></svg>`;

  render() {
    return html`
      <h1>ASISTENTE DE VOZ</h1>
      
      <gdm-live-audio-visuals-3d
        .inputNode=${this.inputNode}
        .outputNode=${this.outputNode}
        .isRecording=${this.isRecording}>
      </gdm-live-audio-visuals-3d>

      <div id="status-container">
        <div id="status" class=${this.error ? 'error-message' : ''}>
          ${this.error || this.status}
        </div>
      </div>

      <div class="controls">
        <button
          id="recordToggleButton"
          @click=${this.toggleRecording}
          aria-label=${this.isRecording ? 'Stop recording' : 'Start recording'}
          aria-pressed=${this.isRecording ? 'true' : 'false'}
          title=${this.isRecording ? 'Stop recording' : 'Start recording'}>
          ${this.isRecording ? this.stopIcon : this.recordIcon}
        </button>
        <button
          id="resetButton"
          @click=${this.reset}
          ?disabled=${this.isRecording}
          aria-label="Reset Session"
          title="Reset Session">
          ${this.resetIcon}
        </button>
      </div>
    `;
  }
}