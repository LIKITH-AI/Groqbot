/**
 * chitchat — Audio & Speech Module
 * Handles Microphone Recording, Real-time Canvas Waveform Visualization,
 * Groq Whisper Transcription via /api/transcribe, and Speech Synthesis (TTS).
 */

class AudioController {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.animationFrameId = null;
        this.timerInterval = null;
        this.recordingSeconds = 0;
        this.isRecording = false;

        // Elements
        this.micBtn = document.getElementById('mic-btn');
        this.audioOverlay = document.getElementById('audio-overlay');
        this.canvas = document.getElementById('audio-waveform-canvas');
        this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
        this.timerEl = document.getElementById('audio-timer');
        this.statusTitle = document.getElementById('audio-status-title');
        this.subtextEl = document.getElementById('audio-subtext');
        this.cancelBtn = document.getElementById('cancel-recording-btn');
        this.finishBtn = document.getElementById('finish-recording-btn');

        // Speech synthesis state
        this.currentUtterance = null;
        this.speakingMessageId = null;

        this.initEventListeners();
    }

    initEventListeners() {
        if (this.micBtn) {
            this.micBtn.addEventListener('click', () => this.startRecording());
        }
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.cancelRecording());
        }
        if (this.finishBtn) {
            this.finishBtn.addEventListener('click', () => this.stopAndTranscribe());
        }
    }

    async startRecording() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('Microphone access is not supported in this browser.', 'error');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;

            // Setup MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                ? 'audio/webm;codecs=opus' 
                : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');

            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            // Setup Real-time Audio Visualization
            this.setupAudioVisualizer(stream);

            // Show Overlay & Reset Timer
            this.recordingSeconds = 0;
            this.updateTimerDisplay();
            this.timerInterval = setInterval(() => {
                this.recordingSeconds++;
                this.updateTimerDisplay();
                if (this.recordingSeconds >= 120) {
                    // Auto-finish after 2 minutes
                    this.stopAndTranscribe();
                }
            }, 1000);

            this.statusTitle.textContent = 'Listening... Speak now';
            this.subtextEl.textContent = 'Transcribing via Groq Whisper with ultra-high accuracy';
            this.finishBtn.disabled = false;
            this.finishBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Done & Transcribe</span>
            `;

            this.audioOverlay.classList.remove('hidden');
            this.mediaRecorder.start(250);
            this.isRecording = true;

        } catch (err) {
            console.error('Error starting microphone recording:', err);
            showToast('Failed to access microphone: ' + (err.message || 'Permission denied'), 'error');
        }
    }

    setupAudioVisualizer(stream) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.source.connect(this.analyser);

            this.drawWaveform();
        } catch (e) {
            console.warn('Audio visualization not available:', e);
        }
    }

    drawWaveform() {
        if (!this.analyser || !this.canvasCtx) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const width = this.canvas.width;
        const height = this.canvas.height;

        const render = () => {
            if (!this.isRecording) return;
            this.animationFrameId = requestAnimationFrame(render);

            this.analyser.getByteFrequencyData(dataArray);

            this.canvasCtx.clearRect(0, 0, width, height);

            const barCount = 38;
            const barWidth = 4;
            const barGap = 4;
            const totalWidth = (barWidth + barGap) * barCount;
            const startX = (width - totalWidth) / 2;

            for (let i = 0; i < barCount; i++) {
                const dataIndex = Math.floor((i / barCount) * bufferLength);
                const val = dataArray[dataIndex] || 0;
                // Calculate normalized bar height (min 4px, max 54px)
                const percent = val / 255;
                const barHeight = Math.max(4, percent * (height - 14));
                const x = startX + i * (barWidth + barGap);
                const y = (height - barHeight) / 2;

                // Gradient from violet to fuchsia
                const gradient = this.canvasCtx.createLinearGradient(0, y, 0, y + barHeight);
                gradient.addColorStop(0, '#818cf8');
                gradient.addColorStop(0.5, '#c084fc');
                gradient.addColorStop(1, '#f472b6');

                this.canvasCtx.fillStyle = gradient;
                this.canvasCtx.beginPath();
                this.canvasCtx.roundRect(x, y, barWidth, barHeight, 3);
                this.canvasCtx.fill();
            }
        };

        render();
    }

    updateTimerDisplay() {
        const mins = String(Math.floor(this.recordingSeconds / 60)).padStart(2, '0');
        const secs = String(this.recordingSeconds % 60).padStart(2, '0');
        if (this.timerEl) {
            this.timerEl.textContent = `${mins}:${secs}`;
        }
    }

    stopRecordingStreams() {
        this.isRecording = false;
        clearInterval(this.timerInterval);

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        if (this.source) {
            try { this.source.disconnect(); } catch (e) {}
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch (e) {}
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }

    cancelRecording() {
        this.stopRecordingStreams();
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.audioChunks = [];
        this.audioOverlay.classList.add('hidden');
    }

    async stopAndTranscribe() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

        this.statusTitle.textContent = 'Transcribing with Groq Whisper...';
        this.subtextEl.textContent = 'Processing speech to text in milliseconds';
        this.finishBtn.disabled = true;
        this.finishBtn.innerHTML = `<div class="spinner-small"></div><span>Transcribing...</span>`;

        this.stopRecordingStreams();

        this.mediaRecorder.onstop = async () => {
            const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            
            if (audioBlob.size < 1000) {
                this.audioOverlay.classList.add('hidden');
                showToast('Recording was too short.', 'info');
                return;
            }

            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            const formData = new FormData();
            formData.append('audio', audioBlob, `speech.${ext}`);

            try {
                const response = await fetch('/api/transcribe', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                this.audioOverlay.classList.add('hidden');

                if (data.success && data.text) {
                    const text = data.text.trim();
                    if (text) {
                        const inputEl = document.getElementById('user-input');
                        if (inputEl) {
                            inputEl.value = (inputEl.value ? inputEl.value + ' ' : '') + text;
                            inputEl.focus();
                            // Auto-resize input
                            inputEl.style.height = 'auto';
                            inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
                        }
                        showToast('Voice transcribed successfully!', 'success');
                    } else {
                        showToast('No speech was detected.', 'info');
                    }
                } else {
                    showToast(data.error || 'Failed to transcribe audio.', 'error');
                }
            } catch (err) {
                console.error('Transcription error:', err);
                this.audioOverlay.classList.add('hidden');
                showToast('Error uploading audio for transcription.', 'error');
            }
        };

        this.mediaRecorder.stop();
    }

    // Text-to-Speech (Read Aloud)
    speakMessage(messageId, text) {
        if (!('speechSynthesis' in window)) {
            showToast('Text-to-speech is not supported in this browser.', 'info');
            return;
        }

        // If already speaking this message, toggle off
        if (this.speakingMessageId === messageId && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            this.updateSpeakerBtnState(messageId, false);
            this.speakingMessageId = null;
            return;
        }

        // Stop any current speech
        window.speechSynthesis.cancel();
        if (this.speakingMessageId) {
            this.updateSpeakerBtnState(this.speakingMessageId, false);
        }

        // Clean markdown tags for natural spoken text
        const cleanText = text
            .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/[#*_~>]/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            this.speakingMessageId = messageId;
            this.updateSpeakerBtnState(messageId, true);
        };

        utterance.onend = () => {
            this.updateSpeakerBtnState(messageId, false);
            this.speakingMessageId = null;
        };

        utterance.onerror = () => {
            this.updateSpeakerBtnState(messageId, false);
            this.speakingMessageId = null;
        };

        window.speechSynthesis.speak(utterance);
    }

    updateSpeakerBtnState(messageId, isPlaying) {
        const btn = document.querySelector(`.speaker-btn[data-msg-id="${messageId}"]`);
        if (!btn) return;
        if (isPlaying) {
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                <span>Stop</span>
            `;
            btn.style.color = 'var(--accent-primary)';
        } else {
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                <span>Read</span>
            `;
            btn.style.color = '';
        }
    }
}

window.audioController = new AudioController();
